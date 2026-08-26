/**
 * Redis-backed Sliding-Window Rate Limiter
 *
 * Replaces the old Map-based in-memory rate limiter with Redis sorted sets.
 *
 * MUTATION endpoints (POST/PUT/PATCH/DELETE) are rate-limited at a strict
 * budget. READ endpoints (GET/HEAD/OPTIONS) are rate-limited at a higher
 * budget so the dashboard can navigate between pages without tripping 429,
 * while still protecting DB-query endpoints from authenticated GET flooding.
 *
 * Static asset paths (/_next/static/, /_next/data/, favicon) and heartbeat
 * endpoints (/health, /v1/kill-switch/health) are exempt entirely — they are
 * navigation/asset traffic, not DB-query endpoints, and must never 429.
 *
 *   - Write: 10 requests per 60s window (POST/PUT/PATCH/DELETE)
 *   - Read:  200 requests per 60s window (GET/HEAD/OPTIONS on API routes)
 *   - Static assets + heartbeat: NOT rate-limited
 *
 * Graceful degradation: allows requests if Redis is unavailable.
 *
 * ADR-133: Kill Switch dashboard — Redis-backed rate limits.
 */

import type { RedisPool } from '../types/redis-pool';

// ─── Configuration ────────────────────────────────
export const READ_RATE_LIMIT_MAX = 200;  // GET/HEAD/OPTIONS per minute (3x write budget)
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

/**
 * Static asset / navigation paths that must never be rate-limited. These are
 * browser asset fetches (Next.js chunks, data, favicon), not DB-query API
 * endpoints, so they are exempt entirely to avoid 429s during navigation.
 */
export function isStaticAssetUrl(url: string): boolean {
  return (
    url.startsWith('/_next/static/') ||
    url.startsWith('/_next/data/') ||
    url === '/favicon.ico' ||
    url.startsWith('/favicon.')
  );
}

export async function checkRateLimit(
  ip: string,
  method: string = 'GET',
  url: string = '/',
): Promise<{ allowed: boolean; retryAfter?: number }> {
  // Heartbeat and static asset paths are exempt entirely — they are not
  // DB-query endpoints and must never trip the limiter during navigation.
  if (isHeartbeatUrl(url) || isStaticAssetUrl(url)) return { allowed: true };

  // Read/navigation requests (GET/HEAD/OPTIONS) are rate-limited at a higher
  // budget than mutations. This protects DB-query endpoints from authenticated
  // GET flooding while still allowing the dashboard to navigate between pages.
  if (isReadRequest(method)) {
    return checkRateLimitRedis(ip, READ_RATE_LIMIT_MAX);
  }

  // Mutation endpoints (POST/PUT/PATCH/DELETE) and the /api/chat webhook
  // (a POST) are rate-limited at the strict write budget.
  return checkRateLimitRedis(ip, WRITE_RATE_LIMIT_MAX);
}
