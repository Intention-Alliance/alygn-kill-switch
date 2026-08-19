/**
 * WebAuthn Routes — Human-Signature Registration & Assertion (ADR-136)
 *
 * Endpoints (all require an authenticated Better-Auth session cookie —
 * the human must be logged in to register an authenticator or to start
 * an assertion ceremony):
 *
 *   POST /v1/auth/webauthn/register/begin  — start registration ceremony
 *   POST /v1/auth/webauthn/register/finish — complete registration
 *   POST /v1/auth/webauthn/assert/begin    — start assertion ceremony
 *   POST /v1/auth/webauthn/assert/finish   — complete assertion → assertion token
 *
 * The assertion token returned by assert/finish is the ONLY credential
 * the kill endpoint and quorum-gated policy endpoint accept. It is
 * HMAC-signed, short-lived, and bound to the exact action being
 * authorized — an API key / service account can never mint one
 * (ADR-136 §4 defense against autonomous self-deactivation).
 */

import { auth } from '../lib/auth';
import {
  startRegistration,
  finishRegistration,
  startAssertion,
  finishAssertion,
  listActiveCredentialsForUser,
  renameCredential,
  revokeCredential,
  WebAuthnError,
} from '../services/webauthn';
import { parseBody } from '../utils/body-parser';

// ─── Helpers ─────────────────────────────────────────────────────────

function json(res: any, statusCode: number, body: Record<string, unknown>) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Resolve the authenticated human from the Better-Auth session cookie.
 * Returns null when there is no valid session — the caller decides the
 * status code (401 for ceremony endpoints).
 */
async function getSessionUser(req: any): Promise<{ id: string; email: string; name: string; role?: string } | null> {
  try {
    const headers = new Headers();
    if (req.headers?.cookie) {
      headers.set('cookie', req.headers.cookie);
    }
    const data = await auth.api.getSession({ headers }) as { user?: { id?: string; email?: string; name?: string; role?: string } } | null;
    if (data?.user?.id) {
      return {
        id: data.user.id,
        email: data.user.email ?? '',
        name: data.user.name ?? data.user.email ?? '',
        role: data.user.role,
      };
    }
  } catch (err: any) {
    console.error('[webauthn] Session check failed:', err.message);
  }
  return null;
}

// ─── Route handler ──────────────────────────────────────────────────

export async function handleWebAuthnRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
): Promise<boolean> {
  if (!url.startsWith('/v1/auth/webauthn/')) return false;

  try {
    // ─── POST /v1/auth/webauthn/register/begin ───────────────────
    if (method === 'POST' && url === '/v1/auth/webauthn/register/begin') {
      const user = await getSessionUser(req);
      if (!user) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }
      const body = await parseBody(req);
      const result = await startRegistration({
        userId: user.id,
        userName: user.email,
        userDisplayName: user.name,
      });
      json(res, 200, {
        options: result.options,
        challengeId: result.challengeId,
      });
      return true;
    }

    // ─── POST /v1/auth/webauthn/register/finish ──────────────────
    if (method === 'POST' && url === '/v1/auth/webauthn/register/finish') {
      const user = await getSessionUser(req);
      if (!user) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }
      const body = await parseBody(req);
      if (!body?.challengeId || !body?.response) {
        json(res, 400, { error: 'Missing required fields: challengeId, response' });
        return true;
      }
      const result = await finishRegistration({
        userId: user.id,
        challengeId: body.challengeId,
        response: body.response,
        name: body.name,
      });
      json(res, 201, { credential: result.credential });
      return true;
    }

    // ─── POST /v1/auth/webauthn/assert/begin ─────────────────────
    if (method === 'POST' && url === '/v1/auth/webauthn/assert/begin') {
      const user = await getSessionUser(req);
      if (!user) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }
      const body = await parseBody(req);
      if (!body?.action || typeof body.action !== 'string') {
        json(res, 400, { error: 'Missing required field: action' });
        return true;
      }
      const result = await startAssertion({
        userId: user.id,
        action: body.action,
      });
      json(res, 200, {
        options: result.options,
        challengeId: result.challengeId,
      });
      return true;
    }

    // ─── POST /v1/auth/webauthn/assert/finish ────────────────────
    if (method === 'POST' && url === '/v1/auth/webauthn/assert/finish') {
      const user = await getSessionUser(req);
      if (!user) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }
      const body = await parseBody(req);
      if (!body?.challengeId || !body?.response) {
        json(res, 400, { error: 'Missing required fields: challengeId, response' });
        return true;
      }
      const result = await finishAssertion({
        challengeId: body.challengeId,
        response: body.response,
      });
      json(res, 200, {
        verified: result.verified,
        assertionToken: result.assertionToken.token,
        expiresAt: new Date(result.assertionToken.payload.exp).toISOString(),
        userId: result.userId,
        credentialId: result.credentialId,
      });
      return true;
    }

    // ─── GET /v1/auth/webauthn/credentials ────────────────────────
    // List the current user's active (non-revoked) credentials.
    if (method === 'GET' && url === '/v1/auth/webauthn/credentials') {
      const user = await getSessionUser(req);
      if (!user) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }
      const creds = await listActiveCredentialsForUser(user.id);
      json(res, 200, {
        credentials: creds.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt.toISOString(),
          transports: c.transports ?? [],
          lastUsedAt: null, // not tracked in v1 (no lastUsedAt column)
          revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
        })),
      });
      return true;
    }

    // ─── PATCH /v1/auth/webauthn/credentials/:id ─────────────────
    // Rename a credential's human label. Owner-scoped: a user may only
    // rename their own credential.
    const patchMatch = url.match(/^\/v1\/auth\/webauthn\/credentials\/([^/]+)$/);
    if (method === 'PATCH' && patchMatch) {
      const user = await getSessionUser(req);
      if (!user) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }
      const body = await parseBody(req);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) {
        json(res, 400, { error: 'Missing required field: name' });
        return true;
      }
      const updated = await renameCredential(patchMatch[1], user.id, name);
      if (!updated) {
        json(res, 404, { error: 'Credential not found' });
        return true;
      }
      json(res, 200, {
        credential: {
          id: updated.id,
          name: updated.name,
          createdAt: updated.createdAt.toISOString(),
          transports: updated.transports ?? [],
          revokedAt: updated.revokedAt ? updated.revokedAt.toISOString() : null,
        },
      });
      return true;
    }

    // ─── DELETE /v1/auth/webauthn/credentials/:id ─────────────────
    // Revoke a credential (sets revokedAt). Owner-scoped: a user may
    // only revoke their own credential.
    const deleteMatch = url.match(/^\/v1\/auth\/webauthn\/credentials\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const user = await getSessionUser(req);
      if (!user) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }
      const revoked = await revokeCredential(deleteMatch[1], user.id);
      if (!revoked) {
        json(res, 404, { error: 'Credential not found' });
        return true;
      }
      json(res, 200, { revoked: true, id: revoked.id });
      return true;
    }

    return false;
  } catch (err: any) {
    if (err instanceof WebAuthnError) {
      json(res, 400, { error: err.message, code: err.code });
      return true;
    }
    console.error('[webauthn] Error:', err.message);
    json(res, 500, { error: 'Internal server error' });
    return true;
  }
}
