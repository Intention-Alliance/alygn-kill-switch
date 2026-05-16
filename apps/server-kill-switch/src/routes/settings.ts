/**
 * Settings API — Key-Value Persistence
 *
 * Endpoints:
 *   GET  /v1/settings         — Get all settings
 *   POST /v1/settings         — Update multiple settings (batch upsert)
 *   GET  /v1/settings/:key    — Get single setting
 *   PUT  /v1/settings/:key    — Update single setting
 *
 * All values stored as text in SQLite. Type coercion handled by validators.
 * Admin role required for writes.
 *
 * ADR-133: Kill Switch dashboard rebuild — persistent settings.
 * Publishes to bcp:settings:updates on change.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { settings as settingsTable } from '../db/schema';

// ─── Known Setting Keys & Validators ────────────────────────────────

const KNOWN_SETTING_KEYS = [
  'auto_poll_interval',
  'enable_notifications',
  'audit_log_retention_days',
  'session_timeout_minutes',
  'ip_allowlist_enabled',
  'rate_limit_per_minute',
];

const SETTING_VALIDATORS: Record<string, (value: string) => string | null> = {
  auto_poll_interval: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1000 || n > 60000) return 'Must be integer 1000-60000';
    return null;
  },
  enable_notifications: (v) => {
    if (v !== 'true' && v !== 'false') return 'Must be "true" or "false"';
    return null;
  },
  audit_log_retention_days: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1 || n > 365) return 'Must be integer 1-365';
    return null;
  },
  session_timeout_minutes: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 5 || n > 480) return 'Must be integer 5-480';
    return null;
  },
  ip_allowlist_enabled: (v) => {
    if (v !== 'true' && v !== 'false') return 'Must be "true" or "false"';
    return null;
  },
  rate_limit_per_minute: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 10 || n > 1000) return 'Must be integer 10-1000';
    return null;
  },
};

function validateSettingValue(key: string, value: string): string | null {
  const validator = SETTING_VALIDATORS[key];
  if (!validator) return `Unknown setting: ${key}`;
  return validator(value);
}

// ─── Helpers ────────────────────────────────────────────────────────

function json(res: any, statusCode: number, body: Record<string, unknown>) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : null); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function getUserRole(req: any): string | null {
  try {
    // Try to extract from request context set by auth middleware
    if (req._user && req._user.role) return req._user.role;
    // Try user header set by auth proxy
    if (req.headers?.['x-user-role']) return req.headers['x-user-role'];
  } catch {
    // ignore
  }
  return null;
}

// ─── Route Handler ──────────────────────────────────────────────────

export async function handleSettingsRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  publishEvent?: (channel: string, message: string) => Promise<void>,
): Promise<boolean> {
  if (!url.startsWith('/v1/settings')) return false;

  try {
    // ─── GET /v1/settings — Get all settings ───────────────────────
    if (method === 'GET' && url === '/v1/settings') {
      const rows = await db.select().from(settingsTable).all();
      const settingsMap: Record<string, string> = {};
      let latestUpdate = 0;

      for (const row of rows) {
        settingsMap[row.key] = row.value;
        if (row.updatedAt && row.updatedAt.getTime() > latestUpdate) {
          latestUpdate = row.updatedAt.getTime();
        }
      }

      json(res, 200, {
        settings: settingsMap,
        updatedAt: latestUpdate > 0 ? new Date(latestUpdate).toISOString() : null,
      });
      return true;
    }

    // ─── POST /v1/settings — Batch update ──────────────────────────
    if (method === 'POST' && url === '/v1/settings') {
      // Admin role check
      const role = getUserRole(req);
      if (role !== 'admin') {
        json(res, 403, { error: 'Admin role required to modify settings' });
        return true;
      }

      const body = await parseJsonBody(req);

      if (!body?.settings || typeof body.settings !== 'object' || Object.keys(body.settings).length === 0) {
        json(res, 400, { error: 'settings object required with at least 1 key' });
        return true;
      }

      const updated: string[] = [];
      const now = new Date();
      const errors: string[] = [];

      for (const [key, value] of Object.entries(body.settings)) {
        // Validate key is known
        if (!KNOWN_SETTING_KEYS.includes(key)) {
          errors.push(`Unknown setting: ${key}`);
          continue;
        }

        // Validate value
        const valErr = validateSettingValue(key, String(value));
        if (valErr) {
          errors.push(`${key}: ${valErr}`);
          continue;
        }

        // Upsert
        await db.insert(settingsTable)
          .values({ key, value: String(value), updatedAt: now })
          .onConflictDoUpdate({
            target: settingsTable.key,
            set: { value: String(value), updatedAt: now },
          });

        updated.push(key);
      }

      if (errors.length > 0 && updated.length === 0) {
        json(res, 400, { error: 'Validation failed', details: errors });
        return true;
      }

      // Publish to Redis
      if (publishEvent && updated.length > 0) {
        await publishEvent('bcp:settings:updates', JSON.stringify({
          updated,
          timestamp: now.toISOString(),
        }));
      }

      json(res, 200, {
        updated,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: now.toISOString(),
      });
      return true;
    }

    // ─── GET /v1/settings/:key — Get single setting ────────────────
    const keyMatch = url.match(/^\/v1\/settings\/([^/]+)$/);
    if (method === 'GET' && keyMatch) {
      const key = keyMatch[1];

      const row = await db
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.key, key))
        .get();

      if (!row) {
        json(res, 404, { error: 'Setting not found', key });
        return true;
      }

      json(res, 200, {
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      });
      return true;
    }

    // ─── PUT /v1/settings/:key — Update single setting ──────────────
    if (method === 'PUT' && keyMatch) {
      // Admin role check
      const role = getUserRole(req);
      if (role !== 'admin') {
        json(res, 403, { error: 'Admin role required to modify settings' });
        return true;
      }

      const key = keyMatch[1];
      const body = await parseJsonBody(req);

      if (!body || body.value === undefined) {
        json(res, 400, { error: 'value field required' });
        return true;
      }

      const value = String(body.value);

      // Validate key is known
      if (!KNOWN_SETTING_KEYS.includes(key)) {
        json(res, 404, { error: 'Setting not found', key });
        return true;
      }

      // Validate value
      const valErr = validateSettingValue(key, value);
      if (valErr) {
        json(res, 400, { error: valErr });
        return true;
      }

      const now = new Date();

      // Upsert
      await db.insert(settingsTable)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value, updatedAt: now },
        });

      // Publish to Redis
      if (publishEvent) {
        await publishEvent('bcp:settings:updates', JSON.stringify({
          updated: [key],
          timestamp: now.toISOString(),
        }));
      }

      json(res, 200, {
        key,
        value,
        updatedAt: now.toISOString(),
      });
      return true;
    }

    return false;
  } catch (err: any) {
    console.error('[settings] Error:', err.message);
    json(res, 500, { error: 'Internal server error', detail: err.message });
    return true;
  }
}
