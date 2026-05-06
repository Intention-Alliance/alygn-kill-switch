// Auth rate limiter — stricter limits for login attempts
// 5 attempts per 15 minutes per IP (vs 10/min for general API)

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_RATE_LIMIT_MAX = 5;

export class AuthRateLimiter {
  private attempts = new Map<string, { count: number; windowStart: number }>();

  check(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.attempts.get(ip);

    if (!entry || now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) {
      this.attempts.set(ip, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (entry.count >= AUTH_RATE_LIMIT_MAX) {
      const elapsed = now - entry.windowStart;
      const retryAfter = Math.ceil((AUTH_RATE_LIMIT_WINDOW_MS - elapsed) / 1000);
      return { allowed: false, retryAfterSeconds: retryAfter };
    }

    entry.count++;
    return { allowed: true };
  }

  reset(ip: string): void {
    this.attempts.delete(ip);
  }
}

export { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS };