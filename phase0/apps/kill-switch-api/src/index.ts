/**
 * Kill Switch API Service — Refactored TypeScript Entry Point
 * ADR-111 BCP + ADR-117 Chaos Engineering
 *
 * Endpoints:
 *   GET  /v1/kill-switch/status   - Current state (full KillSwitchStatus)
 *   POST /v1/kill-switch/chaos   - Change state
 *   GET  /v1/kill-switch/health   - Health check
 *   POST /v1/auth/login          - Login
 *   POST /v1/auth/logout         - Logout
 *   GET  /v1/auth/me             - Session check
 *   GET  /v1/auth/ip             - IP detection
 */

import { KillSwitchService } from './services/kill-switch';
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

// ─── HTTP Handler ────────────────────────────────────────────────────

export function createKillSwitchHandler(service: KillSwitchService) {
  const authRateLimiter = new AuthRateLimiter();
  const config = getConfig();

  return async (req: any, res: any) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const url = req.url || '/';
    const method = req.method || 'GET';

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

    // ─── Auth Rate Limiting (stricter: configurable per env) ───
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

    // ─── Auth Check (skip for health and auth endpoints) ────────
    if (url !== '/v1/kill-switch/health' && !isAuthEndpoint) {
      const auth = checkAuth(service, req);
      if (!auth.authenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }
    }

    // ─── Route to handlers ──────────────────────────────────────
    const handled =
      await handleAuthRoutes(method, url, req, res, service, authRateLimiter) ||
      await handleKillSwitchRoutes(method, url, req, res, service, ip) ||
      await handleFlagsRoutes(method, url, req, res);

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

  const server = await import('http').then((m) => m.createServer(handler));

  const port = opts.port || config.server.port;
  server.listen(port, () => {
    console.log(`⚙️ Kill Switch API listening on port ${port} [${config.env}]`);
    console.log(`   Health: http://localhost:${port}/v1/kill-switch/health`);
    console.log(`   Status: http://localhost:${port}/v1/kill-switch/status`);
    console.log(`   Control: POST http://localhost:${port}/v1/kill-switch/chaos`);
    console.log(`   LB Health: http://localhost:${port}/health`);
    console.log(`   Ready: http://localhost:${port}/ready`);
    console.log(`   Metrics: http://localhost:${port}/metrics`);
  });

  return { server, service, redis };
}

// ─── Main Entry Point ──────────────────────────────────────────────

if (import.meta.path.endsWith('index.ts') || import.meta.path.endsWith('index.mjs')) {
  startServer().catch((err) => {
    console.error('Failed to start Kill Switch API:', err);
    process.exit(1);
  });
}