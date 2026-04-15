/**
 * RateLimiter
 * Spam-filter-aware rate limiting with token bucket, per-domain tracking,
 * sender warmup schedule, and auto-throttle on high bounce rate.
 */
import {
  getProviderProfile,
  type ProviderRateProfile,
} from './ProviderProfiles';

// ── Types ──────────────────────────────────────────────────────────────

export interface CanSendResult {
  allowed: boolean;
  /** Milliseconds to wait before the next check (0 if allowed) */
  waitMs: number;
  /** Human-readable reason if not allowed */
  reason?: string;
}

export interface RateLimiterConfig {
  /** Provider profile ID or inline profile (default: 'smtp') */
  provider?: string | ProviderRateProfile;
  /** When the sender started warming up (ISO date). Defaults to now. */
  warmupStartDate?: string;
  /** Bounce rate threshold for auto-throttle (default: 0.05 = 5%) */
  bounceThrottleThreshold?: number;
  /** Multiplier applied when auto-throttled (default: 0.5 = half rate) */
  throttleMultiplier?: number;
  /** How long the auto-throttle stays active after last bounce (ms, default: 3600000 = 1h) */
  throttleCooldownMs?: number;
}

interface DomainBucket {
  timestamps: number[]; // per-minute window
  hourlyTimestamps: number[]; // per-hour window
  lastActivityAt: number; // timestamp of most recent activity
}

interface BounceWindowEntry {
  timestamp: number;
  type: 'sent' | 'bounce';
}

// ── Implementation ─────────────────────────────────────────────────────

export class RateLimiter {
  private profile: ProviderRateProfile;
  private warmupStart: number;
  private bounceThrottleThreshold: number;
  private throttleMultiplier: number;
  private throttleCooldownMs: number;

  // Token bucket state
  private tokens: number;
  private lastRefill: number;

  // Per-domain tracking
  private domainBuckets: Map<string, DomainBucket> = new Map();
  private readonly maxDomains: number = 10_000;

  // Sliding window bounce tracking
  private bounceWindow: BounceWindowEntry[] = [];
  private readonly bounceWindowMaxEntries: number = 1000;
  private readonly bounceWindowMaxAgeMs: number = 86_400_000; // 24 hours

  // Daily counter
  private dailyCount: number = 0;
  private dailyResetAt: number;

  // Auto-throttle state
  private throttled = false;
  private lastBounceAt = 0;

  constructor(config: RateLimiterConfig = {}) {
    // Resolve profile
    if (typeof config.provider === 'object') {
      this.profile = config.provider;
    } else {
      this.profile = getProviderProfile(config.provider ?? 'smtp');
    }

    this.warmupStart = config.warmupStartDate
      ? new Date(config.warmupStartDate).getTime()
      : Date.now();

    this.bounceThrottleThreshold = config.bounceThrottleThreshold ?? 0.05;
    this.throttleMultiplier = config.throttleMultiplier ?? 0.5;
    this.throttleCooldownMs = config.throttleCooldownMs ?? 3_600_000;

    // Initialize token bucket at full burst capacity
    this.tokens = this.profile.burstSize;
    this.lastRefill = Date.now();

    // Daily counter reset
    this.dailyResetAt = this.startOfNextDay();
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Check whether an email to the given recipient can be sent now.
   * Returns { allowed, waitMs, reason } — if not allowed, waitMs tells
   * the caller how long to delay before retrying.
   */
  canSend(recipientEmail: string): CanSendResult {
    this.refillTokens();
    this.resetDailyIfNeeded();
    this.pruneDomainBuckets();

    const now = Date.now();

    // 1. Auto-throttle check
    if (this.throttled) {
      const elapsed = now - this.lastBounceAt;
      if (elapsed < this.throttleCooldownMs) {
        const remaining = this.throttleCooldownMs - elapsed;
        return { allowed: false, waitMs: remaining, reason: 'Auto-throttled due to high bounce rate' };
      }
      this.throttled = false; // cooldown expired
    }

    // 2. Daily limit (with warmup)
    const dailyLimit = this.getEffectiveDailyLimit();
    if (this.dailyCount >= dailyLimit) {
      const waitMs = this.dailyResetAt - now;
      return { allowed: false, waitMs: Math.max(waitMs, 1000), reason: `Daily limit reached (${dailyLimit})` };
    }

    // 3. Token bucket
    const effectiveBurst = this.getEffectiveBurst();
    if (this.tokens < 1) {
      const waitMs = this.profile.refillIntervalMs;
      return { allowed: false, waitMs, reason: 'Rate limit: no tokens available' };
    }

    // 4. Per-domain limits
    const domain = this.extractDomain(recipientEmail);
    const domainResult = this.checkDomainLimit(domain, now);
    if (!domainResult.allowed) {
      return domainResult;
    }

    // All checks passed
    return { allowed: true, waitMs: 0 };
  }

  /**
   * Record that an email was sent (consumes a token, increments counters).
   * Call this AFTER actually sending (or right before).
   */
  recordSend(recipientEmail: string): void {
    this.refillTokens();

    // Consume token
    if (this.tokens > 0) {
      this.tokens--;
    }

    // Increment daily counter
    this.dailyCount++;

    // Track per-domain
    const domain = this.extractDomain(recipientEmail);
    const bucket = this.getDomainBucket(domain);
    const now = Date.now();
    bucket.timestamps.push(now);
    bucket.hourlyTimestamps.push(now);
    bucket.lastActivityAt = now;

    // Track in bounce sliding window
    this.recordBounceWindowSent();
  }

  /**
   * Record a bounce event. Evaluates bounce rate using the sliding window.
   */
  recordBounce(): void {
    this.pruneBounceWindow();
    this.bounceWindow.push({ timestamp: Date.now(), type: 'bounce' });
    this.lastBounceAt = Date.now();

    const { sent, bounced } = this.getBounceWindowCounts();
    if (sent > 0 && (bounced / sent) >= this.bounceThrottleThreshold) {
      this.throttled = true;
    }
  }

  /**
   * Record a sent event in the bounce tracking window.
   */
  recordBounceWindowSent(): void {
    this.pruneBounceWindow();
    this.bounceWindow.push({ timestamp: Date.now(), type: 'sent' });
  }

  /**
   * Manually set or clear throttle state.
   */
  setThrottled(throttled: boolean): void {
    this.throttled = throttled;
    if (throttled) this.lastBounceAt = Date.now();
  }

  /**
   * Get current state (for monitoring / admin).
   */
  getStatus(): {
    tokens: number;
    dailyCount: number;
    dailyLimit: number;
    warmupDay: number;
    throttled: boolean;
    domainCount: number;
  } {
    this.refillTokens();
    return {
      tokens: this.tokens,
      dailyCount: this.dailyCount,
      dailyLimit: this.getEffectiveDailyLimit(),
      warmupDay: this.getWarmupDay(),
      throttled: this.throttled,
      domainCount: this.domainBuckets.size,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const ticks = Math.floor(elapsed / this.profile.refillIntervalMs);

    if (ticks > 0) {
      const effectiveBurst = this.getEffectiveBurst();
      const added = ticks * this.getEffectiveRefillAmount();
      this.tokens = Math.min(this.tokens + added, effectiveBurst);
      this.lastRefill += ticks * this.profile.refillIntervalMs;
    }
  }

  private resetDailyIfNeeded(): void {
    if (Date.now() >= this.dailyResetAt) {
      this.dailyCount = 0;
      this.dailyResetAt = this.startOfNextDay();
    }
  }

  /**
   * Get the daily limit considering warmup schedule and throttle state.
   */
  private getEffectiveDailyLimit(): number {
    let limit = this.profile.emailsPerDay;

    // Apply warmup schedule
    const warmupDay = this.getWarmupDay();
    const schedule = this.profile.warmupSchedule;
    // Find the most recent schedule entry <= warmupDay
    const applicableDays = Object.keys(schedule)
      .map(Number)
      .filter(d => d <= warmupDay)
      .sort((a, b) => b - a);

    if (applicableDays.length > 0) {
      limit = schedule[applicableDays[0]];
    } else if (warmupDay < 1) {
      // Before day 1 — use day 1 limit
      const day1 = Object.keys(schedule).map(Number).sort((a, b) => a - b)[0];
      if (day1 != null) limit = schedule[day1];
    }

    // Apply throttle multiplier
    if (this.throttled) {
      limit = Math.floor(limit * this.throttleMultiplier);
    }

    return limit;
  }

  private getEffectiveBurst(): number {
    if (this.throttled) {
      return Math.max(1, Math.floor(this.profile.burstSize * this.throttleMultiplier));
    }
    return this.profile.burstSize;
  }

  private getEffectiveRefillAmount(): number {
    if (this.throttled) {
      return Math.max(1, Math.floor(this.profile.refillAmount * this.throttleMultiplier));
    }
    return this.profile.refillAmount;
  }

  private getWarmupDay(): number {
    const daysSinceStart = (Date.now() - this.warmupStart) / (24 * 60 * 60 * 1000);
    return Math.floor(daysSinceStart) + 1;
  }

  private checkDomainLimit(domain: string, now: number): CanSendResult {
    const bucket = this.getDomainBucket(domain);
    const oneMinuteAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;

    // Prune
    bucket.timestamps = bucket.timestamps.filter(t => t > oneMinuteAgo);
    bucket.hourlyTimestamps = bucket.hourlyTimestamps.filter(t => t > oneHourAgo);
    bucket.lastActivityAt = now;

    // Per-minute check
    if (bucket.timestamps.length >= this.profile.perDomain.perMinute) {
      const oldest = bucket.timestamps[0];
      const waitMs = oldest + 60_000 - now;
      return { allowed: false, waitMs: Math.max(waitMs, 1000), reason: `Per-domain minute limit reached for ${domain}` };
    }

    // Per-hour check
    if (bucket.hourlyTimestamps.length >= this.profile.perDomain.perHour) {
      const oldest = bucket.hourlyTimestamps[0];
      const waitMs = oldest + 3_600_000 - now;
      return { allowed: false, waitMs: Math.max(waitMs, 1000), reason: `Per-domain hour limit reached for ${domain}` };
    }

    return { allowed: true, waitMs: 0 };
  }

  private getDomainBucket(domain: string): DomainBucket {
    let bucket = this.domainBuckets.get(domain);
    if (!bucket) {
      bucket = { timestamps: [], hourlyTimestamps: [], lastActivityAt: Date.now() };
      this.domainBuckets.set(domain, bucket);
    }
    return bucket;
  }

  /**
   * Prune domain buckets with no recent activity, and enforce maxDomains cap.
   */
  private pruneDomainBuckets(): void {
    const now = Date.now();
    // Remove domains with empty timestamp arrays (no recent activity)
    for (const [domain, bucket] of this.domainBuckets) {
      if (bucket.timestamps.length === 0 && bucket.hourlyTimestamps.length === 0) {
        this.domainBuckets.delete(domain);
      }
    }
    // Enforce maxDomains cap — remove oldest entries
    if (this.domainBuckets.size > this.maxDomains) {
      const entries = [...this.domainBuckets.entries()]
        .sort((a, b) => a[1].lastActivityAt - b[1].lastActivityAt);
      const excess = this.domainBuckets.size - this.maxDomains;
      for (let i = 0; i < excess; i++) {
        this.domainBuckets.delete(entries[i][0]);
      }
    }
  }

  /**
   * Prune expired entries from the bounce sliding window.
   */
  private pruneBounceWindow(): void {
    const cutoff = Date.now() - this.bounceWindowMaxAgeMs;
    // Also cap by max entries — keep only the most recent
    if (this.bounceWindow.length > this.bounceWindowMaxEntries) {
      this.bounceWindow = this.bounceWindow.slice(-this.bounceWindowMaxEntries);
    }
    this.bounceWindow = this.bounceWindow.filter(e => e.timestamp > cutoff);
  }

  /**
   * Get sent/bounced counts from the current sliding window.
   */
  private getBounceWindowCounts(): { sent: number; bounced: number } {
    let sent = 0;
    let bounced = 0;
    for (const entry of this.bounceWindow) {
      if (entry.type === 'sent') sent++;
      else bounced++;
    }
    return { sent, bounced };
  }

  private extractDomain(email: string): string {
    const atIdx = email.lastIndexOf('@');
    if (atIdx === -1) return email.toLowerCase();
    return email.slice(atIdx + 1).toLowerCase();
  }

  private startOfNextDay(): number {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
  }
}

export default RateLimiter;