/**
 * Kill Switch API Service — Bun.serve() with native WebSocket (ADR-133)
 */
import { KillSwitchService } from './services/kill-switch';
import { WebSocketManager } from './services/websocket-manager';
import { sqlite as sqliteDb } from './db/index';
import { isIpAllowed, startDnsRefresh } from './services/ip-allowlist';
import { checkRateLimit, isReadRequest, initRateLimiter, READ_RATE_LIMIT_MAX, WRITE_RATE_LIMIT_MAX, RATE_LIMIT_MAX } from './middleware/rate-limit';
import { checkAuth } from './middleware/auth';
import { AuthRateLimiter } from './middleware/auth-rate-limit';
import { handleAuthRoutes } from './routes/auth';
import { handleKillSwitchRoutes } from './routes/kill-switch';
import { handleFlagsRoutes } from './routes/flags';
import { handleMachinesRoutes } from './routes/machines';
import { handleSettingsRoutes } from './routes/settings';
import { handleLbHealthRoutes } from './middleware/lb-health';
import { handleAdminRoutes } from './routes/admin';
import { handleAdminSecretsRoutes, initAuditLogFromDb } from './routes/admin-secrets';
import { handleApiKeysRoutes } from './routes/api-keys';
import { SecretsLoader } from './lib/secrets-loader';
import { LockoutStateMachine } from './lib/lockout-state';
import { loadRedisPool } from './infra-loader';
import { startMetricGeneration } from './services/system-metrics';
import { getConfig, isFeatureEnabled } from './config';
import { seedAdminUser } from './lib/auth';
import { seedFeatureFlags } from './db/seed';
import { validateEnvironment } from './config/validate-env';

// ─── Node-style HTTP Handler ───────────────────────────────────────

function createHandler(service: KillSwitchService) {
  const authRateLimiter = new AuthRateLimiter();
  const config = getConfig();

  return async (req: any, res: any) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const url = req.url || '/';
    const method = req.method || 'GET';

    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3001');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (isFeatureEnabled('enableLbHealth')) {
      const lb = await handleLbHealthRoutes(method, url, req, res, service);
      if (lb) return;
    }

    // ── Admin secrets routes (separate auth: ADMIN_UI_API_KEY) ──
    const secretsHandled = await handleAdminSecretsRoutes(method, url, req, res, secretsLoader, lockoutState);
    if (secretsHandled) return;

    // ── Webhook API Key admin + internal routes (separate auth) ──
    // Must run BEFORE checkAuth because:
    //   - /v1/internal/* is called by the openclaw-webhook over loopback
    //     with KILL_SWITCH_INTERNAL_KEY, NOT a user session.
    //   - /v1/admin/api-keys/* uses ADMIN_UI_API_KEY Bearer, NOT a user session
    //     (mirrors admin-secrets.ts above).
    // The handler does its own auth checks (adminKeyMatches / internalKeyMatches).
    const apiKeysHandled = await handleApiKeysRoutes(method, url, req, res, ip);
    if (apiKeysHandled) return;

    const admin = await handleAdminRoutes(method, url, req, res, service);
    if (admin) return;

    const isAuth = url.startsWith('/v1/auth/');
    if (!isAuth && !isIpAllowed(ip)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'IP not allowed', ip }));
      return;
    }

    if (isAuth) {
      const check = authRateLimiter.check(ip);
      if (!check.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(check.retryAfterSeconds || 900) });
        res.end(JSON.stringify({ error: 'Too many login attempts', retryAfter: check.retryAfterSeconds }));
        return;
      }
    }

    const rate = await checkRateLimit(ip, req.method || 'GET', req.url || '/');
    if (!rate.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter || 60) });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', limit: RATE_LIMIT_MAX }));
      return;
    }

    let uid: string | null = null;
    let userRole: string | null = null;
    if (url !== '/v1/kill-switch/health' && !isAuth) {
      const ar = await checkAuth(service, req);
      if (!ar.authenticated) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Authentication required' })); return; }
      uid = ar.user?.email ?? null;
      userRole = ar.user?.role ?? null;
    }

    const handled =
      await handleAuthRoutes(method, url, req, res, service, authRateLimiter) ||
      await handleKillSwitchRoutes(method, url, req, res, service, ip) ||
      await handleFlagsRoutes(method, url, req, res, uid || 'api', userRole) ||
      await handleMachinesRoutes(method, url, req, res,
        async (channel, msg) => { try { await redis.publish(channel, msg); } catch {} },
      ) ||
      await handleSettingsRoutes(method, url, req, res, userRole, null);

    if (!handled) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); }
  };
}

// ─── Server Startup with Bun.serve() + native WebSocket ────────────

export async function startServer(opts: { redisUrls?: string[]; authToken?: string; apiKey?: string; port?: number } = {}) {
  const config = getConfig();

  // ─── Validate environment BEFORE secrets loader (S-A2 — loud, no silent 401s) ──
  validateEnvironment();

  // ─── Secrets Loader (startup-load, throw on missing) ─────────────
  const secretsLoader = new SecretsLoader({
    onReload: (result) => {
      console.log(`[secrets-loader] reload: ${result.skipped ? 'skipped (' + (result.reason || 'unchanged') + ')' : result.loaded.length + ' keys loaded'}`);
    },
  });
  await secretsLoader.load();
  secretsLoader.startWatchers();
  console.log(`[secrets-loader] loaded ${secretsLoader.getLoadedKeys().length} Tailscale secret(s)`);

  // ─── Lockout State Machine ──────────────────────────────────────
  const lockoutState = new LockoutStateMachine();
  await lockoutState.load();
  lockoutState.startWatchers();
  console.log(`[lockout-state] state: ${lockoutState.getLockoutLabel()}`);

  // ─── Secrets Audit Log: load recent entries from DB ─────────────
  await initAuditLogFromDb();

  const RedisPool = await loadRedisPool() as any;
  const redis = new RedisPool({ urls: opts.redisUrls || config.redis.urls });
  await redis.connect();

  initRateLimiter(redis);
  startDnsRefresh();

  const service = new KillSwitchService({
    redis,
    authToken: opts.authToken || process.env.KILL_SWITCH_AUTH_TOKEN,
    apiKey: opts.apiKey || process.env.KILL_SWITCH_API_KEY,
  });

  const wsManager = new WebSocketManager();

  if (typeof redis.subscribe === 'function') {
    wsManager.setRedisSubscribe((ch: string, h: (msg: string) => void) => redis.subscribe(ch, h));
  }

  // Start periodic real system metrics collection (ADR-133: live telemetry)
  // Collects CPU/RAM/GPU/Disk/Load from the host every 5s,
  // publishes machine-metrics events via Redis pubsub → WebSocketManager → frontend
  startMetricGeneration({
    intervalMs: 5000,
    publish: async (channel, msg) => {
      try { await redis.publish(channel, msg); } catch { /* Redis unavailable — metrics update locally */ }
    },
  });

  service.onStateChange((entry: any) => wsManager.broadcastStateChange(entry));

  await seedAdminUser();

  try {
    await seedFeatureFlags();
  } catch (e) {
    console.error('[seed] Feature flag seeding failed (non-fatal):', e);
  }

  const port = opts.port || config.server.port;

  // Bun.serve with native WebSocket
  const server = Bun.serve({
    port,
    websocket: {
      maxPayloadLength: 65536,
      open(ws: any) { wsManager.handleBunUpgrade(ws); },
      close() {},
      message(ws: any, msg: string | Buffer) {
        const text = typeof msg === 'string' ? msg : Buffer.from(msg).toString();
        if (text === 'pong') { /* handled by Bun's auto-pong */ }
      },
    },
    async fetch(req, srv) {
      const url = new URL(req.url);

      // WebSocket upgrade — validate session via Better-Auth v2
      if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        const token = url.searchParams.get('token');
        if (!token) return new Response(JSON.stringify({ error: 'Missing token', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });

        try {
          const auth = await import('./lib/auth').then(m => m.auth);
          const cookieHeader = req.headers.get('cookie') || '';
          const hasBA = cookieHeader.includes('better-auth.session_token') || cookieHeader.includes('__Secure-better-auth.session_token');

          // Use the browser's real cookie, or construct a signed cookie from the raw token
          // Better-Auth v2 signing: HMAC-SHA256(rawToken, key=secret) → base64 (see makeSignature in crypto/index.mjs)
          const sc = hasBA ? cookieHeader : (() => {
            const crypto = require('node:crypto');
            const hmac = crypto.createHmac('sha256', process.env.BETTER_AUTH_SECRET || '');
            hmac.update(token);
            const sig = hmac.digest('base64');
            return `better-auth.session_token=${token}.${sig}`;
          })();

          // Validate via auth.handler() — same proven pattern as middleware/auth.ts
          const headers = new Headers();
          headers.set('cookie', sc);
          headers.set('accept', 'application/json');
          const sessionReq = new Request(`http://localhost:${port}/v1/auth/get-session`, { method: 'GET', headers });
          const response = await auth.handler(sessionReq);

          if (!response.ok) {
            console.error('[ws] getSession returned ' + response.status);
            return new Response(JSON.stringify({ error: 'Invalid or expired token', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });
          }

          const data = await response.json().catch(() => null);
          if (!data?.user) {
            return new Response(JSON.stringify({ error: 'Invalid or expired token', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });
          }

          const userId = data.user.email || data.user.id || 'unknown';
          const ip = req.headers.get('x-real-ip') || srv.requestIP(req)?.address || 'unknown';
          const conns = (wsManager as any).ipCounts?.get(ip) || 0;
          if (conns >= 5) return new Response(JSON.stringify({ error: 'Too many connections', code: 4003 }), { status: 429, headers: { 'content-type': 'application/json' } });

          console.log('[ws] Upgrading: ' + userId + ' from ' + ip);
          const ok = srv.upgrade(req, { data: { userId, ip } });
          return ok ? undefined : new Response('Upgrade failed', { status: 500 });
        } catch (e: any) {
          console.error('[ws] token validation error:', e.message);
          return new Response(JSON.stringify({ error: 'Authentication failed', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });
        }
      }

      // Regular HTTP — read body, convert to node-style, process via handler
      const bodyText = (req.method !== 'GET' && req.method !== 'HEAD')
        ? await req.text().catch(() => '') : '';

      return new Promise(resolve => {
        const ip = srv.requestIP(req)?.address || 'unknown';
        const nodeReq: any = {
          method: req.method,
          url: url.pathname + url.search,
          headers: {} as Record<string, string>,
          socket: { remoteAddress: ip }, ip,
          body: bodyText,
          on(ev: string, cb: Function) {
            if (ev === 'data' && bodyText) cb(Buffer.from(bodyText));
            if (ev === 'end') cb();
          },
        };
        for (const [k, v] of req.headers.entries()) nodeReq.headers[k] = v;

        const nodeRes: any = {
          _h: {} as Record<string, string>, _s: 200, _b: '',
          setHeader(n: string, v: string) { this._h[n.toLowerCase()] = String(v); },
          writeHead(s: number, h?: Record<string, string>) { this._s = s; if (h) Object.entries(h).forEach(([k, v]) => { this._h[k.toLowerCase()] = String(v); }); },
          end(d?: string) {
            this._b = d || '';
            const hdrs = new Headers(this._h);
            hdrs.set('content-length', String(Buffer.byteLength(this._b)));
            resolve(new Response(this._b, { status: this._s, headers: hdrs }));
          },
        };

        createHandler(service)(nodeReq, nodeRes);
      });
    },
  });

  console.log(`\u2699\ufe0f Kill Switch API v2.0.0 listening on port ${port} [${config.env}]`);
  console.log(`   WebSocket: ws://localhost:${port}/ws`);
  return { server, service, redis, wsManager };
}

if (import.meta.path.endsWith('index.ts') || import.meta.path.endsWith('index.mjs')) {
  startServer().catch((err: any) => { console.error('Failed:', err); process.exit(1); });
}
