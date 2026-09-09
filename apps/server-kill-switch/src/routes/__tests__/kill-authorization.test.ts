/**
 * Kill Authorization Routes — HTTP Surface Tests (ADR-136)
 *
 * Covers:
 *   - POST /v1/kill-authorization/requests (initiate kill, assertion token)
 *   - POST /v1/kill-authorization/requests/:id/approve (quorum approval)
 *   - POST /v1/kill-authorization/policy-change (quorum-gated flag change)
 *   - service account / API key rejected (assertion token required)
 *   - non-kill.authorization.* flag rejected on policy-change endpoint
 *
 * Uses a mocked KillSwitchService + mocked db (in-memory stores) so no
 * real SQLite / Redis is touched. Assertion tokens are minted by the
 * REAL webauthn service test hook (no module mock collision).
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Env for assertion token HMAC ─────────────────────────────────
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-secret-0123456789abcdef0123456789abcdef';
process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET = process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET || 'test-assertion-token-secret';

// ─── In-memory stores ─────────────────────────────────────────────

interface MockRequest {
  id: string;
  action: string;
  target: string;
  initiatedBy: string;
  initiatedByCredentialId: string;
  initiatedAt: Date;
  status: string;
  signatures: string;
  executedAt: Date | null;
  timeoutMs: number;
}

interface MockSetting {
  key: string;
  value: string;
  updatedAt: Date;
}

interface MockAudit {
  id: string;
  userId: string;
  reason: string;
  previousState: string;
  newState: string;
  traceId: string;
  machineId: string | null;
  severity: string;
  metadata: string | null;
  timestamp: Date;
}

let requestStore: MockRequest[] = [];
let settingStore: MockSetting[] = [];
let auditStore: MockAudit[] = [];

function setSetting(key: string, value: string) {
  const existing = settingStore.find((s) => s.key === key);
  if (existing) existing.value = value;
  else settingStore.push({ key, value, updatedAt: new Date() });
}

beforeEach(() => {
  requestStore = [];
  settingStore = [];
  auditStore = [];
  setSetting('kill.authorization.mode', 'single');
  setSetting('kill.authorization.quorum', '2');
  setSetting('kill.authorization.timeoutMs', '600000');
});

// ─── Mock @simplewebauthn/server (never called by these tests) ────
// Scope the mock to this file by preserving the real module's exports so it
// does not leak into other test files that import the real module.
const realSimpleWebAuthn = await import('@simplewebauthn/server');

mock.module('@simplewebauthn/server', () => ({
  ...realSimpleWebAuthn,
  generateRegistrationOptions: async () => ({ challenge: 'x' }),
  verifyRegistrationResponse: async () => ({ verified: false }),
  generateAuthenticationOptions: async () => ({ challenge: 'x' }),
  verifyAuthenticationResponse: async () => ({ verified: false }),
}));

// ─── Mock drizzle-orm ─────────────────────────────────────────────
//
// Scope the drizzle-orm mock to this file by preserving the real module's
// exports and overriding only the query-builder helpers this service uses.
// This prevents the mock from leaking into other test files that need the
// real drizzle-orm exports (e.g. inArray/desc/asc) when the suite runs in
// a single process — keeping the suite order-independent.
const realDrizzleOrm = await import('drizzle-orm');

mock.module('drizzle-orm', () => ({
  ...realDrizzleOrm,
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
  and: (...args: any[]) => ({ __and: args }),
  isNull: (col: any) => ({ __isNull: true, __col: col?.name }),
}));

// ─── Mock db/index ────────────────────────────────────────────────

mock.module(path.resolve(__dirname, '../../db/index.ts'), () => {
  function resolveTableName(table: any): string {
    const sym = (table as any)?.[Symbol.for('drizzle:Name')];
    if (sym) return String(sym);
    if (typeof table === 'string') return table;
    if (table?.name && typeof table.name === 'string') return table.name;
    return String(table);
  }

  function makeSelect() {
    return {
      from(table: any) {
        const tableName = resolveTableName(table);
        const isRequest = tableName.includes('kill_authorization_request');
        const isSetting = tableName.includes('setting');
        const isAudit = tableName.includes('kill_switch_audit_log');
        const store = isRequest ? requestStore : isSetting ? settingStore : isAudit ? auditStore : [];

        return {
          all() {
            return [...store];
          },
          where(condition: any) {
            let eqValue: any = condition?.__eq ?? null;
            if (eqValue === null && Array.isArray(condition?.__and)) {
              for (const sub of condition.__and) {
                if (sub?.__eq !== undefined) eqValue = sub.__eq;
              }
            }
            const filtered = eqValue !== null
              ? store.filter((r: any) => r.id === eqValue || r.key === eqValue || r.status === eqValue)
              : [...store];
            return {
              all() { return filtered; },
              get() { return filtered.length > 0 ? filtered[0] : null; },
            };
          },
          orderBy() {
            return { limit() { return { all() { return [...store]; } }; } };
          },
          limit() {
            return { all() { return [...store]; } };
          },
        };
      },
    };
  }

  function makeInsert() {
    return {
      values(data: any) {
        const run = () => {
          if (data.id && data.action) {
            requestStore.push({
              id: data.id,
              action: data.action,
              target: data.target,
              initiatedBy: data.initiatedBy,
              initiatedByCredentialId: data.initiatedByCredentialId,
              initiatedAt: data.initiatedAt ?? new Date(),
              status: data.status ?? 'PENDING_QUORUM',
              signatures: data.signatures ?? '[]',
              executedAt: data.executedAt ?? null,
              timeoutMs: data.timeoutMs ?? 600000,
            });
          } else if (data.key) {
            settingStore.push({
              key: data.key,
              value: data.value,
              updatedAt: data.updatedAt ?? new Date(),
            });
          } else if (data.traceId) {
            auditStore.push({
              id: data.id,
              userId: data.userId,
              reason: data.reason,
              previousState: data.previousState,
              newState: data.newState,
              traceId: data.traceId,
              machineId: data.machineId ?? null,
              severity: data.severity ?? 'info',
              metadata: data.metadata ?? null,
              timestamp: data.timestamp ?? new Date(),
            });
          }
        };
        return {
          run,
          onConflictDoUpdate() {
            const execute = () => {
              // Upsert semantics: update existing row, else insert
              const existing = settingStore.find((s) => s.key === data.key);
              if (existing) {
                existing.value = data.value;
                existing.updatedAt = data.updatedAt ?? new Date();
              } else {
                run();
              }
            };
            // Drizzle insert builders are thenable — `await` executes them.
            const result: any = {
              run: execute,
              then(resolve: any) {
                execute();
                return Promise.resolve(resolve ? resolve(undefined) : undefined);
              },
            };
            return result;
          },
        };
      },
    };
  }

  function makeUpdate() {
    return {
      set(updates: any) {
        return {
          where(condition: any) {
            const eqValue = condition?.__eq ?? null;
            return {
              run() {
                const idx = requestStore.findIndex((r) => r.id === eqValue);
                if (idx >= 0) {
                  requestStore[idx] = { ...requestStore[idx], ...updates };
                }
              },
            };
          },
        };
      },
    };
  }

  const dbMock = {
    select: makeSelect,
    insert: makeInsert,
    update: makeUpdate,
    // ADR-136 atomicity: approve() runs the status update + executor
    // side-effect inside a transaction. The mock executes the callback
    // against the same in-memory db object so reads/writes share the
    // same stores.
    transaction: async (cb: (tx: any) => Promise<unknown>) => {
      return cb(dbMock);
    },
  };
  return { db: dbMock };
});

// ─── Mock KillSwitchService ───────────────────────────────────────

const mockTransitionTo = mock(async (state: string, metadata: any) => ({
  id: 'audit-1',
  previousState: 'ARMED',
  newState: state,
  timestamp: new Date().toISOString(),
  traceId: 'trace-1',
  initiatedBy: metadata.userId,
  reason: metadata.reason,
  ip: metadata.ip,
}));

const mockService = {
  transitionTo: mockTransitionTo,
  getCurrentState: async () => 'ARMED',
  getAuditLog: () => [],
  getLastActivation: () => ({ timestamp: null, by: null, reason: null }),
  healthCheck: async () => ({ status: 'healthy' }),
};

// ─── Import route after mocks ─────────────────────────────────────

let handleKillAuthorizationRoutes: any;
let mintAssertionToken: any;

beforeEach(async () => {
  mockTransitionTo.mockClear();
  const mod = await import('../kill-authorization');
  handleKillAuthorizationRoutes = mod.handleKillAuthorizationRoutes;
  const waMod = await import('../../services/webauthn');
  mintAssertionToken = waMod.__test.mintAssertionToken;
});

// ─── Helpers ──────────────────────────────────────────────────────

function createMockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(code: number, headers: Record<string, string>) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(data: string) {
      this.body = data;
    },
  };
}

function createMockReq(bodyStr: string, headers: Record<string, string> = {}) {
  const req: any = {
    headers,
    ip: '10.0.0.1',
    _body: bodyStr,
    on(event: string, cb: Function) {
      if (event === 'data') {
        if (req._body) cb(Buffer.from(req._body));
      }
      if (event === 'end') cb();
      return req;
    },
  };
  return req;
}

function getJson(res: any): any {
  return JSON.parse(res.body);
}

// Mint a real assertion token bound to an action (uses the real webauthn service)
function assertionToken(userId: string, credentialId: string, action: string): string {
  return mintAssertionToken(userId, credentialId, action).token;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('POST /v1/kill-authorization/requests — initiate kill', () => {
  it('single mode: assertion token → 200 EXECUTED', async () => {
    setSetting('kill.authorization.mode', 'single');
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ target: 'machine-1', state: 'STOPPED', reason: 'test' }),
      { authorization: `Assertion ${assertionToken('human-a', 'cred-a', 'kill:machine-1')}` },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/requests', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = getJson(res);
    expect(body.executed).toBe(true);
    expect(body.mode).toBe('single');
    expect(body.request.status).toBe('EXECUTED');
    expect(mockTransitionTo).toHaveBeenCalledTimes(1);
  });

  it('quorum mode: assertion token → 202 PENDING_QUORUM, no execution', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ target: 'fleet', state: 'STOPPED', reason: 'fleet kill' }),
      { authorization: `Assertion ${assertionToken('human-a', 'cred-a', 'kill:fleet')}` },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/requests', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(202);
    const body = getJson(res);
    expect(body.executed).toBe(false);
    expect(body.request.status).toBe('PENDING_QUORUM');
    expect(mockTransitionTo).not.toHaveBeenCalled();
  });

  it('service account / API key REJECTED — assertion token required', async () => {
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ target: 'fleet', state: 'STOPPED' }),
      { authorization: 'Bearer service-account-token' },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/requests', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).code).toBe('ASSERTION_REQUIRED');
    expect(mockTransitionTo).not.toHaveBeenCalled();
  });

  it('missing target → 400', async () => {
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ state: 'STOPPED' }),
      { authorization: 'Assertion whatever' },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/requests', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/kill-authorization/requests/:id/approve — quorum approval', () => {
  it('quorum: second distinct human approves → 200 EXECUTED', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    // Seed a PENDING_QUORUM request initiated by human-a
    requestStore.push({
      id: 'req-1',
      action: 'kill',
      target: 'fleet',
      initiatedBy: 'human-a',
      initiatedByCredentialId: 'cred-a',
      initiatedAt: new Date(),
      status: 'PENDING_QUORUM',
      signatures: JSON.stringify([{ userId: 'human-a', credentialId: 'cred-a', at: new Date().toISOString(), state: 'STOPPED', reason: 'fleet kill' }]),
      executedAt: null,
      timeoutMs: 600000,
    });

    const res = createMockRes();
    const req = createMockReq('{}', { authorization: `Assertion ${assertionToken('human-b', 'cred-b', 'kill:fleet')}` });

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/requests/req-1/approve', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = getJson(res);
    expect(body.executed).toBe(true);
    expect(body.request.status).toBe('EXECUTED');
    expect(mockTransitionTo).toHaveBeenCalledTimes(1);
  });

  it('approve on unknown request → 404 (valid token for generic action)', async () => {
    const res = createMockRes();
    const req = createMockReq('{}', { authorization: `Assertion ${assertionToken('human-b', 'cred-b', 'kill:unknown')}` });

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/requests/nope/approve', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
  });

  it('approve on unknown request with a BAD token → 403 (no request-ID enumeration)', async () => {
    const res = createMockRes();
    const req = createMockReq('{}', { authorization: 'Assertion not-a-valid-token' });

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/requests/nope/approve', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /v1/kill-authorization/policy-change — quorum-gated flag change', () => {
  it('quorum mode: single signature → 202 PENDING_QUORUM (rejected as single-signature change)', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ flagKey: 'kill.authorization.mode', value: 'single' }),
      { authorization: `Assertion ${assertionToken('human-a', 'cred-a', 'policy-change:kill.authorization.mode')}` },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/policy-change', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(202);
    const body = getJson(res);
    expect(body.executed).toBe(false);
    expect(body.request.status).toBe('PENDING_QUORUM');
    // The setting must NOT have changed yet
    expect(settingStore.find((s) => s.key === 'kill.authorization.mode')!.value).toBe('quorum');
  });

  it('single mode: one signature → 200 EXECUTED + setting applied', async () => {
    setSetting('kill.authorization.mode', 'single');
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ flagKey: 'kill.authorization.timeoutMs', value: '300000' }),
      { authorization: `Assertion ${assertionToken('human-a', 'cred-a', 'policy-change:kill.authorization.timeoutMs')}` },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/policy-change', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = getJson(res);
    expect(body.executed).toBe(true);
    expect(settingStore.find((s) => s.key === 'kill.authorization.timeoutMs')!.value).toBe('300000');
  });

  it('non-kill.authorization.* flag → 400 NOT_KILL_AUTH_FLAG', async () => {
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ flagKey: 'llm_interception_enabled', value: 'false' }),
      { authorization: 'Assertion whatever' },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/policy-change', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(getJson(res).code).toBe('NOT_KILL_AUTH_FLAG');
  });

  it('service account / API key REJECTED on policy-change', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ flagKey: 'kill.authorization.mode', value: 'single' }),
      { 'x-api-key': 'leaked-service-key' },
    );

    const handled = await handleKillAuthorizationRoutes('POST', '/v1/kill-authorization/policy-change', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).code).toBe('ASSERTION_REQUIRED');
  });
});

describe('GET /v1/kill-authorization/requests', () => {
  it('lists requests', async () => {
    requestStore.push({
      id: 'req-1',
      action: 'kill',
      target: 'fleet',
      initiatedBy: 'human-a',
      initiatedByCredentialId: 'cred-a',
      initiatedAt: new Date(),
      status: 'PENDING_QUORUM',
      signatures: '[]',
      executedAt: null,
      timeoutMs: 600000,
    });

    const res = createMockRes();
    const req = createMockReq('');

    const handled = await handleKillAuthorizationRoutes('GET', '/v1/kill-authorization/requests', req, res, mockService);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson(res).requests.length).toBe(1);
  });
});
