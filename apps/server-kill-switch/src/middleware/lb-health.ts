// Load Balancer Health and Performance Monitoring
// Provides /health, /ready, /metrics endpoints for LB integration
// Tracks response times, request counts, error rates, active connections

import type { KillSwitchService } from '../services/kill-switch';
import { getMetrics, recordRequest, incrementActiveConnections, decrementActiveConnections } from '../services/metrics';

export async function handleLbHealthRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  service: KillSwitchService,
): Promise<boolean> {
  // GET /health — Simple liveness check for load balancer (always 200 if process is alive)
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'alive', timestamp: new Date().toISOString() }));
    return true;
  }

  // GET /ready — Readiness check (verifies Redis and dependencies are available)
  if (method === 'GET' && url === '/ready') {
    try {
      const health = await service.healthCheck();
      const isReady = health.status === 'healthy';

      res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: isReady ? 'ready' : 'not_ready',
        checks: {
          redis: health.redis,
          killSwitchState: health.killSwitchState,
        },
        timestamp: new Date().toISOString(),
      }));
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'not_ready', error: 'Health check failed', timestamp: new Date().toISOString() }));
    }
    return true;
  }

  // GET /metrics — Prometheus-format metrics
  if (method === 'GET' && url === '/metrics') {
    const metrics = getMetrics();
    const prometheus = formatPrometheus(metrics);

    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(prometheus);
    return true;
  }

  return false;
}

/**
 * Format metrics in Prometheus exposition format.
 */
function formatPrometheus(metrics: ReturnType<typeof getMetrics>): string {
  const lines: string[] = [];
  const ts = metrics.uptimeSeconds * 1000; // approximate timestamp offset

  lines.push(`# HELP kill_switch_request_total Total number of HTTP requests`);
  lines.push(`# TYPE kill_switch_request_total counter`);
  lines.push(`kill_switch_request_total ${metrics.requestCount}`);

  lines.push(`# HELP kill_switch_errors_total Total number of HTTP errors (5xx)`);
  lines.push(`# TYPE kill_switch_errors_total counter`);
  lines.push(`kill_switch_errors_total ${metrics.errorCount}`);

  lines.push(`# HELP kill_switch_response_time_ms Response time in milliseconds`);
  lines.push(`# TYPE kill_switch_response_time_ms summary`);
  lines.push(`kill_switch_response_time_ms{quantile="0.5"} ${metrics.responseTimeP50}`);
  lines.push(`kill_switch_response_time_ms{quantile="0.9"} ${metrics.responseTimeP90}`);
  lines.push(`kill_switch_response_time_ms{quantile="0.99"} ${metrics.responseTimeP99}`);
  lines.push(`kill_switch_response_time_ms_avg ${metrics.responseTimeAvg}`);

  lines.push(`# HELP kill_switch_active_connections Current active connections`);
  lines.push(`# TYPE kill_switch_active_connections gauge`);
  lines.push(`kill_switch_active_connections ${metrics.activeConnections}`);

  lines.push(`# HELP kill_switch_error_rate Error rate (errors/requests)`);
  lines.push(`# TYPE kill_switch_error_rate gauge`);
  lines.push(`kill_switch_error_rate ${metrics.errorRate}`);

  lines.push(`# HELP kill_switch_uptime_seconds Process uptime in seconds`);
  lines.push(`# TYPE kill_switch_uptime_seconds gauge`);
  lines.push(`kill_switch_uptime_seconds ${metrics.uptimeSeconds}`);

  return lines.join('\n') + '\n';
}

/**
 * Middleware to track response times and active connections.
 * Wrap the handler with this to collect metrics.
 */
export function withMetrics(handler: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    const start = performance.now();
    incrementActiveConnections();

    // Intercept res.writeHead to count errors
    const originalWriteHead = res.writeHead.bind(res);
    let statusCode = 200;
    res.writeHead = (code: number, ...args: any[]) => {
      statusCode = code;
      return originalWriteHead(code, ...args);
    };

    try {
      await handler(req, res);
    } finally {
      const duration = performance.now() - start;
      const isError = statusCode >= 500;
      recordRequest(duration, isError);
      decrementActiveConnections();
    }
  };
}