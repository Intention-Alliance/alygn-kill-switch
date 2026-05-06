// Rate limiting middleware

import { RateLimiter, RATE_LIMIT_MAX } from '../services/rate-limiter';

const limiter = new RateLimiter();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  if (!limiter.check(ip)) {
    return { allowed: false, retryAfter: 60 };
  }
  return { allowed: true };
}

export { RATE_LIMIT_MAX };