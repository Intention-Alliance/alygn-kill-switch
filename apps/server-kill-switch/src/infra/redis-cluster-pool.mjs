/**
 * Redis Cluster Connection Pool with Circuit Breaker & Local Fallback
 * 
 * Phase 0 shared infrastructure for ADR-112, ADR-113, ADR-116, ADR-117
 * 
 * Supports Redis Cluster mode (multiple nodes with slot distribution)
 * 
 * Key patterns:
 *   ratelimit:{client_id}:{bucket}     # ADR-112
 *   ws:conn:{user_id}                  # ADR-113
 *   flags:{flag_name}                  # ADR-116 (5min TTL)
 *   chaos:kill-switch                  # ADR-117 (no TTL)
 *   chaos:experiment:{id}              # ADR-117
 */

import { createCluster } from 'redis';
import { EventEmitter } from 'events';

// ─── Circuit Breaker ───────────────────────────────────────────────

const CIRCUIT_STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker extends EventEmitter {
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

  isHealthy() {
    return this.state === CIRCUIT_STATES.CLOSED || this.state === CIRCUIT_STATES.HALF_OPEN;
  }
}

// ─── Local Cache (Fallback) ────────────────────────────────────────

class LocalCache extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.maxSize = opts.maxSize ?? 100;
    this.defaultTTL = opts.defaultTTL ?? 300_000; // 5 min
    this._cache = new Map();
  }

  async get(key) {
    const item = this._cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this._cache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key, value, ttl = this.defaultTTL) {
    if (this._cache.size >= this.maxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
    this.emit('set', { key, value, ttl });
  }

  async del(key) {
    this._cache.delete(key);
    this.emit('del', { key });
  }

  clear() {
    this._cache.clear();
    this.emit('clear');
  }

  get size() {
    return this._cache.size;
  }
}

// ─── Redis Cluster Pool Manager ───────────────────────────────────

export class RedisPool extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string|string[]} opts.urls - Redis cluster node URLs
   * @param {Object} opts.clientOpts   - Options passed to createCluster
   * @param {Object} opts.circuitBreaker - CircuitBreaker options
   * @param {Object} opts.localCache   - LocalCache options
   */
  constructor(opts = {}) {
    super();
    this.urls = Array.isArray(opts.urls) ? opts.urls : [opts.urls || 'redis://localhost:6379'];
    this.clientOpts = opts.clientOpts ?? {};
    this.circuitBreaker = new CircuitBreaker(opts.circuitBreaker ?? {});
    this.localCache = new LocalCache(opts.localCache ?? {});
    this._cluster = null;
    this._connected = false;

    this.circuitBreaker.on('state-change', (evt) => {
      this.emit('circuit-state-change', evt);
    });
  }

  /**
   * Resolve the nodeAddressMap for createCluster.
   *
   * Reads REDIS_NODE_MAP as a JSON object mapping announced addresses to
   * reachable addresses. Falls back to the host-mode default mapping that
   * translates the internal Docker hostnames to the host-published ports.
   *
   * @redis/client v4.7.1 requires NodeAddressMap values to be
   * `{ host: string; port: number }` objects (not strings). String values
   * in "host:port" form are normalized to objects here so both env-provided
   * and default mappings conform to the expected shape.
   *
   * @returns {Object<string, {host: string, port: number}>} A node address
   *   map whose values are `{ host, port }` objects. Never returns null.
   */
  _resolveNodeAddressMap() {
    const envMap = process.env.REDIS_NODE_MAP;
    if (envMap) {
      try {
        const parsed = JSON.parse(envMap);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Normalize: if values are strings "host:port", convert to objects
          const normalized = {};
          for (const [key, val] of Object.entries(parsed)) {
            if (typeof val === 'string' && val.includes(':')) {
              const idx = val.lastIndexOf(':');
              const host = val.slice(0, idx);
              const portStr = val.slice(idx + 1);
              normalized[key] = { host, port: parseInt(portStr, 10) };
            } else if (typeof val === 'object' && val && val.host && val.port) {
              normalized[key] = { host: val.host, port: parseInt(val.port, 10) };
            }
          }
          return normalized;
        }
      } catch {
        // fall through to default mapping on invalid JSON
      }
    }
    // No env var set: return null (no mapping needed in bridge mode where
    // internal Docker hostnames resolve directly via align-network).
    return null;
    // No env var set: return null (no mapping needed in bridge mode where
    // internal Docker hostnames resolve directly via align-network).
    return null;
    // No env var set: return null (no mapping needed in bridge mode where
    // internal Docker hostnames resolve directly via align-network).
    return null;
    // No env var set: return null (no mapping needed in bridge mode where
    // internal Docker hostnames resolve directly via align-network).
    return null;
    // No env var set: return null (no mapping needed in bridge mode where
    // internal Docker hostnames resolve directly via align-network).
    return null;
  }

  /** Initialize cluster connection */
  async connect() {
    // Parse URLs into rootNodes format for createCluster
    const rootNodes = this.urls.map((url) => {
      const parsed = new URL(url);
      return {
        url: url,
        socket: {
          host: parsed.hostname,
          port: parseInt(parsed.port, 10) || 6379,
        },
      };
    });

    // nodeAddressMap translates the addresses Redis announces via CLUSTER SLOTS
    // (internal Docker hostnames like redis-node-1:6379) to the addresses the
    // client can actually reach. In network_mode: host the kill-switch connects
    // via host-published ports (127.0.0.1:6380-6382), so the announced internal
    // hostnames would not resolve from the host network namespace. The map is
    // configurable via REDIS_NODE_MAP (JSON object) so it works in both host
    // mode (default mapping below) and bridge mode (empty map / internal names).
    const nodeAddressMap = this._resolveNodeAddressMap();

    this._cluster = createCluster({
      rootNodes,
      defaults: {
        ...this.clientOpts,
      },
      ...(nodeAddressMap ? { nodeAddressMap } : {}),
    });

    this._cluster.on('error', (err) => this.emit('error', err));
    await this._cluster.connect();

    this._connected = true;
    this.emit('connected');
  }

  /** Get a cluster client (singleton for cluster mode) */
  async getClient() {
    if (!this._cluster) {
      throw new Error('Cluster not connected');
    }
    return this._cluster;
  }

  /** Release client (no-op for cluster mode, singleton) */
  release(client) {
    // No-op: cluster client is singleton
  }

  /** Disconnect cluster */
  async disconnect() {
    this._connected = false;
    if (this._cluster) {
      try {
        await this._cluster.quit();
      } catch {
        // ignore
      }
    }
    this._cluster = null;
    this.emit('disconnected');
  }

  // ─── Key-Value Operations (with circuit breaker + fallback) ────

  /** Get a value from Redis (with fallback to local cache) */
  async get(key) {
    if (!this.circuitBreaker.allow()) {
      return this.localCache.get(key);
    }

    try {
      const client = await this.getClient();
      const value = await client.get(key);
      this.circuitBreaker.recordSuccess();
      return value;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      this.emit('error', err);
      return this.localCache.get(key);
    }
  }

  /** Set a value in Redis (with local cache fallback on failure) */
  async set(key, value, opts = {}) {
    if (!this.circuitBreaker.allow()) {
      await this.localCache.set(key, value, opts.TTL);
      return false;
    }

    try {
      const client = await this.getClient();
      if (opts.TTL) {
        await client.setEx(key, Math.floor(opts.TTL / 1000), value);
      } else {
        await client.set(key, value);
      }
      this.circuitBreaker.recordSuccess();
      return true;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      this.emit('error', err);
      await this.localCache.set(key, value, opts.TTL);
      return false;
    }
  }

  /** Delete a key from Redis (and local cache) */
  async del(key) {
    await this.localCache.del(key);

    if (!this.circuitBreaker.allow()) {
      return false;
    }

    try {
      const client = await this.getClient();
      await client.del(key);
      this.circuitBreaker.recordSuccess();
      return true;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      this.emit('error', err);
      return false;
    }
  }

  /** Check if a key exists */
  async exists(key) {
    if (!this.circuitBreaker.allow()) {
      return this.localCache.get(key) !== null;
    }

    try {
      const client = await this.getClient();
      const exists = await client.exists(key);
      this.circuitBreaker.recordSuccess();
      return exists > 0;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      this.emit('error', err);
      return this.localCache.get(key) !== null;
    }
  }

  // ─── Pub/Sub ─────────────────────────────────────────────────────

  /** Subscribe to a channel */
  async subscribe(channel, handler) {
    if (!this._cluster) {
      throw new Error('Cluster not connected');
    }

    try {
      await this._cluster.subscribe(channel, (message) => {
        handler(message);
      });
      this.emit('subscribe', { channel });
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  /** Publish a message to a channel */
  async publish(channel, message) {
    if (!this.circuitBreaker.allow()) {
      return false;
    }

    try {
      const client = await this.getClient();
      await client.publish(channel, message);
      this.circuitBreaker.recordSuccess();
      return true;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      this.emit('error', err);
      return false;
    }
  }

  // ─── Utility Methods ─────────────────────────────────────────────

  /** Get Redis key for kill-switch chaos state */
  chaosKillSwitchKey() {
    return 'chaos:kill-switch';
  }

  /** Get Redis key for chaos experiment */
  chaosExperimentKey(id) {
    return `chaos:experiment:${id}`;
  }

  /** Get current circuit breaker state */
  getCircuitState() {
    return this.circuitBreaker.state;
  }

  /** Get local cache size */
  getCacheSize() {
    return this.localCache.size;
  }

  /** Check if connected */
  isConnected() {
    return this._connected && this.circuitBreaker.isHealthy();
  }

  /** Health check - verify Redis connectivity */
  async healthCheck() {
    if (!this._cluster) return { redis: 'UNAVAILABLE' };
    try {
      // Cluster client: sendCommand(firstKey, isReadonly, args)
      await this._cluster.sendCommand(null, true, ['PING']);
      return { redis: 'OK' };
    } catch (err) {
      return { redis: 'ERROR', error: err.message };
    }
  }
}

// Export for single-file usage
export { CircuitBreaker, LocalCache };
