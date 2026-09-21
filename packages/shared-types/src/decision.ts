/**
 * Decision Provider contract — Jev / Ollama / keyword behind one interface.
 *
 * ADR-133/136/140/141 consistent: flag-selected, fail-closed, auditable.
 * The flag set IS the protocol schema state: provider + thresholds are
 * versioned, auditable config, not code constants.
 *
 * TYPE-ONLY MODULE. No runtime values — consumers use `import type` so the
 * package's `dist/` build is not required at runtime.
 */

/** Provider identifiers. `dignity` is reserved for the distilled model (S8). */
export type ProviderName = 'keyword' | 'ollama' | 'jev' | 'dignity';

/** Normalized decision label. */
export type DecisionLabel = 'safe' | 'unsafe' | 'review';

/** Routing action. `review` is the fail-closed terminal state. */
export type DecisionAction = 'forward' | 'block' | 'escalate' | 'review';

export interface DecisionInput {
  /** Which side of the (prompt, output) pair is being judged. */
  kind: 'prompt' | 'output';
  /** The text to judge. */
  text: string;
  /** Model that produced/consumed the text, when known. */
  model?: string;
  /** Machine the decision is attributed to (audit + per-machine flags). */
  machineId: string;
  /** For kind='output': the originating prompt (verifier needs the pair). */
  prompt?: string;
}

export interface DecisionResult {
  label: DecisionLabel;
  /** Risk score 0..1 (higher = more harmful). */
  score: number;
  /** Calibrated confidence 0..1. */
  confidence: number;
  action: DecisionAction;
  reasons: string[];
  /** Provider that produced this result (persisted to inference_log.provider). */
  provider: string;
  /** True when the provider was unavailable / timed out / unparseable. */
  degraded: boolean;
  latencyMs: number;
}

export interface DecisionProvider {
  readonly name: ProviderName;
  decide(input: DecisionInput): Promise<DecisionResult>;
}

/** Reads resolved flag values (FlagClient on agent-plane, db reader on server). */
export interface DecisionFlagReader {
  getFlag(key: string): boolean | number | string | null;
}

/** Canonical flag keys — string literals, kept in sync with flag-definitions.ts. */
export type DecisionFlagKey =
  | 'decision.provider'
  | 'decision.jev.model'
  | 'decision.jev.timeoutMs'
  | 'decision.review_threshold';
