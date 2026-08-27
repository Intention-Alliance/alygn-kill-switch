/**
 * WebAuthn Routes — Admin Role Gate Tests (P0-2)
 *
 * Covers the role-based gates on the WebAuthn ceremony endpoints:
 *   - register/begin  → non-admin 403 (credential enrollment is admin-only)
 *   - register/finish → non-admin 403
 *   - assert/begin    → non-admin 403
 *   - assert/finish   → non-admin 403 (the gate Nikaya flagged as missing)
 *   - admin user passes the gate (sanity check)
 *
 * Mocks the Better-Auth session (`auth.api.getSession`) and the Drizzle
 * `db` module so `requireAdminRole` resolves the user's role from the DB.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Env for assertion token HMAC ─────────────────────────────────
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-secret-0123456789abcdef0123456789abcdef';
process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET = process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET || 'test-assertion-token-secret';

// ─── Mock @simplewebauthn/server (never reached by gate tests) ────
mock.module('@simplewebauthn/server', () => ({
  generateRegistrationOptions: async () => ({ challenge: 'x' }),
  verifyRegistrationResponse: async () => ({ verified: false }),
  generateAuthenticationOptions: async () => ({ challenge: 'x' }),
  verifyAuthenticationResponse: async () => ({ verified: false }),
}));

// ─── Mock drizzle-orm ─────────────────────────────────────────────
mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
  and: (...args: any[]) => ({ __and: args }),
  isNull: (col: any) => ({ __isNull: true, __col: col?.name }),
}));

// ─── Mock db/index — role lookup for requireAdminRole ─────────────
// requireAdminRole does: db.select().from(users).where(eq(users.id, id)).get()
let currentRole: string | null = 'viewer';

mock.module(path.resolve(__dirname, '../../db/index.ts'), () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => (currentRole ? { id: 'u1', role: currentRole } : null),
        }),
      }),
    }),
    insert: () => ({ values: () => ({ run: () => {} }) }),
    update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
  },
}));

// ─── Mock lib/auth — session resolution for getSessionUser ────────
// getSessionUser does: auth.api.getSession({ headers }) → { user: { id, email, name } }
let sessionUser: { id: string; email: string; name: string } | null = null;

mock.module(path.resolve(__dirname, '../../lib/auth.ts'), () => ({
  auth: {
    api: {
      getSession: async () =>
        sessionUser ? { user: sessionUser } : null,
    },
  },
  seedAdminUser: async () => {},
  ADMIN_EMAIL: 'admin@alygn.com',
  BASE_PATH: '/v1/auth',
}));

// ─── Import route after mocks ─────────────────────────────────────

let handleWebAuthnRoutes: any;

beforeEach(() => {
  currentRole = 'viewer';
  sessionUser = { id: 'u1', email: 'viewer@alygn.com', name: 'Viewer' };
});

// ─── Helpers ──────────────────────────────────────────────────────

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

function createMockReq(bodyStr: string, headers: Record<string, string> = {}) {
  const req: any = {
    headers,
    _body: bodyStr,
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

// ─── Tests ────────────────────────────────────────────────────────

describe('WebAuthn routes — admin role gate (P0-2)', () => {
  it('register/begin: non-admin authenticated user → 403', async () => {
    const routeMod = await import('../webauthn');
    handleWebAuthnRoutes = routeMod.handleWebAuthnRoutes;
    const res = createMockRes();
    const req = createMockReq('{}', { cookie: 'better-auth.session_token=abc' });

    const handled = await handleWebAuthnRoutes('POST', '/v1/auth/webauthn/register/begin', req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).error).toContain('Admin role required');
  });

  it('register/finish: non-admin authenticated user → 403', async () => {
    const routeMod = await import('../webauthn');
    handleWebAuthnRoutes = routeMod.handleWebAuthnRoutes;
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ challengeId: 'c1', response: {} }),
      { cookie: 'better-auth.session_token=abc' },
    );

    const handled = await handleWebAuthnRoutes('POST', '/v1/auth/webauthn/register/finish', req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).error).toContain('Admin role required');
  });

  it('assert/begin: non-admin authenticated user → 403', async () => {
    const routeMod = await import('../webauthn');
    handleWebAuthnRoutes = routeMod.handleWebAuthnRoutes;
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ action: 'kill:fleet' }),
      { cookie: 'better-auth.session_token=abc' },
    );

    const handled = await handleWebAuthnRoutes('POST', '/v1/auth/webauthn/assert/begin', req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).error).toContain('Admin role required');
  });

  it('assert/finish: non-admin authenticated user → 403 (Nikaya gap)', async () => {
    const routeMod = await import('../webauthn');
    handleWebAuthnRoutes = routeMod.handleWebAuthnRoutes;
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ challengeId: 'c1', response: {} }),
      { cookie: 'better-auth.session_token=abc' },
    );

    const handled = await handleWebAuthnRoutes('POST', '/v1/auth/webauthn/assert/finish', req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(getJson(res).error).toContain('Admin role required');
  });

  it('assert/finish: unauthenticated user → 401', async () => {
    sessionUser = null;
    const routeMod = await import('../webauthn');
    handleWebAuthnRoutes = routeMod.handleWebAuthnRoutes;
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ challengeId: 'c1', response: {} }),
    );

    const handled = await handleWebAuthnRoutes('POST', '/v1/auth/webauthn/assert/finish', req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
    expect(getJson(res).error).toContain('Authentication required');
  });

  it('assert/finish: admin user passes the role gate (sanity)', async () => {
    currentRole = 'admin';
    const routeMod = await import('../webauthn');
    handleWebAuthnRoutes = routeMod.handleWebAuthnRoutes;
    const res = createMockRes();
    const req = createMockReq(
      JSON.stringify({ challengeId: 'c1', response: {} }),
      { cookie: 'better-auth.session_token=abc' },
    );

    // Admin passes the gate; the handler proceeds to finishAssertion which
    // throws CHALLENGE_INVALID (no challenge stored) → 400 WebAuthnError.
    const handled = await handleWebAuthnRoutes('POST', '/v1/auth/webauthn/assert/finish', req, res);

    expect(handled).toBe(true);
    // NOT 403 — the role gate was passed. The 400 comes from the missing
    // challenge, proving the gate did not short-circuit.
    expect(res.statusCode).toBe(400);
  });
});
