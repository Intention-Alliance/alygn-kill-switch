/**
 * Selector — the single fail-closed entry point.
 *
 * Invariants (asserted in tests):
 *   #1  result.degraded === true  →  action = 'review'
 *   #2  confidence < review_threshold  →  action = 'review'
 *   #3  action === 'forward' && degraded  →  action = 'review' (belt & braces)
 *
 * `decideWithProvider` NEVER throws and NEVER returns action='forward' while
 * degraded === true. That is the safety property of the whole feature.
 */

import type {
  DecisionFlagReader,
  DecisionInput,
  DecisionResult,
  ProviderName,
} from '@align/shared-types';
import type { ProviderRegistry } from './registry';

export const DEFAULT_PROVIDER: ProviderName = 'keyword';
export const DEFAULT_REVIEW_THRESHOLD = 0.6;
/** Decision budget default (D2: 500ms). */
export const DEFAULT_TIMEOUT_MS = 500;
/** Hard outer guard: a provider that ignores its own timeout still cannot hang. */
export const HARD_TIMEOUT_SLACK_MS = 250;

const VALID_PROVIDERS: ProviderName[] = ['keyword', 'ollama', 'jev', 'dignity'];

/** machine override > global > declared default. Unknown value → default. */
export function resolveProviderName(flags: DecisionFlagReader): ProviderName {
  const raw = flags.getFlag('decision.provider');
  if (typeof raw === 'string' && (VALID_PROVIDERS as string[]).includes(raw)) {
    return raw as ProviderName;
  }
  return DEFAULT_PROVIDER;
}

/** Reads decision.review_threshold, clamped to [0,1], default 0.6. */
export function resolveReviewThreshold(flags: DecisionFlagReader): number {
  const raw = flags.getFlag('decision.review_threshold');
  if (raw === null || raw === undefined) return DEFAULT_REVIEW_THRESHOLD;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_REVIEW_THRESHOLD;
  return Math.min(1, Math.max(0, n));
}

/** Reads decision.jev.timeoutMs, clamped to [50, 30000], default 500 (D2). */
export function resolveTimeoutMs(flags: DecisionFlagReader): number {
  const raw = flags.getFlag('decision.jev.timeoutMs');
  if (raw === null || raw === undefined) return DEFAULT_TIMEOUT_MS;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
  return Math.min(30_000, Math.max(50, n));
}

function failClosed(name: string, reason: string, latencyMs: number): DecisionResult {
  return {
    label: 'review',
    score: 0.5,
    confidence: 0,
    action: 'review',
    reasons: [reason],
    provider: name,
    degraded: true,
    latencyMs,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * The single fail-closed entry point. NEVER throws.
 */
export async function decideWithProvider(
  input: DecisionInput,
  flags: DecisionFlagReader,
  registry: ProviderRegistry,
  opts?: { defaultProvider?: ProviderName; defaultThreshold?: number },
): Promise<DecisionResult> {
  const started = Date.now();
  const name = opts?.defaultProvider ?? resolveProviderName(flags);

  const provider = registry.get(name);
  if (!provider) {
    return failClosed(name, `provider unavailable: ${name}`, Date.now() - started);
  }

  const hardTimeout = resolveTimeoutMs(flags) + HARD_TIMEOUT_SLACK_MS;

  let result: DecisionResult;
  try {
    result = await withTimeout(
      provider.decide(input),
      hardTimeout,
      () => failClosed(name, `provider timeout: ${name}`, Date.now() - started),
    );
  } catch (err: any) {
    return failClosed(name, `provider error: ${err?.message ?? 'unknown'}`, Date.now() - started);
  }

  // Invariant #1: degraded → review.
  if (result.degraded) {
    return { ...result, action: 'review' };
  }

  // Invariant #2: low confidence → review.
  const threshold = opts?.defaultThreshold ?? resolveReviewThreshold(flags);
  if (result.confidence < threshold) {
    return { ...result, action: 'review' };
  }

  // Invariant #3: belt & braces.
  if (result.action === 'forward' && result.degraded) {
    return { ...result, action: 'review' };
  }

  return result;
}
