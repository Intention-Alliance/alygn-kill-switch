/**
 * Remote provider — calls the mother's POST /v1/decision endpoint.
 *
 * Why this exists (BE-PLAN §2.5 Option A): the TypeSafe key must stay
 * server-side. The interceptor runs on the guarded machine, so when
 * decision.provider === 'jev' the agent-plane cannot call TypeSafe directly.
 * It calls the mother, which holds the key.
 *
 * Fail-closed: never throws; any failure → review + degraded.
 */

import type { DecisionInput, DecisionProvider, DecisionResult } from '@align/shared-types';

export interface RemoteProviderOpts {
  /** Mother base URL, e.g. http://localhost:3000 */
  motherUrl: string;
  /** Service api key for the mother (x-api-key). */
  apiKey: string;
  /** Machine id this agent represents. */
  machineId: string;
  /** Hard timeout for the round-trip. */
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2000;

function failClosed(reason: string, latencyMs: number): DecisionResult {
  return {
    label: 'review',
    score: 0.5,
    confidence: 0,
    action: 'review',
    reasons: [reason],
    provider: 'remote',
    degraded: true,
    latencyMs,
  };
}

export class RemoteProvider implements DecisionProvider {
  readonly name = 'remote' as any;

  private readonly motherUrl: string;
  private readonly apiKey: string;
  private readonly machineId: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RemoteProviderOpts) {
    this.motherUrl = opts.motherUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.machineId = opts.machineId;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const started = Date.now();
    try {
      const res = await this.fetchImpl(`${this.motherUrl}/v1/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify({ ...input, machineId: input.machineId || this.machineId }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        return failClosed(`remote: http ${res.status}`, Date.now() - started);
      }
      const result = (await res.json()) as DecisionResult;
      if (!result || typeof result !== 'object' || !result.label) {
        return failClosed('remote: unparseable response', Date.now() - started);
      }
      return { ...result, provider: result.provider || 'remote' };
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return failClosed(
        isTimeout ? `remote: timeout after ${this.timeoutMs}ms` : 'remote: transport error',
        Date.now() - started,
      );
    }
  }
}
