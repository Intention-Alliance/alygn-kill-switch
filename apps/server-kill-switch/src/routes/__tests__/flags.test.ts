/**
 * Feature Flags Routes — Unit Tests
 *
 * Mocks the Drizzle `db` module and `drizzle-orm` to test all CRUD
 * endpoints and audit logging in isolation.
 *
 * Covers 12 scenarios per docs/plans/REMAINING-P1-FIXES-PLAN.md §5.5
 */

import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from 'bun:test';

// ─── Mock data stores (in-memory) ───────────────────────────────

interface MockFlag {
  id: string;
  key: string;
  value: boolean;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockAuditEntry {
  id: string;
  flagId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  userId: string;
  timestamp: Date;
}

let flagsStore: MockFlag[] = [];
let auditStore: MockAuditEntry[] = [];
let uuidCounter = 0;

beforeEach(() => {
  flagsStore = [];
  auditStore = [];
  uuidCounter = 0;
});

// ─── Mock crypto.randomUUID ─────────────────────────────────────
let origUUID: () => `${string}-${string}-${string}-${string}-${string}`;

beforeAll(() => {
  origUUID = crypto.randomUUID;
  crypto.randomUUID = () => {
    uuidCounter++;
    return `mock-uuid-${uuidCounter.toString().padStart(3, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
  };
});

afterAll(() => {
  globalThis.crypto.randomUUID = origUUID;
});

// ─── Mock drizzle-orm ───────────────────────────────────────────
mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
}));

// ─── Mock db/index ──────────────────────────────────────────────
// Build a mock db that handles select/insert/update/delete chains

function createTableProxy(tableId: string) {
  return {
    flagAuditLog: true,
    featureFlags: false,
  }[tableId] ?? false;
}

mock.module('../../db/index', () => {
  // Track the last where clause value for filtering
  let _lastEqValue: any = null;

  function applyFlagFilter(items: any[]): any[] {
    if (_lastEqValue === null) return items;
    const filtered = items.filter((f: any) => f.id === _lastEqValue || f.flagId === _lastEqValue);
    _lastEqValue = null;
    return filtered;
  }

  function resolveTableName(table: any): string {
    // Drizzle SQLite stores table name in Symbol.for('drizzle:Name')
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
        const store = isAuditLog ? auditStore : flagsStore;

        return {
          all() {
            return [...store];
          },
          where(condition: any) {
            // Extract eq value from mock condition
            _lastEqValue = condition?.__eq ?? null;
            const filtered = applyFlagFilter(store);
            return {
              all() { return filtered; },
              get() { return filtered.length > 0 ? filtered[0] : null; },
            };
          },
        };
      },
    };
  }

  function makeInsert(table: any) {
    const tableName = resolveTableName(table);
    const isAuditLog = tableName.includes('flag_audit_log') || tableName === 'flagAuditLog';

    return {
      values(data: any) {
        return {
          run() {
            if (isAuditLog) {
              auditStore.push({
                id: data.id || crypto.randomUUID(),
                flagId: data.flagId,
                action: data.action,
                oldValue: data.oldValue ?? null,
                newValue: data.newValue ?? null,
                userId: data.userId,
                timestamp: data.timestamp || new Date(),
              });
            } else {
              const now = new Date();
              flagsStore.push({
                id: data.id || crypto.randomUUID(),
                key: data.key,
                value: Boolean(data.value),
                description: data.description ?? null,
                enabled: data.enabled !== false,
                createdBy: data.createdBy || 'api',
                createdAt: data.createdAt || now,
                updatedAt: data.updatedAt || now,
              });
            }
          },
        };
      },
    };
  }

  function makeUpdate(table: any) {
    return {
      set(updates: any) {
        return {
          where(condition: any) {
            _lastEqValue = condition?.__eq ?? null;
            return {
              run() {
                const idx = flagsStore.findIndex((f) => f.id === _lastEqValue);
                if (idx >= 0) {
                  const existing = flagsStore[idx];
                  if (updates.key !== undefined) existing.key = updates.key;
                  if (updates.value !== undefined) existing.value = Boolean(updates.value);
                  if (updates.description !== undefined) existing.description = updates.description;
                  if (updates.enabled !== undefined) existing.enabled = Boolean(updates.enabled);
                  existing.updatedAt = updates.updatedAt || new Date();
                  flagsStore[idx] = existing;
                }
                _lastEqValue = null;
              },
            };
          },
        };
      },
    };
  }

  function makeDelete(table: any) {
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

// ─── Mock res helper ────────────────────────────────────────────

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

// Dynamically import after mocks are set up
let handleFlagsRoutes: any;

beforeAll(async () => {
  const mod = await import('../flags');
  handleFlagsRoutes = mod.handleFlagsRoutes;
});

// ─── Tests ──────────────────────────────────────────────────────

describe('handleFlagsRoutes', () => {

  // ─── GET /v1/flags — list all ──────────────────────────────

  describe('GET /v1/flags — list all flags', () => {
    it('GET /v1/flags on empty DB → { flags: [] }', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/flags', req, res, 'api', null);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(getJson(res)).toEqual({ flags: [] });
    });

    it('GET /v1/flags returns all flags when populated', async () => {
      flagsStore.push({
        id: 'f1', key: 'feature_a', value: true, description: null,
        enabled: true, createdBy: 'admin', createdAt: new Date(), updatedAt: new Date(),
      });
      flagsStore.push({
        id: 'f2', key: 'feature_b', value: false, description: 'beta',
        enabled: true, createdBy: 'admin', createdAt: new Date(), updatedAt: new Date(),
      });

      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/flags', req, res, 'api', null);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.flags.length).toBe(2);
    });
  });

  // ─── GET /v1/flags/:id — single flag ───────────────────────

  describe('GET /v1/flags/:id — single flag', () => {
    it('GET /v1/flags/:id existing → { flag: {...} }', async () => {
      flagsStore.push({
        id: 'flag-abc', key: 'dark_mode', value: true, description: null,
        enabled: true, createdBy: 'admin', createdAt: new Date(), updatedAt: new Date(),
      });

      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/flags/flag-abc', req, res, 'api', null);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.flag.id).toBe('flag-abc');
      expect(body.flag.key).toBe('dark_mode');
    });

    it('GET /v1/flags/:id missing → 404', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/flags/nonexistent', req, res, 'api', null);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(404);
      expect(getJson(res).error).toContain('Flag not found');
    });
  });

  // ─── POST /v1/flags — create ───────────────────────────────

  describe('POST /v1/flags — create flag', () => {
    it('POST /v1/flags with admin role → 201', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ key: 'new_feature', value: true, description: 'Desc' }));
      const handled = await handleFlagsRoutes('POST', '/v1/flags', req, res, 'admin-id', 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(201);
      const body = getJson(res);
      expect(body.flag.key).toBe('new_feature');
      expect(body.flag.value).toBe(true);
      expect(body.flag.id).toBeDefined();
      expect(flagsStore.length).toBe(1);
      // Audit entry should be created
      expect(auditStore.length).toBe(1);
      expect(auditStore[0].action).toBe('created');
      expect(auditStore[0].userId).toBe('admin-id');
    });

    it('POST /v1/flags non-admin → 403', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ key: 'f', value: true }));
      const handled = await handleFlagsRoutes('POST', '/v1/flags', req, res, 'user', 'viewer');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(403);
      expect(getJson(res).error).toBe('Admin role required');
      expect(flagsStore.length).toBe(0);
    });

    it('POST /v1/flags missing key/value → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ description: 'no key' }));
      const handled = await handleFlagsRoutes('POST', '/v1/flags', req, res, 'admin-id', 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(getJson(res).error).toContain('Missing required fields');
    });

    it('POST /v1/flags missing value → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ key: 'only_key' }));
      const handled = await handleFlagsRoutes('POST', '/v1/flags', req, res, 'admin-id', 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── PUT /v1/flags/:id — update ────────────────────────────

  describe('PUT /v1/flags/:id — update flag', () => {
    it('PUT /v1/flags/:id update → 200', async () => {
      flagsStore.push({
        id: 'flag-xyz', key: 'old_key', value: false, description: 'Old',
        enabled: true, createdBy: 'admin', createdAt: new Date(), updatedAt: new Date(),
      });

      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ key: 'new_key', value: true }));
      const handled = await handleFlagsRoutes('PUT', '/v1/flags/flag-xyz', req, res, 'admin-id', 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.flag.key).toBe('new_key');
      expect(body.flag.value).toBe(true);
      expect(auditStore.length).toBe(1);
      expect(auditStore[0].action).toBe('updated');
    });

    it('PUT /v1/flags/:id missing → 404', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ key: 'x' }));
      const handled = await handleFlagsRoutes('PUT', '/v1/flags/missing', req, res, 'admin-id', 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(404);
      expect(getJson(res).error).toContain('Flag not found');
    });

    it('PUT /v1/flags/:id non-admin → 403', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ key: 'x' }));
      const handled = await handleFlagsRoutes('PUT', '/v1/flags/some-id', req, res, 'user', 'viewer');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── DELETE /v1/flags/:id ──────────────────────────────────

  describe('DELETE /v1/flags/:id — delete flag', () => {
    it('DELETE /v1/flags/:id → { success: true }', async () => {
      flagsStore.push({
        id: 'flag-del', key: 'del_me', value: true, description: null,
        enabled: true, createdBy: 'admin', createdAt: new Date(), updatedAt: new Date(),
      });

      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('DELETE', '/v1/flags/flag-del', req, res, 'admin-id', 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe('flag-del');
      expect(auditStore.length).toBe(1);
      expect(auditStore[0].action).toBe('deleted');
      // The flag should be removed from store
      expect(flagsStore.find((f) => f.id === 'flag-del')).toBeUndefined();
    });

    it('DELETE /v1/flags/:id non-admin → 403', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('DELETE', '/v1/flags/some-id', req, res, 'user', 'viewer');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── GET /v1/flags/:id/audit — audit log ───────────────────

  describe('GET /v1/flags/:id/audit — audit log', () => {
    it('GET /v1/flags/:id/audit → audit entries', async () => {
      auditStore.push({
        id: 'a1', flagId: 'flag-audit', action: 'created', oldValue: null,
        newValue: '{}', userId: 'admin', timestamp: new Date(),
      });
      auditStore.push({
        id: 'a2', flagId: 'flag-audit', action: 'updated', oldValue: '{old}',
        newValue: '{new}', userId: 'admin', timestamp: new Date(),
      });

      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/flags/flag-audit/audit', req, res, 'api', null);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.logs.length).toBe(2);
    });

    it('Audit entry has correct fields (id, flagId, action, etc.)', async () => {
      auditStore.push({
        id: 'audit-fields', flagId: 'flag-fields', action: 'created',
        oldValue: null, newValue: '{"key":"test"}', userId: 'admin-user',
        timestamp: new Date('2026-05-18T00:00:00Z'),
      });

      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/flags/flag-fields/audit', req, res, 'api', null);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      const entry = body.logs[0];
      expect(entry.id).toBe('audit-fields');
      expect(entry.flagId).toBe('flag-fields');
      expect(entry.action).toBe('created');
      expect(entry.oldValue).toBeNull();
      expect(entry.newValue).toBe('{"key":"test"}');
      expect(entry.userId).toBe('admin-user');
      expect(entry.timestamp).toBeDefined();
    });

    it('GET /v1/flags/:id/audit returns empty logs for flag with no audit', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/flags/no-audit/audit', req, res, 'api', null);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.logs).toEqual([]);
    });
  });

  // ─── Non-matching routes ───────────────────────────────────

  describe('Non-matching routes', () => {
    it('returns false for non /v1/flags URLs', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/v1/other', req, res, 'api', null);
      expect(handled).toBe(false);
    });

    it('returns false for /api/health', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleFlagsRoutes('GET', '/api/health', req, res, 'api', null);
      expect(handled).toBe(false);
    });
  });
});
