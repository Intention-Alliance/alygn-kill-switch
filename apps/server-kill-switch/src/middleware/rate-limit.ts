/**
 * Split Rate Limiter — Read (60/min) + Write (10/min)
 *
 * Replaces the old single 10/min rate limiter with two independent limiters:
 *   - ReadRateLimiter: 60 requests per 60s window (GET/HEAD/OPTIONS)
 *   - WriteRateLimiter: 10 requests per 60s window (POST/PUT/PATCH/DELETE)
 *
 * Heartbeat endpoints (machines/:id/heartbeat) bypass rate limiting entirely.
 *
 * ADR-133: Kill Switch dashboard rebuild — split rate limits.
 */

const READ_WINDOW_MS = 60_000;
const READ_MAX = 60;
const WRITE_WINDOW_MS = 60_000;
const WRITE_MAX = 10;

// ─── Read Rate Limiter (60/min) ─────────────────────────────────────

export class ReadRateLimiter {
  private requests = new Map<string, { count: number; windowStart: number }>();

  check(ip: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(ip);

    if (!entry || now - entry.windowStart > READ_WINDOW_MS) {
      this.requests.set(ip, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= READ_MAX) {
      return false;
    }

    entry.count++;
    return true;
  }
}

// ─── Write Rate Limiter (10/min) ────────────────────────────────────

export class WriteRateLimiter {
  private requests = new Map<string, { count: number; windowStart: number }>();

  check(ip: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(ip);

    if (!entry || now - entry.windowStart > WRITE_WINDOW_MS) {
      this.requests.set(ip, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= WRITE_MAX) {
      return false;
    }

    entry.count++;
    return true;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Determine if a request is a read request based on HTTP method.
 */
export function isReadRequest(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/**
 * Determine if a request is a machine heartbeat (should bypass rate limit).
 */
export function isHeartbeatRequest(url: string): boolean {
  return url.includes('/heartbeat');
}

// ─── Singleton instances ────────────────────────────────────────────

const readLimiter = new ReadRateLimiter();
const writeLimiter = new WriteRateLimiter();

/**
 * Check rate limit for any request.
 * Returns { allowed: boolean; retryAfter?: number }.
 */
export function checkRateLimit(ip: string, method: string = 'GET', url: string = ''): { allowed: boolean; retryAfter?: number } {
  // Heartbeat endpoints bypass rate limiting entirely
  if (isHeartbeatRequest(url)) {
    return { allowed: true };
  }

  const allowed = isReadRequest(method)
    ? readLimiter.check(ip)
    : writeLimiter.check(ip);

  if (!allowed) {
    const retryAfter = Math.ceil(
      (isReadRequest(method) ? READ_WINDOW_MS : WRITE_WINDOW_MS) / 1000
    );
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

// Backward-compatible export for index.ts and types.ts
// RATE_LIMIT_MAX = 10 (write limit) matches the old single-rate-limiter value
export const RATE_LIMIT_MAX = WRITE_MAX;

export { READ_WINDOW_MS, READ_MAX, WRITE_WINDOW_MS, WRITE_MAX };
