/**
 * Feature Flags API — Full CRUD with Audit Logging
 *
 * Endpoints:
 *   GET    /v1/flags              — List all flags
 *   POST   /v1/flags              — Create flag
 *   PUT    /v1/flags/:id          — Update flag
 *   DELETE /v1/flags/:id          — Delete flag
 *   GET    /v1/flags/:id/audit    — Audit log for a flag
 *
 * ADR-131: SQLite-backed flags with audit trail.
 * Every mutation is recorded in flag_audit_log.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { featureFlags, flagAuditLog } from '../db/schema';

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

export async function handleFlagsRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  userId: string = 'api',
  userRole: string | null = null,
  publishEvent?: (channel: string, data: string) => void | Promise<void>,
): Promise<boolean> {
  // Only intercept /v1/flags paths
  if (!url.startsWith('/v1/flags')) return false;

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

      const flag = {
        id: crypto.randomUUID(),
        key: body.key,
        value: Boolean(body.value),
        description: body.description ?? null,
        enabled: body.enabled !== false,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(featureFlags).values(flag).run();
      await logFlagAction(flag.id, 'created', userId, undefined, JSON.stringify(flag));

      json(res, 201, { flag: { ...flag, value: !!flag.value, enabled: !!flag.enabled } });
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

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.key !== undefined) updates.key = body.key;
      if (body.value !== undefined) updates.value = Boolean(body.value);
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
          value: !!updated!.value,
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

      await logFlagAction(flagId, 'deleted', userId, JSON.stringify(existing));
      await db.delete(featureFlags).where(eq(featureFlags.id, flagId)).run();

      json(res, 200, { success: true, deleted: flagId });
      if (publishEvent) {
        await publishEvent('bcp:flags:updates', JSON.stringify({ type: 'flag-update', action: 'deleted', flagId }));
      }
      return true;
    }

    return false;
  } catch (err: any) {
    console.error('[flags] Error:', err.message);
    json(res, 500, { error: 'Internal server error', detail: err.message });
    return true;
  }
}
