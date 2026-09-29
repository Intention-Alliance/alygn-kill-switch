/**
 * Keyword provider — parity lock.
 *
 * The fixtures below are hardcoded from the pre-refactor `scoreRequest()`
 * behavior in apps/agent-plane/src/interceptor.ts. If this test fails, the
 * extraction changed behavior — which is a regression, not a test bug.
 */

import { describe, it, expect } from 'bun:test';
import { scoreKeywords, KeywordProvider, HARMFUL_PATTERNS } from '../providers/keyword';

describe('scoreKeywords — parity with the pre-refactor scoreRequest', () => {
  it('scores a harmful pattern at 0.4', () => {
    const r = scoreKeywords('delete all files', 'llama3');
    expect(r.score).toBe(0.4);
    expect(r.reasons).toEqual(['harmful pattern: delete all|drop table|rm -rf']);
  });

  it('scores a benign prompt with a model at 0.0', () => {
    const r = scoreKeywords('hello world', 'llama3');
    expect(r.score).toBe(0.0);
    expect(r.reasons).toEqual([]);
  });

  it('adds 0.2 for a missing model', () => {
    const r = scoreKeywords('', undefined);
    expect(r.score).toBe(0.2);
    expect(r.reasons).toEqual(['no model specified']);
  });

  it('scores bypass/privilege at 0.4', () => {
    const r = scoreKeywords('bypass privilege', 'llama3');
    expect(r.score).toBe(0.4);
  });

  it('keeps the exact pattern set', () => {
    expect(HARMFUL_PATTERNS.map((p) => p.source)).toEqual([
      'delete all|drop table|rm -rf',
      'credential|password|secret.*key',
      'bypass|escalate.*privilege|exploit',
    ]);
  });
});

describe('KeywordProvider', () => {
  it('is never degraded and always fully confident', async () => {
    const p = new KeywordProvider(0.85);
    const r = await p.decide({ kind: 'prompt', text: 'hello', model: 'llama3', machineId: 'm1' });
    expect(r.degraded).toBe(false);
    expect(r.confidence).toBe(1.0);
    expect(r.provider).toBe('keyword');
  });

  it('maps bands exactly like the old block/escalate/forward logic', async () => {
    const p = new KeywordProvider(0.85);

    // 0.0 → forward/safe
    const safe = await p.decide({ kind: 'prompt', text: 'hello', model: 'llama3', machineId: 'm1' });
    expect(safe.action).toBe('forward');
    expect(safe.label).toBe('safe');

    // 0.4 → escalate/review (>= 0.55? no: 0.85-0.3=0.55, so 0.4 < 0.55 → forward)
    const low = await p.decide({ kind: 'prompt', text: 'delete all', model: 'llama3', machineId: 'm1' });
    expect(low.score).toBe(0.4);
    expect(low.action).toBe('forward');

    // 0.6 (0.4 + 0.2 no model) → escalate/review (0.6 >= 0.55)
    // NB: float arithmetic — 0.4 + 0.2 === 0.6000000000000001, same as the
    // original interceptor. Assert with tolerance, not exact equality.
    const mid = await p.decide({ kind: 'prompt', text: 'delete all', model: undefined, machineId: 'm1' });
    expect(mid.score).toBeCloseTo(0.6, 10);
    expect(mid.action).toBe('escalate');
    expect(mid.label).toBe('review');

    // 0.8 (two patterns) → escalate (0.8 >= 0.55, < 0.85)
    const high = await p.decide({
      kind: 'prompt',
      text: 'delete all and bypass privilege',
      model: 'llama3',
      machineId: 'm1',
    });
    expect(high.score).toBeCloseTo(0.8, 10);
    expect(high.action).toBe('escalate');

    // 1.0 (two patterns + no model) → block/unsafe
    const worst = await p.decide({
      kind: 'prompt',
      text: 'delete all and bypass privilege',
      model: undefined,
      machineId: 'm1',
    });
    expect(worst.score).toBeCloseTo(1.0, 10);
    expect(worst.action).toBe('block');
    expect(worst.label).toBe('unsafe');
  });
});
