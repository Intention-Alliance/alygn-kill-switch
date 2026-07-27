/**
 * Tests for /api/admin/secrets endpoints
 *
 * Covers:
 *  - Auth (401 without key, 200 with key)
 *  - Masking never leaks full value
 *  - Audit log entries
 *  - Rotate endpoint (server-generated, consumer writes)
 *  - Lockout endpoint
 *  - Audit query endpoint
 *
 * @author Keridz ⚙️
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { handleAdminSecretsRoutes, appendAuditEntry, getAuditEntries, clearAuditLog } from '../routes/admin-secrets';
import { SecretsLoader } from './secrets-loader';
import { LockoutStateMachine } from './lockout-state';
import { writeFile, unlink, mkdir, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = resolve(tmpdir(), `api-secrets-test-${process.pid}-${Date.now()}`);
const TEST_SECRETS_PATH = join(TEST_DIR, 'secrets.json');
const TEST_LOCKOUT_PATH = join(TEST_DIR, 'secrets.lockout.json');

const TEST_API_KEY = 'test-admin-ui-api-key-12345';
const TEST_SECRET_VALUE = 'tsauth_test_value_for_401_testing';

async function setupTestEnv() {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(TEST_SECRETS_PATH, JSON.stringify({
    OLLAMA_TAILSCALE_AUTH_TOKEN: TEST_SECRET_VALUE,
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

describe('/api/admin/secrets endpoints', () => {
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

  // ── Auth ──

  it('returns 401 without Bearer token', async () => {
    const req = makeReq('GET', '/api/admin/secrets');
    const res = makeRes();

    const handled = await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    expect(handled).toBe(true);
    expect(res.status).toBe(401);
    expect(res.json?.error).toContain('Unauthorized');
  });

  it('returns 401 with wrong Bearer token', async () => {
    const req = makeReq('GET', '/api/admin/secrets', undefined, 'wrong-key');
    const res = makeRes();

    const handled = await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    expect(handled).toBe(true);
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct Bearer token', async () => {
    const req = makeReq('GET', '/api/admin/secrets', undefined, TEST_API_KEY);
    const res = makeRes();

    const handled = await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    expect(handled).toBe(true);
    expect(res.status).toBe(200);
  });

  // ── GET /api/admin/secrets — list ──

  it('lists all *_TAILSCALE_* keys with masked values', async () => {
    const req = makeReq('GET', '/api/admin/secrets', undefined, TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    expect(res.status).toBe(200);
    const data = res.json;
    expect(data.secrets).toBeInstanceOf(Array);
    expect(data.secrets.length).toBe(1);
    expect(data.secrets[0].name).toBe('OLLAMA_TAILSCALE_AUTH_TOKEN');
    expect(data.secrets[0].maskedValue).toContain('••••');
    expect(data.secrets[0].previewSuffix).toBeDefined();
    expect(data.secrets[0].previewSuffix.length).toBe(4);
    expect(data.secrets[0].dependentConfigs).toBeInstanceOf(Array);
    expect(data.secrets[0].reloadTargets).toBeInstanceOf(Array);
    expect(data.secrets[0].state).toMatch(/^(armed|locked)$/);
  });

  it('GET /api/admin/secrets returns "secrets" key (not "keys")', async () => {
    const req = makeReq('GET', '/api/admin/secrets', undefined, TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    expect(res.status).toBe(200);
    const data = res.json;
    expect(data.secrets).toBeDefined();
    expect(data.keys).toBeUndefined();
  });

  it('never returns full secret value in response body', async () => {
    const req = makeReq('GET', '/api/admin/secrets', undefined, TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    const bodyStr = res.body;
    expect(bodyStr).not.toContain(TEST_SECRET_VALUE);
  });

  // ── POST /api/admin/secrets/:name/rotate ──

  it('rotates a key and returns masked value', async () => {
    const req = makeReq('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', '', TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', req, res, loader, lockout);

    expect(res.status).toBe(200);
    const data = res.json;
    expect(data.name).toBe('OLLAMA_TAILSCALE_AUTH_TOKEN');
    expect(data.rotatedAt).toBeTruthy();
    expect(data.maskedValue).toContain('••••');
    expect(data.maskedValue.startsWith('tsau')).toBe(true);
    expect(data.writtenToConfigs).toBeInstanceOf(Array);
    expect(data.dependentConfigs).toBeInstanceOf(Array);
    expect(data.reloadTargets).toBeInstanceOf(Array);
  });

  it('POST /rotate returns filesWritten and appsReloaded', async () => {
    const req = makeReq('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', '', TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', req, res, loader, lockout);

    expect(res.status).toBe(200);
    const data = res.json;
    expect(typeof data.filesWritten).toBe('number');
    expect(typeof data.appsReloaded).toBe('number');
    expect(data.filesWritten).toBe(data.dependentConfigs.length);
    expect(data.appsReloaded).toBe(data.reloadTargets.length);
  });

  it('never returns the rotated value in response body', async () => {
    const req = makeReq('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', '', TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', req, res, loader, lockout);

    const bodyStr = res.body;
    // The new value should not appear anywhere in the response
    const newValue = process.env.OLLAMA_TAILSCALE_AUTH_TOKEN!;
    expect(bodyStr).not.toContain(newValue);
  });

  it('rejects rotation of non-_TAILSCALE_ keys', async () => {
    const req = makeReq('POST', '/api/admin/secrets/SOME_OTHER_KEY/rotate', '', TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('POST', '/api/admin/secrets/SOME_OTHER_KEY/rotate', req, res, loader, lockout);

    expect(res.status).toBe(400);
    expect(res.json?.error).toContain('not a *_TAILSCALE_* key');
  });

  it('returns 423 when key is locked', async () => {
    // Trip the lockout
    for (let i = 0; i < 50; i++) {
      await lockout.record401('127.0.0.1');
    }

    const req = makeReq('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', '', TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('POST', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/rotate', req, res, loader, lockout);

    expect(res.status).toBe(423);
    expect(res.json?.error).toContain('locked');
  });

  // ── GET /api/admin/secrets/:name/lockout ──

  it('returns lockout state for a key', async () => {
    const req = makeReq('GET', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/lockout', undefined, TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets/OLLAMA_TAILSCALE_AUTH_TOKEN/lockout', req, res, loader, lockout);

    expect(res.status).toBe(200);
    const data = res.json;
    expect(data.state).toBe('ok');
    expect(data.recent401s).toBe(0);
    expect(data.consecutive401s).toBe(0);
  });

  // ── GET /api/admin/secrets/audit ──

  it('returns audit log entries', async () => {
    // Add some audit entries
    await appendAuditEntry({
      at: new Date().toISOString(),
      event: 'rotate',
      name: 'OLLAMA_TAILSCALE_AUTH_TOKEN',
      sourceIp: '127.0.0.1',
      actor: 'admin',
      result: 'ok',
    });

    const req = makeReq('GET', '/api/admin/secrets/audit', undefined, TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets/audit', req, res, loader, lockout);

    expect(res.status).toBe(200);
    const data = res.json;
    expect(data.entries).toBeInstanceOf(Array);
    expect(data.total).toBeGreaterThan(0);
    expect(data.entries[0].event).toBe('rotate');
    expect(data.entries[0].at).toBeDefined();
    expect(data.entries[0].name).toBeDefined();
  });

  it('supports filtering audit log by keyName', async () => {
    await appendAuditEntry({
      at: new Date().toISOString(),
      event: 'rotate',
      name: 'KEY_A',
      sourceIp: '127.0.0.1',
      actor: 'admin',
      result: 'ok',
    });
    await appendAuditEntry({
      at: new Date().toISOString(),
      event: 'rotate',
      name: 'KEY_B',
      sourceIp: '127.0.0.1',
      actor: 'admin',
      result: 'ok',
    });

    const req = makeReq('GET', '/api/admin/secrets/audit?name=KEY_A', undefined, TEST_API_KEY);
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets/audit?name=KEY_A', req, res, loader, lockout);

    expect(res.status).toBe(200);
    const data = res.json;
    expect(data.total).toBe(1);
    expect(data.entries[0].name).toBe('KEY_A');
  });

  // ── Audit entries from auth failures ──

  it('records 401 audit entry on auth failure', async () => {
    const req = makeReq('GET', '/api/admin/secrets', undefined, 'wrong-key');
    const res = makeRes();

    await handleAdminSecretsRoutes('GET', '/api/admin/secrets', req, res, loader, lockout);

    expect(res.status).toBe(401);
    // The 401 should be in the audit log
    const { entries } = getAuditEntries({ event: '401' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[entries.length - 1].event).toBe('401');
  });

  // ── Audit log entry shape (v1 contract) ──

  it('audit log entries have at/event/name fields', async () => {
    await appendAuditEntry({
      at: new Date().toISOString(),
      event: 'rotate',
      name: 'TEST_KEY',
      sourceIp: '127.0.0.1',
      actor: 'admin',
      result: 'ok',
    });

    const { entries } = getAuditEntries({ limit: 10 });
    const entry = entries[entries.length - 1];
    expect(entry.at).toBeDefined();
    expect(entry.event).toBe('rotate');
    expect(entry.name).toBe('TEST_KEY');
    expect(entry.ts).toBeUndefined();
    expect(entry.action).toBeUndefined();
    expect(entry.keyName).toBeUndefined();
  });

  // ── Unmatched routes ──

  it('returns false for unmatched routes', async () => {
    const req = makeReq('GET', '/api/admin/other', undefined, TEST_API_KEY);
    const res = makeRes();

    const handled = await handleAdminSecretsRoutes('GET', '/api/admin/other', req, res, loader, lockout);

    expect(handled).toBe(false);
  });
});