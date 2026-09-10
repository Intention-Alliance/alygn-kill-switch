/**
 * Inference Logs API — intercepted LLM requests reported by agent-plane
 *
 * Endpoints:
 *   GET  /v1/inference-logs            — list logs (admin, paginated)
 *   POST /v1/inference-logs            — report a log entry (agent-plane, x-api-key)
 *
 * The agent-plane interceptor reports each intercepted request here so the
 * dashboard can show inference logs (previously only stdout on the agent).
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { inferenceLogs } from '../db/schema';
import { parseBody } from '../utils/body-parser';

function json(res: any, statusCode: number, body: Record<string, unknown>) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleInferenceLogsRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  uid: string | null,
  userRole: string | null,
): Promise<boolean> {
  if (!url.startsWith('/v1/inference-logs')) return false;

  try {
    // Split path from query string — the GET handler matches on the pathname
    // (the dispatcher passes the raw URL, which may include ?limit=...).
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname;

    // ─── GET /v1/inference-logs — list (admin) ─────────────────────
    if (method === 'GET' && pathname === '/v1/inference-logs') {
      if (userRole !== 'admin') {
        json(res, 403, { error: 'Admin role required' });
        return true;
      }

      const limit = Math.min(parseInt(urlObj.searchParams.get('limit') ?? '50', 10) || 50, 200);
      const offset = Math.max(parseInt(urlObj.searchParams.get('offset') ?? '0', 10) || 0, 0);
      const machineId = urlObj.searchParams.get('machineId');

      const base = db.select().from(inferenceLogs);
      const rows = machineId
        ? await base.where(eq(inferenceLogs.machineId, machineId)).orderBy(desc(inferenceLogs.timestamp)).limit(limit).offset(offset).all()
        : await base.orderBy(desc(inferenceLogs.timestamp)).limit(limit).offset(offset).all();

      const logs = rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp as any).toISOString(),
        machineId: r.machineId,
        method: r.method,
        path: r.path,
        score: r.score,
        action: r.action,
        reasons: r.reasons ? JSON.parse(r.reasons) : [],
        alert: !!r.alert,
        scored: !!r.scored,
        promptPreview: r.promptPreview,
        model: r.model,
      }));

      json(res, 200, { logs, total: logs.length, limit, offset });
      return true;
    }

    // ─── POST /v1/inference-logs — report (agent-plane) ────────────
    if (method === 'POST' && url === '/v1/inference-logs') {
      // Auth: x-api-key (service account) — same as /v1/discovery/heartbeat.
      // The route dispatcher already authenticated the request (uid set);
      // agent-plane calls carry the API key which maps to admin.
      if (!uid) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }

      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        json(res, 400, { error: 'Request body required' });
        return true;
      }

      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        machineId: typeof body.machineId === 'string' ? body.machineId : 'unknown',
        method: typeof body.method === 'string' ? body.method : 'POST',
        path: typeof body.path === 'string' ? body.path : '/',
        score: typeof body.score === 'number' ? body.score : 0,
        action: typeof body.action === 'string' ? body.action : 'forward',
        reasons: Array.isArray(body.reasons) ? JSON.stringify(body.reasons) : null,
        alert: body.alert === true,
        scored: body.scored !== false,
        promptPreview: typeof body.promptPreview === 'string' ? body.promptPreview.slice(0, 200) : null,
        model: typeof body.model === 'string' ? body.model : null,
      };

      await db.insert(inferenceLogs).values(entry).run();
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: entry.id }));
      return true;
    }

    return false;
  } catch (err: any) {
    console.error('[inference-logs] Error:', err.message);
    json(res, 500, { error: 'Internal server error' });
    return true;
  }
}
