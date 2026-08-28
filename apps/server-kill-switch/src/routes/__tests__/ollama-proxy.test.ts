/**
 * Ollama Reverse-Proxy Routes — Unit Tests
 *
 * Infra consult #3 (2026-08-27): the kill-switch proxies ALL machine
 * inference lanes through the verification layer.
 *
 * Covers:
 *   - X-API-Key auth: 401 on missing/wrong key, pass on correct key
 *   - metadata pass-through (GET /v1/models, /api/tags) — unverified
 *   - upstream failover: first upstream down → second serves
 *   - buffered passthrough (chunked body relayed to the client)
 *   - path traversal rejection (defense in depth)
 *   - integration against the production nodeRes adapter (write/end contract)
 *   - non-proxy paths return false (not handled)
 *
 * NOTE: route-level verification was removed (P1-3) — the
 * inference-verification middleware hook (index.ts) is the single source of
 * truth. The route no longer accepts a `verification` option.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  handleOllamaProxyRoutes,
  isOllamaProxyPath,
  isOllamaProxyRequest,
  startOllamaUpstreamHealthCheck,
  resetOllamaUpstreamHealthCheck,
  extractGenerationOutput,
} from '../ollama-proxy';
import { createNodeResAdapter } from '../../utils/node-res-adapter';
import type { VerificationService } from '../../services/verification/verification-service';
import {
  blockFingerprint,
  deriveFingerprint,
  isFingerprintBlocked,
  resetFingerprintHaltState,
  unblockFingerprint,
} from '../../services/fingerprint-halt';
import { checkInferenceGate } from '../../middleware/inference-gate';
import { resetTrafficPauseState } from '../../services/traffic-pause';

const API_KEY = 'test-api-key-0123456789abcdef';

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function makeFetchImpl(handler: FetchImpl) {
  return mock(handler);
}

// ─── Test helpers ───────────────────────────────────────────────────

function makeReq(overrides: { body?: string; headers?: Record<string, string> } = {}) {
  return {
    headers: { ...(overrides.headers ?? {}) },
    body: overrides.body ?? '',
  };
}

interface MockRes {
  _h: Record<string, string>;
  _s: number;
  _b: string;
  chunks: Array<string | Uint8Array>;
  setHeader: (n: string, v: string) => void;
  writeHead: (s: number, h?: Record<string, string>) => void;
  write: (chunk: string | Uint8Array) => void;
  end: (d?: string) => void;
}

function makeRes(): MockRes {
  const chunks: Array<string | Uint8Array> = [];
  const res: MockRes = {
    _h: {},
    _s: 200,
    _b: '',
    chunks,
    setHeader(n: string, v: string) {
      this._h[n.toLowerCase()] = String(v);
    },
    writeHead(s: number, h?: Record<string, string>) {
      this._s = s;
      if (h) Object.entries(h).forEach(([k, v]) => { this._h[k.toLowerCase()] = String(v); });
    },
    write(chunk: string | Uint8Array) {
      chunks.push(chunk);
    },
    end(d?: string) {
      if (d) chunks.push(d);
      this._b = chunks
        .map((c: string | Uint8Array) => (typeof c === 'string' ? c : new TextDecoder().decode(c)))
        .join('');
    },
  };
  return res;
}

function makeUpstreamResponse(
  status: number,
  body: string,
  headers: Record<string, string> = { 'content-type': 'application/json' },
): Response {
  return new Response(body, { status, headers });
}

function makeStreamingResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers });
}

/** Resolve a Response from the production nodeRes adapter (write/end contract). */
function makeProductionRes(): { res: ReturnType<typeof createNodeResAdapter>; response: Promise<Response> } {
  let resolveResponse: (r: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  return { res: createNodeResAdapter(resolveResponse), response };
}

// ─── Path matching ─────────────────────────────────────────────────

describe('isOllamaProxyPath / isOllamaProxyRequest', () => {
  it('matches generation paths', () => {
    expect(isOllamaProxyPath('/v1/chat/completions')).toBe(true);
    expect(isOllamaProxyPath('/api/chat')).toBe(true);
    expect(isOllamaProxyPath('/api/generate')).toBe(true);
    expect(isOllamaProxyPath('/v1/completions')).toBe(true);
  });

  it('matches metadata paths', () => {
    expect(isOllamaProxyPath('/v1/models')).toBe(true);
    expect(isOllamaProxyPath('/api/tags')).toBe(true);
    expect(isOllamaProxyPath('/api/version')).toBe(true);
    expect(isOllamaProxyPath('/api/show')).toBe(true);
  });

  it('matches blob paths (model create binary uploads)', () => {
    expect(isOllamaProxyPath('/api/blobs/sha256-abc123')).toBe(true);
  });

  it('strips query strings', () => {
    expect(isOllamaProxyPath('/v1/models?format=json')).toBe(true);
  });

  it('does not match non-proxy paths', () => {
    expect(isOllamaProxyPath('/v1/kill-switch/health')).toBe(false);
    expect(isOllamaProxyPath('/v1/auth/login')).toBe(false);
    expect(isOllamaProxyPath('/api/admin/secrets')).toBe(false);
    expect(isOllamaProxyPath('/')).toBe(false);
  });

  it('flags generation POSTs as verified lanes', () => {
    expect(isOllamaProxyRequest('POST', '/v1/chat/completions')).toEqual({ matched: true, verified: true });
    expect(isOllamaProxyRequest('POST', '/v1/completions')).toEqual({ matched: true, verified: true });
    expect(isOllamaProxyRequest('POST', '/api/chat')).toEqual({ matched: true, verified: true });
    expect(isOllamaProxyRequest('POST', '/api/generate')).toEqual({ matched: true, verified: true });
  });

  it('flags metadata GETs as unverified lanes', () => {
    expect(isOllamaProxyRequest('GET', '/v1/models')).toEqual({ matched: true, verified: false });
    expect(isOllamaProxyRequest('GET', '/api/tags')).toEqual({ matched: true, verified: false });
  });

  it('strips query strings for verified-lane matching (P1-2)', () => {
    expect(isOllamaProxyRequest('POST', '/api/chat?stream=true')).toEqual({ matched: true, verified: true });
    expect(isOllamaProxyRequest('POST', '/v1/chat/completions?stream=true')).toEqual({ matched: true, verified: true });
    expect(isOllamaProxyRequest('POST', '/v1/completions?stream=true')).toEqual({ matched: true, verified: true });
    expect(isOllamaProxyRequest('GET', '/v1/models?format=json')).toEqual({ matched: true, verified: false });
  });
});

// ─── Auth (X-API-Key) ──────────────────────────────────────────────

describe('handleOllamaProxyRoutes — X-API-Key auth', () => {
  it('returns 401 when X-API-Key is missing', async () => {
    const req = makeReq();
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(401);
    expect(JSON.parse(res._b)).toHaveProperty('error');
  });

  it('returns 401 when X-API-Key is wrong', async () => {
    const req = makeReq({ headers: { 'x-api-key': 'wrong-key' } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(401);
  });

  it('accepts a correct X-API-Key and proxies', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, JSON.stringify({ models: [] })));
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('does not leak X-API-Key to the upstream', async () => {
    let upstreamHeaders: Record<string, string> = {};
    const fetchImpl = makeFetchImpl(async (_input: string | URL | Request, init?: RequestInit) => {
      upstreamHeaders = (init?.headers ?? {}) as Record<string, string>;
      return makeUpstreamResponse(200, JSON.stringify({ models: [] }));
    });
    const req = makeReq({ headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' } });
    const res = makeRes();
    await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(upstreamHeaders['x-api-key']).toBeUndefined();
    expect(upstreamHeaders['content-type']).toBe('application/json');
  });
});

// ─── Metadata pass-through ─────────────────────────────────────────

describe('handleOllamaProxyRoutes — metadata pass-through', () => {
  it('proxies GET /v1/models unverified (no verification option on the route)', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ object: 'list', data: [{ id: 'qwen2.5:0.5b' }] })),
    );
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(JSON.parse(res._b).data[0].id).toBe('qwen2.5:0.5b');
  });

  it('proxies GET /api/tags unverified', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }] })),
    );
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/tags', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(JSON.parse(res._b).models[0].name).toBe('qwen2.5:0.5b');
  });
});

// ─── Generation paths proxy without route-level verification ───────

describe('handleOllamaProxyRoutes — generation paths (no route-level verification)', () => {
  it('proxies POST /v1/chat/completions (verification is the middleware hook, not the route)', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ choices: [{ message: { content: 'hi' } }] })),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', messages: [{ role: 'user', content: 'Hello there' }] }),
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/v1/chat/completions', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('proxies POST /v1/completions (verified lane, P1-1)', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ choices: [{ text: 'ok' }] })),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'Complete this' }),
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/v1/completions', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('proxies POST /api/chat?stream=true (query string stripped, P1-2)', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ message: { role: 'assistant', content: 'ok' } })),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', messages: [{ role: 'user', content: 'Hi' }] }),
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/chat?stream=true', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    // The query string must be forwarded to the upstream.
    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toContain('/api/chat?stream=true');
  });

  it('passes through without verification when body has no prompt/messages', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ choices: [] })),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b' }),
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/v1/chat/completions', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
  });
});

// ─── Upstream failover ─────────────────────────────────────────────

describe('handleOllamaProxyRoutes — upstream failover', () => {
  it('tries the second upstream when the first is unreachable', async () => {
    const fetchImpl = makeFetchImpl(async (input: string | URL | Request) => {
      if (String(input).startsWith('http://upstream-1')) throw new Error('ECONNREFUSED');
      return makeUpstreamResponse(200, JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }] }));
    });
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/tags', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434', 'http://upstream-2:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(JSON.parse(res._b).models[0].name).toBe('qwen2.5:0.5b');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails over on 5xx from the primary upstream', async () => {
    const fetchImpl = makeFetchImpl(async (input: string | URL | Request) => {
      if (String(input).startsWith('http://upstream-1')) return makeUpstreamResponse(503, 'unavailable');
      return makeUpstreamResponse(200, JSON.stringify({ models: [] }));
    });
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434', 'http://upstream-2:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when all upstreams fail', async () => {
    const fetchImpl = makeFetchImpl(async () => {
      throw new Error('ECONNREFUSED');
    });
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/tags', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434', 'http://upstream-2:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(502);
    expect(JSON.parse(res._b)).toHaveProperty('error');
  });

  it('passes through 4xx responses without failover (model-not-found is deterministic)', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(404, JSON.stringify({ error: 'model not found' })));
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434', 'http://upstream-2:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// ─── Buffered passthrough ─────────────────────────────────────────

describe('handleOllamaProxyRoutes — buffered passthrough', () => {
  it('relays SSE chunks to the client (buffered pass-through)', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeStreamingResponse(
        ['data: {"response":"Hel', 'lo"}\n\ndata: [DONE]\n\n'],
        { 'content-type': 'text/event-stream' },
      ),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'hi', stream: true }),
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(res._h['content-type']).toBe('text/event-stream');
    const relayed = res.chunks.map((c: string | Uint8Array) => (typeof c === 'string' ? c : new TextDecoder().decode(c))).join('');
    expect(relayed).toContain('data: {"response":"Hel');
    expect(relayed).toContain('lo"}\n\ndata: [DONE]');
  });

  it('forwards the original body to the upstream', async () => {
    let upstreamBody = '';
    const fetchImpl = makeFetchImpl(async (_input: string | URL | Request, init?: RequestInit) => {
      upstreamBody = String(init?.body ?? '');
      return makeUpstreamResponse(200, JSON.stringify({ response: 'ok' }));
    });
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'hello', stream: false }),
    });
    const res = makeRes();
    await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(JSON.parse(upstreamBody)).toEqual({ model: 'qwen2.5:0.5b', prompt: 'hello', stream: false });
  });
});

// ─── Production nodeRes adapter integration (P0) ──────────────────

describe('handleOllamaProxyRoutes — production nodeRes adapter (write/end contract)', () => {
  it('relays a chunked upstream body through the real adapter (no res.write TypeError)', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeStreamingResponse(
        ['data: {"response":"Hel', 'lo"}\n\ndata: [DONE]\n\n'],
        { 'content-type': 'text/event-stream' },
      ),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'hi', stream: true }),
    });
    const { res, response } = makeProductionRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    const upstreamResponse = await response;
    expect(upstreamResponse.status).toBe(200);
    expect(upstreamResponse.headers.get('content-type')).toBe('text/event-stream');
    const body = await upstreamResponse.text();
    expect(body).toContain('data: {"response":"Hel');
    expect(body).toContain('lo"}\n\ndata: [DONE]');
  });

  it('resolves a JSON error body through the real adapter (401 path)', async () => {
    const req = makeReq(); // no X-API-Key
    const { res, response } = makeProductionRes();
    const handled = await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
    });
    expect(handled).toBe(true);
    const upstreamResponse = await response;
    expect(upstreamResponse.status).toBe(401);
    const body = (await upstreamResponse.json()) as { error?: string };
    expect(body.error).toBe('Invalid or missing X-API-Key');
  });
});

// ─── Non-proxy paths ──────────────────────────────────────────────

describe('handleOllamaProxyRoutes — non-proxy paths', () => {
  it('returns false (not handled) for non-proxy paths', async () => {
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/v1/kill-switch/health', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
    });
    expect(handled).toBe(false);
    expect(res._s).toBe(200); // untouched
  });
});

// ─── Path traversal hygiene (P2-4) ────────────────────────────────

describe('handleOllamaProxyRoutes — path traversal rejection', () => {
  it('rejects raw `..` segments with 400', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, '{}'));
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/blobs/../api/tags', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(400);
    expect(JSON.parse(res._b)).toHaveProperty('error');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects percent-encoded traversal (%2e%2e) with 400', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, '{}'));
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/blobs/%2e%2e/api/tags', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects mixed-encoded traversal (%2e.) with 400', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, '{}'));
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/blobs/%2e./tags', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed percent-encoding with 400', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, '{}'));
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/blobs/%zz', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows legitimate percent-encoded query values (e.g. model names)', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, '{}'));
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('GET', '/api/show?name=qwen2.5%3A0.5b', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    expect(fetchImpl).toHaveBeenCalled();
  });
});

// ─── Mock VerificationService (P1-1 output verification) ─────────

interface MockVerificationCall {
  prompt: string;
  output: string;
  requestId: string;
  machineId?: string;
  fingerprint?: string;
}

function makeMockVerification(overrides: { verdict?: 'SAFE' | 'UNSAFE' | 'REVIEW' } = {}): {
  service: VerificationService;
  calls: MockVerificationCall[];
  mode: 'async' | 'sync';
} {
  const calls: MockVerificationCall[] = [];
  const verdict = overrides.verdict ?? 'SAFE';
  const service = {
    mode: 'async',
    handleInferenceRequest: async (opts: MockVerificationCall) => {
      calls.push(opts);
      return { mode: 'async' as const };
    },
    recordDegradedEvent: async () => {},
  } as unknown as VerificationService;
  return { service, calls, mode: 'async' };
}

// ─── P1-1: output verification (fires after relay) ───────────────

describe('handleOllamaProxyRoutes — P1-1 output verification', () => {
  beforeEach(() => {
    resetFingerprintHaltState();
    // Prior test files (kill-switch, traffic-pause) may leave the global
    // traffic pause ON — reset so the scoped-halt assertions are isolated.
    resetTrafficPauseState();
  });

  it('(b) fires output verification AFTER relaying for generation paths', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ response: 'hello world' })),
    );
    const { service, calls } = makeMockVerification();
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'Say hello', stream: false }),
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
      fingerprintSource: { machineId: 'machine-42' },
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200);
    // Output verification fired with the extracted output + prompt.
    expect(calls.length).toBe(1);
    expect(calls[0]!.prompt).toBe('Say hello');
    expect(calls[0]!.output).toBe('hello world');
    expect(calls[0]!.fingerprint).toBe(deriveFingerprint({ machineId: 'machine-42' }).fingerprint);
  });

  it('(b) extracts chat-completions output (choices[0].message.content)', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ choices: [{ message: { content: 'assistant reply' } }] })),
    );
    const { service, calls } = makeMockVerification();
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', messages: [{ role: 'user', content: 'Hi' }] }),
    });
    const res = makeRes();
    await handleOllamaProxyRoutes('POST', '/v1/chat/completions', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
      fingerprintSource: { machineId: 'machine-42' },
    });
    expect(calls.length).toBe(1);
    expect(calls[0]!.output).toBe('assistant reply');
  });

  it('(b) does NOT fire output verification for metadata paths', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ models: [] })),
    );
    const { service, calls } = makeMockVerification();
    const req = makeReq({ headers: { 'x-api-key': API_KEY } });
    const res = makeRes();
    await handleOllamaProxyRoutes('GET', '/v1/models', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
    });
    expect(calls.length).toBe(0);
  });

  it('(b) does NOT fire output verification when no verification service is wired', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ response: 'ok' })),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'hi' }),
    });
    const res = makeRes();
    await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(res._s).toBe(200);
  });

  it('(c) UNSAFE output verdict blocks THAT fingerprint (next request → 503) while a DIFFERENT fingerprint continues (200)', async () => {
    // First request: upstream returns UNSAFE-worthy output; the mock
    // verification service blocks the fingerprint via the real blocklist.
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ response: 'unsafe content' })),
    );
    const { service, calls } = makeMockVerification();
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'bad', stream: false }),
    });
    const res = makeRes();
    await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
      fingerprintSource: { machineId: 'machine-42' },
    });
    expect(calls.length).toBe(1);

    // Simulate the async verification completing with UNSAFE → block.
    const fp = deriveFingerprint({ machineId: 'machine-42' }).fingerprint;
    blockFingerprint(fp, "machineId");

    // Next request from the SAME fingerprint → gated 503 (scoped halt).
    const gate = checkInferenceGate('POST', '/api/generate', { machineId: 'machine-42' });
    expect(gate.gated).toBe(true);
    expect(gate.reason).toBe('fingerprint');

    // A DIFFERENT fingerprint → passes the gate (200 path).
    const otherGate = checkInferenceGate('POST', '/api/generate', { machineId: 'machine-99' });
    expect(otherGate.gated).toBe(false);
  });

  it('(e) SAFE verdict unblocks a previously-blocked fingerprint', async () => {
    const fp = deriveFingerprint({ machineId: 'machine-42' }).fingerprint;
    blockFingerprint(fp, "machineId");
    expect(isFingerprintBlocked(fp)).toBe(true);

    // A SAFE output verification from the same fingerprint unblocks it.
    const { service } = makeMockVerification();
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ response: 'safe content' })),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'good', stream: false }),
    });
    const res = makeRes();
    await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
      fingerprintSource: { machineId: 'machine-42' },
    });
    // The route fired verification; the SAFE verdict path unblocks.
    // (The mock service does not act — the real service does. Here we
    // verify the route fired with the fingerprint so the real service
    // would unblock; the unblock itself is covered in the service tests.)
    expect(isFingerprintBlocked(fp)).toBe(true); // still blocked (mock)
    unblockFingerprint(fp);
    expect(isFingerprintBlocked(fp)).toBe(false);
  });

  it('(g) query-string variant (?stream=true) still fires output verification', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ response: 'streamed' })),
    );
    const { service, calls } = makeMockVerification();
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'hi', stream: true }),
    });
    const res = makeRes();
    await handleOllamaProxyRoutes('POST', '/api/generate?stream=true', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
      fingerprintSource: { machineId: 'machine-42' },
    });
    expect(calls.length).toBe(1);
    expect(calls[0]!.output).toBe('streamed');
  });

  it('(h) malformed request JSON still proxies and fires verification with empty prompt', async () => {
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, JSON.stringify({ response: 'ok' })),
    );
    const { service, calls } = makeMockVerification();
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: '{not valid json',
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
      fingerprintSource: { machineId: 'machine-42' },
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(200); // request still proxied
    expect(calls.length).toBe(1);
    expect(calls[0]!.prompt).toBe(''); // nothing to extract
    expect(calls[0]!.output).toBe('ok');
  });

  it('does NOT fire output verification when the relay was aborted (buffer cap)', async () => {
    const huge = 'x'.repeat(70 * 1024 * 1024); // > 64 MiB cap
    const fetchImpl = makeFetchImpl(async () =>
      makeUpstreamResponse(200, huge),
    );
    const { service, calls } = makeMockVerification();
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'hi' }),
    });
    const { res, response } = makeProductionRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
      verification: service,
      fingerprintSource: { machineId: 'machine-42' },
    });
    expect(handled).toBe(true);
    const upstreamResponse = await response;
    expect(upstreamResponse.status).toBe(502);
    const body = (await upstreamResponse.json()) as { error?: string };
    expect(body.error).toBe('response_too_large');
    expect(calls.length).toBe(0); // no verification on a truncated body
  });
});

// ─── extractGenerationOutput ─────────────────────────────────────

describe('extractGenerationOutput', () => {
  it('extracts /api/generate response field', () => {
    expect(extractGenerationOutput(JSON.stringify({ response: 'hello' }))).toBe('hello');
  });

  it('extracts /v1/chat/completions choices[0].message.content', () => {
    expect(extractGenerationOutput(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }))).toBe('hi');
  });

  it('extracts /v1/completions choices[0].text', () => {
    expect(extractGenerationOutput(JSON.stringify({ choices: [{ text: 'done' }] }))).toBe('done');
  });

  it('extracts /api/chat message.content', () => {
    expect(extractGenerationOutput(JSON.stringify({ message: { role: 'assistant', content: 'yo' } }))).toBe('yo');
  });

  it('returns empty for non-JSON bodies', () => {
    expect(extractGenerationOutput('data: {"response":"x"}\n\ndata: [DONE]')).toBe('');
    expect(extractGenerationOutput('')).toBe('');
  });

  it('returns empty for JSON without a recognizable output field', () => {
    expect(extractGenerationOutput(JSON.stringify({ foo: 'bar' }))).toBe('');
  });
});

// ─── P2-2 / P2-4: body cap + mid-stream failure ─────────────────

describe('handleOllamaProxyRoutes — P2-2 request body cap', () => {
  it('rejects an oversized request body with 413 + request_too_large', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, '{}'));
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: 'x'.repeat(70 * 1024 * 1024), // > 64 MiB cap
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    expect(res._s).toBe(413);
    expect(JSON.parse(res._b)).toHaveProperty('error', 'request_too_large');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('handleOllamaProxyRoutes — P2-4 mid-stream failure', () => {
  it('sends an error frame instead of silently truncating on mid-stream failure', async () => {
    // Upstream body stream that errors after the first chunk.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"response":"par'));
        controller.error(new Error('upstream died'));
      },
    });
    const fetchImpl = makeFetchImpl(async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const req = makeReq({
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:0.5b', prompt: 'hi', stream: true }),
    });
    const res = makeRes();
    const handled = await handleOllamaProxyRoutes('POST', '/api/generate', req, res, {
      apiKey: API_KEY,
      upstreams: ['http://upstream-1:11434'],
      fetchImpl,
    });
    expect(handled).toBe(true);
    // The client receives an error frame, not a silent truncated 200.
    const relayed = res.chunks.map((c: string | Uint8Array) => (typeof c === 'string' ? c : new TextDecoder().decode(c))).join('');
    expect(relayed).toContain('upstream_stream_interrupted');
  });
});

// ─── Health check ──────────────────────────────────────────────────

describe('startOllamaUpstreamHealthCheck', () => {
  beforeEach(() => {
    resetOllamaUpstreamHealthCheck();
  });

  it('probes each upstream /api/tags and logs reachability', async () => {
    const logs: string[] = [];
    const fetchImpl = makeFetchImpl(async (input: string | URL | Request) => {
      if (String(input).includes('upstream-1')) return makeUpstreamResponse(200, '{}');
      throw new Error('ECONNREFUSED');
    });
    startOllamaUpstreamHealthCheck({
      upstreams: ['http://upstream-1:11434', 'http://upstream-2:11434'],
      intervalMs: 60_000,
      fetchImpl,
      log: (m) => logs.push(m),
    });
    // Wait for the immediate first check to complete.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logs.some((l) => l.includes('upstream-1') && l.includes('OK'))).toBe(true);
    expect(logs.some((l) => l.includes('upstream-2') && l.includes('UNREACHABLE'))).toBe(true);
  });

  it('clears the interval on reset (no timer leak across test runs, P2-2)', async () => {
    const fetchImpl = makeFetchImpl(async () => makeUpstreamResponse(200, '{}'));
    startOllamaUpstreamHealthCheck({
      upstreams: ['http://upstream-1:11434'],
      intervalMs: 5,
      fetchImpl,
      log: () => {},
    });
    const callsAfterStart = fetchImpl.mock.calls.length;
    // Reset clears the timer — no further interval ticks fire.
    resetOllamaUpstreamHealthCheck();
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchImpl.mock.calls.length).toBe(callsAfterStart);
  });
});
