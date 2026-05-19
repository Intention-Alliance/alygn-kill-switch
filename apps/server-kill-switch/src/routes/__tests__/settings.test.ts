/**
 * Settings Routes — Unit Tests
 *
 * Mocks the Drizzle `db` module to test all settings CRUD endpoints
 * and validation logic in isolation.
 *
 * Covers 12 scenarios per docs/plans/REMAINING-P1-FIXES-PLAN.md §5.6
 */

import { describe, it, expect, mock, beforeEach, beforeAll } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Mock data store (in-memory) ──────────────────────────────

interface MockSetting {
  key: string;
  value: string;
  updatedAt: Date;
}

let settingsStore: MockSetting[] = [];

beforeEach(() => {
  settingsStore = [];
});

// ─── Mock drizzle-orm ──────────────────────────────────────────
mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right }),
}));

// ─── Mock db/index.ts — must match resolution from settings.ts ───────
// settings.ts imports '../db/index' which resolves to src/db/index.ts
// ─── Mock db/index.ts — use fully resolved absolute path ──
// Bun mock.module matches against the fully-resolved module file path.
mock.module(path.resolve(__dirname, '../../db/index.ts'), () => {
  let _lastEqValue: string | null = null;

  function makeSelect() {
    return {
      from(table: any) {
        const tableName = String(table?.name || table?.constructor?.name || table);
        return {
          all() {
            return [...settingsStore].map((s) => ({
              key: s.key,
              value: s.value,
              updatedAt: s.updatedAt,
            }));
          },
          where(condition: any) {
            _lastEqValue = condition?.__eq ?? null;
            const filtered = _lastEqValue !== null
              ? settingsStore.filter((s) => s.key === _lastEqValue)
              : [...settingsStore];
            _lastEqValue = null;
            return {
              all() {
                return filtered.map((s) => ({
                  key: s.key,
                  value: s.value,
                  updatedAt: s.updatedAt,
                }));
              },
              get() {
                if (filtered.length === 0) return null;
                const s = filtered[0];
                return {
                  key: s.key,
                  value: s.value,
                  updatedAt: s.updatedAt,
                };
              },
            };
          },
        };
      },
    };
  }

  function makeInsert(table: any) {
    return {
      values(data: { key: string; value: string; updatedAt?: Date }) {
        return {
          onConflictDoUpdate(opts: { target: any; set: any }) {
            // Upsert behavior: update existing or insert new
            const existing = settingsStore.find((s) => s.key === data.key);
            const now = data.updatedAt || new Date();
            if (existing) {
              existing.value = data.value;
              existing.updatedAt = now;
            } else {
              settingsStore.push({
                key: data.key,
                value: data.value,
                updatedAt: now,
              });
            }
          },
        };
      },
    };
  }

  return {
    db: {
      select: makeSelect,
      insert: makeInsert,
    },
  };
});

// ─── Helpers ───────────────────────────────────────────────────

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
let handleSettingsRoutes: any;

beforeAll(async () => {
  const mod = await import('../settings');
  handleSettingsRoutes = mod.handleSettingsRoutes;
});

// ─── Tests ─────────────────────────────────────────────────────

describe('handleSettingsRoutes', () => {

  // ─── GET /v1/settings — list all ──────────────────────────

  describe('GET /v1/settings — list all settings', () => {
    it('GET /v1/settings empty → { settings: {}, updatedAt: null }', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleSettingsRoutes('GET', '/v1/settings', req, res);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.settings).toEqual({});
      expect(body.updatedAt).toBeNull();
    });

    it('GET /v1/settings returns all keys/values when populated', async () => {
      settingsStore.push({
        key: 'auto_poll_interval', value: '5000', updatedAt: new Date('2026-05-01T00:00:00Z'),
      });
      settingsStore.push({
        key: 'enable_notifications', value: 'true', updatedAt: new Date('2026-05-02T00:00:00Z'),
      });

      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleSettingsRoutes('GET', '/v1/settings', req, res);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.settings.auto_poll_interval).toBe('5000');
      expect(body.settings.enable_notifications).toBe('true');
      expect(body.updatedAt).not.toBeNull();
    });
  });

  // ─── GET /v1/settings/:key — single setting ───────────────

  describe('GET /v1/settings/:key — single setting', () => {
    it('GET /v1/settings/:key existing → returns key/value', async () => {
      settingsStore.push({
        key: 'audit_log_retention_days', value: '90',
        updatedAt: new Date('2026-05-01T00:00:00Z'),
      });

      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleSettingsRoutes('GET', '/v1/settings/audit_log_retention_days', req, res);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.key).toBe('audit_log_retention_days');
      expect(body.value).toBe('90');
      expect(body.updatedAt).toBeDefined();
    });

    it('GET /v1/settings/:key missing → 404', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleSettingsRoutes('GET', '/v1/settings/nonexistent', req, res);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(404);
      const body = getJson(res);
      expect(body.error).toBe('Setting not found');
      expect(body.key).toBe('nonexistent');
    });
  });

  // ─── POST /v1/settings — batch update ─────────────────────

  describe('POST /v1/settings — batch update', () => {
    it('POST /v1/settings with admin → updates', async () => {
      // Pre-populate a setting to test upsert
      settingsStore.push({
        key: 'auto_poll_interval', value: '3000',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      const res = createMockRes();
      const req = createMockReq(JSON.stringify({
        settings: { auto_poll_interval: '5000' },
      }));
      const handled = await handleSettingsRoutes('POST', '/v1/settings', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.updated).toContain('auto_poll_interval');
      expect(body.timestamp).toBeDefined();
    });

    it('POST /v1/settings non-admin → 403', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({
        settings: { auto_poll_interval: '5000' },
      }));
      const handled = await handleSettingsRoutes('POST', '/v1/settings', req, res, 'viewer');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(403);
      expect(getJson(res).error).toContain('Admin role required');
    });

    it('POST /v1/settings with empty settings → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ settings: {} }));
      const handled = await handleSettingsRoutes('POST', '/v1/settings', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(getJson(res).error).toBe('settings object required with at least 1 key');
    });

    it('POST /v1/settings without settings field → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ other: true }));
      const handled = await handleSettingsRoutes('POST', '/v1/settings', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── PUT /v1/settings/:key — single update ────────────────

  describe('PUT /v1/settings/:key — update single setting', () => {
    it('PUT /v1/settings/:key admin → updates', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '5000' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/auto_poll_interval', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.key).toBe('auto_poll_interval');
      expect(body.value).toBe('5000');
      expect(body.updatedAt).toBeDefined();
    });

    it('PUT /v1/settings/:key non-admin → 403', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '5000' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/auto_poll_interval', req, res, 'viewer');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(403);
      expect(getJson(res).error).toContain('Admin role required');
    });

    it('PUT /v1/settings/:key missing value → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({}));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/auto_poll_interval', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(getJson(res).error).toBe('value field required');
    });
  });

  // ─── Validation ────────────────────────────────────────────

  describe('Validation', () => {
    // Scenario 8: auto_poll_interval too low
    it('auto_poll_interval=500 (too low) → 400 (POST)', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({
        settings: { auto_poll_interval: '500' },
      }));
      const handled = await handleSettingsRoutes('POST', '/v1/settings', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      const body = getJson(res);
      expect(body.error).toBeDefined();
      expect(body.details).toBeDefined();
      expect(body.details[0]).toContain('auto_poll_interval');
    });

    // Scenario 9: auto_poll_interval too high
    it('auto_poll_interval=70000 (too high) → 400 (PUT)', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '70000' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/auto_poll_interval', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(getJson(res).error).toContain('1000-60000');
    });

    // Scenario 10: auto_poll_interval=5000 (valid)
    it('auto_poll_interval=5000 (valid) → success', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '5000' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/auto_poll_interval', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      const body = getJson(res);
      expect(body.key).toBe('auto_poll_interval');
      expect(body.value).toBe('5000');
    });

    // Scenario 11: enable_notifications="maybe"
    it('enable_notifications="maybe" → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: 'maybe' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/enable_notifications', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(getJson(res).error).toContain('true');
      expect(getJson(res).error).toContain('false');
    });

    it('enable_notifications="true" is valid', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: 'true' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/enable_notifications', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(getJson(res).value).toBe('true');
    });

    it('enable_notifications="false" is valid', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: 'false' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/enable_notifications', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(getJson(res).value).toBe('false');
    });

    // Scenario 12: Unknown setting key
    it('Unknown setting key → 404', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '123' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/unknown_key', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(404);
      const body = getJson(res);
      expect(body.error).toContain('Setting not found');
      expect(body.key).toBe('unknown_key');
    });
  });

  // ─── Additional validation tests ───────────────────────────

  describe('Additional validations', () => {
    it('audit_log_retention_days=0 → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '0' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/audit_log_retention_days', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
    });

    it('audit_log_retention_days=90 is valid', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '90' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/audit_log_retention_days', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('session_timeout_minutes=3 (too low) → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '3' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/session_timeout_minutes', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
    });

    it('rate_limit_per_minute=5 (too low) → 400', async () => {
      const res = createMockRes();
      const req = createMockReq(JSON.stringify({ value: '5' }));
      const handled = await handleSettingsRoutes('PUT', '/v1/settings/rate_limit_per_minute', req, res, 'admin');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Non-matching routes ───────────────────────────────────

  describe('Non-matching routes', () => {
    it('returns false for non /v1/settings URLs', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleSettingsRoutes('GET', '/v1/other', req, res);
      expect(handled).toBe(false);
    });

    it('returns false for /api/health', async () => {
      const res = createMockRes();
      const req = createMockReq();
      const handled = await handleSettingsRoutes('GET', '/api/health', req, res);
      expect(handled).toBe(false);
    });
  });
});
