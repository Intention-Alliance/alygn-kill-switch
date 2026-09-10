/**
 * Flags Routes — Quorum-Gated Policy Changes (ADR-136 §6)
 *
 * When `kill.authorization.mode` is `quorum`, the plain flag-management
 * endpoint (PUT /v1/flags/:id, DELETE /v1/flags/:id) REJECTS
 * single-signature changes to any `kill.authorization.*` flag with 403
 * QUORUM_REQUIRED. The caller must use
 * POST /v1/kill-authorization/policy-change instead.
 *
 * Uses the REAL kill-authorization service (reads mode from the mocked
 * settings store) so no module mock collision occurs with the service
 * unit tests.
 */

import { describe, it, expect, mock, beforeEach, beforeAll } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Mock drizzle-orm ─────────────────────────────────────────────

mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
  and: (...args: any[]) => ({ __and: args }),
}));

// ─── In-memory stores ─────────────────────────────────────────────

interface MockFlag {
  id: string;
  key: string;
  value: boolean | string; // v1.2: stored as TEXT, mocks may hold either
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockSetting {
  key: string;
  value: string;
  updatedAt: Date;
}

let flagsStore: MockFlag[] = [];
let settingStore: MockSetting[] = [];

beforeEach(() => {
  flagsStore = [
    {
      id: 'flag-kill-auth-mode',
      key: 'kill.authorization.mode',
      value: true,
      description: null,
      enabled: true,
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'flag-interception',
      key: 'llm_interception_enabled',
      value: true,
      description: null,
      enabled: true,
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  settingStore = [
    { key: 'kill.authorization.mode', value: 'quorum', updatedAt: new Date() },
    { key: 'kill.authorization.quorum', value: '2', updatedAt: new Date() },
    { key: 'kill.authorization.timeoutMs', value: '600000', updatedAt: new Date() },
  ];
});

// ─── Mock db/index ────────────────────────────────────────────────

mock.module(path.resolve(__dirname, '../../db/index.ts'), () => {
  let _lastEqValue: any = null;

  function applyFilter(items: any[]): any[] {
    if (_lastEqValue === null) return items;
    const filtered = items.filter(
      (f: any) => f.id === _lastEqValue || f.flagId === _lastEqValue || f.key === _lastEqValue,
    );
    _lastEqValue = null;
    return filtered;
  }

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
        const isAuditLog = tableName.includes('flag_audit_log') || tableName === 'flagAuditLog';
        const isSetting = tableName.includes('setting');
        const store = isAuditLog ? [] : isSetting ? settingStore : flagsStore;

        return {
          all() {
            return [...store];
          },
          where(condition: any) {
            _lastEqValue = condition?.__eq ?? null;
            const filtered = applyFilter(store);
            return {
              all() { return filtered; },
              get() { return filtered.length > 0 ? filtered[0] : null; },
            };
          },
        };
      },
    };
  }

  function makeInsert() {
    return {
      values(data: any) {
        return {
          run() {
            if (data.key) {
              settingStore.push({
                key: data.key,
                value: data.value,
                updatedAt: data.updatedAt ?? new Date(),
              });
            } else {
              flagsStore.push({
                id: data.id || crypto.randomUUID(),
                key: data.key,
                value: Boolean(data.value),
                description: data.description ?? null,
                enabled: data.enabled !== false,
                createdBy: data.createdBy || 'api',
                createdAt: data.createdAt || new Date(),
                updatedAt: data.updatedAt || new Date(),
              });
            }
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
            _lastEqValue = condition?.__eq ?? null;
            return {
              run() {
                const idx = flagsStore.findIndex((f) => f.id === _lastEqValue);
                if (idx >= 0) {
                  flagsStore[idx] = { ...flagsStore[idx], ...updates };
                }
                _lastEqValue = null;
              },
            };
          },
        };
      },
    };
  }

  function makeDelete() {
    return {
      where(condition: any) {
        _lastEqValue = condition?.__eq ?? null;
        return {
          run() {
            flagsStore = flagsStore.filter((f) => f.id !== _lastEqValue);
            _lastEqValue = null;
          },
        };
      },
    };
  }

  return {
    db: {
      select: makeSelect,
      insert: makeInsert,
      update: makeUpdate,
      delete: makeDelete,
    },
  };
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

function createMockReq(bodyStr?: string) {
  const req: any = {
    headers: {} as Record<string, string>,
    _body: bodyStr || '',
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

let handleFlagsRoutes: any;

beforeAll(async () => {
  const mod = await import('../flags');
  handleFlagsRoutes = mod.handleFlagsRoutes;
});

// ─── Tests ────────────────────────────────────────────────────────

describe('handleFlagsRoutes — quorum-gated kill.authorization.* changes (ADR-136 §6)', () => {
  it('PUT kill.authorization.* flag while mode=quorum → 403 QUORUM_REQUIRED', async () => {
    const res = createMockRes();
    const req = createMockReq(JSON.stringify({ value: false }));

    const handled = await handleFlagsRoutes(
      'PUT', '/v1/flags/flag-kill-auth-mode', req, res, 'admin@alygn.com', 'admin',
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).code).toBe('QUORUM_REQUIRED');
    // Flag must be unchanged
    expect(flagsStore.find((f) => f.id === 'flag-kill-auth-mode')!.value).toBe(true);
  });

  it('DELETE kill.authorization.* flag while mode=quorum → 403 QUORUM_REQUIRED', async () => {
    const res = createMockRes();
    const req = createMockReq();

    const handled = await handleFlagsRoutes(
      'DELETE', '/v1/flags/flag-kill-auth-mode', req, res, 'admin@alygn.com', 'admin',
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).code).toBe('QUORUM_REQUIRED');
    expect(flagsStore.length).toBe(2); // nothing deleted
  });

  it('PUT non-kill.authorization.* flag while mode=quorum → still allowed (200)', async () => {
    const res = createMockRes();
    const req = createMockReq(JSON.stringify({ value: false }));

    const handled = await handleFlagsRoutes(
      'PUT', '/v1/flags/flag-interception', req, res, 'admin@alygn.com', 'admin',
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    // v1.2: value stored as TEXT ('false'), not boolean
    expect(flagsStore.find((f) => f.id === 'flag-interception')!.value).toBe('false');
    // Response body coerces back to the declared type
    expect(getJson(res).flag.value).toBe(false);
  });

  it('non-admin PUT kill.authorization.* flag → 403 Admin role required (role check first)', async () => {
    const res = createMockRes();
    const req = createMockReq(JSON.stringify({ value: false }));

    const handled = await handleFlagsRoutes(
      'PUT', '/v1/flags/flag-kill-auth-mode', req, res, 'viewer@alygn.com', 'viewer',
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).error).toContain('Admin role required');
  });
});
