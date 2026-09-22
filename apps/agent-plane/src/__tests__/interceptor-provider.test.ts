/**
 * Interceptor provider wiring — S3.
 *
 * Parity: with the default provider (keyword) the async path must equal the
 * legacy sync path exactly. Fail-closed: a degraded/review decision must
 * never be a forward.
 */

import { describe, it, expect } from 'bun:test';
import { decideInterception, decideInterceptionAsync, type FlagProvider } from '../interceptor';
import { ProviderRegistry } from '@align/decision-core';
import type { DecisionProvider, DecisionResult } from '@align/shared-types';

function flags(map: Record<string, unknown>): FlagProvider {
  return { getFlag: (k: string) => (k in map ? (map[k] as any) : null) };
}

function stubProvider(name: string, result: Partial<DecisionResult>): DecisionProvider {
  return {
    name: name as any,
    decide: async () => ({
      label: 'safe',
      score: 0,
      confidence: 1,
      action: 'forward',
      reasons: [],
      provider: name,
      degraded: false,
      latencyMs: 1,
      ...result,
    }),
  };
}

const REQ = {
  method: 'POST',
  path: '/api/generate',
  body: { prompt: 'hello world', model: 'llama3' },
  headers: {},
  timestamp: new Date().toISOString(),
};

describe('decideInterceptionAsync — parity with the legacy path', () => {
  it('no registry → identical to decideInterception', async () => {
    const legacy = decideInterception(REQ, 0.7, flags({}));
    const async_ = await decideInterceptionAsync(REQ, 0.7, flags({}), undefined, 'm1');
    expect(async_).toEqual(legacy);
  });

  it('decision.provider=keyword → identical to decideInterception', async () => {
    const f = flags({ 'decision.provider': 'keyword' });
    const legacy = decideInterception(REQ, 0.7, f);
    const reg = new ProviderRegistry();
    reg.register(stubProvider('keyword', { action: 'block' }));
    const async_ = await decideInterceptionAsync(REQ, 0.7, f, reg, 'm1');
    // Must use the legacy path, NOT the stub (which would return block).
    expect(async_).toEqual(legacy);
  });

  it('interception disabled → forward unscored regardless of provider', async () => {
    const f = flags({ 'decision.provider': 'jev', llm_interception_enabled: false });
    const reg = new ProviderRegistry();
    reg.register(stubProvider('jev', { action: 'block' }));
    const r = await decideInterceptionAsync(REQ, 0.7, f, reg, 'm1');
    expect(r.action).toBe('forward');
    expect(r.scored).toBe(false);
  });

  it('sampled out (rate 0) → forward unscored regardless of provider', async () => {
    const f = flags({ 'decision.provider': 'jev', request_sampling_rate: 0 });
    const reg = new ProviderRegistry();
    reg.register(stubProvider('jev', { action: 'block' }));
    const r = await decideInterceptionAsync(REQ, 0.7, f, reg, 'm1');
    expect(r.action).toBe('forward');
    expect(r.scored).toBe(false);
  });
});

describe('decideInterceptionAsync — provider selection', () => {
  it('decision.provider=jev with a stub returning unsafe → block + provider tag', async () => {
    const f = flags({ 'decision.provider': 'jev' });
    const reg = new ProviderRegistry();
    reg.register(stubProvider('jev', { action: 'block', label: 'unsafe', provider: 'jev' }));
    const r = await decideInterceptionAsync(REQ, 0.7, f, reg, 'm1');
    expect(r.action).toBe('block');
    expect(r.provider).toBe('jev');
    expect(r.scored).toBe(true);
  });

  it('a degraded stub → review (never forward)', async () => {
    const f = flags({ 'decision.provider': 'jev' });
    const reg = new ProviderRegistry();
    reg.register(stubProvider('jev', { degraded: true, action: 'forward' }));
    const r = await decideInterceptionAsync(REQ, 0.7, f, reg, 'm1');
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
  });

  it('a throwing stub → review + degraded', async () => {
    const f = flags({ 'decision.provider': 'jev' });
    const reg = new ProviderRegistry();
    reg.register({
      name: 'jev' as any,
      decide: async () => {
        throw new Error('boom');
      },
    });
    const r = await decideInterceptionAsync(REQ, 0.7, f, reg, 'm1');
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
  });

  it('an unregistered provider → review + degraded', async () => {
    const f = flags({ 'decision.provider': 'jev' });
    const reg = new ProviderRegistry();
    const r = await decideInterceptionAsync(REQ, 0.7, f, reg, 'm1');
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
  });
});
