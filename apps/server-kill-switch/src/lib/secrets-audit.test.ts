/**
 * Tests for Secrets Audit Log DB Persistence (S-A1)
 *
 * Covers:
 *  - rotate writes to DB
 *  - 401 writes to DB
 *  - lockout writes to DB
 *  - FIFO eviction still works (hot cache size = 100)
 *  - Process restart recovers history (load from DB)
 *
 * @author Keridz ⚙️
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { handleAdminSecretsRoutes, appendAuditEntry, getAuditEntries, clearAuditLog, initAuditLogFromDb, _resetAuditLogInitFlag, _clearInMemoryAuditLog } from '../routes/admin-secrets';
import { SecretsLoader } from './secrets-loader';
import { LockoutStateMachine } from './lockout-state';
import { db } from '../db';
import { secretsAuditLog } from '../db/schema';
import { writeFile, unlink, mkdir, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { desc } from 'drizzle-orm';

const TEST_DIR = resolve(tmpdir(), `secrets-audit-test-${process.pid}-${Date.now()}`);
const TEST_SECRETS_PATH = join(TEST_DIR, 'secrets.json');
const TEST_LOCKOUT_PATH = join(TEST_DIR, 'secrets.lockout.json');

const TEST_API_KEY = 'test-admin-ui-api-key-audit-test-12345';

async function setupTestEnv() {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(TEST_SECRETS_PATH, JSON.stringify({
    OLLAMA_TAILSCALE_AUTH_TOKEN: 'tsauth_test_value_for_audit_testing',
  }, null, 2), { mode: 0o600 });
  await chmod(TEST_SECRETS_PATH, 0o600);
  process.env.ADMIN_UI_API_KEY = TEST_API_KEY;
}

async function cleanupTestEnv() {
  try {
    await unlink(TEST_SECRETS_PATH).catch(() => {});
    await unlink(TEST_LOCKOUT_PATH).catch(() => {});
  } catch {}
  delete process.env.ADMIN_UI_API_KEY;
  delete process.env.OLLAMA_TAILSCALE_AUTH_TOKEN;
  await clearAuditLog();
}

function makeReq(method: string, url: string, body?: string, authKey?: string) {
  const headers: Record<string, string> = {};
  if (authKey) headers['authorization'] = `Bearer ${authKey}`;
  const nodeReq: any = {
    method,
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
    body: body || '',
    on(ev: string, cb: Function) {
      if (ev === 'data' && body) cb(Buffer.from(body));
      if (ev === 'end') cb();
    },
  };
  return nodeReq;
}

function makeRes() {
  const res: any = {
    _h: {} as Record<string, string>,
    _s: 200,
    _b: '',
    setHeader(n: string, v: string) { this._h[n.toLowerCase()] = String(v); },
    writeHead(s: number, h?: Record<string, string>) {
      this._s = s;
      if (h) Object.entries(h).forEach(([k, v]) => { this._h[k.toLowerCase()] = String(v); });
    },
    end(d?: string) { this._b = d || ''; },
    get status() { return this._s; },
    get body() { return this._b; },
    get json() {
      try { return JSON.parse(this._b); } catch { return null; }
    },
  };
  return res;
}

async function countDbEntries(): Promise<number> {
  const rows = await db.select().from(secretsAuditLog);
  return rows.length;
}

async function countDbEntriesByAction(action: string): Promise<number> {
  const rows = await db.select().from(secretsAuditLog).where(
    require('drizzle-orm').eq(secretsAuditLog.action, action)
  );
  return rows.length;
}

describe('Secrets Audit Log — DB Persistence (S-A1)', () => {
  let loader: SecretsLoader;
  let lockout: LockoutStateMachine;

  beforeEach(async () => {
    await setupTestEnv();
    loader = new SecretsLoader({
      secretsPath: TEST_SECRETS_PATH,
      enableFsWatch: false,
      enableSighup: false,
    });
    await loader.load();
    lockout = new LockoutStateMachine({ lockoutPath: TEST_LOCKOUT_PATH });
    await lockout.load();
    lockout.reset();
    await clearAuditLog();
  });

  afterEach(async () => {
    loader.stopWatchers();
    lockout.stopWatchers();
    await cleanupTestEnv();
  });

  it('rotate event writes to DB', async () => {
    const req = makeReq('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', '', TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', req, res, loader, lockout);

    expect(res.status).toBe(200);

    // Check DB has the rotate entry
    const { eq } = await import('drizzle-orm');
    const rotateRows = await db.select().from(secretsAuditLog).where(eq(secretsAuditLog.action, 'rotate'));
    expect(rotateRows.length).toBeGreaterThanOrEqual(1);
    expect(rotateRows[0].keyName).toBe('OLLAMA_TAILSCALE_AUTH_TOKEN');
    expect(rotateRows[0].result).toBe('ok');
  });

  it('401 event writes to DB', async () => {
    const req = makeReq('GET', '/api/admin/secrets', undefined, 'wrong-key');
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    expect(res.status).toBe(401);

    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(secretsAuditLog).where(eq(secretsAuditLog.action, '401'));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].result).toBe('unauthorized');
  });

  it('lockout event writes to DB (rotate blocked by lockout)', async () => {
    // Trip the lockout
    for (let i = 0; i < 50; i++) {
      await lockout.record401('127.0.0.1');
    }

    const req = makeReq('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', '', TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', req, res, loader, lockout);

    expect(res.status).toBe(423);

    const { eq } = await import('drizzle-orm');
    const rotateRows = await db.select().from(secretsAuditLog).where(eq(secretsAuditLog.action, 'rotate'));
    // The rotate entry should have result='locked'
    const lockedEntry = rotateRows.find((r) => r.result === 'locked');
    expect(lockedEntry).toBeDefined();
    expect(lockedEntry!.keyName).toBe('OLLAMA_TAILSCALE_AUTH_TOKEN');
  });

  it('FIFO eviction still works on hot cache (100 entries)', async () => {
    // Insert 120 entries directly
    for (let i = 0; i < 120; i++) {
      await appendAuditEntry({
        ts: new Date().toISOString(),
        action: 'view',
        keyName: `KEY_${i}`,
        sourceIp: '127.0.0.1',
        actor: 'admin',
        result: 'ok',
      });
    }

    // Hot cache should be capped at 100
    const { entries } = getAuditEntries({ limit: 200 });
    expect(entries.length).toBe(100);

    // The first 20 should be evicted, KEY_20 should be the oldest
    expect(entries[0].keyName).toBe('KEY_20');

    // But DB should have all 120
    const dbCount = await countDbEntries();
    expect(dbCount).toBe(120);
  });

  it('process restart recovers history from DB', async () => {
    // Write 5 entries to both in-memory cache and DB
    for (let i = 0; i < 5; i++) {
      await appendAuditEntry({
        ts: new Date().toISOString(),
        action: 'rotate',
        keyName: `KEY_${i}`,
        sourceIp: '127.0.0.1',
        actor: 'admin',
        result: 'ok',
      });
    }

    // Verify entries are in the in-memory cache
    expect(getAuditEntries({ limit: 100 }).entries.length).toBe(5);

    // Simulate process restart: clear in-memory cache only (DB still has entries)
    _clearInMemoryAuditLog();
    _resetAuditLogInitFlag();
    expect(getAuditEntries({ limit: 100 }).entries.length).toBe(0);

    // Reload from DB (simulates startup)
    await initAuditLogFromDb();

    const { entries } = getAuditEntries({ limit: 100 });
    expect(entries.length).toBe(5);
    // All entries should have keyName matching KEY_*
    for (const e of entries) {
      expect(e.keyName).toMatch(/^KEY_\d$/);
    }
    // Verify all 5 keys are present
    const keyNames = entries.map((e) => e.keyName).sort();
    expect(keyNames).toEqual(['KEY_0', 'KEY_1', 'KEY_2', 'KEY_3', 'KEY_4']);
  });
});