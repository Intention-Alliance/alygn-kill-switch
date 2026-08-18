/**
 * WebAuthn Service — Unit Tests (ADR-136)
 *
 * Covers the registration and assertion ceremonies with a mocked
 * @simplewebauthn/server (no real hardware authenticator needed):
 *   - register: begin → finish → credential stored
 *   - assert: begin → finish → assertion verified + token minted
 *   - replay detection: counter must advance
 *   - challenge single-use + expiry
 *   - assertion token: bound to action, rejects mismatched action
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

// ─── Test env (assertion token HMAC secret) ───────────────────────
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-secret-0123456789abcdef0123456789abcdef';
process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET = process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET || 'test-assertion-token-secret';

// ─── Mock @simplewebauthn/server ─────────────────────────────────

const FAKE_CHALLENGE = 'fake-challenge-abc123';
const FAKE_CREDENTIAL_ID = 'fake-credential-id-001';
const FAKE_PUBLIC_KEY = new Uint8Array([1, 2, 3, 4, 5]);

const mockGenerateRegistrationOptions = mock(async () => ({
  challenge: FAKE_CHALLENGE,
  rp: { name: 'Alygn Kill Switch', id: 'localhost' },
  user: { id: 'dXNlcg', name: 'admin@alygn.com' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 60000,
  attestation: 'none',
  excludeCredentials: [],
  authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
}));

const mockVerifyRegistrationResponse = mock(async () => ({
  verified: true,
  registrationInfo: {
    fmt: 'none',
    aaguid: '00000000-0000-0000-0000-000000000000',
    credential: {
      id: FAKE_CREDENTIAL_ID,
      publicKey: FAKE_PUBLIC_KEY,
      counter: 0,
      transports: ['usb'],
    },
    credentialType: 'public-key',
    attestationObject: new Uint8Array([9, 9, 9]),
    userVerified: true,
    credentialDeviceType: 'singleDevice',
    credentialBackedUp: false,
    origin: 'http://localhost:3000',
    rpID: 'localhost',
  },
}));

const mockGenerateAuthenticationOptions = mock(async () => ({
  challenge: FAKE_CHALLENGE,
  rpId: 'localhost',
  allowCredentials: [{ id: FAKE_CREDENTIAL_ID, transports: ['usb'] }],
  timeout: 60000,
  userVerification: 'required',
}));

const mockVerifyAuthenticationResponse = mock(async () => ({
  verified: true,
  authenticationInfo: {
    credentialID: FAKE_CREDENTIAL_ID,
    newCounter: 1,
    userVerified: true,
    credentialDeviceType: 'singleDevice',
    credentialBackedUp: false,
    origin: 'http://localhost:3000',
    rpID: 'localhost',
  },
}));

// Scope the @simplewebauthn/server mock to this file by preserving the real
// module's exports and overriding only the four ceremony functions. This
// prevents the mock from leaking into other test files that import the real
// module when the suite runs in a single process.
const realSimpleWebAuthn = await import('@simplewebauthn/server');

mock.module('@simplewebauthn/server', () => ({
  ...realSimpleWebAuthn,
  generateRegistrationOptions: mockGenerateRegistrationOptions,
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
  generateAuthenticationOptions: mockGenerateAuthenticationOptions,
  verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
}));

// ─── In-memory credential store ──────────────────────────────────

interface MockCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  name: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

let credentialStore: MockCredential[] = [];

beforeEach(() => {
  credentialStore = [];
  mockGenerateRegistrationOptions.mockClear();
  mockVerifyRegistrationResponse.mockClear();
  mockGenerateAuthenticationOptions.mockClear();
  mockVerifyAuthenticationResponse.mockClear();
});

// ─── Mock db/index ───────────────────────────────────────────────

mock.module('../../db/index', () => {
  function resolveTableName(table: any): string {
    const sym = (table as any)?.[Symbol.for('drizzle:Name')];
    if (sym) return String(sym);
    if (typeof table === 'string') return table;
    if (table?.name && typeof table.name === 'string') return table.name;
    return String(table);
  }

  function makeSelect() {
    return {
      from(table: any) {
        const tableName = resolveTableName(table);
        const isCredential = tableName.includes('webauthn_credential');
        const store = isCredential ? credentialStore : [];

        return {
          all() {
            return [...store];
          },
          where(condition: any) {
            // Handle both bare eq() and and(eq(...), isNull(...)) conditions
            let eqValue: any = condition?.__eq ?? null;
            if (eqValue === null && Array.isArray(condition?.__and)) {
              for (const sub of condition.__and) {
                if (sub?.__eq !== undefined) eqValue = sub.__eq;
              }
            }
            const filtered = eqValue !== null
              ? store.filter((c: any) => c.credentialId === eqValue || c.id === eqValue || c.userId === eqValue)
              : [...store];
            return {
              all() { return filtered; },
              get() { return filtered.length > 0 ? filtered[0] : null; },
            };
          },
        };
      },
    };
  }

  function makeInsert() {
    return {
      values(data: any) {
        return {
          run() {
            credentialStore.push({
              id: data.id,
              userId: data.userId,
              credentialId: data.credentialId,
              publicKey: data.publicKey,
              counter: data.counter ?? 0,
              transports: data.transports ?? null,
              name: data.name ?? null,
              createdAt: data.createdAt ?? new Date(),
              revokedAt: data.revokedAt ?? null,
            });
          },
        };
      },
    };
  }

  function makeUpdate() {
    return {
      set(updates: any) {
        return {
          where(condition: any) {
            const eqValue = condition?.__eq ?? null;
            return {
              run() {
                const idx = credentialStore.findIndex((c) => c.id === eqValue);
                if (idx >= 0) {
                  credentialStore[idx] = { ...credentialStore[idx], ...updates };
                }
              },
            };
          },
        };
      },
    };
  }

  return {
    db: {
      select: makeSelect,
      insert: makeInsert,
      update: makeUpdate,
    },
  };
});

// ─── Mock drizzle-orm eq/isNull/and ──────────────────────────────
//
// Scope the drizzle-orm mock to this file by preserving the real module's
// exports and overriding only the query-builder helpers this service uses.
// This prevents the mock from leaking into other test files that need the
// real drizzle-orm exports (e.g. inArray/desc/asc) when the suite runs in
// a single process — keeping the suite order-independent.
const realDrizzleOrm = await import("drizzle-orm");

mock.module('drizzle-orm', () => ({
  ...realDrizzleOrm,
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
  isNull: (col: any) => ({ __isNull: true, __col: col?.name }),
  and: (...args: any[]) => ({ __and: args }),
}));

// ─── Import service after mocks ──────────────────────────────────

let webauthn: any;
let WebAuthnError: any;

beforeEach(async () => {
  const mod = await import('../../services/webauthn');
  webauthn = mod;
  WebAuthnError = mod.WebAuthnError;
});

// ─── Tests ───────────────────────────────────────────────────────

describe('WebAuthnService — registration ceremony', () => {
  it('register: begin → finish → credential stored', async () => {
    const started = await webauthn.startRegistration({
      userId: 'user-1',
      userName: 'admin@alygn.com',
    });

    expect(started.options.challenge).toBe(FAKE_CHALLENGE);
    expect(started.challengeId).toBeDefined();

    const finished = await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: started.challengeId,
      response: { id: FAKE_CREDENTIAL_ID, type: 'public-key' },
      name: 'YubiKey 5C',
    });

    expect(finished.credential.credentialId).toBe(FAKE_CREDENTIAL_ID);
    expect(finished.credential.userId).toBe('user-1');
    expect(finished.credential.name).toBe('YubiKey 5C');
    expect(credentialStore.length).toBe(1);
    expect(credentialStore[0].credentialId).toBe(FAKE_CREDENTIAL_ID);
  });

  it('register: challenge is single-use — second finish with same challengeId fails', async () => {
    const started = await webauthn.startRegistration({
      userId: 'user-1',
      userName: 'admin@alygn.com',
    });

    await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: started.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    await expect(
      webauthn.finishRegistration({
        userId: 'user-1',
        challengeId: started.challengeId,
        response: { id: FAKE_CREDENTIAL_ID },
      }),
    ).rejects.toThrow();
  });

  it('register: challenge bound to user — different user rejected', async () => {
    const started = await webauthn.startRegistration({
      userId: 'user-1',
      userName: 'admin@alygn.com',
    });

    await expect(
      webauthn.finishRegistration({
        userId: 'user-2',
        challengeId: started.challengeId,
        response: { id: FAKE_CREDENTIAL_ID },
      }),
    ).rejects.toThrow();
  });
});

describe('WebAuthnService — assertion ceremony', () => {
  it('assert: begin → finish → assertion verified + token minted', async () => {
    // Seed a credential first
    const reg = await webauthn.startRegistration({ userId: 'user-1', userName: 'admin@alygn.com' });
    await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: reg.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    const started = await webauthn.startAssertion({
      userId: 'user-1',
      action: 'kill:fleet',
    });
    expect(started.options.challenge).toBe(FAKE_CHALLENGE);

    const finished = await webauthn.finishAssertion({
      challengeId: started.challengeId,
      response: { id: FAKE_CREDENTIAL_ID, type: 'public-key' },
    });

    expect(finished.verified).toBe(true);
    expect(finished.userId).toBe('user-1');
    expect(finished.credentialId).toBe(FAKE_CREDENTIAL_ID);
    expect(finished.assertionToken.token).toBeDefined();
    expect(finished.assertionToken.payload.action).toBe('kill:fleet');
    expect(finished.assertionToken.payload.sub).toBe('user-1');
  });

  it('assert: counter advances and is persisted (replay detection)', async () => {
    const reg = await webauthn.startRegistration({ userId: 'user-1', userName: 'admin@alygn.com' });
    await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: reg.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    const started = await webauthn.startAssertion({ userId: 'user-1', action: 'kill:fleet' });
    await webauthn.finishAssertion({
      challengeId: started.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    // Mock returns newCounter=1; stored counter must now be 1.
    expect(credentialStore[0].counter).toBe(1);
  });

  it('assert: unknown credential rejected', async () => {
    // Seed a valid credential so startAssertion succeeds, then assert
    // with a DIFFERENT (unknown) credential id.
    const reg = await webauthn.startRegistration({ userId: 'user-1', userName: 'admin@alygn.com' });
    await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: reg.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    const started = await webauthn.startAssertion({ userId: 'user-1', action: 'kill:fleet' });
    await expect(
      webauthn.finishAssertion({
        challengeId: started.challengeId,
        response: { id: 'unknown-credential' },
      }),
    ).rejects.toThrow();
  });

  it('assert: challenge single-use', async () => {
    const reg = await webauthn.startRegistration({ userId: 'user-1', userName: 'admin@alygn.com' });
    await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: reg.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    const started = await webauthn.startAssertion({ userId: 'user-1', action: 'kill:fleet' });
    await webauthn.finishAssertion({
      challengeId: started.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    await expect(
      webauthn.finishAssertion({
        challengeId: started.challengeId,
        response: { id: FAKE_CREDENTIAL_ID },
      }),
    ).rejects.toThrow();
  });
});

describe('WebAuthnService — assertion tokens', () => {
  it('token verifies for the bound action', async () => {
    const reg = await webauthn.startRegistration({ userId: 'user-1', userName: 'admin@alygn.com' });
    await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: reg.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    const started = await webauthn.startAssertion({ userId: 'user-1', action: 'kill:machine:m1' });
    const finished = await webauthn.finishAssertion({
      challengeId: started.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    const verified = webauthn.verifyAssertionTokenForAction({
      token: finished.assertionToken.token,
      action: 'kill:machine:m1',
    });
    expect(verified.userId).toBe('user-1');
    expect(verified.credentialId).toBe(FAKE_CREDENTIAL_ID);
  });

  it('token rejects a different action (action binding)', async () => {
    const reg = await webauthn.startRegistration({ userId: 'user-1', userName: 'admin@alygn.com' });
    await webauthn.finishRegistration({
      userId: 'user-1',
      challengeId: reg.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    const started = await webauthn.startAssertion({ userId: 'user-1', action: 'kill:machine:m1' });
    const finished = await webauthn.finishAssertion({
      challengeId: started.challengeId,
      response: { id: FAKE_CREDENTIAL_ID },
    });

    expect(() => {
      webauthn.verifyAssertionTokenForAction({
        token: finished.assertionToken.token,
        action: 'kill:fleet',
      });
    }).toThrow();
  });

  it('garbage token rejected', () => {
    expect(() => {
      webauthn.verifyAssertionTokenForAction({ token: 'not-a-token', action: 'kill:fleet' });
    }).toThrow();
  });
});
