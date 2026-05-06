// Rate Limiter (in-memory, per-IP)
// Extracted from kill-switch-service.mjs

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

export class RateLimiter {
  private requests = new Map<string, { count: number; windowStart: number }>();

  check(ip: string): boolean {
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

export { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS };