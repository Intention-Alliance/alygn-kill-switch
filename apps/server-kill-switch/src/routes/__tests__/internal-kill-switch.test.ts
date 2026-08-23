/**
 * Internal Kill-Switch Transition Route — Unit Tests
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §d.1, P2-4 (Stage 1 review).
 *
 * Covers:
 *   - correct internal key passes (200)
 *   - wrong key → 403
 *   - no key → 401
 *   - STOPPED transition works
 *   - already-STOPPED is idempotent (409, no double-transition)
 *   - non-internal paths reject (returns false, not handled)
 *   - non-POST method → 405
 *   - disallowed state (e.g. RUNNING) → 400
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { handleInternalKillSwitchRoutes } from '../internal-kill-switch';

const INTERNAL_KEY = 'test-internal-key-0123456789abcdef';

function makeRes() {
  let status = 0;
  let body: unknown = null;
  return {
    res: {
      writeHead: (s: number) => { status = s; },
      end: (d?: string) => { body = d ? JSON.parse(d) : null; },
    },
    get status() { return status; },
    get body() { return body; },
  };
}

function makeService(overrides: Partial<{
  currentState: string;
  transitionError: { statusCode: number; message: string; current: string; allowed: string[] } | null;
}> = {}) {
  const transitions: Array<{ state: string; metadata: any }> = [];
  return {
    transitions,
    transitionTo: async (state: string, metadata: any) => {
      transitions.push({ state, metadata });
      if (overrides.transitionError) {
        const err: any = new Error(overrides.transitionError.message);
        err.statusCode = overrides.transitionError.statusCode;
        err.current = overrides.transitionError.current;
        err.allowed = overrides.transitionError.allowed;
        throw err;
      }
      return {
        previousState: overrides.currentState ?? 'RUNNING',
        newState: state,
        timestamp: new Date().toISOString(),
        traceId: 'trace-1',
        initiatedBy: metadata?.userId ?? 'system:verifier',
        reason: metadata?.reason ?? 'automated-stop',
        ip: 'internal',
      };
    },
  };
}

function makeReq(overrides: Partial<{
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  ip: string;
}> = {}) {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? '/v1/internal/kill-switch/transition',
    headers: overrides.headers ?? {},
    body: overrides.body ?? '',
    ip: overrides.ip ?? '127.0.0.1',
  };
}

beforeEach(() => {
  process.env.KILL_SWITCH_INTERNAL_KEY = INTERNAL_KEY;
});

afterEach(() => {
  delete process.env.KILL_SWITCH_INTERNAL_KEY;
});

describe('handleInternalKillSwitchRoutes — auth', () => {
  it('rejects non-internal paths (returns false, not handled)', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'GET',
      '/v1/kill-switch/chaos',
      makeReq({ url: '/v1/kill-switch/chaos' }),
      r.res,
      service as any,
    );
    expect(handled).toBe(false);
    expect(r.status).toBe(0);
    expect(r.body).toBeNull();
  });

  it('returns 401 when no internal credential is supplied', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({ headers: {} }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(401);
  });

  it('returns 403 when a wrong internal key is supplied', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({ headers: { 'x-internal-key': 'wrong-key' } }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(403);
  });

  it('returns 403 when a wrong bearer token is supplied', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({ headers: { authorization: 'Bearer wrong-token' } }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(403);
  });

  it('passes with the correct x-internal-key header', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({
        headers: { 'x-internal-key': INTERNAL_KEY },
        body: JSON.stringify({ state: 'STOPPED', reason: 'unsafe-inference' }),
      }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body as { ok?: boolean; newState?: string }).toMatchObject({ ok: true, newState: 'STOPPED' });
  });

  it('passes with the correct bearer token', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({
        headers: { authorization: `Bearer ${INTERNAL_KEY}` },
        body: JSON.stringify({ state: 'STOPPED' }),
      }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(200);
  });
});

describe('handleInternalKillSwitchRoutes — transitions', () => {
  it('STOPPED transition works and passes initiatedBy/reason', async () => {
    const r = makeRes();
    const service = makeService({ currentState: 'RUNNING' });
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({
        headers: { 'x-internal-key': INTERNAL_KEY },
        body: JSON.stringify({ state: 'STOPPED', reason: 'unsafe-inference', initiatedBy: 'system:verifier' }),
      }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body as { ok?: boolean; newState?: string; previousState?: string }).toMatchObject({ ok: true, newState: 'STOPPED', previousState: 'RUNNING' });
    expect(service.transitions).toHaveLength(1);
    expect(service.transitions[0].state).toBe('STOPPED');
    expect(service.transitions[0].metadata).toMatchObject({
      reason: 'unsafe-inference',
      userId: 'system:verifier',
      ip: 'internal',
    });
  });

  it('already-STOPPED is idempotent (409, no double-transition)', async () => {
    const r = makeRes();
    const service = makeService({
      transitionError: {
        statusCode: 409,
        message: 'Invalid transition: STOPPED → STOPPED',
        current: 'STOPPED',
        allowed: ['ARMED', 'LOCKED', 'RUNNING'],
      },
    });
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({
        headers: { 'x-internal-key': INTERNAL_KEY },
        body: JSON.stringify({ state: 'STOPPED' }),
      }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(409);
    expect(r.body as { current?: string }).toMatchObject({ current: 'STOPPED' });
  });

  it('rejects a disallowed state (RUNNING) with 400', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'POST',
      '/v1/internal/kill-switch/transition',
      makeReq({
        headers: { 'x-internal-key': INTERNAL_KEY },
        body: JSON.stringify({ state: 'RUNNING' }),
      }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(400);
    expect((r.body as { error?: string }).error).toMatch(/STOPPING|STOPPED/);
    expect(service.transitions).toHaveLength(0);
  });

  it('returns 405 for a non-POST method', async () => {
    const r = makeRes();
    const service = makeService();
    const handled = await handleInternalKillSwitchRoutes(
      'GET',
      '/v1/internal/kill-switch/transition',
      makeReq({ method: 'GET' }),
      r.res,
      service as any,
    );
    expect(handled).toBe(true);
    expect(r.status).toBe(405);
  });
});
