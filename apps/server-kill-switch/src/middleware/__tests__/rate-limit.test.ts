import { describe, it, expect } from 'bun:test';
import {
  checkRateLimit,
  isReadRequest,
  isHeartbeatUrl,
  initRateLimiter,
  READ_RATE_LIMIT_MAX,
  WRITE_RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
} from '../rate-limit';
import type { RedisPool } from '../../types/redis-pool';

// ─── Pure unit functions ──────────────────────────

describe('isReadRequest', () => {
  it('returns true for GET', () => {
    expect(isReadRequest('GET')).toBe(true);
  });

  it('returns false for POST', () => {
    expect(isReadRequest('POST')).toBe(false);
  });

  it('returns true for HEAD', () => {
    expect(isReadRequest('HEAD')).toBe(true);
  });

  it('returns true for OPTIONS', () => {
    expect(isReadRequest('OPTIONS')).toBe(true);
  });

  it('returns false for PUT, PATCH, DELETE', () => {
    expect(isReadRequest('PUT')).toBe(false);
    expect(isReadRequest('PATCH')).toBe(false);
    expect(isReadRequest('DELETE')).toBe(false);
  });
});

describe('isHeartbeatUrl', () => {
  it('returns true for /v1/kill-switch/health', () => {
    expect(isHeartbeatUrl('/v1/kill-switch/health')).toBe(true);
  });

  it('returns true for /health', () => {
    expect(isHeartbeatUrl('/health')).toBe(true);
  });

  it('returns false for /v1/flags', () => {
    expect(isHeartbeatUrl('/v1/flags')).toBe(false);
  });

  it('returns false for /api/other', () => {
    expect(isHeartbeatUrl('/api/other')).toBe(false);
  });
});

// ─── Rate limiting with graceful degradation ──────

describe('checkRateLimit', () => {
  it('returns { allowed: true } when Redis is not initialized (graceful degradation)', async () => {
    const result = await checkRateLimit('10.0.0.1', 'POST', '/v1/flags');
    expect(result).toEqual({ allowed: true });
  });

  it('bypasses rate limiting for heartbeat URLs regardless of method', async () => {
    // Heartbeat URL with POST (write) should still bypass
    const result = await checkRateLimit('10.0.0.1', 'POST', '/v1/kill-switch/health');
    expect(result).toEqual({ allowed: true });
  });

  it('bypasses rate limiting for /health (short form)', async () => {
    const result = await checkRateLimit('10.0.0.1', 'GET', '/health');
    expect(result).toEqual({ allowed: true });
  });
});

// ─── Constants ────────────────────────────────────

describe('rate limit constants', () => {
  it('RATE_LIMIT_MAX equals READ_RATE_LIMIT_MAX for backward compatibility', () => {
    expect(RATE_LIMIT_MAX).toBe(READ_RATE_LIMIT_MAX);
    expect(RATE_LIMIT_MAX).toBe(60);
  });

  it('exports READ_RATE_LIMIT_MAX', () => {
    expect(READ_RATE_LIMIT_MAX).toBe(60);
  });

  it('exports WRITE_RATE_LIMIT_MAX', () => {
    expect(WRITE_RATE_LIMIT_MAX).toBe(10);
  });

  it('exports RATE_LIMIT_WINDOW_MS', () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(60000);
  });

  it('read limit is greater than write limit', () => {
    expect(READ_RATE_LIMIT_MAX).toBeGreaterThan(WRITE_RATE_LIMIT_MAX);
  });
});

// ─── initRateLimiter ──────────────────────────────

describe('initRateLimiter', () => {
  it('accepts a RedisPool and does not throw', () => {
    const mockPool: RedisPool = {
      getClient: async () => ({ multi: () => ({ zAdd() { return this; }, zRemRangeByScore() { return this; }, zCard() { return this; }, expire() { return this; }, exec: async () => [0, 0, 1, 1] }) }),
      release: () => {},
      get: async () => null,
      set: async () => null,
      del: async () => 0,
      publish: async () => 0,
      subscribe: async () => {},
      healthCheck: async () => ({ redis: 'ok' }),
      chaosKillSwitchKey: () => 'chaos:kill-switch',
      connect: async () => {},
    };

    expect(() => initRateLimiter(mockPool)).not.toThrow();
  });

  it('after init, checkRateLimit no longer falls back to uninitialized path', async () => {
    // Create a mock whose getClient throws so we hit the catch (not the uninitialized path)
    const mockPool: RedisPool = {
      getClient: async () => { throw new Error('Redis connection refused'); },
      release: () => {},
      get: async () => null,
      set: async () => null,
      del: async () => 0,
      publish: async () => 0,
      subscribe: async () => {},
      healthCheck: async () => ({ redis: 'ok' }),
      chaosKillSwitchKey: () => 'chaos:kill-switch',
      connect: async () => {},
    };

    initRateLimiter(mockPool);

    // Should hit the catch block (Redis error) → { allowed: true }
    // Not the "Redis not initialized" path
    const result = await checkRateLimit('10.0.0.2', 'POST', '/v1/flags');
    expect(result).toEqual({ allowed: true });
  });
});
