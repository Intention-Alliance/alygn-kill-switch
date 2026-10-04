/**
 * Keyword provider — deterministic regex scoring.
 *
 * Pure extraction of the scoring that lived in
 * `apps/agent-plane/src/interceptor.ts` (`scoreRequest`). Behavior must be
 * bit-identical: same patterns, same weights, same bands, same reasons.
 *
 * `confidence` is 1.0 because the scoring is deterministic (no uncertainty).
 * That makes `decision.review_threshold` a no-op for this provider, which is
 * exactly what preserves the pre-existing behavior.
 */

import type { DecisionInput, DecisionProvider, DecisionResult } from '@align/shared-types';

/** The exact regex set from interceptor.ts — do not add/remove patterns. */
export const HARMFUL_PATTERNS: readonly RegExp[] = [
  /delete all|drop table|rm -rf/i,
  /credential|password|secret.*key/i,
  /bypass|escalate.*privilege|exploit/i,
];

export interface KeywordScore {
  score: number;
  reasons: string[];
}

/**
 * Pure keyword scoring. Extracted verbatim from `scoreRequest` so the
 * interceptor and the provider share one implementation.
 * Empty model → +0.2 'no model specified' (preserved).
 */
export function scoreKeywords(text: string, model?: string): KeywordScore {
  let score = 0;
  const reasons: string[] = [];

  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.4;
      reasons.push(`harmful pattern: ${pattern.source}`);
    }
  }

  if (!model) {
    score += 0.2;
    reasons.push('no model specified');
  }

  return { score, reasons };
}

export class KeywordProvider implements DecisionProvider {
  readonly name = 'keyword' as const;

  constructor(private readonly threshold: number) {}

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const started = Date.now();
    const { score, reasons } = scoreKeywords(input.text, input.model);

    // Bands mirror today's block/escalate/forward logic exactly.
    const label = score >= this.threshold ? 'unsafe' : score >= this.threshold - 0.3 ? 'review' : 'safe';
    const action = score >= this.threshold ? 'block' : score >= this.threshold - 0.3 ? 'escalate' : 'forward';

    return {
      label,
      score,
      confidence: 1.0,
      action,
      reasons,
      provider: 'keyword',
      degraded: false,
      latencyMs: Date.now() - started,
    };
  }
}
