/**
 * WebAuthn Service — Human-Signature Kill Authorization (ADR-136)
 *
 * Wraps @simplewebauthn/server to run the FIDO2 registration and
 * assertion ceremonies against the `webauthn_credential` table.
 *
 * Security properties enforced here:
 *  - Challenges are single-use, short-lived, and bound to a purpose
 *    ('register' | 'assert') and (for assertions) to the exact action
 *    being authorized (kill machine X, fleet kill, policy change).
 *  - Assertion verification enforces the authenticator counter
 *    (monotonic per credential) for replay detection.
 *  - A successful assertion yields a short-lived, HMAC-signed
 *    assertion token that the kill / policy endpoints accept INSTEAD
 *    of a Bearer token. The token is bound to the action, the user,
 *    and the specific credential — an API key can never mint one.
 *
 * ADR-136 §4: kill-authorization endpoints reject any credential that
 * is not a human WebAuthn assertion. Service accounts / API keys have
 * no path into this service.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/index';
import { sessions, users, webauthnCredentials } from '../db/schema';
import { getConfig } from '../config';

// ─── Types ──────────────────────────────────────────────────────────

export type WebAuthnPurpose = 'register' | 'assert' | 'login';

export interface PendingChallenge {
  id: string;
  challenge: string;
  purpose: WebAuthnPurpose;
  userId: string;
  action: string | null; // bound action for assertions ('kill:machine:<id>' | 'kill:fleet' | 'policy-change:<flagKey>')
  createdAt: number;
}

export interface AssertionTokenPayload {
  sub: string;   // userId
  cred: string;  // credentialId (base64url)
  action: string;
  exp: number;   // epoch ms
  jti: string;
}

export interface AssertionToken {
  token: string;
  payload: AssertionTokenPayload;
}

export interface StoredCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  name: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

// ─── Challenge Store (in-memory, single-instance) ───────────────────

const challengeStore = new Map<string, PendingChallenge>();

function pruneExpiredChallenges(now: number): void {
  for (const [id, c] of challengeStore) {
    if (now - c.createdAt > getConfig().webauthn.challengeTtlMs) {
      challengeStore.delete(id);
    }
  }
}

function storeChallenge(challenge: PendingChallenge): void {
  pruneExpiredChallenges(Date.now());
  challengeStore.set(challenge.id, challenge);
}

function takeChallenge(id: string, purpose: WebAuthnPurpose): PendingChallenge | null {
  const entry = challengeStore.get(id);
  if (!entry) return null;
  challengeStore.delete(id); // single-use
  if (Date.now() - entry.createdAt > getConfig().webauthn.challengeTtlMs) return null;
  if (entry.purpose !== purpose) return null;
  return entry;
}

// ─── Assertion Token (HMAC-signed, short-lived) ─────────────────────

function assertionTokenSecret(): string {
  const secret = process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('Missing WEBAUTHN_ASSERTION_TOKEN_SECRET (or BETTER_AUTH_SECRET)');
  }
  return secret;
}

function signAssertionToken(payload: AssertionTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', assertionTokenSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAssertionToken(token: string): AssertionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac('sha256', assertionTokenSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AssertionTokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.cred !== 'string' ||
        typeof payload.action !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function mintAssertionToken(userId: string, credentialId: string, action: string): AssertionToken {
  const payload: AssertionTokenPayload = {
    sub: userId,
    cred: credentialId,
    action,
    exp: Date.now() + getConfig().webauthn.assertionTokenTtlMs,
    jti: randomBytes(16).toString('hex'),
  };
  return { token: signAssertionToken(payload), payload };
}

// ─── Better-Auth session minting (login assertion) ────────────────────
//
// A successful login assertion proves the user owns a registered WebAuthn
// credential. We then mint a real Better-Auth session so the rest of the
// app (AuthGuard, /api/auth/get-session, etc.) treats the user as signed
// in — exactly as if they had typed email + password.
//
// The session cookie format mirrors Better-Auth's own `setSignedCookie`:
//   better-auth.session_token = <token>.<base64(hmac-sha256(token, secret))>
// The token is a random opaque string stored in the `session` table.

function betterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new WebAuthnError('Missing BETTER_AUTH_SECRET', 'CONFIG_MISSING');
  }
  return secret;
}

function signSessionToken(token: string): string {
  const sig = createHmac('sha256', betterAuthSecret())
    .update(token)
    .digest('base64');
  return `${token}.${sig}`;
}

/**
 * Create a Better-Auth session row for the given user and return the
 * signed session cookie value (the value placed in the
 * `better-auth.session_token` cookie).
 */
export async function mintSessionCookie(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h, matches auth.ts session.expiresIn
  const now = new Date();

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  }).run();

  return signSessionToken(token);
}

/**
 * Resolve a user by email (used when the login assertion is scoped to a
 * specific username). Returns null when no user matches.
 */
export async function findUserByEmail(email: string): Promise<{ id: string; email: string; name: string } | null> {
  const row = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name ?? row.email };
}

// ─── Credential persistence ─────────────────────────────────────────

function toStoredCredential(row: typeof webauthnCredentials.$inferSelect): StoredCredential {
  return {
    id: row.id,
    userId: row.userId,
    credentialId: row.credentialId,
    publicKey: row.publicKey,
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : null,
    name: row.name,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

async function findActiveCredential(credentialId: string): Promise<StoredCredential | null> {
  const row = await db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.credentialId, credentialId), isNull(webauthnCredentials.revokedAt)))
    .get();
  return row ? toStoredCredential(row) : null;
}

async function listActiveCredentialsForUser(userId: string): Promise<StoredCredential[]> {
  const rows = await db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.userId, userId), isNull(webauthnCredentials.revokedAt)))
    .all();
  return rows.map(toStoredCredential);
}

// ─── Registration ceremony ──────────────────────────────────────────

export interface StartRegistrationParams {
  userId: string;
  userName: string;
  userDisplayName?: string;
}

export interface StartRegistrationResult {
  options: Record<string, unknown>;
  challengeId: string;
}

export async function startRegistration({
  userId,
  userName,
  userDisplayName,
}: StartRegistrationParams): Promise<StartRegistrationResult> {
  const config = getConfig().webauthn;

  const existing = await listActiveCredentialsForUser(userId);
  const excludeCredentials = existing.map((c) => ({
    id: c.credentialId,
    transports: (c.transports ?? []) as ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid' | 'cable' | 'smart-card')[],
  }));

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName,
    userID: isoBase64URL.toBuffer(userId),
    userDisplayName: userDisplayName ?? userName,
    timeout: 60_000,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });

  const challengeId = randomBytes(16).toString('hex');
  storeChallenge({
    id: challengeId,
    challenge: options.challenge,
    purpose: 'register',
    userId,
    action: null,
    createdAt: Date.now(),
  });

  return { options: options as unknown as Record<string, unknown>, challengeId };
}

export interface FinishRegistrationParams {
  userId: string;
  challengeId: string;
  response: Record<string, unknown>;
  name?: string;
}

export interface FinishRegistrationResult {
  credential: StoredCredential;
}

export async function finishRegistration({
  userId,
  challengeId,
  response,
  name,
}: FinishRegistrationParams): Promise<FinishRegistrationResult> {
  const config = getConfig().webauthn;
  const pending = takeChallenge(challengeId, 'register');
  if (!pending) {
    throw new WebAuthnError('Registration challenge missing, expired, or already used', 'CHALLENGE_INVALID');
  }
  if (pending.userId !== userId) {
    throw new WebAuthnError('Registration challenge was issued for a different user', 'CHALLENGE_MISMATCH');
  }

  const verification = await verifyRegistrationResponse({
    response: response as unknown as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge: pending.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserPresence: true,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new WebAuthnError('Registration verification failed', 'VERIFICATION_FAILED');
  }

  const { credential } = verification.registrationInfo;
  const credentialId = credential.id;
  const counter = credential.counter;
  const existing = await findActiveCredential(credentialId);
  if (existing) {
    throw new WebAuthnError('Credential already registered', 'CREDENTIAL_EXISTS');
  }

  const row = {
    id: crypto.randomUUID(),
    userId,
    credentialId,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    name: name ?? null,
    createdAt: new Date(),
    revokedAt: null,
  };

  await db.insert(webauthnCredentials).values(row).run();

  return { credential: toStoredCredential(row) };
}

// ─── Assertion ceremony (kill authorization) ────────────────────────

export interface StartAssertionParams {
  userId?: string;      // optional: if omitted, any registered credential may assert
  action: string;       // 'kill:machine:<id>' | 'kill:fleet' | 'policy-change:<flagKey>'
}

export interface StartAssertionResult {
  options: Record<string, unknown>;
  challengeId: string;
}

export async function startAssertion({
  userId,
  action,
}: StartAssertionParams): Promise<StartAssertionResult> {
  const config = getConfig().webauthn;

  let allowCredentials: { id: string; transports: string[] }[] | undefined;
  if (userId) {
    const creds = await listActiveCredentialsForUser(userId);
    allowCredentials = creds.map((c) => ({
      id: c.credentialId,
      transports: c.transports ?? [],
    }));
    if (allowCredentials.length === 0) {
      throw new WebAuthnError('No registered authenticators for this user', 'NO_CREDENTIALS');
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: allowCredentials as { id: string; transports?: ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid' | 'cable' | 'smart-card')[] }[] | undefined,
    timeout: 60_000,
    userVerification: 'required',
  });

  const challengeId = randomBytes(16).toString('hex');
  storeChallenge({
    id: challengeId,
    challenge: options.challenge,
    purpose: 'assert',
    userId: userId ?? '',
    action,
    createdAt: Date.now(),
  });

  return { options: options as unknown as Record<string, unknown>, challengeId };
}

export interface FinishAssertionParams {
  challengeId: string;
  response: Record<string, unknown>;
}

export interface FinishAssertionResult {
  verified: boolean;
  assertionToken: AssertionToken;
  userId: string;
  credentialId: string;
}

export async function finishAssertion({
  challengeId,
  response,
}: FinishAssertionParams): Promise<FinishAssertionResult> {
  const config = getConfig().webauthn;
  const pending = takeChallenge(challengeId, 'assert');
  if (!pending) {
    throw new WebAuthnError('Assertion challenge missing, expired, or already used', 'CHALLENGE_INVALID');
  }
  if (!pending.action) {
    throw new WebAuthnError('Assertion challenge missing bound action', 'CHALLENGE_INVALID');
  }

  const authResponse = response as unknown as Parameters<typeof verifyAuthenticationResponse>[0]['response'];
  const credential = await findActiveCredential(authResponse.id);
  if (!credential) {
    throw new WebAuthnError('Unknown or revoked credential', 'CREDENTIAL_UNKNOWN');
  }
  if (pending.userId && credential.userId !== pending.userId) {
    throw new WebAuthnError('Credential does not belong to the challenge user', 'CREDENTIAL_MISMATCH');
  }

  const verification = await verifyAuthenticationResponse({
    response: authResponse,
    expectedChallenge: pending.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: {
      id: credential.credentialId,
      publicKey: isoBase64URL.toBuffer(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []) as ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid' | 'cable' | 'smart-card')[],
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new WebAuthnError('Assertion verification failed', 'VERIFICATION_FAILED');
  }

  // Replay detection: authenticator counter must be strictly greater
  // than the last seen counter for this credential.
  const { newCounter } = verification.authenticationInfo;
  if (newCounter <= credential.counter) {
    throw new WebAuthnError('Credential counter did not advance — possible replay', 'REPLAY_DETECTED');
  }

  await db
    .update(webauthnCredentials)
    .set({ counter: newCounter })
    .where(eq(webauthnCredentials.id, credential.id))
    .run();

  const assertionToken = mintAssertionToken(credential.userId, credential.credentialId, pending.action);

  return {
    verified: true,
    assertionToken,
    userId: credential.userId,
    credentialId: credential.credentialId,
  };
}

// ─── Login assertion ceremony (sign-in with security key) ─────────────
//
// Unlike the kill-authorization assertion above, the login assertion runs
// BEFORE the user has a session — it is the second factor (or sole factor)
// that signs them in. It does NOT require a session cookie.

export interface StartLoginAssertionParams {
  username?: string; // optional email — scopes allowCredentials to that user's keys
}

export interface StartLoginAssertionResult {
  options: Record<string, unknown>;
  challengeId: string;
}

export async function startLoginAssertion({
  username,
}: StartLoginAssertionParams): Promise<StartLoginAssertionResult> {
  const config = getConfig().webauthn;

  let allowCredentials: { id: string; transports: string[] }[] | undefined;
  if (username) {
    const user = await findUserByEmail(username);
    if (!user) {
      throw new WebAuthnError('Unknown user', 'USER_NOT_FOUND');
    }
    const creds = await listActiveCredentialsForUser(user.id);
    allowCredentials = creds.map((c) => ({
      id: c.credentialId,
      transports: c.transports ?? [],
    }));
    if (allowCredentials.length === 0) {
      throw new WebAuthnError('No registered authenticators for this user', 'NO_CREDENTIALS');
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: allowCredentials as { id: string; transports?: ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid' | 'cable' | 'smart-card')[] }[] | undefined,
    timeout: 60_000,
    userVerification: 'required',
  });

  const challengeId = randomBytes(16).toString('hex');
  storeChallenge({
    id: challengeId,
    challenge: options.challenge,
    purpose: 'login',
    userId: '',
    action: 'login',
    createdAt: Date.now(),
  });

  return { options: options as unknown as Record<string, unknown>, challengeId };
}

export interface FinishLoginAssertionParams {
  challengeId: string;
  response: Record<string, unknown>;
}

export interface FinishLoginAssertionResult {
  verified: boolean;
  userId: string;
  email: string;
  name: string;
  credentialId: string;
  sessionCookie: string; // signed better-auth.session_token cookie value
}

export async function finishLoginAssertion({
  challengeId,
  response,
}: FinishLoginAssertionParams): Promise<FinishLoginAssertionResult> {
  const config = getConfig().webauthn;
  const pending = takeChallenge(challengeId, 'login');
  if (!pending) {
    throw new WebAuthnError('Login challenge missing, expired, or already used', 'CHALLENGE_INVALID');
  }

  const authResponse = response as unknown as Parameters<typeof verifyAuthenticationResponse>[0]['response'];
  const credential = await findActiveCredential(authResponse.id);
  if (!credential) {
    throw new WebAuthnError('Unknown or revoked credential', 'CREDENTIAL_UNKNOWN');
  }

  const verification = await verifyAuthenticationResponse({
    response: authResponse,
    expectedChallenge: pending.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: {
      id: credential.credentialId,
      publicKey: isoBase64URL.toBuffer(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []) as ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid' | 'cable' | 'smart-card')[],
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new WebAuthnError('Login assertion verification failed', 'VERIFICATION_FAILED');
  }

  // Replay detection: authenticator counter must advance.
  const { newCounter } = verification.authenticationInfo;
  if (newCounter <= credential.counter) {
    throw new WebAuthnError('Credential counter did not advance — possible replay', 'REPLAY_DETECTED');
  }

  await db
    .update(webauthnCredentials)
    .set({ counter: newCounter })
    .where(eq(webauthnCredentials.id, credential.id))
    .run();

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, credential.userId))
    .get();
  if (!user) {
    throw new WebAuthnError('Credential owner no longer exists', 'USER_NOT_FOUND');
  }

  const sessionCookie = await mintSessionCookie(credential.userId);

  return {
    verified: true,
    userId: credential.userId,
    email: user.email,
    name: user.name ?? user.email,
    credentialId: credential.credentialId,
    sessionCookie,
  };
}

// ─── Token verification for downstream endpoints ────────────────────

export interface VerifyAssertionTokenParams {
  token: string;
  action: string; // exact action the token must be bound to
}

export interface VerifiedAssertion {
  userId: string;
  credentialId: string;
  action: string;
}

export function verifyAssertionTokenForAction({
  token,
  action,
}: VerifyAssertionTokenParams): VerifiedAssertion {
  const payload = verifyAssertionToken(token);
  if (!payload) {
    throw new WebAuthnError('Invalid or expired assertion token', 'TOKEN_INVALID');
  }
  if (payload.action !== action) {
    throw new WebAuthnError('Assertion token is bound to a different action', 'TOKEN_ACTION_MISMATCH');
  }
  return { userId: payload.sub, credentialId: payload.cred, action: payload.action };
}

// ─── Errors ─────────────────────────────────────────────────────────

export class WebAuthnError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'WebAuthnError';
    this.code = code;
  }
}

// ─── Test hooks (exported for unit tests) ───────────────────────────

export const __test = {
  challengeStore,
  takeChallenge,
  verifyAssertionToken,
  mintAssertionToken,
};
