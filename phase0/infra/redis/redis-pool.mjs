/**
 * Redis Connection Pool with Circuit Breaker & Local Fallback
 * 
 * Phase 0 shared infrastructure for ADR-112, ADR-113, ADR-116, ADR-117
 * 
 * Key patterns:
 *   ratelimit:{client_id}:{bucket}     # ADR-112
 *   ws:conn:{user_id}                  # ADR-113
 *   flags:{flag_name}                  # ADR-116 (5min TTL)
 *   chaos:kill-switch                  # ADR-117 (no TTL)
 *   chaos:experiment:{id}              # ADR-117
 */

import { createClient } from 'redis';
import { EventEmitter } from 'events';

// ─── Circuit Breaker ───────────────────────────────────────────────

const CIRCUIT_STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {number} opts.failureThreshold - Failures before opening (default: 5)
   * @param {number} opts.resetTimeoutMs  - Time before half-open (default: 30000)
   * @param {number} opts.halfOpenMax      - Probes allowed in half-open (default: 1)
   */
  constructor(opts = {}) {
    super();
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.halfOpenMax = opts.halfOpenMax ?? 1;
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.openedAt = null;
  }

  recordSuccess() {
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.state = CIRCUIT_STATES.CLOSED;
      this.failureCount = 0;
      this.halfOpenAttempts = 0;
      this.emit('state-change', { from: CIRCUIT_STATES.HALF_OPEN, to: CIRCUIT_STATES.CLOSED });
    }
    if (this.state === CIRCUIT_STATES.CLOSED) {
      this.failureCount = 0;
    }
  }

  recordFailure() {
    this.failureCount++;
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this._open();
      return;
    }
    if (this.state === CIRCUIT_STATES.CLOSED && this.failureCount >= this.failureThreshold) {
      this._open();
    }
  }

  _open() {
    this.state = CIRCUIT_STATES.OPEN;
    this.openedAt = Date.now();
    this.emit('state-change', { from: this.state, to: CIRCUIT_STATES.OPEN });
  }

  /** Returns true if a request is allowed through */
  allow() {
    if (this.state === CIRCUIT_STATES.CLOSED) return true;
    if (this.state === CIRCUIT_STATES.OPEN) {
      if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
        this.state = CIRCUIT_STATES.HALF_OPEN;
        this.halfOpenAttempts = 0;
        this.emit('state-change', { from: CIRCUIT_STATES.OPEN, to: CIRCUIT_STATES.HALF_OPEN });
        return true;
      }
      return false;
    }
    // HALF_OPEN
    if (this.halfOpenAttempts < this.halfOpenMax) {
      this.halfOpenAttempts++;
      return true;
    }
    return false;
  }

  get status() {
    return { state: this.state, failureCount: this.failureCount, openedAt: this.openedAt };
  }
}

// ─── Local In-Memory Fallback ──────────────────────────────────────

class LocalCache {
  constructor(opts = {}) {
    this.maxEntries = opts.maxEntries ?? 1000;
    this.defaultTtlMs = opts.defaultTtlMs ?? 60_000;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  del(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

// ─── Redis Pool Manager ───────────────────────────────────────────

export class RedisPool extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string|string[]} opts.urls - Redis connection URLs
   * @param {Object} opts.clientOpts   - Options passed to redis.createClient
   * @param {number} opts.poolSize     - Max clients in pool (default: 10)
   * @param {Object} opts.circuitBreaker - CircuitBreaker options
   * @param {Object} opts.localCache   - LocalCache options
   */
  constructor(opts = {}) {
    super();
    this.urls = Array.isArray(opts.urls) ? opts.urls : [opts.urls || 'redis://localhost:6379'];
    this.clientOpts = opts.clientOpts ?? {};
    this.poolSize = opts.poolSize ?? 10;
    this.circuitBreaker = new CircuitBreaker(opts.circuitBreaker ?? {});
    this.localCache = new LocalCache(opts.localCache ?? {});
    this._pool = [];
    this._available = [];
    this._waiting = [];
    this._connected = false;
    this._subscriber = null;
    this._pubSubHandlers = new Map();

    this.circuitBreaker.on('state-change', (evt) => {
      this.emit('circuit-state-change', evt);
    });
  }

  /** Initialize pool connections */
  async connect() {
    for (let i = 0; i < this.poolSize; i++) {
      const client = createClient({
        url: this.urls[i % this.urls.length],
        ...this.clientOpts,
      });
      client.on('error', (err) => this.emit('error', err));
      await client.connect();
      this._pool.push(client);
      this._available.push(client);
    }

    // Dedicated subscriber client
    this._subscriber = createClient({
      url: this.urls[0],
      ...this.clientOpts,
    });
    this._subscriber.on('error', (err) => this.emit('error', err));
    await this._subscriber.connect();

    this._connected = true;
    this.emit('connected');
  }

  /** Acquire a client from the pool */
  async acquire() {
    if (this._available.length > 0) {
      return this._available.pop();
    }
    // Wait for a client to be released
    return new Promise((resolve) => {
      this._waiting.push(resolve);
    });
  }

  /** Release a client back to the pool */
  release(client) {
    if (this._waiting.length > 0) {
      const next = this._waiting.shift();
      next(client);
    } else {
      this._available.push(client);
    }
  }

  /** Disconnect all clients */
  async disconnect() {
    this._connected = false;
    for (const client of this._pool) {
      try { await client.quit(); } catch { /* ignore */ }
    }
    if (this._subscriber) {
      try { await this._subscriber.quit(); } catch { /* ignore */ }
    }
    this._pool = [];
    this._available = [];
    this._waiting = [];
    this.emit('disconnected');
  }

  // ─── Key-Value Operations (with circuit breaker + fallback) ────

  async get(key) {
    if (!this.circuitBreaker.allow()) {
      // Circuit open → serve from local cache
      const cached = this.localCache.get(key);
      if (cached !== null) return cached;
      return null; // fail-open: return null rather than error
    }

    const client = await this.acquire();
    try {
      const value = await client.get(key);
      this.circuitBreaker.recordSuccess();
      if (value !== null) {
        // Backfill local cache on hit
        this.localCache.set(key, value);
      }
      return value;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      // Fallback to local cache
      const cached = this.localCache.get(key);
      if (cached !== null) return cached;
      throw err;
    } finally {
      this.release(client);
    }
  }

  async set(key, value, opts = {}) {
    if (!this.circuitBreaker.allow()) {
      // Circuit open → write to local cache only
      this.localCache.set(key, value, opts.ttlMs);
      return 'LOCAL_OK';
    }

    const client = await this.acquire();
    try {
      let result;
      if (opts.ttlMs || opts.ttl) {
        const ttlMs = opts.ttlMs ?? (opts.ttl ? opts.ttl * 1000 : undefined);
        result = await client.set(key, value, { PX: ttlMs });
      } else {
        result = await client.set(key, value);
      }
      this.circuitBreaker.recordSuccess();
      // Update local cache
      this.localCache.set(key, value, opts.ttlMs);
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      // Still update local cache
      this.localCache.set(key, value, opts.ttlMs);
      throw err;
    } finally {
      this.release(client);
    }
  }

  async del(key) {
    if (!this.circuitBreaker.allow()) {
      this.localCache.del(key);
      return 0;
    }

    const client = await this.acquire();
    try {
      const result = await client.del(key);
      this.circuitBreaker.recordSuccess();
      this.localCache.del(key);
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      this.localCache.del(key);
      throw err;
    } finally {
      this.release(client);
    }
  }

  async incr(key) {
    if (!this.circuitBreaker.allow()) {
      throw new Error('Circuit open: cannot increment in local cache');
    }
    const client = await this.acquire();
    try {
      const result = await client.incr(key);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    } finally {
      this.release(client);
    }
  }

  async expire(key, ttlSeconds) {
    if (!this.circuitBreaker.allow()) return false;
    const client = await this.acquire();
    try {
      const result = await client.expire(key, ttlSeconds);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    } finally {
      this.release(client);
    }
  }

  // ─── PubSub ─────────────────────────────────────────────────────

  async publish(channel, message) {
    if (!this.circuitBreaker.allow()) {
      throw new Error('Circuit open: cannot publish');
    }
    const client = await this.acquire();
    try {
      const result = await client.publish(channel, message);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    } finally {
      this.release(client);
    }
  }

  async subscribe(channel, handler) {
    if (!this._subscriber) throw new Error('Not connected');
    this._pubSubHandlers.set(channel, handler);
    await this._subscriber.subscribe(channel, (message) => {
      try {
        handler(JSON.parse(message));
      } catch {
        handler(message);
      }
    });
  }

  async unsubscribe(channel) {
    this._pubSubHandlers.delete(channel);
    if (this._subscriber) {
      await this._subscriber.unsubscribe(channel);
    }
  }

  // ─── Health Check ──────────────────────────────────────────────

  async healthCheck() {
    const checks = {
      redis: 'UNKNOWN',
      circuitBreaker: this.circuitBreaker.status,
      localCacheSize: this.localCache.size,
      poolAvailable: this._available.length,
      poolTotal: this._pool.length,
      timestamp: new Date().toISOString(),
    };

    if (!this._connected) {
      checks.redis = 'DISCONNECTED';
      return checks;
    }

    if (!this.circuitBreaker.allow()) {
      checks.redis = 'CIRCUIT_OPEN';
      return checks;
    }

    const client = await this.acquire();
    try {
      const pong = await client.ping();
      checks.redis = pong === 'PONG' ? 'OK' : 'DEGRADED';
      this.circuitBreaker.recordSuccess();
    } catch (err) {
      checks.redis = 'ERROR';
      checks.error = err.message;
      this.circuitBreaker.recordFailure();
    } finally {
      this.release(client);
    }

    return checks;
  }

  // ─── Convenience: Key Pattern Helpers ──────────────────────────

  /** ADR-112: Rate limit counter */
  rateLimitKey(clientId, bucket) {
    return `ratelimit:${clientId}:${bucket}`;
  }

  /** ADR-113: WebSocket connection registry */
  wsConnKey(userId) {
    return `ws:conn:${userId}`;
  }

  /** ADR-116: Feature flag cache (5min TTL) */
  flagsKey(flagName) {
    return `flags:${flagName}`;
  }

  /** ADR-117: Kill switch state (no TTL) */
  chaosKillSwitchKey() {
    return 'chaos:kill-switch';
  }

  /** ADR-117: Experiment state */
  chaosExperimentKey(experimentId) {
    return `chaos:experiment:${experimentId}`;
  }
}

export { CircuitBreaker, LocalCache };
export default RedisPool;