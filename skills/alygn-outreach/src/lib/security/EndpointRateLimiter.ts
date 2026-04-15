/**
 * EndpointRateLimiter — Per-endpoint rate limiting with preset configurations
 *
 * Wraps the generic RateLimiter with endpoint-specific presets and
 * convenience methods. Integrates with EmailService and WebhookHandler
 * to enforce rate limits on outbound operations.
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */
import { RateLimiter, type TokenBucketConfig, type ConsumeResult } from './RateLimiter';

// ── Types ──────────────────────────────────────────────────────────────

export type EndpointPreset =
  | 'email-send'
  | 'email-batch'
  | 'webhook-incoming'
  | 'webhook-outgoing'
  | 'api-general'
  | 'api-write'
  | 'api-read'
  | 'auth-login'
  | 'auth-register'
  | 'password-reset';

export interface EndpointLimitConfig {
  preset: EndpointPreset;
  /** Override the preset's TokenBucketConfig (optional) */
  overrides?: Partial<TokenBucketConfig>;
}

export interface EndpointConsumeResult extends ConsumeResult {
  endpoint: EndpointPreset;
}

// ── Preset configurations ──────────────────────────────────────────────

const ENDPOINT_PRESETS: Record<EndpointPreset, TokenBucketConfig> = {
  'email-send': {
    maxTokens: 10,
    refillAmount: 10,
    refillIntervalMs: 60_000,       // 10 emails/min burst
    label: 'email-send',
  },
  'email-batch': {
    maxTokens: 50,
    refillAmount: 50,
    refillIntervalMs: 3_600_000,   // 50 emails/hour
    label: 'email-batch',
  },
  'webhook-incoming': {
    maxTokens: 100,
    refillAmount: 100,
    refillIntervalMs: 60_000,       // 100 webhooks/min
    label: 'webhook-incoming',
  },
  'webhook-outgoing': {
    maxTokens: 30,
    refillAmount: 30,
    refillIntervalMs: 60_000,       // 30 outgoing webhooks/min
    label: 'webhook-outgoing',
  },
  'api-general': {
    maxTokens: 60,
    refillAmount: 60,
    refillIntervalMs: 60_000,       // 60 req/min
    label: 'api-general',
  },
  'api-write': {
    maxTokens: 20,
    refillAmount: 20,
    refillIntervalMs: 60_000,       // 20 writes/min
    label: 'api-write',
  },
  'api-read': {
    maxTokens: 120,
    refillAmount: 120,
    refillIntervalMs: 60_000,       // 120 reads/min
    label: 'api-read',
  },
  'auth-login': {
    maxTokens: 5,
    refillAmount: 5,
    refillIntervalMs: 60_000,       // 5 login attempts/min
    label: 'auth-login',
  },
  'auth-register': {
    maxTokens: 3,
    refillAmount: 3,
    refillIntervalMs: 60_000,       // 3 registrations/min
    label: 'auth-register',
  },
  'password-reset': {
    maxTokens: 3,
    refillAmount: 3,
    refillIntervalMs: 300_000,       // 3 resets per 5 min
    label: 'password-reset',
  },
};

// ── Implementation ─────────────────────────────────────────────────────

export class EndpointRateLimiter {
  private limiters: Map<EndpointPreset, RateLimiter> = new Map();
  private readonly customPresets: Map<EndpointPreset, TokenBucketConfig> = new Map();

  constructor(initialEndpoints?: EndpointLimitConfig[]) {
    if (initialEndpoints) {
      for (const cfg of initialEndpoints) {
        this.getLimiter(cfg.preset, cfg.overrides);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Try to consume a token for the given endpoint.
   */
  consume(endpoint: EndpointPreset, count: number = 1): EndpointConsumeResult {
    const limiter = this.getLimiter(endpoint);
    const result = limiter.consume(count);
    return { ...result, endpoint };
  }

  /**
   * Check availability without consuming.
   */
  peek(endpoint: EndpointPreset, count: number = 1): EndpointConsumeResult {
    const limiter = this.getLimiter(endpoint);
    const result = limiter.peek(count);
    return { ...result, endpoint };
  }

  /**
   * Add tokens to an endpoint's bucket (admin override).
   */
  credit(endpoint: EndpointPreset, count: number): void {
    const limiter = this.getLimiter(endpoint);
    limiter.credit(count);
  }

  /**
   * Reset a specific endpoint's bucket to full.
   */
  resetEndpoint(endpoint: EndpointPreset): void {
    const limiter = this.limiters.get(endpoint);
    if (limiter) limiter.reset();
  }

  /**
   * Reset all endpoint buckets.
   */
  resetAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
  }

  /**
   * Register or update a custom preset (overrides built-in for this instance).
   */
  registerPreset(preset: EndpointPreset, config: TokenBucketConfig): void {
    this.customPresets.set(preset, config);
    // Invalidate cached limiter so next access picks up new config
    this.limiters.delete(preset);
  }

  /**
   * Get the RateLimiter instance for a specific endpoint.
   */
  getLimiterForEndpoint(endpoint: EndpointPreset): RateLimiter {
    return this.getLimiter(endpoint);
  }

  /**
   * Get status for all active endpoints.
   */
  getAllStatus(): Record<EndpointPreset, ReturnType<RateLimiter['getStatus']>> {
    const result = {} as Record<EndpointPreset, ReturnType<RateLimiter['getStatus']>>;
    for (const [preset, limiter] of this.limiters) {
      result[preset] = limiter.getStatus();
    }
    return result;
  }

  /**
   * Get a list of all configured endpoint presets.
   */
  getConfiguredEndpoints(): EndpointPreset[] {
    return [...this.limiters.keys()];
  }

  // ── EmailService integration helpers ─────────────────────────────────

  /**
   * Check if an email can be sent (uses 'email-send' preset).
   * Returns ConsumeResult — call recordEmailSend() after successful send.
   */
  canSendEmail(): EndpointConsumeResult {
    return this.consume('email-send');
  }

  /**
   * Check if a batch email operation can proceed (uses 'email-batch' preset).
   */
  canSendBatch(count: number = 1): EndpointConsumeResult {
    return this.consume('email-batch', count);
  }

  /**
   * Record that an email was sent.
   * Call AFTER the send succeeds.
   *
   * No-op: tokens are already consumed at check time by canSendEmail()
   * and canSendBatch(), so there is nothing to deduct here. This matches
   * the pattern used by recordWebhookProcessed/recordWebhookSent.
   */
  recordEmailSend(_isBatch: boolean = false): void {
    // Tokens consumed at check time — nothing to do.
  }

  // ── WebhookHandler integration helpers ────────────────────────────────

  /**
   * Check if an incoming webhook can be processed (uses 'webhook-incoming' preset).
   */
  canProcessWebhook(): EndpointConsumeResult {
    return this.consume('webhook-incoming');
  }

  /**
   * Check if an outgoing webhook can be sent (uses 'webhook-outgoing' preset).
   */
  canSendWebhook(): EndpointConsumeResult {
    return this.consume('webhook-outgoing');
  }

  /**
   * Record that an incoming webhook was processed.
   * Token already consumed by canProcessWebhook().
   */
  recordWebhookProcessed(): void {
    // Already consumed in canProcessWebhook()
  }

  /**
   * Record that an outgoing webhook was sent.
   * Token already consumed by canSendWebhook().
   */
  recordWebhookSent(): void {
    // Already consumed in canSendWebhook()
  }

  // ── Internal ────────────────────────────────────────────────────────

  private getLimiter(endpoint: EndpointPreset, overrides?: Partial<TokenBucketConfig>): RateLimiter {
    let limiter = this.limiters.get(endpoint);
    if (limiter) return limiter;

    // Custom preset takes precedence
    let config = this.customPresets.get(endpoint) ?? ENDPOINT_PRESETS[endpoint];

    if (!config) {
      // Fallback to api-general for unknown presets
      config = ENDPOINT_PRESETS['api-general'];
    }

    // Apply overrides
    const finalConfig: TokenBucketConfig = {
      maxTokens: overrides?.maxTokens ?? config.maxTokens,
      refillAmount: overrides?.refillAmount ?? config.refillAmount,
      refillIntervalMs: overrides?.refillIntervalMs ?? config.refillIntervalMs,
      label: overrides?.label ?? config.label ?? endpoint,
    };

    limiter = new RateLimiter(finalConfig);
    this.limiters.set(endpoint, limiter);
    return limiter;
  }
}

export default EndpointRateLimiter;