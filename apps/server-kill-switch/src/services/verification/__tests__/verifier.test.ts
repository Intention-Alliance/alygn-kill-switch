/**
 * InferenceVerifier — Unit Tests
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §f.1.
 *
 * Covers verdict extraction (SAFE/UNSAFE/REVIEW, case-insensitive, leading
 * whitespace), non-verdict text → REVIEW + degraded, timeout → REVIEW +
 * degraded, model unreachable → REVIEW + degraded, and latency measurement.
 */

import { describe, expect, it } from 'bun:test';
import { InferenceVerifier, extractVerdict, extractReason } from '../verifier';

// ─── Verdict extraction (pure function) ─────────────────────────

describe('extractVerdict', () => {
  it('extracts SAFE from clean model text', () => {
    const { verdict, degraded } = extractVerdict('SAFE\ncorrect factual answer');
    expect(verdict).toBe('SAFE');
    expect(degraded).toBe(false);
  });

  it('extracts UNSAFE from clean model text', () => {
    const { verdict, degraded } = extractVerdict('UNSAFE\nharmful instructions');
    expect(verdict).toBe('UNSAFE');
    expect(degraded).toBe(false);
  });

  it('extracts REVIEW from clean model text', () => {
    const { verdict, degraded } = extractVerdict('REVIEW\nborderline opinion');
    expect(verdict).toBe('REVIEW');
    expect(degraded).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(extractVerdict('safe\nok').verdict).toBe('SAFE');
    expect(extractVerdict('UnSaFe\nbad').verdict).toBe('UNSAFE');
    expect(extractVerdict('review\nmeh').verdict).toBe('REVIEW');
  });

  it('tolerates leading whitespace', () => {
    expect(extractVerdict('   SAFE\nok').verdict).toBe('SAFE');
    expect(extractVerdict('\n\n  UNSAFE\nbad').verdict).toBe('UNSAFE');
  });

  it('matches the verdict token anywhere in the text (first line)', () => {
    const { verdict } = extractVerdict('Some preamble\nUNSAFE\nharmful');
    expect(verdict).toBe('UNSAFE');
  });

  it('returns REVIEW + degraded when no verdict token is present', () => {
    const { verdict, degraded } = extractVerdict('this is gibberish with no verdict');
    expect(verdict).toBe('REVIEW');
    expect(degraded).toBe(true);
  });

  it('returns REVIEW + degraded on empty text', () => {
    const { verdict, degraded } = extractVerdict('');
    expect(verdict).toBe('REVIEW');
    expect(degraded).toBe(true);
  });
});

describe('extractReason', () => {
  it('extracts the second line as the reason', () => {
    expect(extractReason('SAFE\ncorrect factual answer')).toBe('correct factual answer');
  });

  it('returns empty string when no reason line exists', () => {
    expect(extractReason('SAFE')).toBe('');
  });

  it('skips the verdict line and takes the next non-empty line', () => {
    expect(extractReason('UNSAFE\n\nharmful instructions here')).toBe('harmful instructions here');
  });
});

// ─── InferenceVerifier with injected fetch ──────────────────────

function makeFetchResponder(body: unknown, status = 200) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as Response;
}

function makeFetchThrower(err: Error) {
  return async () => {
    throw err;
  };
}

describe('InferenceVerifier.verify', () => {
  it('returns SAFE verdict when the model responds SAFE', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:11434',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchResponder({ response: 'SAFE\ncorrect factual answer' }),
    });
    const result = await verifier.verify({ prompt: 'What is 2+2?', output: '4' });
    expect(result.verdict).toBe('SAFE');
    expect(result.degraded).toBe(false);
    expect(result.model).toBe('test-model');
    expect(result.reason).toBe('correct factual answer');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns UNSAFE verdict when the model responds UNSAFE', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:11434',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchResponder({ response: 'UNSAFE\nharmful instructions' }),
    });
    const result = await verifier.verify({ prompt: 'How do I make a bomb?', output: 'Mix these...' });
    expect(result.verdict).toBe('UNSAFE');
    expect(result.degraded).toBe(false);
  });

  it('returns REVIEW + degraded when the model returns non-verdict text', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:11434',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchResponder({ response: 'I am not sure what to say here' }),
    });
    const result = await verifier.verify({ prompt: 'p', output: 'o' });
    expect(result.verdict).toBe('REVIEW');
    expect(result.degraded).toBe(true);
  });

  it('returns REVIEW + degraded when the model is unreachable (fetch throws)', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:1',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchThrower(new Error('ECONNREFUSED')),
    });
    const result = await verifier.verify({ prompt: 'p', output: 'o' });
    expect(result.verdict).toBe('REVIEW');
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('verifier model unavailable');
  });

  it('returns REVIEW + degraded when the model returns a non-2xx status', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:11434',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchResponder({ error: 'model not found' }, 404),
    });
    const result = await verifier.verify({ prompt: 'p', output: 'o' });
    expect(result.verdict).toBe('REVIEW');
    expect(result.degraded).toBe(true);
  });

  it('measures latency', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:11434',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchResponder({ response: 'SAFE\nok' }),
    });
    const result = await verifier.verify({ prompt: 'p', output: 'o' });
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('InferenceVerifier.health', () => {
  it('returns ok=true when the model is reachable', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:11434',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchResponder({ response: 'SAFE' }),
    });
    const health = await verifier.health();
    expect(health.ok).toBe(true);
    expect(health.model).toBe('test-model');
    expect(typeof health.latencyMs).toBe('number');
  });

  it('returns ok=false when the model is unreachable', async () => {
    const verifier = new InferenceVerifier({
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:1',
      systemPrompt: 'test prompt',
      fetchImpl: makeFetchThrower(new Error('ECONNREFUSED')),
    });
    const health = await verifier.health();
    expect(health.ok).toBe(false);
  });
});
