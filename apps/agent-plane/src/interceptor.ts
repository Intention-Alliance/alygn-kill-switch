/**
 * Ollama interception adapter — intercepts LLM requests to the local
 * Ollama instance, scores them, and forwards or blocks per threshold.
 *
 * The agent acts as a reverse proxy: the agent listens on the intercept
 * port (default 11436) and forwards to the real Ollama (default 11434).
 *
 * NOTE: the default was 11435, but nginx owns 11435 (admin-ui.conf serves
 * Ollama over TLS there) — the interceptor could never bind it. 11436 is
 * free on the production host.
 *
 * Enforcement: when the kill-switch is paused (STOPPED/LOCKED), the
 * interceptor rejects inference requests with 503 instead of forwarding.
 * This is the local half of the `enforce` capability — the remote half is
 * the EnforcementConsumer polling the mother's /v1/kill-switch/status.
 *
 * Runtime flags (v1.3): the interceptor reads flags from the backend via a
 * FlagProvider (see flags.ts), applied per request:
 *   - llm_interception_enabled → master toggle (false = pass through unscored)
 *   - auto_stop_threshold      → scoring threshold (overrides constructor default)
 *   - request_sampling_rate    → fraction of requests to score (0-1)
 *   - damage_logging_level     → log verbosity (minimal/standard/verbose)
 *   - alert_on_critical_score  → emit alert when score ≥ threshold
 * When no provider is given (or a flag is missing), the constructor
 * defaults are used — backward compatible.
 */

import type { DecisionFlagReader } from '@align/shared-types';
import {
  decideWithProvider,
  resolveProviderName,
  type ProviderRegistry,
} from '@align/decision-core';

export interface InterceptedRequest {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
  timestamp: string
}
export interface ScoringResult {
  score: number
  action: 'forward' | 'block' | 'escalate' | 'review'
  reasons: string[]
  /** True when the request was actually scored (not sampled out / disabled). */
  scored?: boolean
  /** True when score ≥ threshold and alert_on_critical_score is enabled. */
  alert?: boolean
  /** Provider that produced the decision (S3). */
  provider?: string
  /** True when the provider was unavailable / timed out / unparseable (S3). */
  degraded?: boolean
  /** Calibrated confidence 0..1 when the provider supplies one (S3). */
  confidence?: number
}

/** Reads runtime flag values (see flags.ts FlagClient). */
export interface FlagProvider {
  getFlag(key: string): boolean | number | string | null
}

export class OllamaInterceptor {
  readonly ollamaUrl: string
  readonly listenPort: number
  private readonly scoreThreshold: number
  private readonly isPaused: () => boolean
  private readonly flags?: FlagProvider
  private readonly machineId: string
  private readonly registry?: ProviderRegistry

  constructor(config: {
    ollamaUrl?: string
    listenPort?: number
    scoreThreshold?: number
    isPaused?: () => boolean
    flags?: FlagProvider
    /** Machine id for DecisionInput attribution (S3). */
    machineId?: string
    /** Provider registry (S3). When absent, keyword-only behavior is used. */
    registry?: ProviderRegistry
  }) {
    this.ollamaUrl = (config.ollamaUrl ?? 'http://localhost:11434').replace(/\/$/, '')
    this.listenPort = config.listenPort ?? 11436
    this.scoreThreshold = config.scoreThreshold ?? 0.7
    this.isPaused = config.isPaused ?? (() => false)
    this.flags = config.flags
    this.machineId = config.machineId ?? 'unknown'
    this.registry = config.registry
  }

  async start(onRequest?: (req: InterceptedRequest, result: ScoringResult) => void): Promise<ReturnType<typeof Bun.serve>> {
    const { ollamaUrl, scoreThreshold, isPaused, flags, machineId, registry } = this
    return Bun.serve({
      port: this.listenPort,
      async fetch(req) {
        const url = new URL(req.url)
        const body = req.method === 'POST' ? await req.json().catch(() => null) : null

        const intercepted: InterceptedRequest = {
          method: req.method,
          path: url.pathname,
          body,
          headers: Object.fromEntries(req.headers.entries()),
          timestamp: new Date().toISOString(),
        }

        const decision = await decideInterceptionAsync(
          intercepted,
          scoreThreshold,
          flags,
          registry,
          machineId,
        )
        const scoring: ScoringResult = {
          score: decision.score,
          action: decision.action,
          reasons: decision.reasons,
          scored: decision.scored,
          alert: decision.alert,
          provider: decision.provider,
          degraded: decision.degraded,
          confidence: decision.confidence,
        }

        onRequest?.(intercepted, scoring)

        // Enforcement gate: paused → reject before forwarding
        if (isPaused()) {
          return Response.json(
            {
              error: 'Traffic paused by Alygn Kill Switch',
              state: 'PAUSED',
              score: scoring.score,
              reasons: scoring.reasons,
            },
            { status: 503, headers: { 'Retry-After': '5' } },
          )
        }

        // Fail-closed: a review decision must never reach the upstream fetch.
        if (scoring.action === 'review') {
          return Response.json(
            {
              error: 'Held for review by Alygn Kill Switch',
              action: 'review',
              provider: scoring.provider,
              degraded: scoring.degraded,
              score: scoring.score,
              reasons: scoring.reasons,
            },
            { status: 403 },
          )
        }

        if (scoring.action === 'forward') {
          // Forward to the real Ollama
          const upstream = await fetch(`${ollamaUrl}${url.pathname}${url.search}`, {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
          })
          return new Response(upstream.body, {
            status: upstream.status,
            headers: upstream.headers,
          })
        }

        // Block
        return Response.json(
          { error: 'Blocked by Alygn Kill Switch', score: scoring.score, reasons: scoring.reasons },
          { status: 403 },
        )
      },
    })
  }
}

export interface InterceptionDecision {
  score: number
  action: 'forward' | 'block' | 'escalate' | 'review'
  reasons: string[]
  scored: boolean
  alert: boolean
  /** Provider that produced the decision (S3). */
  provider?: string
  /** True when the provider was unavailable / timed out / unparseable (S3). */
  degraded?: boolean
  /** Calibrated confidence 0..1 when the provider supplies one (S3). */
  confidence?: number
}

/**
 * Applies runtime flags to a request and produces the interception
 * decision. Pure function — unit-testable without a live server.
 */
export function decideInterception(
  req: InterceptedRequest,
  threshold: number,
  flags?: FlagProvider,
): InterceptionDecision {
  const interceptionEnabled = flags?.getFlag('llm_interception_enabled') ?? true
  if (!interceptionEnabled) {
    return {
      score: 0,
      action: 'forward',
      reasons: ['interception disabled by flag'],
      scored: false,
      alert: false,
    }
  }

  const samplingRate = toNumber(flags?.getFlag('request_sampling_rate'), 1.0)
  if (samplingRate < 1.0 && Math.random() > samplingRate) {
    return {
      score: 0,
      action: 'forward',
      reasons: ['request sampled out'],
      scored: false,
      alert: false,
    }
  }

  const effectiveThreshold = toNumber(flags?.getFlag('auto_stop_threshold'), threshold)
  const scoring = scoreRequest(req, effectiveThreshold)
  const alertOnCritical = flags?.getFlag('alert_on_critical_score') ?? true
  return {
    ...scoring,
    scored: true,
    alert: alertOnCritical !== false && scoring.score >= effectiveThreshold,
  }
}

function toNumber(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Async, provider-aware decision (S3).
 *
 * When the resolved provider is `keyword` (the default) this delegates to the
 * sync `decideInterception()` so behavior is byte-identical to today. For any
 * other provider it goes through the fail-closed selector.
 */
export async function decideInterceptionAsync(
  req: InterceptedRequest,
  threshold: number,
  flags: FlagProvider | undefined,
  registry: ProviderRegistry | undefined,
  machineId = 'unknown',
): Promise<InterceptionDecision> {
  // No registry → legacy keyword-only path (backward compatible).
  if (!registry) return decideInterception(req, threshold, flags);

  const flagReader: DecisionFlagReader = {
    getFlag: (key: string) => flags?.getFlag(key) ?? null,
  };

  const providerName = resolveProviderName(flagReader);

  // Default provider → exact legacy path (parity is asserted in tests).
  if (providerName === 'keyword') return decideInterception(req, threshold, flags);

  // Interception disabled / sampled out still short-circuit first, exactly as
  // the legacy path does — those are explicit operator config, not failures.
  const interceptionEnabled = flags?.getFlag('llm_interception_enabled') ?? true;
  if (!interceptionEnabled) {
    return {
      score: 0,
      action: 'forward',
      reasons: ['interception disabled by flag'],
      scored: false,
      alert: false,
    };
  }
  const samplingRate = toNumber(flags?.getFlag('request_sampling_rate'), 1.0);
  if (samplingRate < 1.0 && Math.random() > samplingRate) {
    return { score: 0, action: 'forward', reasons: ['request sampled out'], scored: false, alert: false };
  }

  const body = req.body as Record<string, unknown> | null;
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  const model = typeof body?.model === 'string' ? body.model : undefined;
  const effectiveThreshold = toNumber(flags?.getFlag('auto_stop_threshold'), threshold);

  const result = await decideWithProvider(
    { kind: 'prompt', text: prompt, model, machineId },
    flagReader,
    registry,
  );

  const alertOnCritical = flags?.getFlag('alert_on_critical_score') ?? true;
  return {
    score: result.score,
    action: result.action,
    reasons: result.reasons,
    scored: true,
    alert: alertOnCritical !== false && result.score >= effectiveThreshold,
    provider: result.provider,
    degraded: result.degraded,
    confidence: result.confidence,
  };
}

function scoreRequest(req: InterceptedRequest, threshold: number): ScoringResult {
  let score = 0
  const reasons: string[] = []
  const body = req.body as Record<string, unknown> | null
  const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
  const model = typeof body?.model === 'string' ? body.model : ''

  // Keyword scoring (basic — the full semantic engine is Phase 2.5)
  const harmfulPatterns = [
    /delete all|drop table|rm -rf/i,
    /credential|password|secret.*key/i,
    /bypass|escalate.*privilege|exploit/i,
  ]
  for (const pattern of harmfulPatterns) {
    if (pattern.test(prompt)) {
      score += 0.4
      reasons.push(`harmful pattern: ${pattern.source}`)
    }
  }

  // Model allowlist check (empty model = suspicious)
  if (!model) {
    score += 0.2
    reasons.push('no model specified')
  }

  const action = score >= threshold ? 'block' : score >= threshold - 0.3 ? 'escalate' : 'forward'
  return { score, action, reasons }
}
