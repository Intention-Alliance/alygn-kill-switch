/**
 * Inference logs — S6 provider/degraded observability.
 *
 * Dependencies are injected (no process-wide mock.module), so this suite can
 * run alongside the other route suites.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { handleInferenceLogsRoutes, type InferenceLogsDeps } from '../inference-logs';

let inserted: any[] = [];
let rows: any[] = [];

function deps(): InferenceLogsDeps {
  return {
    insertLog: async (entry: any) => {
      inserted.push(entry);
    },
    listLogs: async () => rows,
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
  inserted = [];
  rows = [];
});

describe('handleInferenceLogsRoutes — S6 provider field', () => {
  it('does not handle unrelated urls', async () => {
    const handled = await handleInferenceLogsRoutes('GET', '/v1/flags', mockReq({}), mockRes(), 'u1', 'admin', deps());
    expect(handled).toBe(false);
  });

  it('POST persists provider + degraded', async () => {
    const res = mockRes();
    await handleInferenceLogsRoutes(
      'POST',
      '/v1/inference-logs',
      mockReq({
        machineId: 'm1',
        method: 'POST',
        path: '/api/generate',
        score: 0.9,
        action: 'block',
        provider: 'jev',
        degraded: true,
      }),
      res,
      'u1',
      'admin',
      deps(),
    );
    expect(res.statusCode).toBe(201);
    expect(inserted.length).toBe(1);
    expect(inserted[0].provider).toBe('jev');
    expect(inserted[0].degraded).toBe(true);
  });

  it('POST defaults provider to null and degraded to false', async () => {
    const res = mockRes();
    await handleInferenceLogsRoutes(
      'POST',
      '/v1/inference-logs',
      mockReq({ machineId: 'm1', method: 'POST', path: '/x' }),
      res,
      'u1',
      'admin',
      deps(),
    );
    expect(inserted[0].provider).toBeNull();
    expect(inserted[0].degraded).toBe(false);
  });

  it('GET surfaces provider + degraded', async () => {
    rows = [
      {
        id: 'l1',
        timestamp: new Date(),
        machineId: 'm1',
        method: 'POST',
        path: '/api/generate',
        score: 0.9,
        action: 'block',
        reasons: null,
        alert: false,
        scored: true,
        promptPreview: null,
        model: null,
        provider: 'jev',
        degraded: true,
      },
    ];
    const res = mockRes();
    await handleInferenceLogsRoutes(
      'GET',
      '/v1/inference-logs?limit=5',
      mockReq({}),
      res,
      'u1',
      'admin',
      deps(),
    );
    expect(res.statusCode).toBe(200);
    const body = parsed(res);
    expect(body.logs[0].provider).toBe('jev');
    expect(body.logs[0].degraded).toBe(true);
  });

  it('GET with a query string is handled (pathname match)', async () => {
    const res = mockRes();
    const handled = await handleInferenceLogsRoutes(
      'GET',
      '/v1/inference-logs?limit=5',
      mockReq({}),
      res,
      'u1',
      'admin',
      deps(),
    );
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});
