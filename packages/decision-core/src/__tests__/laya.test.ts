/**
 * Laya provider — fail-closed behaviour and result mapping.
 *
 * The provider is an HTTP client to a local sidecar. Every failure path must
 * return the fail-closed review result, never throw, and never forward.
 * The calibration limitation must appear in `reasons` for audit honesty.
 */

import { describe, it, expect } from 'bun:test';
import { LayaProvider, LAYA_UNCALIBRATED_MARKER } from '../providers/laya';
import type { DecisionInput } from '@align/shared-types';

const INPUT: DecisionInput = {
  kind: 'prompt',
  text: 'What is the capital of France?',
  machineId: 'm-1',
};

function fakeFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  return (async () => {
    if (response.jsonBody === undefined && response.ok === false) {
      return { ok: false, status: response.status ?? 500, json: async () => ({}) } as unknown as Response;
    }
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.jsonBody,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('LayaProvider — mapping', () => {
  it('maps a safe choice to forward', async () => {
    const p = new LayaProvider({
      fetchImpl: fakeFetch({
        jsonBody: {
          answers: {
            harmful: { noul: 0.01 },
            category: { choice: 'safe', confidence: 0.97, probabilities: { safe: 0.97, unsafe: 0.01, review: 0.02 } },
          },
        },
      }),
    });
    const r = await p.decide(INPUT);
    expect(r.label).toBe('safe');
    expect(r.action).toBe('forward');
    expect(r.provider).toBe('laya');
    expect(r.degraded).toBe(false);
    expect(r.score).toBe(0.01);
  });

  it('maps an unsafe choice to block', async () => {
    const p = new LayaProvider({
      fetchImpl: fakeFetch({
        jsonBody: {
          answers: {
            harmful: { noul: 0.95 },
            category: { choice: 'unsafe', confidence: 0.9, probabilities: { unsafe: 0.9 } },
          },
        },
      }),
    });
    const r = await p.decide(INPUT);
    expect(r.label).toBe('unsafe');
    expect(r.action).toBe('block');
    expect(r.degraded).toBe(false);
  });

  it('always surfaces the calibration limitation in reasons', async () => {
    const p = new LayaProvider({
      fetchImpl: fakeFetch({
        jsonBody: { answers: { harmful: { noul: 0.1 }, category: { choice: 'safe', confidence: 0.8 } } },
      }),
    });
    const r = await p.decide(INPUT);
    expect(r.reasons).toContain(LAYA_UNCALIBRATED_MARKER);
  });
});

describe('LayaProvider — fail-closed', () => {
  it('fails closed when the sidecar is unreachable', async () => {
    const p = new LayaProvider({
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    const r = await p.decide(INPUT);
    expect(r.label).toBe('review');
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
    expect(r.confidence).toBe(0);
  });

  it('fails closed on a non-2xx response', async () => {
    const p = new LayaProvider({
      fetchImpl: fakeFetch({ ok: false, status: 503 }),
    });
    const r = await p.decide(INPUT);
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
  });

  it('fails closed on malformed JSON', async () => {
    const p = new LayaProvider({
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad json');
        },
      })) as unknown as typeof fetch,
    });
    const r = await p.decide(INPUT);
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
  });

  it('fails closed when answers are missing', async () => {
    const p = new LayaProvider({ fetchImpl: fakeFetch({ jsonBody: { model: 'laya-multilingual' } }) });
    const r = await p.decide(INPUT);
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
  });

  it('fails closed on an unknown choice label', async () => {
    const p = new LayaProvider({
      fetchImpl: fakeFetch({
        jsonBody: { answers: { harmful: { noul: 0.5 }, category: { choice: 'maybe', confidence: 0.5 } } },
      }),
    });
    const r = await p.decide(INPUT);
    expect(r.label).toBe('review');
    expect(r.degraded).toBe(true);
  });

  it('never returns forward while degraded', async () => {
    const p = new LayaProvider({
      fetchImpl: (async () => {
        throw new Error('down');
      }) as unknown as typeof fetch,
    });
    const r = await p.decide(INPUT);
    expect(r.degraded && r.action === 'forward').toBe(false);
  });
});
