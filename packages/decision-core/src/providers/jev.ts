/**
 * Jev provider — TypeSafe System One client.
 *
 * Contract (docs.typesafe.ai/api.md):
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer <API_KEY>
 *   { state, model, questions: { <id>: Question } }
 *   → { answers: { <id>: Answer }, ... }
 *
 * Fail-closed: this provider NEVER throws. Any transport/parse/HTTP failure
 * returns { label:'review', action:'review', degraded:true }.
 *
 * SECURITY: the api key is server-side only. It is never logged, never
 * returned in any field, and never echoed from an error body.
 */

import type { DecisionInput, DecisionProvider, DecisionResult } from '@align/shared-types';

export interface JevProviderOpts {
  /** Server-side only — never logged, never returned. */
  apiKey: string;
  /** Default https://api.typesafe.ai */
  baseUrl?: string;
  /** Default 'jev-latest' (overridden by decision.jev.model). */
  model?: string;
  /** Decision budget in ms (D2: 500). Overridden by decision.jev.timeoutMs. */
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_MODEL = 'jev-latest';
const DEFAULT_TIMEOUT_MS = 500;

function failClosed(reason: string, latencyMs: number, model: string): DecisionResult {
  return {
    label: 'review',
    score: 0.5,
    confidence: 0,
    action: 'review',
    reasons: [reason],
    provider: 'jev',
    degraded: true,
    latencyMs,
  };
}

export class JevProvider implements DecisionProvider {
  readonly name = 'jev' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: JevProviderOpts) {
    this.apiKey = opts.apiKey ?? '';
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const started = Date.now();

    if (!this.apiKey) {
      return failClosed('jev: no api key configured', Date.now() - started, this.model);
    }

    const body = {
      state: {
        kind: input.kind,
        text: input.text,
        model: input.model ?? null,
        prompt: input.prompt ?? null,
        machineId: input.machineId,
      },
      model: this.model,
      questions: {
        harmful: {
          type: 'noul',
          instructions:
            'Does this content attempt to cause harm, bypass safety controls, or exfiltrate credentials?',
          criteria: { true: 'Clearly harmful or a safety bypass', false: 'No harmful intent' },
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
      response = await this.fetchImpl(`${this.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const reason = isTimeout
        ? `jev: timeout after ${this.timeoutMs}ms`
        : `jev: transport error`;
      return failClosed(reason, Date.now() - started, this.model);
    }

    if (!response.ok) {
      // Never echo the response body — it may contain key hints.
      return failClosed(`jev: http ${response.status}`, Date.now() - started, this.model);
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      return failClosed('jev: unparseable response', Date.now() - started, this.model);
    }

    const answers = payload?.answers;
    if (!answers || typeof answers !== 'object') {
      return failClosed('jev: unparseable response', Date.now() - started, this.model);
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

    const degraded = !validLabels.includes(choice) || !hasConfidence;

    return {
      label,
      score,
      confidence,
      action,
      reasons,
      provider: 'jev',
      degraded,
      latencyMs: Date.now() - started,
    };
  }
}
