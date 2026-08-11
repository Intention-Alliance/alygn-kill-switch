/**
 * Kill Authorization Routes — Human-Signature Kill + Quorum (ADR-136)
 *
 * Endpoints:
 *   POST /v1/kill-authorization/requests          — initiate kill (assertion token)
 *   POST /v1/kill-authorization/requests/:id/approve — approve pending quorum (assertion token)
 *   GET  /v1/kill-authorization/requests          — list requests
 *   GET  /v1/kill-authorization/requests/:id      — get single request
 *   POST /v1/kill-authorization/policy-change     — quorum-gated kill.authorization.* flag change
 *
 * These endpoints accept ONLY a WebAuthn assertion token (from
 * /v1/auth/webauthn/assert/finish) in the `Authorization: Assertion <token>`
 * header. Bearer tokens / API keys are structurally rejected here
 * (ADR-136 §4 — defense against autonomous self-deactivation).
 *
 * Every signature event is appended to the immutable audit log
 * (kill_switch_audit_log, ADR-140) by the executor.
 */

import type { KillSwitchService } from '../services/kill-switch';
import {
  initiateKill,
  approve,
  initiatePolicyChange,
  listRequests,
  getRequest,
  expireStaleRequests,
  KillAuthorizationError,
  isKillAuthorizationFlag,
  getAuthorizationMode,
  getQuorumThreshold,
  type KillAuthorizationExecutor,
} from '../services/kill-authorization';
import { verifyAssertionTokenForAction, WebAuthnError } from '../services/webauthn';
import { db } from '../db/index';
import { settings as settingsTable, killSwitchAuditLog } from '../db/schema';
import { parseBody } from '../utils/body-parser';

// ─── Action strings ─────────────────────────────────────────────────

export function killActionForTarget(target: string): string {
  return `kill:${target}`;
}

export function policyChangeActionForFlag(flagKey: string): string {
  return `policy-change:${flagKey}`;
}

// ─── Helpers ────────────────────────────────────────────────────────

function json(res: any, statusCode: number, body: Record<string, unknown>) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Extract and verify the WebAuthn assertion token. The token must be
 * bound to exactly `action`. Throws KillAuthorizationError on failure.
 */
function requireAssertion(req: any, action: string): { userId: string; credentialId: string } {
  const header = req.headers?.['authorization'] ?? '';
  if (!header.startsWith('Assertion ')) {
    throw new KillAuthorizationError(
      'Kill authorization requires a WebAuthn assertion token (Authorization: Assertion <token>)',
      'ASSERTION_REQUIRED',
    );
  }
  const token = header.slice('Assertion '.length).trim();
  if (!token) {
    throw new KillAuthorizationError('Empty assertion token', 'ASSERTION_REQUIRED');
  }
  try {
    return verifyAssertionTokenForAction({ token, action });
  } catch (err: any) {
    if (err instanceof WebAuthnError) {
      throw new KillAuthorizationError(err.message, err.code);
    }
    throw err;
  }
}

async function writeAudit(entry: {
  userId: string;
  reason: string;
  previousState: string;
  newState: string;
  machineId?: string | null;
  severity?: string;
  metadata?: string;
}): Promise<void> {
  await db.insert(killSwitchAuditLog).values({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    userId: entry.userId,
    reason: entry.reason,
    previousState: entry.previousState,
    newState: entry.newState,
    traceId: crypto.randomUUID(),
    machineId: entry.machineId ?? null,
    severity: entry.severity ?? 'info',
    metadata: entry.metadata ?? null,
  }).run();
}

// ─── Executor (real side effects) ───────────────────────────────────

export function createKillAuthorizationExecutor(service: KillSwitchService): KillAuthorizationExecutor {
  return {
    async executeKill({ state, reason, userId, ip }) {
      const result = await service.transitionTo(state as any, {
        userId,
        reason,
        ip,
      });
      await writeAudit({
        userId,
        reason: `Kill authorized by human WebAuthn signature: ${reason}`,
        previousState: result.previousState,
        newState: result.newState,
        severity: 'critical',
        metadata: JSON.stringify({ authorization: 'webauthn', actor: userId, ip }),
      });
      return result;
    },
    async applyPolicyChange({ flagKey, value, userId }) {
      const now = new Date();
      await db.insert(settingsTable)
        .values({ key: flagKey, value, updatedAt: now })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value, updatedAt: now },
        });
      await writeAudit({
        userId,
        reason: `Quorum-gated policy change: ${flagKey} = ${value}`,
        previousState: 'POLICY',
        newState: 'POLICY',
        severity: 'warning',
        metadata: JSON.stringify({ flagKey, value, authorization: 'webauthn-quorum', actor: userId }),
      });
      return { flagKey, value, updatedAt: now };
    },
  };
}

// ─── Route handler ──────────────────────────────────────────────────

export async function handleKillAuthorizationRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  service: KillSwitchService,
): Promise<boolean> {
  if (!url.startsWith('/v1/kill-authorization')) return false;

  const executor = createKillAuthorizationExecutor(service);

  try {
    // ─── GET /v1/kill-authorization/requests — list ──────────────
    if (method === 'GET' && url === '/v1/kill-authorization/requests') {
      await expireStaleRequests();
      const requests = await listRequests(50);
      json(res, 200, { requests });
      return true;
    }

    // ─── GET /v1/kill-authorization/requests/:id — single ────────
    const getMatch = url.match(/^\/v1\/kill-authorization\/requests\/([^/]+)$/);
    if (method === 'GET' && getMatch) {
      const request = await getRequest(getMatch[1]);
      if (!request) {
        json(res, 404, { error: 'Authorization request not found' });
        return true;
      }
      json(res, 200, { request });
      return true;
    }

    // ─── POST /v1/kill-authorization/requests — initiate kill ────
    if (method === 'POST' && url === '/v1/kill-authorization/requests') {
      const body = await parseBody(req);
      if (!body?.target || typeof body.target !== 'string') {
        json(res, 400, { error: 'Missing required field: target (machine id or "fleet")' });
        return true;
      }
      if (!body?.state || typeof body.state !== 'string') {
        json(res, 400, { error: 'Missing required field: state' });
        return true;
      }

      const action = killActionForTarget(body.target);
      const { userId, credentialId } = requireAssertion(req, action);

      const result = await initiateKill(
        {
          action: 'kill',
          target: body.target,
          state: body.state,
          reason: body.reason ?? 'Kill authorization request',
          userId,
          credentialId,
          ip: req.ip,
        },
        executor,
      );

      await writeAudit({
        userId,
        reason: `Kill authorization initiated (${result.mode} mode): ${body.target} → ${body.state}`,
        previousState: 'AUTHORIZATION',
        newState: result.executed ? 'EXECUTED' : 'PENDING_QUORUM',
        machineId: body.target === 'fleet' ? null : body.target,
        severity: 'critical',
        metadata: JSON.stringify({
          requestId: result.request.id,
          mode: result.mode,
          credentialId,
          target: body.target,
        }),
      });

      json(res, result.executed ? 200 : 202, {
        request: result.request,
        executed: result.executed,
        mode: result.mode,
      });
      return true;
    }

    // ─── POST /v1/kill-authorization/requests/:id/approve ────────
    const approveMatch = url.match(/^\/v1\/kill-authorization\/requests\/([^/]+)\/approve$/);
    if (method === 'POST' && approveMatch) {
      const requestId = approveMatch[1];
      const request = await getRequest(requestId);
      if (!request) {
        json(res, 404, { error: 'Authorization request not found' });
        return true;
      }

      const action = request.action === 'kill'
        ? killActionForTarget(request.target)
        : policyChangeActionForFlag(request.target);
      const { userId, credentialId } = requireAssertion(req, action);

      const result = await approve(
        { requestId, userId, credentialId, ip: req.ip },
        executor,
      );

      await writeAudit({
        userId,
        reason: `Quorum approval signature added to request ${requestId}`,
        previousState: 'PENDING_QUORUM',
        newState: result.executed ? 'EXECUTED' : 'PENDING_QUORUM',
        machineId: request.target === 'fleet' ? null : request.target,
        severity: 'critical',
        metadata: JSON.stringify({
          requestId,
          credentialId,
          signatures: result.request.signatures.length,
          threshold: result.threshold,
        }),
      });

      json(res, result.executed ? 200 : 202, {
        request: result.request,
        executed: result.executed,
        threshold: result.threshold,
      });
      return true;
    }

    // ─── POST /v1/kill-authorization/policy-change — quorum-gated flag change ──
    if (method === 'POST' && url === '/v1/kill-authorization/policy-change') {
      const body = await parseBody(req);
      if (!body?.flagKey || typeof body.flagKey !== 'string') {
        json(res, 400, { error: 'Missing required field: flagKey' });
        return true;
      }
      if (!isKillAuthorizationFlag(body.flagKey)) {
        json(res, 400, {
          error: `Only ${'kill.authorization.*'} flags are quorum-gated`,
          code: 'NOT_KILL_AUTH_FLAG',
        });
        return true;
      }
      if (body.value === undefined) {
        json(res, 400, { error: 'Missing required field: value' });
        return true;
      }

      const action = policyChangeActionForFlag(body.flagKey);
      const { userId, credentialId } = requireAssertion(req, action);

      const result = await initiatePolicyChange(
        {
          flagKey: body.flagKey,
          proposedValue: String(body.value),
          userId,
          credentialId,
        },
        executor,
      );

      await writeAudit({
        userId,
        reason: `Quorum-gated policy change initiated: ${body.flagKey} = ${body.value}`,
        previousState: 'POLICY',
        newState: result.executed ? 'EXECUTED' : 'PENDING_QUORUM',
        severity: 'warning',
        metadata: JSON.stringify({
          requestId: result.request.id,
          flagKey: body.flagKey,
          proposedValue: String(body.value),
          mode: result.mode,
          threshold: result.threshold,
          credentialId,
        }),
      });

      json(res, result.executed ? 200 : 202, {
        request: result.request,
        executed: result.executed,
        mode: result.mode,
        threshold: result.threshold,
      });
      return true;
    }

    return false;
  } catch (err: any) {
    if (err instanceof KillAuthorizationError) {
      json(res, 403, { error: err.message, code: err.code });
      return true;
    }
    console.error('[kill-authorization] Error:', err.message);
    json(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// Re-export for tests / callers
export { getAuthorizationMode, getQuorumThreshold };
