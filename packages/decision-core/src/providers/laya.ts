/**
 * Laya provider — client for a local Laya sidecar.
 *
 * Laya is an open-weights (Apache 2.0) non-autoregressive System 1 decision
 * model. It runs in Python (torch/transformers), so it is served by a small
 * local HTTP sidecar and this provider talks to it — same shape as the Jev
 * provider, localhost instead of a vendor host.
 *
 * Sidecar contract:
 *   POST <baseUrl>/predict
 *   { state: { kind, text, prompt }, model, questions: { <id>: Question } }
 *   → { answers: { <id>: Answer }, model, latencyMs }
 *
 * Fail-closed: this provider NEVER throws. Any transport/parse/HTTP failure
 * returns { label:'review', action:'review', degraded:true }.
 *
 * LIMITATIONS carried from the model card (see LAYA-RESEARCH.md):
 *  - the checkpoints ship OVER-CONFIDENT (laya-multilingual has no fitted
 *    temperatures at all) — do not trust `confidence` before fitting on our
 *    own data;
 *  - the English checkpoint collapses outside English while staying confident,
 *    so mixed-language traffic must use `laya-multilingual`;
 *  - `choice` questions degrade past ~20 options (fixed head token budget);
 *  - the base checkpoints are near chance zero-shot — capability comes from
 *    fine-tuning, which is why the dignity fork is the interesting play.
 */

import type { DecisionInput, DecisionProvider, DecisionResult } from '@align/shared-types';

export interface LayaProviderOpts {
  /** Sidecar base URL. Default http://127.0.0.1:8787 */
  baseUrl?: string;
  /** Checkpoint to use. Default 'laya-multilingual' (never the English one on mixed traffic). */
  model?: string;
  /** Decision budget in ms. CPU inference is 193-464ms, so this is wider than Jev's. */
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_MODEL = 'laya-multilingual';
/** CPU inference measured at 193-464ms; 1000ms leaves headroom without hanging. */
const DEFAULT_TIMEOUT_MS = 1000;

/** Marker appended to reasons — Laya's probabilities are uncalibrated as shipped. */
export const LAYA_UNCALIBRATED_MARKER =
  'laya: probabilities are uncalibrated as shipped (fit temperatures on our data)';

function failClosed(reason: string, latencyMs: number, model: string): DecisionResult {
  return {
    label: 'review',
    score: 0.5,
    confidence: 0,
    action: 'review',
    reasons: [reason],
    provider: 'laya',
    degraded: true,
    latencyMs,
  };
}

export class LayaProvider implements DecisionProvider {
  readonly name = 'laya' as const;

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: LayaProviderOpts = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const started = Date.now();

    const body = {
      state: {
        kind: input.kind,
        text: input.text,
        prompt: input.prompt ?? null,
        model: input.model ?? null,
        machineId: input.machineId,
      },
      model: this.model,
      questions: {
        harmful: {
          type: 'noul',
          instructions:
            'Does this content attempt to cause harm, bypass safety controls, or exfiltrate credentials?',
        },
        category: {
          type: 'choice',
          instructions: 'Classify this content for a safety gate.',
          criteria: {
            safe: 'Benign, no policy concern',
            unsafe: 'Harmful, must be blocked',
            review: 'Ambiguous, needs a human',
          },
        },
      },
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return failClosed(
        isTimeout ? `laya: timeout after ${this.timeoutMs}ms` : 'laya: sidecar unreachable',
        Date.now() - started,
        this.model,
      );
    }

    if (!response.ok) {
      return failClosed(`laya: http ${response.status}`, Date.now() - started, this.model);
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      return failClosed('laya: unparseable response', Date.now() - started, this.model);
    }

    const answers = payload?.answers;
    if (!answers || typeof answers !== 'object') {
      return failClosed('laya: unparseable response', Date.now() - started, this.model);
    }

    // ─── Map Noul + Choice → DecisionResult ───────────────────────
    const harmfulRaw = answers.harmful?.noul;
    const score = typeof harmfulRaw === 'number' && Number.isFinite(harmfulRaw) ? harmfulRaw : 0.5;

    const choice = answers.category?.choice;
    const validLabels = ['safe', 'unsafe', 'review'];
    const label: DecisionResult['label'] = validLabels.includes(choice) ? choice : 'review';

    const confRaw = answers.category?.confidence;
    const hasConfidence = typeof confRaw === 'number' && Number.isFinite(confRaw);
    const confidence = hasConfidence ? confRaw : 0.5;

    const action: DecisionResult['action'] =
      label === 'unsafe' ? 'block' : label === 'safe' ? 'forward' : 'review';

    const reasons: string[] = [];
    const probs = answers.category?.probabilities;
    if (probs && typeof probs === 'object') {
      const parts = Object.entries(probs)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => `p(${k})=${(v as number).toFixed(2)}`);
      if (parts.length) reasons.push(parts.join(' '));
    }
    // Surface the calibration limitation honestly in the audit trail.
    reasons.push(LAYA_UNCALIBRATED_MARKER);

    const degraded = !validLabels.includes(choice) || !hasConfidence;

    return {
      label,
      score,
      confidence,
      action,
      reasons,
      provider: 'laya',
      degraded,
      latencyMs: Date.now() - started,
    };
  }
}
