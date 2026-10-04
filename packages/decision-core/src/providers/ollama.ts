/**
 * Ollama provider — wraps the existing inference verifier.
 *
 * Structural interface (`VerifierLike`) instead of importing the app's
 * verifier class, so this package never depends on an app (no cycle).
 *
 * F1 (known): `InferenceVerifier.confidence` is a hardcoded constant
 * (0.9 for SAFE/UNSAFE, 0.5 for REVIEW), so it is NOT a calibrated
 * probability. We pass it through to preserve routing exactly, and surface
 * the limitation in `reasons` so the audit trail is honest. The real fix
 * (derive confidence from the model output) requires changing verifier.ts
 * and is tracked for S7 (calibration), where the eval can measure it.
 */

import type { DecisionInput, DecisionProvider, DecisionResult } from '@align/shared-types';

/** Structural mirror of InferenceVerifier's public surface. */
export interface VerifierLike {
  verify(input: { prompt: string; output: string }): Promise<{
    verdict: 'SAFE' | 'UNSAFE' | 'REVIEW';
    confidence: number;
    reason: string;
    latencyMs: number;
    model: string;
    degraded: boolean;
  }>;
}

/** Marker appended to reasons while the verifier's confidence is a constant. */
export const CONSTANT_CONFIDENCE_MARKER = 'ollama: confidence is a fixed constant (calibration pending)';

export class OllamaProvider implements DecisionProvider {
  readonly name = 'ollama' as const;

  constructor(private readonly verifier: VerifierLike) {}

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const started = Date.now();

    // The verifier needs the (prompt, output) pair.
    const payload =
      input.kind === 'output'
        ? { prompt: input.prompt ?? '', output: input.text }
        : { prompt: input.text, output: '' };

    const result = await this.verifier.verify(payload);

    const map: Record<string, { label: DecisionResult['label']; score: number; action: DecisionResult['action'] }> = {
      SAFE: { label: 'safe', score: 0.0, action: 'forward' },
      UNSAFE: { label: 'unsafe', score: 1.0, action: 'block' },
      REVIEW: { label: 'review', score: 0.5, action: 'review' },
    };
    const mapped = map[result.verdict] ?? map.REVIEW;

    const reasons = result.reason ? [result.reason] : [];
    // Surface F1 honestly: the verifier's confidence is a constant today.
    if (!result.degraded) reasons.push(CONSTANT_CONFIDENCE_MARKER);

    return {
      label: mapped.label,
      score: mapped.score,
      confidence: result.confidence,
      action: mapped.action,
      reasons,
      provider: 'ollama',
      degraded: result.degraded,
      latencyMs: result.latencyMs ?? Date.now() - started,
    };
  }
}
