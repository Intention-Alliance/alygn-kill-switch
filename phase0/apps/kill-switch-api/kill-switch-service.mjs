/**
 * Kill Switch API Service
 * ADR-111 BCP + ADR-117 Chaos Engineering
 * 
 * Endpoints:
 *   GET  /v1/kill-switch/status   - Current state
 *   POST /v1/kill-switch/chaos   - Change state (ARMED/RUNNING/STOPPING/STOPPED/LOCKED)
 *   GET  /v1/kill-switch/health   - Health check
 * 
 * Security:
 *   - Token-based auth (Bearer token or API key)
 *   - IP allowlist (100.66.199.80, 192.168.1.11, 127.0.0.1)
 *   - Rate limiting: max 10 requests/min
 * 
 * Redis PubSub channel: bcp:kill-switch:chaos
 * Propagation target: <30 seconds
 */

import { RedisPool } from '../redis/redis-cluster-pool.mjs';
import { recordSpan, tracer } from '../tracing/tracing-sdk.mjs';
import { trace } from '@opentelemetry/api';

// ─── Constants ─────────────────────────────────────────────────────

const STATES = {
  ARMED: 'ARMED',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  LOCKED: 'LOCKED',
};

const VALID_TRANSITIONS = {
  ARMED:   [STATES.RUNNING, STATES.LOCKED],
  RUNNING: [STATES.STOPPING, STATES.LOCKED],
  STOPPING: [STATES.STOPPED, STATES.LOCKED],
  STOPPED: [STATES.ARMED, STATES.LOCKED],
  LOCKED: [STATES.STOPPED],
};

const IP_ALLOWLIST = new Set([
  '100.66.199.80',
  '192.168.1.11',
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  // Docker network IPs
  '172.16.0.0/12',
  '172.17.0.0/16',
  '172.18.0.0/16',
  '172.19.0.0/16',
  '172.20.0.0/16',
  '172.21.0.0/16',
  '172.22.0.0/16',
  '172.23.0.0/16',
  '172.24.0.0/16',
  '172.25.0.0/16',
  '172.26.0.0/16',
  '172.27.0.0/16',
  '172.28.0.0/16',
]);

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const PUBSUB_CHANNEL = 'bcp:kill-switch:chaos';

// ─── Rate Limiter (in-memory, per-IP) ──────────────────────────────

class RateLimiter {
  constructor() {
    this.requests = new Map(); // ip → { count, windowStart }
  }

  check(ip) {
    const now = Date.now();
    const entry = this.requests.get(ip);
    
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.requests.set(ip, { count: 1, windowStart: now });
      return true;
    }
    
    if (entry.count >= RATE_LIMIT_MAX) {
      return false;
    }
    
    entry.count++;
    return true;
  }
}

// ─── Kill Switch Service ──────────────────────────────────────────

export class KillSwitchService {
  /**
   * @param {Object} opts
   * @param {RedisPool} opts.redis - Redis pool instance
   * @param {string} opts.authToken - Bearer token for API auth
   * @param {string} opts.apiKey - API key for header-based auth
   */
  constructor(opts = {}) {
    this.redis = opts.redis;
    this.authToken = opts.authToken || process.env.KILL_SWITCH_AUTH_TOKEN;
    this.apiKey = opts.apiKey || process.env.KILL_SWITCH_API_KEY;
    this.rateLimiter = new RateLimiter();
    this.auditLog = [];
    this._stateChangeListeners = [];
  }

  // ─── Authentication ──────────────────────────────────────────────

  authenticate(req) {
    // Check Bearer token
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (token === this.authToken) return true;
    }
    
    // Check API key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader === this.apiKey) return true;
    
    return false;
  }

  // ─── IP Allowlist ────────────────────────────────────────────────

  isIpAllowed(ip) {
    // Handle IPv6-mapped IPv4
    const normalizedIp = ip.replace(/^::ffff:/, '');
    
    // Check exact match
    if (IP_ALLOWLIST.has(normalizedIp) || IP_ALLOWLIST.has(ip)) {
      return true;
    }
    
    // Check CIDR ranges for Docker networks
    const cidrRanges = Array.from(IP_ALLOWLIST).filter(r => r.includes('/'));
    for (const cidr of cidrRanges) {
      if (this.isIpInCidr(normalizedIp, cidr)) {
        return true;
      }
    }
    
    return false;
  }
  
  isIpInCidr(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
    
    // Convert IPs to numeric
    const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    const rangeNum = range.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    
    return (ipNum & mask) === (rangeNum & mask);
  }

  // ─── State Management ────────────────────────────────────────────

  async getCurrentState() {
    const state = await this.redis.get(this.redis.chaosKillSwitchKey());
    return state || STATES.ARMED;
  }

  async transitionTo(newState, metadata = {}) {
    return recordSpan('kill-switch.transition', {
      'kill_switch.target_state': newState,
      'kill_switch.initiated_by': metadata.userId || 'system',
    }, async (span) => {
      const currentState = await this.getCurrentState();
      
      // Validate transition
      if (!VALID_TRANSITIONS[currentState]?.includes(newState)) {
        const err = new Error(`Invalid transition: ${currentState} → ${newState}`);
        err.statusCode = 409;
        err.current = currentState;
        err.allowed = VALID_TRANSITIONS[currentState] || [];
        throw err;
      }
      
      // Update state in Redis
      await this.redis.set(this.redis.chaosKillSwitchKey(), newState);
      
      // Publish via Redis PubSub for <30s propagation
      const message = {
        previousState: currentState,
        newState,
        timestamp: new Date().toISOString(),
        traceId: span.spanContext().traceId,
        initiatedBy: metadata.userId || 'system',
        reason: metadata.reason || 'manual',
      };
      
      await this.redis.publish(PUBSUB_CHANNEL, JSON.stringify(message));
      
      // Audit log entry
      const auditEntry = {
        id: crypto.randomUUID(),
        previousState: currentState,
        newState,
        timestamp: message.timestamp,
        traceId: message.traceId,
        initiatedBy: message.initiatedBy,
        reason: message.reason,
        ip: metadata.ip || 'unknown',
      };
      
      this.auditLog.push(auditEntry);
      // Keep last 1000 entries
      if (this.auditLog.length > 1000) {
        this.auditLog = this.auditLog.slice(-1000);
      }
      
      // Notify listeners
      for (const listener of this._stateChangeListeners) {
        try { await listener(auditEntry); } catch { /* ignore */ }
      }
      
      span.setAttribute('kill_switch.previous_state', currentState);
      span.setAttribute('kill_switch.transition_complete', true);
      
      return auditEntry;
    });
  }

  // ─── PubSub Subscription ─────────────────────────────────────────

  async subscribeToStateChanges(handler) {
    await this.redis.subscribe(PUBSUB_CHANNEL, handler);
  }

  onStateChange(listener) {
    this._stateChangeListeners.push(listener);
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck() {
    const redisHealth = await this.redis.healthCheck();
    const state = await this.getCurrentState();
    
    return {
      status: redisHealth.redis === 'OK' ? 'healthy' : 'degraded',
      killSwitchState: state,
      redis: redisHealth,
      auditLogSize: this.auditLog.length,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Audit Log ───────────────────────────────────────────────────

  getAuditLog(limit = 50) {
    return this.auditLog.slice(-limit);
  }
}

// ─── HTTP Handler (Node.js native / Express-compatible) ────────────

/**
 * Create request handler for Kill Switch API
 * Works with Node.js native http or Express
 */
export function createKillSwitchHandler(service) {
  return async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const url = req.url || '/';
    const method = req.method || 'GET';

    // ─── IP Allowlist Check (skip for auth endpoints) ──────────
    const isAuthEndpoint = url.startsWith('/v1/auth/');
    if (!isAuthEndpoint && !service.isIpAllowed(ip)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'IP not allowed', ip }));
      return;
    }

    // ─── Rate Limiting ───────────────────────────────────────────
    if (!service.rateLimiter.check(ip)) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', limit: RATE_LIMIT_MAX }));
      return;
    }

    // ─── Auth Check (skip for health and auth endpoints) ────────
    if (url !== '/v1/kill-switch/health' && !isAuthEndpoint) {
      if (!service.authenticate(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }
    }

    // ─── Auth Endpoints ──────────────────────────────────────────

    // POST /v1/auth/login
    if (method === 'POST' && url === '/v1/auth/login') {
      try {
        const body = await parseBody(req);
        const { email, password } = body;
        const validEmail = process.env.ADMIN_EMAIL || 'admin@alyygn.com';
        const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN;

        if (email === validEmail && password === validPassword) {
          const user = { email, role: 'admin' };
          res.setHeader('Set-Cookie', `admin_token=${validPassword}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=3600`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ user }));
          return;
        }

        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invalid credentials' }));
        return;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invalid request body' }));
        return;
      }
    }

    // GET /v1/auth/me
    if (method === 'GET' && url === '/v1/auth/me') {
      const cookies = parseCookies(req);
      const token = cookies.admin_token;
      const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN;

      if (token && token === validPassword) {
        const validEmail = process.env.ADMIN_EMAIL || 'admin@alyygn.com';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ user: { email: validEmail, role: 'admin' } }));
        return;
      }

      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not authenticated' }));
      return;
    }

    // POST /v1/auth/logout
    if (method === 'POST' && url === '/v1/auth/logout') {
      res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Logged out' }));
      return;
    }

    // GET /v1/auth/ip
    if (method === 'GET' && url === '/v1/auth/ip') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ip }));
      return;
    }

    // ─── Routing ─────────────────────────────────────────────────

    try {
      // GET /v1/kill-switch/status
      if (method === 'GET' && url === '/v1/kill-switch/status') {
        const state = await service.getCurrentState();
        const auditLog = service.getAuditLog(10);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ state, recentTransitions: auditLog }));
        return;
      }

      // GET /v1/kill-switch/health
      if (method === 'GET' && url === '/v1/kill-switch/health') {
        const health = await service.healthCheck();
        res.writeHead(health.status === 'healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
        return;
      }

      // POST /v1/kill-switch/chaos
      if (method === 'POST' && url === '/v1/kill-switch/chaos') {
        // Parse body
        const body = await parseBody(req);
        
        if (!body.state || !Object.values(STATES).includes(body.state)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Invalid state',
            validStates: Object.values(STATES),
          }));
          return;
        }

        const result = await service.transitionTo(body.state, {
          userId: body.userId || 'api',
          reason: body.reason || 'API request',
          ip,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      const status = err.statusCode || 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: err.message,
        current: err.current,
        allowed: err.allowed,
      }));
    }
  };
}

// ─── Cookie Parser ───────────────────────────────────────────────────

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k] = v.join('=');
  }
  return cookies;
}

// ─── Body Parser ───────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// ─── Standalone Server ─────────────────────────────────────────────

/**
 * Start the Kill Switch API as a standalone server
 */
export async function startServer(opts = {}) {
  const { RedisPool } = await import('../redis/redis-cluster-pool.mjs');
  
  const redis = new RedisPool({
    urls: opts.redisUrls || ['redis://localhost:6379'],
    poolSize: 5,
  });
  
  await redis.connect();
  
  const service = new KillSwitchService({
    redis,
    authToken: opts.authToken,
    apiKey: opts.apiKey,
  });
  
  const handler = createKillSwitchHandler(service);
  
  const server = await import('http').then((m) =>
    m.createServer(handler)
  );
  
  const port = opts.port || 11435;
  server.listen(port, () => {
    console.log(`⚙️ Kill Switch API listening on port ${port}`);
    console.log(`   Health: http://localhost:${port}/v1/kill-switch/health`);
    console.log(`   Status: http://localhost:${port}/v1/kill-switch/status`);
    console.log(`   Control: POST http://localhost:${port}/v1/kill-switch/chaos`);
  });
  
  return { server, service, redis };
}

export { STATES, VALID_TRANSITIONS, IP_ALLOWLIST };
export default KillSwitchService;
// ─── Main Entry Point ──────────────────────────────────────────────
// This runs when the file is executed directly: bun run kill-switch-service.mjs

if (import.meta.path.endsWith('kill-switch-service.mjs')) {
  const env = process.env;
  
  const redisUrls = (env.REDIS_URLS || 'redis://localhost:6379')
    .split(',')
    .map((url) => url.trim());
  
  startServer({
    redisUrls,
    authToken: env.KILL_SWITCH_AUTH_TOKEN,
    apiKey: env.KILL_SWITCH_API_KEY,
    port: parseInt(env.KILL_SWITCH_PORT || '3000', 10),
  }).catch((err) => {
    console.error('Failed to start Kill Switch API:', err);
    process.exit(1);
  });
}
