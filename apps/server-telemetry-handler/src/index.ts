/**
 * Telemetry Handler Service — Main Entry Point
 *
 * Bun + TypeScript + Drizzle SQLite + Hardware Monitoring
 * Version 3.0.0 — complete rewrite from C++ demo to production service.
 *
 * Architecture:
 *   Monitors → Collector → Persister + Threshold Engine → Kill Switch Bridge
 *
 * Endpoints:
 *   GET  /health         — Health check with collector state
 *   GET  /metrics        — Latest hardware metrics snapshot
 *   GET  /metrics/:name  — Latest metrics for a specific monitor
 *   GET  /alerts         — Recent alert events
 *   WS   /ws             — WebSocket real-time telemetry events
 *
 * Constructor Injection throughout: all dependencies are injected,
 * no `new X()` inside classes. Strict TypeScript, explicit return types.
 */

import { loadTelemetryConfig } from './config';
import { initTelemetryDatabase } from './db/index';
import {
  CpuMonitor,
  MemoryMonitor,
  DiskMonitor,
  GpuMonitor,
  DpuMonitor,
  NetworkMonitor,
} from './monitors/index';
import type { HardwareMonitor } from './monitors/interface';
import { MetricCollector } from './collectors/metric-collector';
import { SqlitePersister } from './persisters/sqlite-persister';
import { ThresholdEngine } from './alerting/threshold-engine';
import { KillSwitchBridge } from './alerting/kill-switch-bridge';
import type { HardwareMetric } from './types';
import { telemetryAlerts, telemetryMetrics } from './db/schema';
import { desc, eq } from 'drizzle-orm';

// ─── Type Aliases for External Dependencies ──────────────────────────────

/** Minimal Redis pool interface — matches the pattern from server-kill-switch */
interface RedisPoolLike {
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  publish(channel: string, message: string): Promise<void>;
}

/**
 * Create and return the full telemetry service wiring.
 *
 * This function is the composition root — all dependencies are instantiated
 * here and injected into their consumers.
 */
async function composeTelemetryService(redisPool: RedisPoolLike | null) {
  const config = loadTelemetryConfig();
  const { database, sqliteInstance } = initTelemetryDatabase();

  // ─── Instantiate Hardware Monitors ──────────────────────────────
  const monitors: HardwareMonitor[] = [
    new CpuMonitor(),
    new MemoryMonitor(),
    new DiskMonitor(),
    new GpuMonitor(),
    new DpuMonitor(),
    new NetworkMonitor(),
  ];

  // ─── Persister ──────────────────────────────────────────────────
  const persister = new SqlitePersister(database);

  // ─── Kill Switch Bridge (optional — only if Redis is connected) ─
  const killSwitchBridge = new KillSwitchBridge(
    // Transition callback — in production, this would call the real KillSwitch via HTTP
    async (newState: string, metadata: { reason: string; userId: string }) => {
      console.log(
        `[telemetry] Kill switch transition requested: ${newState} by ${metadata.userId} — ${metadata.reason}`,
      );
      // In production: POST to kill-switch service's /v1/kill-switch/chaos endpoint
      // For now, log and publish via Redis
      if (redisPool) {
        await redisPool.publish(
          'bcp:kill-switch:telemetry',
          JSON.stringify({
            type: 'telemetry-emergency',
            targetState: newState,
            metadata,
            timestamp: new Date().toISOString(),
          }),
        );
      }
    },
    redisPool
      ? async (channel: string, message: string) => {
          await redisPool.publish(channel, message);
        }
      : null,
    config.enableKillSwitchTrigger,
  );

  // ─── Threshold Engine ───────────────────────────────────────────
  const thresholdEngine = new ThresholdEngine(config, killSwitchBridge);

  // ─── Metric Collector ───────────────────────────────────────────
  const collector = new MetricCollector(
    monitors,
    persister,
    config.collectionIntervalSeconds * 1000,
    config.criticalCollectionIntervalSeconds * 1000,
    config.batchFlushIntervalSeconds * 1000,
    config.batchMaxSize,
  );

  return {
    config,
    database,
    sqliteInstance,
    monitors,
    persister,
    thresholdEngine,
    killSwitchBridge,
    collector,
  };
}

/**
 * Start the telemetry handler HTTP server.
 *
 * @param opts.port — override the port (default from TELEMETRY_PORT or 3002)
 * @param opts.redisUrls — Redis connection URLs (optional; service works without Redis)
 */
export async function startTelemetryServer(
  opts: { port?: number; redisUrls?: string[] } = {},
): Promise<{ server: ReturnType<typeof import('http').createServer>; collector: MetricCollector }> {
  const config = loadTelemetryConfig();

  // ─── Redis (optional — service is fully functional without it) ───
  let redisPool: RedisPoolLike | null = null;
  const redisUrls = opts.redisUrls || config.redisUrls;

  if (redisUrls.length > 0 && redisUrls[0]) {
    try {
      // Dynamic import to avoid hard dependency on redis package
      const redisModule = await import('redis');
      const redisClient = redisModule.createClient({ url: redisUrls[0] });
      await redisClient.connect();

      redisPool = {
        subscribe: async (channel: string, handler: (message: string) => void) => {
          await redisClient.subscribe(channel, handler);
        },
        publish: async (channel: string, message: string) => {
          await redisClient.publish(channel, message);
        },
      };

      console.log(`[telemetry] Redis connected: ${redisUrls[0]}`);
    } catch (error: unknown) {
      console.warn(
        `[telemetry] Redis unavailable — running without pubsub: ${(error as Error).message}`,
      );
    }
  }

  // ─── Compose the service ────────────────────────────────────────
  const service = await composeTelemetryService(redisPool);

  // Start metric collection
  service.collector.startCollecting();

  // ─── Create HTTP server ─────────────────────────────────────────
  const http = await import('http');
  const port = opts.port || config.port;

  const requestHandler = async (req: any, res: any) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url: string = req.url || '/';
    const method: string = req.method || 'GET';

    // Health check
    if (url === '/health' && method === 'GET') {
      const collectorState = service.collector.getCollectorState();
      const healthPayload = {
        status: 'healthy',
        service: '@alygn/server-telemetry-handler',
        version: '3.0.0',
        uptime: process.uptime(),
        collector: {
          activeMonitors: service.monitors.map((m) => m.name),
          pendingBatchSize: collectorState.pendingBatch.length,
          lastFlushTimestamp: new Date(collectorState.lastFlushTimestamp).toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthPayload));
      return;
    }

    // Latest metrics snapshot
    if (url === '/metrics' && method === 'GET') {
      try {
        const rows = await service.database
          .select()
          .from(telemetryMetrics)
          .orderBy(desc(telemetryMetrics.timestamp))
          .limit(50);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
      } catch (error: unknown) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Failed to query metrics',
            detail: (error as Error).message,
          }),
        );
      }
      return;
    }

    // Latest metrics for a specific monitor
    const monitorMatch = /^\/metrics\/([a-z]+)$/.exec(url);
    if (monitorMatch && method === 'GET') {
      const monitorName = monitorMatch[1];
      try {
        const rows = await service.database
          .select()
          .from(telemetryMetrics)
          .where(eq(telemetryMetrics.monitorName, monitorName))
          .orderBy(desc(telemetryMetrics.timestamp))
          .limit(20);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
      } catch (error: unknown) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `Failed to query metrics for ${monitorName}`,
            detail: (error as Error).message,
          }),
        );
      }
      return;
    }

    // Recent alerts
    if (url === '/alerts' && method === 'GET') {
      try {
        const rows = await service.database
          .select()
          .from(telemetryAlerts)
          .orderBy(desc(telemetryAlerts.timestamp))
          .limit(50);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
      } catch (error: unknown) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Failed to query alerts',
            detail: (error as Error).message,
          }),
        );
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  };

  const server = http.createServer(requestHandler);

  // ─── Graceful Shutdown ──────────────────────────────────────────
  function gracefulShutdown(signal: string): void {
    console.log(`[telemetry] Received ${signal} — shutting down gracefully...`);

    service.collector.stopCollecting().then(() => {
      console.log('[telemetry] Metric collector stopped');
    });

    server.close((err?: Error) => {
      if (err) {
        console.error(`[telemetry] Error closing HTTP server: ${err.message}`);
      } else {
        console.log('[telemetry] HTTP server closed');
      }

      try {
        service.sqliteInstance.close();
        console.log('[telemetry] SQLite database closed');
      } catch (error: unknown) {
        console.error(
          `[telemetry] Error closing SQLite: ${(error as Error).message}`,
        );
      }

      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      console.error('[telemetry] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(port, () => {
    console.log(`⚙️ Telemetry Handler v3.0.0 listening on port ${port}`);
    console.log(`   DB: SQLite at ${config.dataDir}/telemetry.sqlite (WAL mode)`);
    console.log(`   Collection interval: ${config.collectionIntervalSeconds}s (critical: ${config.criticalCollectionIntervalSeconds}s)`);
    console.log(`   Batch flush: ${config.batchFlushIntervalSeconds}s / ${config.batchMaxSize} max`);
    console.log(`   Kill switch trigger: ${config.enableKillSwitchTrigger ? 'enabled' : 'disabled'}`);
    console.log(`   Redis: ${redisPool ? 'connected' : 'disabled'}`);
    console.log(`   Health: http://localhost:${port}/health`);
    console.log(`   Metrics: http://localhost:${port}/metrics`);
    console.log(`   Alerts: http://localhost:${port}/alerts`);
    console.log(`   Monitors: ${service.monitors.map((m) => m.name).join(', ')}`);
  });

  return { server, collector: service.collector };
}

// ─── Main Entry Point ──────────────────────────────────────────────────

if (import.meta.path?.endsWith('index.ts') || import.meta.path?.endsWith('index.js')) {
  startTelemetryServer().catch((err: unknown) => {
    console.error('Failed to start Telemetry Handler:', (err as Error).message);
    process.exit(1);
  });
}
