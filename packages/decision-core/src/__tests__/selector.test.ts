/**
 * Selector — the fail-closed safety property.
 *
 * The invariants under test are the reason this feature can ship:
 *   #1 degraded → review
 *   #2 low confidence → review
 *   #3 never forward while degraded
 * Plus: unknown/unavailable provider → review, never forward.
 */

import { describe, it, expect } from 'bun:test';
import type { DecisionFlagReader, DecisionProvider, DecisionResult } from '@align/shared-types';
import { ProviderRegistry } from '../registry';
import {
  decideWithProvider,
  resolveProviderName,
  resolveReviewThreshold,
  resolveTimeoutMs,
  DEFAULT_PROVIDER,
} from '../selector';

function flags(map: Record<string, unknown>): DecisionFlagReader {
  return { getFlag: (k) => (k in map ? (map[k] as any) : null) };
}

function provider(name: string, result: Partial<DecisionResult>): DecisionProvider {
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

describe('resolveProviderName', () => {
  it('defaults to keyword', () => {
    expect(resolveProviderName(flags({}))).toBe(DEFAULT_PROVIDER);
  });

  it('accepts a valid provider', () => {
    expect(resolveProviderName(flags({ 'decision.provider': 'jev' }))).toBe('jev');
  });

  it('falls back to keyword for an unknown value', () => {
    expect(resolveProviderName(flags({ 'decision.provider': 'bogus' }))).toBe('keyword');
  });
});

describe('resolveReviewThreshold / resolveTimeoutMs', () => {
  it('defaults threshold to 0.6 and clamps', () => {
    expect(resolveReviewThreshold(flags({}))).toBe(0.6);
    expect(resolveReviewThreshold(flags({ 'decision.review_threshold': 1.5 }))).toBe(1);
    expect(resolveReviewThreshold(flags({ 'decision.review_threshold': -1 }))).toBe(0);
  });

  it('defaults timeout to 500 (D2) and clamps', () => {
    expect(resolveTimeoutMs(flags({}))).toBe(500);
    expect(resolveTimeoutMs(flags({ 'decision.jev.timeoutMs': 10 }))).toBe(50);
    expect(resolveTimeoutMs(flags({ 'decision.jev.timeoutMs': 99999 }))).toBe(30000);
  });
});

describe('decideWithProvider — fail-closed invariants', () => {
  it('unknown provider → review + degraded (never forward)', async () => {
    const reg = new ProviderRegistry();
    const r = await decideWithProvider(
      { kind: 'prompt', text: 'x', machineId: 'm1' },
      flags({ 'decision.provider': 'jev' }),
      reg,
    );
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
    expect(r.reasons.join(' ')).toContain('provider unavailable');
  });

  it('INVARIANT #1: a degraded result is forced to review', async () => {
    const reg = new ProviderRegistry();
    reg.register(provider('keyword', { degraded: true, action: 'forward', confidence: 1 }));
    const r = await decideWithProvider(
      { kind: 'prompt', text: 'x', machineId: 'm1' },
      flags({ 'decision.provider': 'keyword' }),
      reg,
    );
    expect(r.action).toBe('review');
  });

  it('INVARIANT #2: confidence below threshold is forced to review', async () => {
    const reg = new ProviderRegistry();
    reg.register(provider('keyword', { confidence: 0.3, action: 'forward' }));
    const r = await decideWithProvider(
      { kind: 'prompt', text: 'x', machineId: 'm1' },
      flags({ 'decision.provider': 'keyword', 'decision.review_threshold': 0.6 }),
      reg,
    );
    expect(r.action).toBe('review');
  });

  it('a confident, non-degraded result passes through unchanged', async () => {
    const reg = new ProviderRegistry();
    reg.register(provider('keyword', { confidence: 0.9, action: 'block', label: 'unsafe' }));
    const r = await decideWithProvider(
      { kind: 'prompt', text: 'x', machineId: 'm1' },
      flags({ 'decision.provider': 'keyword' }),
      reg,
    );
    expect(r.action).toBe('block');
    expect(r.label).toBe('unsafe');
  });

  it('a provider that throws → review + degraded', async () => {
    const reg = new ProviderRegistry();
    reg.register({
      name: 'keyword' as any,
      decide: async () => {
        throw new Error('boom');
      },
    });
    const r = await decideWithProvider(
      { kind: 'prompt', text: 'x', machineId: 'm1' },
      flags({ 'decision.provider': 'keyword' }),
      reg,
    );
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
    expect(r.reasons.join(' ')).toContain('provider error');
  });

  it('a provider that hangs → hard timeout → review + degraded', async () => {
    const reg = new ProviderRegistry();
    reg.register({
      name: 'keyword' as any,
      decide: () => new Promise(() => {}), // never resolves
    });
    const r = await decideWithProvider(
      { kind: 'prompt', text: 'x', machineId: 'm1' },
      flags({ 'decision.provider': 'keyword', 'decision.jev.timeoutMs': 50 }),
      reg,
    );
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
    expect(r.reasons.join(' ')).toContain('timeout');
  });
});
