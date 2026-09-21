/**
 * Ollama provider — structural wrap of the verifier.
 */

import { describe, it, expect } from 'bun:test';
import { OllamaProvider, CONSTANT_CONFIDENCE_MARKER, type VerifierLike } from '../providers/ollama';

function stubVerifier(over: Partial<Awaited<ReturnType<VerifierLike['verify']>>> = {}): VerifierLike {
  return {
    verify: async () => ({
      verdict: 'SAFE',
      confidence: 0.9,
      reason: 'looks fine',
      latencyMs: 42,
      model: 'qwen2.5:0.5b',
      degraded: false,
      ...over,
    }),
  };
}

describe('OllamaProvider', () => {
  it('maps SAFE → forward/safe', async () => {
    const p = new OllamaProvider(stubVerifier({ verdict: 'SAFE' }));
    const r = await p.decide({ kind: 'output', text: 'ok', prompt: 'hi', machineId: 'm1' });
    expect(r.label).toBe('safe');
    expect(r.action).toBe('forward');
    expect(r.score).toBe(0.0);
    expect(r.provider).toBe('ollama');
  });

  it('maps UNSAFE → block/unsafe', async () => {
    const p = new OllamaProvider(stubVerifier({ verdict: 'UNSAFE' }));
    const r = await p.decide({ kind: 'output', text: 'bad', prompt: 'hi', machineId: 'm1' });
    expect(r.label).toBe('unsafe');
    expect(r.action).toBe('block');
    expect(r.score).toBe(1.0);
  });

  it('maps REVIEW → review/review', async () => {
    const p = new OllamaProvider(stubVerifier({ verdict: 'REVIEW', confidence: 0.5 }));
    const r = await p.decide({ kind: 'output', text: '?', prompt: 'hi', machineId: 'm1' });
    expect(r.label).toBe('review');
    expect(r.action).toBe('review');
  });

  it('propagates degraded', async () => {
    const p = new OllamaProvider(stubVerifier({ verdict: 'REVIEW', degraded: true }));
    const r = await p.decide({ kind: 'output', text: '?', prompt: 'hi', machineId: 'm1' });
    expect(r.degraded).toBe(true);
  });

  it('passes (prompt, output) for kind=output and (text, "") for kind=prompt', async () => {
    const seen: Array<{ prompt: string; output: string }> = [];
    const v: VerifierLike = {
      verify: async (input) => {
        seen.push(input);
        return { verdict: 'SAFE', confidence: 0.9, reason: '', latencyMs: 1, model: 'x', degraded: false };
      },
    };
    const p = new OllamaProvider(v);

    await p.decide({ kind: 'output', text: 'OUT', prompt: 'PROMPT', machineId: 'm1' });
    await p.decide({ kind: 'prompt', text: 'PROMPT', machineId: 'm1' });

    expect(seen[0]).toEqual({ prompt: 'PROMPT', output: 'OUT' });
    expect(seen[1]).toEqual({ prompt: 'PROMPT', output: '' });
  });

  it('surfaces the F1 constant-confidence limitation in reasons', async () => {
    const p = new OllamaProvider(stubVerifier({ verdict: 'SAFE' }));
    const r = await p.decide({ kind: 'output', text: 'ok', prompt: 'hi', machineId: 'm1' });
    expect(r.reasons).toContain(CONSTANT_CONFIDENCE_MARKER);
  });

  it('does not add the F1 marker when degraded', async () => {
    const p = new OllamaProvider(stubVerifier({ verdict: 'REVIEW', degraded: true }));
    const r = await p.decide({ kind: 'output', text: '?', prompt: 'hi', machineId: 'm1' });
    expect(r.reasons).not.toContain(CONSTANT_CONFIDENCE_MARKER);
  });
});
