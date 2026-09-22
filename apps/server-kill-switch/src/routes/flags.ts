/**
 * Feature Flags API — Full CRUD with Audit Logging
 *
 * Endpoints:
 *   GET    /v1/flags                       — List all flags
 *   POST   /v1/flags                       — Create flag
 *   PUT    /v1/flags/:id                   — Update flag
 *   DELETE /v1/flags/:id                   — Delete flag (cascades machine_flag)
 *   GET    /v1/flags/:id/audit             — Audit log for a flag
 *
 *   GET    /v1/machines/:id/flags          — Merged global + per-machine view (admin)
 *   PUT    /v1/machines/:id/flags/:key     — Set/update per-machine override (admin)
 *   DELETE /v1/machines/:id/flags/:key     — Clear per-machine override (admin)
 *
 * ADR-131: SQLite-backed flags with audit trail.
 * ADR-133: per-machine flag overrides (resolution: machine > global > default).
 * v1.1 contract: docs/api-contracts/per-machine-flags-v1.md
 * Every mutation is recorded in flag_audit_log.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/index';
import { featureFlags, flagAuditLog, machineFlags, machines } from '../db/schema';
import { getAuthorizationMode, isKillAuthorizationFlag } from '../services/kill-authorization';
import { PREDEFINED_FLAG_DEFINITIONS, getFlagType } from '../db/flag-definitions';

// ─── Helpers ─────────────────────────────────────────────────────────────

function json(res: any, statusCode: number, body: Record<string, unknown>) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : null); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

async function logFlagAction(
  flagId: string,
  action: 'created' | 'updated' | 'deleted',
  userId: string,
  oldValue?: string,
  newValue?: string,
) {
  await db.insert(flagAuditLog).values({
    id: crypto.randomUUID(),
    flagId,
    action,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    userId,
    timestamp: new Date(),
  }).run();
}

// v1.1 (§ 8.2a) — audit helper for per-machine flag override mutations.
// Mirrors logFlagAction but populates machine_id. Used for action verbs
// 'override-set' | 'override-cleared' | 'override-rejected'.
async function logMachineFlagAction(
  flagId: string,
  machineId: string,
  action: 'override-set' | 'override-cleared' | 'override-rejected',
  userId: string,
  oldValue?: string | null,
  newValue?: string | null,
) {
  await db.insert(flagAuditLog).values({
    id: crypto.randomUUID(),
    flagId,
    action,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    userId,
    timestamp: new Date(),
    machineId,
  }).run();
}

// ─── Per-Machine Flag Helpers (v1.1 § 8.2a) ──────────────────────────────

// Declared types come from the single source of truth (db/flag-definitions.ts).
// Custom (non-predefined) flags infer their type from the stored value.

// Infer the JS type from a raw stored value string. Used when getFlagType
// returns null (i.e. the flag key is not predefined). Per contract § 3.2:
// the resolved effective value must always be coerced back to the right type.
function inferType(stored: string): 'boolean' | 'number' | 'string' {
  if (stored === 'true' || stored === 'false') return 'boolean';
  const n = Number(stored);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(stored)) return 'number';
  return 'string';
}

// Infer the declared type from an incoming (unserialized) value.
function inferIncomingType(raw: unknown): 'boolean' | 'number' | 'string' {
  if (typeof raw === 'boolean') return 'boolean';
  if (typeof raw === 'number') return 'number';
  return 'string';
}

// Coerce a raw value into the flag's declared JS type. Accepts both the
// TEXT storage form (strings) and native JS values (tests/mocks) so the
// helpers are robust either way. Per contract § 3.1 "Type coercion rule".
function coerceFlagValue(raw: string | null | undefined, type: 'boolean' | 'number' | 'string' | null): unknown {
  if (raw === null || raw === undefined) return null;
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    return raw === 'true' || raw === '1';
  }
  if (type === 'number') {
    if (typeof raw === 'number') return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}

function coerceIncomingValue(raw: unknown, type: 'boolean' | 'number' | 'string' | null): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined) return { ok: false, error: 'Missing required field: value' };
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: String(raw) };
    if (raw === 'true' || raw === '1' || raw === 1) return { ok: true, value: 'true' };
    if (raw === 'false' || raw === '0' || raw === 0) return { ok: true, value: 'false' };
    return { ok: false, error: `Invalid value for boolean flag` };
  }
  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: `Value must be a finite number` };
    return { ok: true, value: String(n) };
  }
  if (type === 'string') {
    if (typeof raw !== 'string') return { ok: false, error: `Value must be a string` };
    return { ok: true, value: raw };
  }
  // Unknown flag key — accept stringified value as-is, store as string.
  return { ok: true, value: String(raw) };
}

/**
 * ADR-136 §6 (amendment 2026-08-10): Quorum-gated policy changes.
 *
 * Changes to `kill.authorization.*` flags require the SAME threshold as
 * the operations they govern. When the current mode is `quorum`, a
 * single-signature request via the plain flag endpoint is REJECTED — the
 * caller must use POST /v1/kill-authorization/policy-change with a
 * WebAuthn assertion token instead.
 */
async function assertKillAuthorizationFlagChangeAllowed(flagKey: string): Promise<void> {
  if (!isKillAuthorizationFlag(flagKey)) return;
  const mode = await getAuthorizationMode();
  if (mode === 'quorum') {
    const err = new Error(
      `Changing ${flagKey} requires quorum authorization (current mode: quorum). ` +
      `Use POST /v1/kill-authorization/policy-change with a WebAuthn assertion token.`,
    );
    (err as any).statusCode = 403;
    (err as any).code = 'QUORUM_REQUIRED';
    throw err;
  }
}

export async function handleFlagsRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  userId: string = 'api',
  userRole: string | null = null,
  publishEvent?: (channel: string, data: string) => void | Promise<void>,
): Promise<boolean> {
  // Intercept /v1/flags and /v1/machines/:id/flags/...
  if (!url.startsWith('/v1/flags') && !url.match(/^\/v1\/machines\/[^/]+\/flags(\/|$)/)) {
    return false;
  }

  try {
    // ─── GET /v1/flags — List all flags ──────────────────────────
    if (method === 'GET' && url === '/v1/flags') {
      const flags = await db.select().from(featureFlags).all();
      json(res, 200, { flags });
      return true;
    }

    // ─── GET /v1/flags/:id/audit — Flag audit log ────────────────
    const auditMatch = url.match(/^\/v1\/flags\/([^/]+)\/audit$/);
    if (method === 'GET' && auditMatch) {
      const flagId = auditMatch[1];
      const logs = await db
        .select()
        .from(flagAuditLog)
        .where(eq(flagAuditLog.flagId, flagId))
        .all();
      json(res, 200, { logs });
      return true;
    }

    // ─── GET /v1/flags/:id — Get single flag ─────────────────────
    const idMatch = url.match(/^\/v1\/flags\/([^/]+)$/);
    if (method === 'GET' && idMatch) {
      const flagId = idMatch[1];
      const flag = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.id, flagId))
        .get();
      if (!flag) {
        json(res, 404, { error: `Flag not found: ${flagId}` });
        return true;
      }
      json(res, 200, { flag });
      return true;
    }

    // ─── POST /v1/flags — Create flag (admin only) ─────────────
    if (method === 'POST' && url === '/v1/flags') {
      if (userRole !== 'admin') {
        json(res, 403, { error: 'Admin role required' });
        return true;
      }
      const body = await parseJsonBody(req);
      if (!body?.key || body?.value === undefined) {
        json(res, 400, { error: 'Missing required fields: key, value' });
        return true;
      }

      // F4: store the value with its real type, not Boolean(value).
      // Predefined flags use their declared type; custom flags infer from
      // the incoming JSON type. Stored as TEXT (v1.2).
      const declaredType = getFlagType(body.key);
      const type = declaredType ?? inferIncomingType(body.value);
      const coerced = coerceIncomingValue(body.value, type);
      if (!coerced.ok) {
        json(res, 400, { error: coerced.error });
        return true;
      }

      const flag = {
        id: crypto.randomUUID(),
        key: body.key,
        value: coerced.value,
        description: body.description ?? null,
        enabled: body.enabled !== false,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(featureFlags).values(flag).run();
      await logFlagAction(flag.id, 'created', userId, undefined, JSON.stringify(flag));

      json(res, 201, { flag: { ...flag, value: coerceFlagValue(flag.value, type), enabled: !!flag.enabled } });
      if (publishEvent) {
        await publishEvent('bcp:flags:updates', JSON.stringify({ type: 'flag-update', action: 'created', flag }));
      }
      return true;
    }

    // ─── PUT /v1/flags/:id — Update flag (admin only) ──────────
    if (method === 'PUT' && idMatch) {
      if (userRole !== 'admin') {
        json(res, 403, { error: 'Admin role required' });
        return true;
      }
      const flagId = idMatch[1];
      const body = await parseJsonBody(req);
      if (!body || Object.keys(body).length === 0) {
        json(res, 400, { error: 'Request body required' });
        return true;
      }

      const existing = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.id, flagId))
        .get();

      if (!existing) {
        json(res, 404, { error: `Flag not found: ${flagId}` });
        return true;
      }

      // ADR-136 §6: quorum-gated policy changes — reject single-signature
      // changes to kill.authorization.* flags when mode is quorum.
      try {
        await assertKillAuthorizationFlagChangeAllowed(existing.key);
      } catch (gateErr: any) {
        json(res, gateErr.statusCode || 403, { error: gateErr.message, code: gateErr.code });
        return true;
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.key !== undefined) updates.key = body.key;
      if (body.value !== undefined) {
        // F4: coerce by declared type (or infer for custom flags) instead of
        // Boolean(value) — preserves number/string flag values.
        const type = getFlagType(existing.key) ?? inferIncomingType(body.value);
        const coerced = coerceIncomingValue(body.value, type);
        if (!coerced.ok) {
          json(res, 400, { error: coerced.error });
          return true;
        }
        updates.value = coerced.value;
      }
      if (body.description !== undefined) updates.description = body.description;
      if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);

      await db.update(featureFlags)
        .set(updates as any)
        .where(eq(featureFlags.id, flagId))
        .run();

      await logFlagAction(
        flagId, 'updated', userId,
        JSON.stringify(existing),
        JSON.stringify({ ...existing, ...updates }),
      );

      const updated = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.id, flagId))
        .get();

      json(res, 200, {
        flag: {
          ...updated,
          value: coerceFlagValue(updated!.value, getFlagType(updated!.key) ?? inferType(String(updated!.value))),
          enabled: !!updated!.enabled,
        },
      });
      if (publishEvent) {
        await publishEvent('bcp:flags:updates', JSON.stringify({ type: 'flag-update', action: 'updated', flag: updated }));
      }
      return true;
    }

    // ─── DELETE /v1/flags/:id — Delete flag (admin only) ─────
    if (method === 'DELETE' && idMatch) {
      if (userRole !== 'admin') {
        json(res, 403, { error: 'Admin role required' });
        return true;
      }
      const flagId = idMatch[1];

      const existing = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.id, flagId))
        .get();

      if (!existing) {
        json(res, 404, { error: `Flag not found: ${flagId}` });
        return true;
      }

      // ADR-136 §6: deleting a kill.authorization.* flag is a policy
      // change — quorum-gated when mode is quorum.
      try {
        await assertKillAuthorizationFlagChangeAllowed(existing.key);
      } catch (gateErr: any) {
        json(res, gateErr.statusCode || 403, { error: gateErr.message, code: gateErr.code });
        return true;
      }

      await logFlagAction(flagId, 'deleted', userId, JSON.stringify(existing));
      await db.delete(featureFlags).where(eq(featureFlags.id, flagId)).run();

      // v1.1 § 6.3 — cascade: clear any machine_flag rows referencing the deleted key.
      await db.delete(machineFlags).where(eq(machineFlags.flagKey, existing.key)).run();

      json(res, 200, { success: true, deleted: flagId });
      if (publishEvent) {
        await publishEvent('bcp:flags:updates', JSON.stringify({ type: 'flag-update', action: 'deleted', flagId }));
      }
      return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // v1.1 § 8.2a — Per-Machine Flag Override Endpoints (admin only)
    // ═══════════════════════════════════════════════════════════════════

    // GET /v1/machines/:id/flags — merged view (global + override)
    const machineFlagsListMatch = url.match(/^\/v1\/machines\/([^/]+)\/flags$/);
    if (method === 'GET' && machineFlagsListMatch) {
      if (userRole !== 'admin') {
        json(res, 403, { error: 'Admin role required' });
        return true;
      }
      const machineId = machineFlagsListMatch[1];

      const machine = await db
        .select()
        .from(machines)
        .where(eq(machines.id, machineId))
        .get();
      if (!machine) {
        json(res, 404, { error: `Machine not found: ${machineId}` });
        return true;
      }

      const globals = await db.select().from(featureFlags).all();
      const overrides = await db
        .select()
        .from(machineFlags)
        .where(eq(machineFlags.machineId, machineId))
        .all();
      const overrideMap = new Map<string, typeof overrides[number]>(
        overrides.map((o) => [o.flagKey, o]),
      );

      // F2/F3: dynamic merged view — iterate the predefined flags in
      // documented order, then append any additional global flags (custom or
      // legacy) that are not predefined. Overrides are matched by key, so
      // nothing is ever silently dropped.
      const flags: Array<{
        key: string;
        value: unknown;
        type: string;
        description: string;
        overridden: boolean;
      }> = [];
      const seenKeys = new Set<string>();

      const emitFlag = (key: string, global: typeof globals[number] | undefined, ov: typeof overrides[number] | undefined) => {
        // Resolve raw value: override takes precedence, else global stored value.
        let rawResolved: string | null;
        if (ov) {
          rawResolved = ov.value;
        } else if (global) {
          rawResolved = global.value === null || global.value === undefined ? null : String(global.value);
        } else {
          rawResolved = null;
        }

        if (rawResolved === null) {
          // Known flag with no value anywhere: emit with null (never drop).
          flags.push({
            key,
            value: null,
            type: getFlagType(key) ?? 'string',
            description: global?.description ?? '',
            overridden: !!ov,
          });
          seenKeys.add(key);
          return;
        }

        const type = getFlagType(key) ?? inferType(rawResolved);
        const coerced = coerceFlagValue(rawResolved, type);
        if (coerced === null) {
          // F3: value unparseable for the declared type (legacy garbage such as
          // a boolean stored for a number flag) — surface it raw instead of
          // silently dropping the flag from the view.
          console.warn(`[flags] Unparseable value for ${key}: ${rawResolved} — surfacing raw`);
          flags.push({
            key,
            value: rawResolved,
            type: inferType(rawResolved),
            description: global?.description ?? '',
            overridden: !!ov,
          });
        } else {
          flags.push({
            key,
            value: coerced,
            type,
            description: global?.description ?? '',
            overridden: !!ov,
          });
        }
        seenKeys.add(key);
      };

      // 1) Predefined flags in document order (ADR-133).
      for (const def of PREDEFINED_FLAG_DEFINITIONS) {
        const global = globals.find((g) => g.key === def.key);
        const ov = overrideMap.get(def.key);
        emitFlag(def.key, global, ov);
      }
      // 2) Any other global flags (custom / legacy) not covered above.
      for (const g of globals) {
        if (!seenKeys.has(g.key)) {
          emitFlag(g.key, g, overrideMap.get(g.key));
        }
      }
      // 3) Orphan overrides (flag row deleted but override remains): surface
      //    them so they are never invisible.
      for (const ov of overrides) {
        if (!seenKeys.has(ov.flagKey)) {
          emitFlag(ov.flagKey, undefined, ov);
        }
      }

      json(res, 200, {
        machineId,
        flags,
        overrides: overrides.map((o) => ({
          flagKey: o.flagKey,
          value: o.value,
          updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : new Date(o.updatedAt as any).toISOString(),
        })),
      });
      return true;
    }

    // PUT /v1/machines/:id/flags/:key — set/update per-machine override
    // DELETE /v1/machines/:id/flags/:key — clear per-machine override
    const machineFlagKeyMatch = url.match(/^\/v1\/machines\/([^/]+)\/flags\/([^/]+)$/);
    if ((method === 'PUT' || method === 'DELETE') && machineFlagKeyMatch) {
      if (userRole !== 'admin') {
        json(res, 403, { error: 'Admin role required' });
        return true;
      }
      const machineId = machineFlagKeyMatch[1];
      const flagKey = decodeURIComponent(machineFlagKeyMatch[2]);

      // Validate machine exists
      const machine = await db
        .select()
        .from(machines)
        .where(eq(machines.id, machineId))
        .get();
      if (!machine) {
        // Look up flag id for audit (best-effort); still log informational rejection.
        const flag = await db.select().from(featureFlags).where(eq(featureFlags.key, flagKey)).get();
        if (flag) {
          await logMachineFlagAction(flag.id, machineId, 'override-rejected', userId, null, null);
        }
        json(res, 404, { error: `Machine not found: ${machineId}` });
        return true;
      }

      // Validate flag key exists
      const flag = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, flagKey))
        .get();
      if (!flag) {
        json(res, 404, { error: `Flag not found: ${flagKey}` });
        return true;
      }

      if (method === 'PUT') {
        const body = await parseJsonBody(req);
        if (!body) {
          json(res, 400, { error: 'Request body required' });
          return true;
        }
        const type = getFlagType(flagKey);
        const coerced = coerceIncomingValue(body.value, type);
        if (!coerced.ok) {
          json(res, 400, { error: coerced.error });
          return true;
        }
        const stored = coerced.value;

        // Per-flag range/enum validation per contract § 3.2
        if (flagKey === 'auto_stop_threshold' || flagKey === 'request_sampling_rate') {
          const n = Number(stored);
          if (!Number.isFinite(n) || n < 0.0 || n > 1.0) {
            json(res, 400, { error: `${flagKey} must be in [0.0, 1.0]` });
            return true;
          }
        }
        if (flagKey === 'damage_logging_level') {
          const allowed = ['minimal', 'standard', 'verbose'];
          if (!allowed.includes(stored)) {
            json(res, 400, { error: 'Invalid value for damage_logging_level' });
            return true;
          }
        }

        // Upsert: read prior value for audit
        const prior = await db
          .select()
          .from(machineFlags)
          .where(and(eq(machineFlags.machineId, machineId), eq(machineFlags.flagKey, flagKey)))
          .get();

        const now = new Date();
        if (prior) {
          await db
            .update(machineFlags)
            .set({ value: stored, updatedAt: now })
            .where(and(eq(machineFlags.machineId, machineId), eq(machineFlags.flagKey, flagKey)))
            .run();
        } else {
          await db.insert(machineFlags).values({
            machineId,
            flagKey,
            value: stored,
            updatedAt: now,
          }).run();
        }

        await logMachineFlagAction(
          flag.id, machineId, 'override-set', userId,
          prior?.value ?? null,
          stored,
        );

        const resolvedType = type ?? inferType(stored);
        const resolved = coerceFlagValue(stored, resolvedType);
        json(res, 200, {
          flagKey,
          value: resolved,
          updatedAt: now.toISOString(),
          overridden: true,
        });

        if (publishEvent) {
          await publishEvent('bcp:flags:updates', JSON.stringify({
            type: 'flag-override-update',
            action: 'set',
            machineId,
            flagKey,
            value: stored,
            userId,
          }));
        }
        return true;
      }

      // DELETE branch — idempotent clear
      const prior = await db
        .select()
        .from(machineFlags)
        .where(and(eq(machineFlags.machineId, machineId), eq(machineFlags.flagKey, flagKey)))
        .get();

      if (prior) {
        await db
          .delete(machineFlags)
          .where(and(eq(machineFlags.machineId, machineId), eq(machineFlags.flagKey, flagKey)))
          .run();
      }

      // Per contract § 3.3: audit even on idempotent no-op; metadata = { wasPresent }
      // Stored in new_value as JSON for compactness since the column is plain text.
      await logMachineFlagAction(
        flag.id, machineId, 'override-cleared', userId,
        prior?.value ?? null,
        JSON.stringify({ wasPresent: !!prior }),
      );

      res.writeHead(204, { 'Content-Type': 'application/json' });
      res.end();

      if (publishEvent) {
        await publishEvent('bcp:flags:updates', JSON.stringify({
          type: 'flag-override-update',
          action: 'cleared',
          machineId,
          flagKey,
          value: null,
          userId,
        }));
      }
      return true;
    }

    return false;
  } catch (err: any) {
    console.error('[flags] Error:', err.message);
    json(res, 500, { error: 'Internal server error' });
    return true;
  }
}
