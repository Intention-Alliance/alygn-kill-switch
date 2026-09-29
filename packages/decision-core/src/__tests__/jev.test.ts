/**
 * Jev provider — TypeSafe System One client.
 *
 * All cases use an injected fetchImpl; no network calls.
 */

import { describe, it, expect } from 'bun:test';
import { JevProvider } from '../providers/jev';

const KEY = 'test-key-do-not-log';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function answers(over: Record<string, unknown> = {}) {
  return {
    answers: {
      harmful: { noul: 0.95 },
      category: {
        choice: 'unsafe',
        confidence: 0.81,
        probabilities: { safe: 0.05, unsafe: 0.9, review: 0.05 },
      },
      ...over,
    },
  };
}

describe('JevProvider', () => {
  it('happy path: Noul + Choice unsafe → block', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () => jsonResponse(answers())) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'do harm', machineId: 'm1' });
    expect(r.label).toBe('unsafe');
    expect(r.score).toBe(0.95);
    expect(r.confidence).toBe(0.81);
    expect(r.action).toBe('block');
    expect(r.degraded).toBe(false);
    expect(r.provider).toBe('jev');
  });

  it('Choice safe → forward', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () =>
        jsonResponse(answers({ category: { choice: 'safe', confidence: 0.9, probabilities: { safe: 0.95 } } }))) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'hi', machineId: 'm1' });
    expect(r.label).toBe('safe');
    expect(r.action).toBe('forward');
  });

  it('Choice review → review', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () =>
        jsonResponse(answers({ category: { choice: 'review', confidence: 0.5, probabilities: {} } }))) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: '?', machineId: 'm1' });
    expect(r.label).toBe('review');
    expect(r.action).toBe('review');
  });

  it('401 → degraded review, no body echoed', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () => jsonResponse({ secret: KEY }, 401)) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'x', machineId: 'm1' });
    expect(r.action).toBe('review');
    expect(r.degraded).toBe(true);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it('429 → degraded review', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'x', machineId: 'm1' });
    expect(r.degraded).toBe(true);
    expect(r.action).toBe('review');
  });

  it('malformed JSON → degraded review', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'x', machineId: 'm1' });
    expect(r.degraded).toBe(true);
    expect(r.reasons.join(' ')).toContain('unparseable');
  });

  it('missing answers → degraded review', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () => jsonResponse({ model: 'jev-1.0' })) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'x', machineId: 'm1' });
    expect(r.degraded).toBe(true);
  });

  it('timeout → degraded review with timeout reason', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      timeoutMs: 50,
      fetchImpl: (async () => {
        const err: any = new Error('aborted');
        err.name = 'TimeoutError';
        throw err;
      }) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'x', machineId: 'm1' });
    expect(r.degraded).toBe(true);
    expect(r.reasons.join(' ')).toContain('timeout');
  });

  it('empty apiKey → degraded review and NO fetch call', async () => {
    let called = false;
    const p = new JevProvider({
      apiKey: '',
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({});
      }) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'x', machineId: 'm1' });
    expect(called).toBe(false);
    expect(r.degraded).toBe(true);
    expect(r.reasons.join(' ')).toContain('no api key');
  });

  it('sends the documented request shape and the Bearer header', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async (url: any, init: any) => {
        captured = { url: String(url), init };
        return jsonResponse(answers());
      }) as unknown as typeof fetch,
    });
    await p.decide({ kind: 'prompt', text: 'hello', model: 'llama3', machineId: 'm1' });

    expect(captured!.url).toBe('https://api.typesafe.ai/v1/systemone');
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);

    const body = JSON.parse(captured!.init.body as string);
    expect(body.model).toBe('jev-latest');
    expect(body.questions.harmful.type).toBe('noul');
    expect(body.questions.category.type).toBe('choice');
    expect(body.state.kind).toBe('prompt');
    expect(body.state.machineId).toBe('m1');
  });

  it('never leaks the key into any returned field', async () => {
    const p = new JevProvider({
      apiKey: KEY,
      fetchImpl: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
    });
    const r = await p.decide({ kind: 'prompt', text: 'x', machineId: 'm1' });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
});
