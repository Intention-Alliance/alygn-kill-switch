/**
 * Kill Switch API Service — Refactored TypeScript Entry Point
 * ADR-111 BCP + ADR-117 Chaos Engineering + ADR-121 SQLite Auth
 *
 * Consolidated into canonical monorepo: @alygn/server-kill-switch v2.0.0
 *
 * Endpoints:
 *   GET  /v1/kill-switch/status    - Current state (full KillSwitchStatus)
 *   POST /v1/kill-switch/chaos     - Change state
 *   GET  /v1/kill-switch/health    - Health check
 *   POST /v1/auth/login            - Login (Better-Auth v2 + SQLite)
 *   POST /v1/auth/logout           - Logout
 *   GET  /v1/auth/me               - Session check
 *   GET  /v1/auth/ip               - IP detection
 *   GET  /v1/flags                  - List feature flags
 *   POST /v1/flags                  - Create flag
 *   PUT  /v1/flags/:id              - Update flag
 *   DELETE /v1/flags/:id           - Delete flag
 *   GET  /v1/flags/:id/audit       - Flag audit log
 */

import { KillSwitchService } from './services/kill-switch';
import { db, sqlite as sqliteDb } from './db/index'; // P0-2: ensure DB tables are created on startup
import { isIpAllowed } from './services/ip-allowlist';
import { checkRateLimit, RATE_LIMIT_MAX } from './middleware/rate-limit';
import { checkAuth } from './middleware/auth';
import { AuthRateLimiter } from './middleware/auth-rate-limit';
import { handleAuthRoutes } from './routes/auth';
import { handleKillSwitchRoutes } from './routes/kill-switch';
import { handleFlagsRoutes } from './routes/flags';
import { handleLbHealthRoutes } from './middleware/lb-health';
import { handleAdminRoutes } from './routes/admin';
import { loadRedisPool } from './infra-loader';
import { getConfig, isFeatureEnabled } from './config';
import { seedAdminUser } from './lib/auth';
import { validateEnvironment } from './config/validate-env';

// ─── HTTP Handler ────────────────────────────────────────────────────

export function createKillSwitchHandler(service: KillSwitchService) {
  const authRateLimiter = new AuthRateLimiter();
  const config = getConfig();

  return async (req: any, res: any) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const url = req.url || '/';
    const method = req.method || 'GET';

    // ─── CORS Headers ────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3001');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ─── LB Health / Metrics (no auth required) ───────────────
    if (isFeatureEnabled('enableLbHealth')) {
      const lbHandled = await handleLbHealthRoutes(method, url, req, res, service);
      if (lbHandled) return;
    }

    // ─── Admin routes (auth required) ─────────────────────────
    const adminHandled = await handleAdminRoutes(method, url, req, res, service);
    if (adminHandled) return;

    // ─── IP Allowlist Check (skip for auth endpoints) ──────────
    const isAuthEndpoint = url.startsWith('/v1/auth/');
    if (!isAuthEndpoint && !isIpAllowed(ip)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'IP not allowed', ip }));
      return;
    }

    // ─── Auth Rate Limiting ────────────────────────────────────
    if (isAuthEndpoint) {
      const authRateCheck = authRateLimiter.check(ip);
      if (!authRateCheck.allowed) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': String(authRateCheck.retryAfterSeconds || config.rateLimit.authWindowMs / 1000),
        });
        res.end(JSON.stringify({ error: 'Too many login attempts', retryAfter: authRateCheck.retryAfterSeconds }));
        return;
      }
    }

    // ─── General Rate Limiting ─────────────────────────────────
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(rateCheck.retryAfter || 60),
      });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', limit: RATE_LIMIT_MAX }));
      return;
    }

    // ─── Auth Check (skip for health and auth endpoints) ───────
    let authenticatedUserId: string | null = null;

    if (url !== '/v1/kill-switch/health' && !isAuthEndpoint) {
      const authResult = await checkAuth(service, req);
      if (!authResult.authenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }
      authenticatedUserId = authResult.user?.email ?? null;
    }

    // ─── Route to handlers ─────────────────────────────────────
    const handled =
      await handleAuthRoutes(method, url, req, res, service, authRateLimiter) ||
      await handleKillSwitchRoutes(method, url, req, res, service, ip) ||
      await handleFlagsRoutes(method, url, req, res, authenticatedUserId || 'api');

    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  };
}

// ─── Standalone Server ─────────────────────────────────────────────

export async function startServer(opts: { redisUrls?: string[]; authToken?: string; apiKey?: string; port?: number } = {}) {
  const config = getConfig();
  const RedisPool = await loadRedisPool() as any;

  const redis: any = new RedisPool({
    urls: opts.redisUrls || config.redis.urls,
  });

  await redis.connect();

  const service = new KillSwitchService({
    redis,
    authToken: opts.authToken || process.env.KILL_SWITCH_AUTH_TOKEN,
    apiKey: opts.apiKey || process.env.KILL_SWITCH_API_KEY,
  });

  const handler = createKillSwitchHandler(service);

  // Seed admin user before accepting connections
  await seedAdminUser();

  const server = await import('http').then((m) => m.createServer(handler));

  const port = opts.port || config.server.port;

  // ─── Graceful Shutdown ───────────────────────────────────────
  function gracefulShutdown(signal: string) {
    console.log(`[server] Received ${signal}, shutting down gracefully...`);

    server.close((err?: Error) => {
      if (err) console.error(`[server] Error closing HTTP server: ${err.message}`);
      else console.log('[server] HTTP server closed');

      // Close SQLite database
      try {
        sqliteDb.close();
        console.log('[server] SQLite (kill-switch) database closed');
      } catch (e: any) {
        console.error(`[server] Error closing SQLite: ${e.message}`);
      }

      // Close Redis connection
      if (redis) {
        redis.disconnect().then(() => {
          console.log('[server] Redis pool disconnected');
          process.exit(0);
        }).catch((e: any) => {
          console.error(`[server] Error disconnecting Redis: ${e.message}`);
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error('[server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(port, () => {
    console.log(`⚙️ Kill Switch API v2.0.0 listening on port ${port} [${config.env}]`);
    console.log(`   Auth DB: SQLite (WAL mode)`);
    console.log(`   Health: http://localhost:${port}/v1/kill-switch/health`);
    console.log(`   Status: http://localhost:${port}/v1/kill-switch/status`);
    console.log(`   Control: POST http://localhost:${port}/v1/kill-switch/chaos`);
    console.log(`   Flags:  http://localhost:${port}/v1/flags`);
    console.log(`   LB Health: http://localhost:${port}/health`);
    console.log(`   Ready: http://localhost:${port}/ready`);
    console.log(`   Metrics: http://localhost:${port}/metrics`);
  });

  return { server, service, redis };
}

// ─── Main Entry Point ──────────────────────────────────────────────

if (import.meta.path.endsWith('index.ts') || import.meta.path.endsWith('index.mjs')) {
  try {
    validateEnvironment();
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  startServer().catch((err) => {
    console.error('Failed to start Kill Switch API:', err);
    process.exit(1);
  });
}
