/**
 * Redis-backed Sliding-Window Rate Limiter
 *
 * Replaces the old Map-based in-memory rate limiter with Redis sorted sets.
 *
 * Only MUTATION endpoints (POST/PUT/PATCH/DELETE) and the /api/chat webhook
 * are rate-limited. Read/navigation requests (GET/HEAD/OPTIONS) are NOT
 * rate-limited — the dashboard fires many GETs while navigating between
 * pages (machines, flags, settings, health, metrics), and counting those
 * toward a per-minute budget caused the UI to hit 429 just from browsing.
 *
 *   - Write: 10 requests per 60s window (POST/PUT/PATCH/DELETE)
 *   - Read:  NOT rate-limited (GET/HEAD/OPTIONS bypass)
 *
 * Heartbeat endpoints (/health, /v1/kill-switch/health) bypass rate limiting
 * entirely.
 *
 * Graceful degradation: allows requests if Redis is unavailable.
 *
 * ADR-133: Kill Switch dashboard — Redis-backed rate limits.
 */

import type { RedisPool } from '../types/redis-pool';

// ─── Configuration ────────────────────────────────
export const READ_RATE_LIMIT_MAX = 60;   // legacy compat — reads are no longer limited
export const WRITE_RATE_LIMIT_MAX = 10;  // POST/PUT/DELETE per minute
export const RATE_LIMIT_WINDOW_MS = 60000;
export const RATE_LIMIT_MAX = READ_RATE_LIMIT_MAX; // legacy compat

// ─── Redis-backed Sliding Window ──────────────────
let _redis: RedisPool | null = null;

export function initRateLimiter(redis: RedisPool): void {
  _redis = redis;
}

async function checkRateLimitRedis(
  ip: string,
  maxRequests: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (!_redis) {
    console.warn('[rate-limit] Redis not initialized, allowing request');
    return { allowed: true };
  }

  try {
    const now = Date.now();
    const key = `ratelimit:${maxRequests}:${ip}`;
    const cutoff = now - RATE_LIMIT_WINDOW_MS;

    const client = await _redis.getClient();
    try {
      const pipeline = client.multi();
      pipeline.zAdd(key, { score: now, value: `${now}:${Math.random().toString(36).slice(2)}` });
      pipeline.zRemRangeByScore(key, 0, cutoff);
      pipeline.zCard(key);
      pipeline.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) + 1);
      const results = await pipeline.exec();

      const count = results?.[2] as number ?? 0;
      if (count <= maxRequests) return { allowed: true };

      return { allowed: false, retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
    } finally {
      _redis.release(client);
    }
  } catch (err: any) {
    console.error('[rate-limit] Redis error, allowing request:', err.message);
    return { allowed: true };
  }
}

export function isReadRequest(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

export function isHeartbeatUrl(url: string): boolean {
  return url.startsWith('/v1/kill-switch/health') || url.startsWith('/health');
}

export async function checkRateLimit(
  ip: string,
  method: string = 'GET',
  url: string = '/',
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (isHeartbeatUrl(url)) return { allowed: true };

  // Read/navigation requests (GET/HEAD/OPTIONS) are NOT rate-limited. Only
  // mutation endpoints (POST/PUT/PATCH/DELETE) and the /api/chat webhook
  // (a POST) are rate-limited. This prevents the dashboard from tripping the
  // limiter just by navigating between pages.
  if (isReadRequest(method)) return { allowed: true };

  return checkRateLimitRedis(ip, WRITE_RATE_LIMIT_MAX);
}
