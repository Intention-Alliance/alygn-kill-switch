/**
 * RateLimiter — Generic token-bucket rate limiter
 *
 * Provides a reusable token-bucket implementation suitable for any
 * rate-limited resource (API endpoints, email sends, webhook calls, etc.).
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface TokenBucketConfig {
  /** Maximum tokens the bucket can hold (burst capacity) */
  maxTokens: number;
  /** Tokens added per refill interval */
  refillAmount: number;
  /** Milliseconds between refills */
  refillIntervalMs: number;
  /** Optional label for debugging / logging */
  label?: string;
}

export interface ConsumeResult {
  /** Whether the consume was allowed */
  allowed: boolean;
  /** Remaining tokens after the attempt (0 if denied) */
  remaining: number;
  /** Milliseconds until next token is available (0 if allowed) */
  retryAfterMs: number;
  /** Human-readable reason when denied */
  reason?: string;
}

// ── Implementation ─────────────────────────────────────────────────────

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillAmount: number;
  private readonly refillIntervalMs: number;
  private readonly label: string;

  constructor(config: TokenBucketConfig) {
    this.maxTokens = config.maxTokens;
    this.refillAmount = config.refillAmount;
    this.refillIntervalMs = config.refillIntervalMs;
    this.label = config.label ?? 'unnamed';
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Try to consume `count` tokens. Returns result indicating success
   * or how long to wait before retrying.
   */
  consume(count: number = 1): ConsumeResult {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return {
        allowed: true,
        remaining: this.tokens,
        retryAfterMs: 0,
      };
    }

    const deficit = count - this.tokens;
    const refillsNeeded = Math.ceil(deficit / this.refillAmount);
    // Account for time already elapsed since last refill to avoid overestimating wait time.
    const msToNextRefill = this.refillIntervalMs - ((Date.now() - this.lastRefill) % this.refillIntervalMs);
    const retryAfterMs = msToNextRefill + (refillsNeeded - 1) * this.refillIntervalMs;

    return {
      allowed: false,
      remaining: Math.floor(this.tokens),
      retryAfterMs: deficit > 0 ? retryAfterMs : 0,
      reason: `Rate limit exceeded for "${this.label}": need ${count}, have ${Math.floor(this.tokens)}`,
    };
  }

  /**
   * Check if `count` tokens are available without consuming them.
   */
  peek(count: number = 1): ConsumeResult {
    this.refill();

    if (this.tokens >= count) {
      return {
        allowed: true,
        remaining: Math.floor(this.tokens) - count,
        retryAfterMs: 0,
      };
    }

    const deficit = count - this.tokens;
    const refillsNeeded = Math.ceil(deficit / this.refillAmount);
    const msToNextRefill = this.refillIntervalMs - ((Date.now() - this.lastRefill) % this.refillIntervalMs);
    const retryAfterMs = msToNextRefill + (refillsNeeded - 1) * this.refillIntervalMs;

    return {
      allowed: false,
      remaining: Math.floor(this.tokens),
      retryAfterMs: deficit > 0 ? retryAfterMs : 0,
      reason: `Insufficient tokens for "${this.label}": need ${count}, have ${Math.floor(this.tokens)}`,
    };
  }

  /**
   * Forcefully add tokens (e.g. for admin overrides or credit grants).
   */
  credit(count: number): void {
    this.refill();
    this.tokens = Math.min(this.tokens + count, this.maxTokens);
  }

  /**
   * Reset the bucket to full capacity.
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Current token count (after refill).
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Get bucket metadata.
   */
  getStatus(): {
    label: string;
    available: number;
    maxTokens: number;
    refillAmount: number;
    refillIntervalMs: number;
    utilizationPercent: number;
  } {
    this.refill();
    return {
      label: this.label,
      available: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      refillAmount: this.refillAmount,
      refillIntervalMs: this.refillIntervalMs,
      utilizationPercent: Math.round(((this.maxTokens - this.tokens) / this.maxTokens) * 100),
    };
  }

  // ── Internal ────────────────────────────────────────────────────────

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const ticks = Math.floor(elapsed / this.refillIntervalMs);

    if (ticks > 0) {
      const added = ticks * this.refillAmount;
      this.tokens = Math.min(this.tokens + added, this.maxTokens);
      this.lastRefill += ticks * this.refillIntervalMs;
    }
  }
}

export default RateLimiter;