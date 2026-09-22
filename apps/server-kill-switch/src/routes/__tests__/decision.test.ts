/**
 * POST /v1/decision — validation + fail-closed (S3).
 *
 * Dependencies are injected (no process-wide mock.module), so this suite can
 * run alongside the flags reader suite without interference.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ProviderRegistry } from '@align/decision-core';
import type { DecisionProvider, DecisionResult, DecisionFlagReader } from '@align/shared-types';
import { handleDecisionRoutes, type DecisionRouteDeps } from '../decision';

let stubResult: Partial<DecisionResult> = {};

function stubProvider(): DecisionProvider {
  return {
    name: 'keyword' as any,
    decide: async () => ({
      label: 'safe',
      score: 0,
      confidence: 1,
      action: 'forward',
      reasons: [],
      provider: 'keyword',
      degraded: false,
      latencyMs: 1,
      ...stubResult,
    }),
  };
}

function deps(): DecisionRouteDeps {
  const registry = new ProviderRegistry();
  registry.register(stubProvider());
  return {
    registry,
    flagsReader: async (): Promise<DecisionFlagReader> => ({
      getFlag: (k: string) => (k === 'decision.provider' ? 'keyword' : null),
    }),
  };
}

function mockRes() {
  const res: any = {
    statusCode: 0,
    body: '',
    writeHead(code: number) {
      res.statusCode = code;
    },
    end(b: string) {
      res.body = b;
    },
  };
  return res;
}

function mockReq(body: unknown) {
  return {
    headers: {},
    ip: '127.0.0.1',
    on: (ev: string, cb: (chunk?: any) => void) => {
      if (ev === 'data') cb(Buffer.from(JSON.stringify(body)));
      if (ev === 'end') cb();
    },
  };
}

function parsed(res: any) {
  return JSON.parse(res.body);
}

beforeEach(() => {
  stubResult = {};
});

describe('handleDecisionRoutes', () => {
  it('does not handle unrelated urls', async () => {
    const handled = await handleDecisionRoutes('POST', '/v1/flags', mockReq({}), mockRes(), 'u1', deps());
    expect(handled).toBe(false);
  });

  it('401 without auth', async () => {
    const res = mockRes();
    await handleDecisionRoutes(
      'POST',
      '/v1/decision',
      mockReq({ kind: 'prompt', text: 'x', machineId: 'm1' }),
      res,
      null,
      deps(),
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 on a bad kind', async () => {
    const res = mockRes();
    await handleDecisionRoutes(
      'POST',
      '/v1/decision',
      mockReq({ kind: 'bogus', text: 'x', machineId: 'm1' }),
      res,
      'u1',
      deps(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on a missing machineId', async () => {
    const res = mockRes();
    await handleDecisionRoutes('POST', '/v1/decision', mockReq({ kind: 'prompt', text: 'x' }), res, 'u1', deps());
    expect(res.statusCode).toBe(400);
  });

  it('400 on a non-string text', async () => {
    const res = mockRes();
    await handleDecisionRoutes(
      'POST',
      '/v1/decision',
      mockReq({ kind: 'prompt', text: 42, machineId: 'm1' }),
      res,
      'u1',
      deps(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 with a decision result', async () => {
    const res = mockRes();
    await handleDecisionRoutes(
      'POST',
      '/v1/decision',
      mockReq({ kind: 'prompt', text: 'x', machineId: 'm1' }),
      res,
      'u1',
      deps(),
    );
    expect(res.statusCode).toBe(200);
    expect(parsed(res).action).toBe('forward');
  });

  it('fail-closed end-to-end: a degraded result is review, not a 500', async () => {
    stubResult = {
      label: 'review',
      score: 0.5,
      confidence: 0,
      action: 'review',
      reasons: ['jev: no api key configured'],
      provider: 'jev',
      degraded: true,
      latencyMs: 1,
    };
    const res = mockRes();
    await handleDecisionRoutes(
      'POST',
      '/v1/decision',
      mockReq({ kind: 'prompt', text: 'x', machineId: 'm1' }),
      res,
      'u1',
      deps(),
    );
    expect(res.statusCode).toBe(200);
    expect(parsed(res).action).toBe('review');
    expect(parsed(res).degraded).toBe(true);
  });

  it('never returns an api key field', async () => {
    const res = mockRes();
    await handleDecisionRoutes(
      'POST',
      '/v1/decision',
      mockReq({ kind: 'prompt', text: 'x', machineId: 'm1' }),
      res,
      'u1',
      deps(),
    );
    expect(res.body).not.toContain('apiKey');
    expect(res.body).not.toContain('typesafe');
  });
});
