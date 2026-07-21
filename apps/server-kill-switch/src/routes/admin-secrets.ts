/**
 * Admin Secrets API Routes — /api/admin/secrets/*
 *
 * Auth: Bearer <ADMIN_UI_API_KEY> (env var, throw on missing)
 *
 * Endpoints:
 *  - GET  /api/admin/secrets          — list all *_TAILSCALE_* keys (masked)
 *  - POST /api/admin/secrets/:name/rotate — server-generated rotation
 *  - GET  /api/admin/secrets/:name/lockout — lockout state for a key
 *  - GET  /api/admin/secrets/audit    — queryable audit log
 *
 * Never returns the full secret value in body or logs.
 *
 * @author Keridz ⚙️
 */

import type { SecretsLoader } from '../lib/secrets-loader';
import { maskSecret } from '../lib/secrets-loader';
import type { LockoutStateMachine } from '../lib/lockout-state';
import { getConsumers, getConsumerNames, writeToAllConsumers } from '../lib/secrets-consumers';
import { secureCompare } from '../utils/secure-compare';
import { db } from '../db';
import { secretsAuditLog } from '../db/schema';
import { desc, eq, and, gte, lte, sql } from 'drizzle-orm';

// ─── Audit Log (in-memory hot cache + DB persistence) ───────────────────

export interface SecretsAuditEntry {
  id: string;
  ts: string;
  action: 'rotate' | 'view' | '401' | '401-block' | 'sighup' | 'poll' | 'lock' | 'unlock' | 'rotate-consumer';
  keyName: string;
  sourceIp: string;
  actor: string;
  result: string;
  meta?: Record<string, any>;
}

/** Hot cache size for SSE clients (last N events). */
const HOT_CACHE_SIZE = 100;

/** Number of events to load from DB on startup. */
const STARTUP_LOAD_COUNT = 1000;

const auditLog: SecretsAuditEntry[] = [];
let dbInitialized = false;

/**
 * Reset the DB initialization flag (for tests only).
 */
export function _resetAuditLogInitFlag(): void {
  dbInitialized = false;
}

/**
 * Clear only the in-memory hot cache without touching the DB (for tests only).
 * Simulates a process restart where the in-memory buffer is empty but DB has history.
 */
export function _clearInMemoryAuditLog(): void {
  auditLog.length = 0;
}

/**
 * Load recent audit entries from DB into the in-memory hot cache.
 * Called once on startup to recover history after process restart.
 */
export async function initAuditLogFromDb(): Promise<void> {
  if (dbInitialized) return;
  dbInitialized = true;

  try {
    const rows = await db.select()
      .from(secretsAuditLog)
      .orderBy(desc(secretsAuditLog.ts))
      .limit(STARTUP_LOAD_COUNT);

    // Reverse to chronological order (oldest first)
    for (const row of rows.reverse()) {
      auditLog.push({
        id: row.id,
        ts: new Date(row.ts).toISOString(),
        action: row.action as SecretsAuditEntry['action'],
        keyName: row.keyName,
        sourceIp: row.sourceIp || 'unknown',
        actor: row.actor || 'unknown',
        result: row.result,
        meta: row.meta ? JSON.parse(row.meta) : undefined,
      });
    }

    // Trim to hot cache size — keep the most recent
    if (auditLog.length > HOT_CACHE_SIZE) {
      auditLog.splice(0, auditLog.length - HOT_CACHE_SIZE);
    }

    console.log(`[admin-secrets] Loaded ${auditLog.length} audit entries from DB`);
  } catch (err) {
    console.error('[admin-secrets] Failed to load audit log from DB:', err);
  }
}

export async function appendAuditEntry(entry: Omit<SecretsAuditEntry, 'id'>): Promise<SecretsAuditEntry> {
  const full: SecretsAuditEntry = {
    id: crypto.randomUUID(),
    ...entry,
  };

  // Push to in-memory hot cache
  auditLog.push(full);
  if (auditLog.length > HOT_CACHE_SIZE) {
    auditLog.splice(0, auditLog.length - HOT_CACHE_SIZE);
  }

  // Persist to DB (fire-and-forget — DB write should not block the request)
  try {
    await db.insert(secretsAuditLog).values({
      id: full.id,
      ts: new Date(full.ts),
      keyName: full.keyName,
      action: full.action,
      sourceIp: full.sourceIp,
      result: full.result,
      actor: full.actor,
      meta: full.meta ? JSON.stringify(full.meta) : null,
    });
  } catch (err) {
    console.error('[admin-secrets] Failed to persist audit entry to DB:', err);
  }

  return full;
}

export function getAuditEntries(opts: {
  keyName?: string;
  action?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}): { entries: SecretsAuditEntry[]; total: number } {
  let filtered = auditLog;

  if (opts.keyName) {
    filtered = filtered.filter((e) => e.keyName === opts.keyName);
  }
  if (opts.action) {
    filtered = filtered.filter((e) => e.action === opts.action);
  }
  if (opts.from) {
    filtered = filtered.filter((e) => new Date(e.ts).getTime() >= opts.from!);
  }
  if (opts.to) {
    filtered = filtered.filter((e) => new Date(e.ts).getTime() <= opts.to!);
  }

  const total = filtered.length;
  const offset = opts.offset || 0;
  const limit = opts.limit || 50;

  return {
    entries: filtered.slice(offset, offset + limit),
    total,
  };
}

/**
 * Clear the audit log (for tests only).
 * Clears both the in-memory hot cache and the DB table.
 */
export async function clearAuditLog(): Promise<void> {
  auditLog.length = 0;
  try {
    await db.delete(secretsAuditLog);
  } catch (err) {
    console.error('[admin-secrets] Failed to clear DB audit log:', err);
  }
}

// ─── Auth Helper ────────────────────────────────────────────────────────

function getAdminApiKey(): string {
  const key = process.env.ADMIN_UI_API_KEY;
  if (!key) {
    throw new Error('[admin-secrets] FATAL: ADMIN_UI_API_KEY env var not set.');
  }
  return key;
}

function checkAdminAuth(req: any): boolean {
  const authHeader = req.headers?.['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const expected = getAdminApiKey();
  return secureCompare(token, expected);
}

// ─── Route Handler ─────────────────────────────────────────────────────

export async function handleAdminSecretsRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  secretsLoader: SecretsLoader,
  lockoutState: LockoutStateMachine,
): Promise<boolean> {
  const ip = req.ip || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';

  // ── Auth gate ──
  function rejectAuth(): boolean {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized — valid Bearer token required' }));
    return true;
  }

  // All routes under /api/admin/secrets require admin auth
  if (!url.startsWith('/api/admin/secrets')) return false;

  if (!checkAdminAuth(req)) {
    // Record the 401 in the lockout state machine
    await lockoutState.record401(ip);
    await appendAuditEntry({
      ts: new Date().toISOString(),
      action: '401',
      keyName: 'admin-secrets-api',
      sourceIp: ip,
      actor: ip,
      result: 'unauthorized',
    });
    return rejectAuth();
  }

  // ── GET /api/admin/secrets — list all *_TAILSCALE_* keys ──
  if (method === 'GET' && url === '/api/admin/secrets') {
    const loadedKeys = secretsLoader.getLoadedKeys();
    const consumerNames = getConsumerNames();
    const consumerPaths = getConsumers().map((c) => ({ name: c.name, type: 'service' as const, path: c.path }));

    const keys = loadedKeys.map((name) => {
      const value = process.env[name] || '';
      const lockoutLabel = lockoutState.getLockoutLabel();
      return {
        name,
        maskedValue: maskSecret(value),
        lastRotatedAt: null, // TODO: track rotation timestamps per key
        lockoutState: lockoutLabel,
        dependentConfigs: consumerNames,
      };
    });

    await appendAuditEntry({
      ts: new Date().toISOString(),
      action: 'view',
      keyName: '*',
      sourceIp: ip,
      actor: 'admin',
      result: 'ok',
    });

    // Record successful auth
    await lockoutState.record200();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys }));
    return true;
  }

  // ── POST /api/admin/secrets/:name/rotate ──
  const rotateMatch = url.match(/^\/api\/admin\/secrets\/([^/]+)\/rotate$/);
  if (method === 'POST' && rotateMatch) {
    const keyName = decodeURIComponent(rotateMatch[1]);

    // Validate key name pattern (only *_TAILSCALE_* keys)
    if (!keyName.includes('_TAILSCALE_')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Key '${keyName}' is not a *_TAILSCALE_* key` }));
      return true;
    }

    // Check lockout
    const lockoutCheck = lockoutState.getCheckResult();
    if (lockoutCheck.locked) {
      await appendAuditEntry({
        ts: new Date().toISOString(),
        action: 'rotate',
        keyName,
        sourceIp: ip,
        actor: 'admin',
        result: 'locked',
      });

      res.writeHead(423, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Key is locked',
        lockoutState: lockoutState.getLockoutLabel(),
        autoUnlockAt: lockoutCheck.autoUnlockAt,
      }));
      return true;
    }

    try {
      // Rotate the key (server-generated, never returned)
      const { maskedValue, rotatedAt } = await secretsLoader.rotateKey(keyName);
      const newValue = process.env[keyName]!;

      // Write to all consumer config files
      const writeResults = await writeToAllConsumers(keyName, newValue);

      // Audit: rotation event
      await appendAuditEntry({
        ts: rotatedAt,
        action: 'rotate',
        keyName,
        sourceIp: ip,
        actor: 'admin',
        result: 'ok',
        meta: { consumersWritten: writeResults.filter((r) => r.result === 'ok').length },
      });

      // Audit: per-consumer write events
      for (const wr of writeResults) {
        await appendAuditEntry({
          ts: rotatedAt,
          action: 'rotate-consumer',
          keyName,
          sourceIp: ip,
          actor: 'admin',
          result: wr.result,
          meta: { consumer: wr.consumer, reloaded: wr.reloaded, error: wr.error || wr.reloadError },
        });
      }

      // Record successful auth
      await lockoutState.record200();

      // Build response — NEVER includes the full value
      const consumers = getConsumers();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: keyName,
        rotatedAt,
        maskedValue,
        dependentConfigs: consumers.map((c) => ({
          name: c.name,
          type: 'service',
          path: c.path,
        })),
        reloadTargets: writeResults
          .filter((r) => r.reloaded)
          .map((r) => ({
            name: r.consumer,
            method: r.reloadError ? 'none' : 'sighup',
          })),
        writtenToConfigs: writeResults
          .filter((r) => r.result === 'ok')
          .map((r) => r.path),
        consumerResults: writeResults,
      }));
      return true;
    } catch (err) {
      await appendAuditEntry({
        ts: new Date().toISOString(),
        action: 'rotate',
        keyName,
        sourceIp: ip,
        actor: 'admin',
        result: 'error',
        meta: { error: (err as Error).message },
      });

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rotation failed', detail: (err as Error).message }));
      return true;
    }
  }

  // ── GET /api/admin/secrets/:name/lockout ──
  const lockoutMatch = url.match(/^\/api\/admin\/secrets\/([^/]+)\/lockout$/);
  if (method === 'GET' && lockoutMatch) {
    const keyName = decodeURIComponent(lockoutMatch[1]);
    const check = lockoutState.getCheckResult();

    await lockoutState.record200();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: keyName,
      state: check.state,
      lastEventAt: check.lastEventAt ? new Date(check.lastEventAt).toISOString() : null,
      autoUnlockAt: check.autoUnlockAt ? new Date(check.autoUnlockAt).toISOString() : null,
      recent401s: check.recent401s,
      consecutive401s: check.consecutive401s,
      autoUnlockRemainingMs: check.autoUnlockRemainingMs,
    }));
    return true;
  }

  // ── GET /api/admin/secrets/audit — queryable audit log ──
  if (method === 'GET' && url.startsWith('/api/admin/secrets/audit')) {
    const parsedUrl = new URL(url, 'http://localhost');
    const keyName = parsedUrl.searchParams.get('keyName') || undefined;
    const action = parsedUrl.searchParams.get('action') || undefined;
    const fromStr = parsedUrl.searchParams.get('from');
    const toStr = parsedUrl.searchParams.get('to');
    const limitStr = parsedUrl.searchParams.get('limit');
    const offsetStr = parsedUrl.searchParams.get('offset');

    const from = fromStr ? parseInt(fromStr, 10) : undefined;
    const to = toStr ? parseInt(toStr, 10) : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const result = getAuditEntries({ keyName, action, from, to, limit, offset });

    await lockoutState.record200();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      entries: result.entries,
      total: result.total,
      limit,
      offset,
    }));
    return true;
  }

  return false;
}