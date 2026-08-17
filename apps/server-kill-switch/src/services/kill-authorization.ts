/**
 * Kill Authorization Service — Quorum Workflow (ADR-136 §3, §5, §6)
 *
 * Implements the human-signature kill authorization state machine:
 *
 *   single mode:  one WebAuthn assertion → request EXECUTED immediately
 *   quorum mode:  assertion #1 → PENDING_QUORUM
 *                 assertion #2 (distinct human) → threshold met → EXECUTE
 *
 * Rules enforced:
 *  - The initiator cannot be the sole approver (needs ≥1 OTHER distinct
 *    human when threshold > 1).
 *  - Requests expire after `kill.authorization.timeoutMs` (default 10 min).
 *  - Every signature event is recorded in the request's signatures array
 *    (mirrored to the immutable audit log by the route layer).
 *  - Quorum-gated policy changes (ADR-136 §6): changing any
 *    `kill.authorization.*` flag requires the CURRENT threshold — the
 *    threshold of the mode in effect, never the proposed one.
 *
 * The service is executor-injected so the route layer owns the actual
 * side effects (kill-switch transition, flag update) and tests can mock
 * them.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { killAuthorizationRequests, settings as settingsTable } from '../db/schema';

// ─── Types ──────────────────────────────────────────────────────────

export type KillAuthorizationMode = 'single' | 'quorum';
export type KillAuthorizationStatus = 'PENDING_QUORUM' | 'EXECUTED' | 'EXPIRED' | 'REJECTED';
export type KillAuthorizationAction = 'kill' | 'policy-change';

export interface KillSignature {
  userId: string;
  credentialId: string;
  at: string; // ISO timestamp
  // Kill requests carry the execution intent on the initiator signature:
  state?: string;
  reason?: string;
  ip?: string;
  // Policy-change requests carry the proposed value on the first signature:
  proposedValue?: string;
}

export interface KillAuthorizationRequest {
  id: string;
  action: KillAuthorizationAction;
  target: string;
  initiatedBy: string;
  initiatedByCredentialId: string;
  initiatedAt: Date;
  status: KillAuthorizationStatus;
  signatures: KillSignature[];
  executedAt: Date | null;
  timeoutMs: number;
}

export interface KillAuthorizationExecutor {
  executeKill(params: { state: string; reason: string; userId: string; ip: string }): Promise<unknown>;
  applyPolicyChange(params: { flagKey: string; value: string; userId: string }): Promise<unknown>;
}

export interface InitiateKillParams {
  action: 'kill';
  target: string;          // machine id or 'fleet'
  state: string;           // target kill-switch state (STOPPED, LOCKED, ...)
  reason: string;
  userId: string;
  credentialId: string;
  ip?: string;
}

export interface InitiatePolicyChangeParams {
  flagKey: string;
  proposedValue: string;
  userId: string;
  credentialId: string;
}

export interface ApproveParams {
  requestId: string;
  userId: string;
  credentialId: string;
  ip?: string;
}

// ─── Settings helpers (kill.authorization.* flags) ──────────────────

const SETTING_MODE = 'kill.authorization.mode';
const SETTING_QUORUM = 'kill.authorization.quorum';
const SETTING_TIMEOUT = 'kill.authorization.timeoutMs';

export const KILL_AUTHORIZATION_FLAG_PREFIX = 'kill.authorization.';

export function isKillAuthorizationFlag(flagKey: string): boolean {
  return flagKey.startsWith(KILL_AUTHORIZATION_FLAG_PREFIX);
}

async function getSetting(key: string): Promise<string | null> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .get();
  return row?.value ?? null;
}

export async function getAuthorizationMode(): Promise<KillAuthorizationMode> {
  const mode = await getSetting(SETTING_MODE);
  return mode === 'quorum' ? 'quorum' : 'single';
}

export async function getQuorumThreshold(): Promise<number> {
  const raw = await getSetting(SETTING_QUORUM);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

export async function getAuthorizationTimeoutMs(): Promise<number> {
  const raw = await getSetting(SETTING_TIMEOUT);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 600_000;
}

// ─── Row mapping ────────────────────────────────────────────────────

function toRequest(row: typeof killAuthorizationRequests.$inferSelect): KillAuthorizationRequest {
  return {
    id: row.id,
    action: row.action as KillAuthorizationAction,
    target: row.target,
    initiatedBy: row.initiatedBy,
    initiatedByCredentialId: row.initiatedByCredentialId,
    initiatedAt: row.initiatedAt,
    status: row.status as KillAuthorizationStatus,
    signatures: JSON.parse(row.signatures) as KillSignature[],
    executedAt: row.executedAt,
    timeoutMs: row.timeoutMs,
  };
}

// A minimal structural handle for the DB or a transaction — both the
// global `db` (BunSQLiteDatabase) and a `db.transaction` callback's `tx`
// (SQLiteTransaction) expose the same select/update builders used here.
type DbLike = {
  select: typeof db.select;
  update: typeof db.update;
};

async function loadRequest(requestId: string, dbLike: DbLike = db): Promise<KillAuthorizationRequest | null> {
  const row = await dbLike
    .select()
    .from(killAuthorizationRequests)
    .where(eq(killAuthorizationRequests.id, requestId))
    .get();
  return row ? toRequest(row) : null;
}

async function saveRequest(request: KillAuthorizationRequest, dbLike: DbLike = db): Promise<void> {
  await dbLike
    .update(killAuthorizationRequests)
    .set({
      status: request.status,
      signatures: JSON.stringify(request.signatures),
      executedAt: request.executedAt,
    })
    .where(eq(killAuthorizationRequests.id, request.id))
    .run();
}

// ─── Quorum helpers ─────────────────────────────────────────────────

function distinctApproverCount(request: KillAuthorizationRequest): number {
  return new Set(request.signatures.map((s) => s.userId)).size;
}

function isThresholdMet(request: KillAuthorizationRequest, threshold: number): boolean {
  const distinct = distinctApproverCount(request);
  if (distinct < threshold) return false;
  // ADR-136 §3: the initiating human cannot also be the sole approver —
  // when threshold > 1 there must be at least one OTHER distinct human.
  if (threshold > 1 && distinct === 1) return false;
  return true;
}

function isExpired(request: KillAuthorizationRequest, now: number): boolean {
  return now - request.initiatedAt.getTime() > request.timeoutMs;
}

// ─── Request lifecycle ──────────────────────────────────────────────

export async function expireStaleRequests(now: number = Date.now()): Promise<number> {
  const rows = await db
    .select()
    .from(killAuthorizationRequests)
    .where(eq(killAuthorizationRequests.status, 'PENDING_QUORUM'))
    .all();

  let expired = 0;
  for (const row of rows) {
    const request = toRequest(row);
    if (isExpired(request, now)) {
      request.status = 'EXPIRED';
      await saveRequest(request);
      expired++;
    }
  }
  return expired;
}

async function createRequest(
  params: {
    action: KillAuthorizationAction;
    target: string;
    userId: string;
    credentialId: string;
    timeoutMs: number;
    firstSignature: KillSignature;
  },
): Promise<KillAuthorizationRequest> {
  const request: KillAuthorizationRequest = {
    id: crypto.randomUUID(),
    action: params.action,
    target: params.target,
    initiatedBy: params.userId,
    initiatedByCredentialId: params.credentialId,
    initiatedAt: new Date(),
    status: 'PENDING_QUORUM',
    signatures: [params.firstSignature],
    executedAt: null,
    timeoutMs: params.timeoutMs,
  };

  await db.insert(killAuthorizationRequests).values({
    id: request.id,
    action: request.action,
    target: request.target,
    initiatedBy: request.initiatedBy,
    initiatedByCredentialId: request.initiatedByCredentialId,
    initiatedAt: request.initiatedAt,
    status: request.status,
    signatures: JSON.stringify(request.signatures),
    executedAt: null,
    timeoutMs: request.timeoutMs,
  }).run();

  return request;
}

// ─── Kill initiation ────────────────────────────────────────────────

export interface InitiateKillResult {
  request: KillAuthorizationRequest;
  executed: boolean;
  mode: KillAuthorizationMode;
}

export async function initiateKill(
  params: InitiateKillParams,
  executor: KillAuthorizationExecutor,
): Promise<InitiateKillResult> {
  const mode = await getAuthorizationMode();
  const timeoutMs = await getAuthorizationTimeoutMs();

  const firstSignature: KillSignature = {
    userId: params.userId,
    credentialId: params.credentialId,
    at: new Date().toISOString(),
    state: params.state,
    reason: params.reason,
    ip: params.ip,
  };

  if (mode === 'single') {
    // Single mode: one human signature is sufficient — execute immediately.
    const request = await createRequest({
      action: 'kill',
      target: params.target,
      userId: params.userId,
      credentialId: params.credentialId,
      timeoutMs,
      firstSignature,
    });
    request.status = 'EXECUTED';
    request.executedAt = new Date();
    await saveRequest(request);

    await executor.executeKill({
      state: params.state,
      reason: params.reason,
      userId: params.userId,
      ip: params.ip ?? 'unknown',
    });

    return { request, executed: true, mode };
  }

  // Quorum mode: request enters PENDING_QUORUM awaiting a second signature.
  const request = await createRequest({
    action: 'kill',
    target: params.target,
    userId: params.userId,
    credentialId: params.credentialId,
    timeoutMs,
    firstSignature,
  });

  return { request, executed: false, mode };
}

// ─── Quorum approval ────────────────────────────────────────────────

export interface ApproveResult {
  request: KillAuthorizationRequest;
  executed: boolean;
  threshold: number;
}

export async function approve(
  params: ApproveParams,
  executor: KillAuthorizationExecutor,
): Promise<ApproveResult> {
  const request = await loadRequest(params.requestId);
  if (!request) {
    throw new KillAuthorizationError('Authorization request not found', 'REQUEST_NOT_FOUND');
  }
  if (request.status !== 'PENDING_QUORUM') {
    throw new KillAuthorizationError(
      `Request is not awaiting approval (status: ${request.status})`,
      'REQUEST_NOT_APPROVABLE',
    );
  }
  if (isExpired(request, Date.now())) {
    request.status = 'EXPIRED';
    await saveRequest(request);
    throw new KillAuthorizationError('Authorization request expired', 'REQUEST_EXPIRED');
  }

  // A human may sign once per request (no double-counting).
  const alreadySigned = request.signatures.some(
    (s) => s.userId === params.userId && s.credentialId === params.credentialId,
  );
  if (alreadySigned) {
    throw new KillAuthorizationError('This credential already signed the request', 'ALREADY_SIGNED');
  }

  request.signatures.push({
    userId: params.userId,
    credentialId: params.credentialId,
    at: new Date().toISOString(),
    ip: params.ip,
  });

  const threshold = await getQuorumThreshold();
  if (isThresholdMet(request, threshold)) {
    // ADR-136 atomicity: the status update (EXECUTED) and the executor
    // side-effect (kill transition / policy change) must be atomic. If the
    // executor fails, the transaction rolls back — the request stays
    // PENDING_QUORUM with its signatures preserved, so a retry can
    // re-attempt. Without this, a failure would leave the request marked
    // EXECUTED while the kill was never applied.
    return await db.transaction(async (tx): Promise<ApproveResult> => {
      request.status = 'EXECUTED';
      request.executedAt = new Date();
      await saveRequest(request, tx);

      if (request.action === 'kill') {
        const initiator = request.signatures[0];
        await executor.executeKill({
          state: initiator.state ?? 'STOPPED',
          reason: initiator.reason ?? 'Quorum kill authorization',
          userId: params.userId,
          ip: params.ip ?? 'unknown',
        });
      } else {
        const initiator = request.signatures[0];
        await executor.applyPolicyChange({
          flagKey: request.target,
          value: initiator.proposedValue ?? '',
          userId: params.userId,
        });
      }

      return { request, executed: true, threshold };
    });
  }

  await saveRequest(request);
  return { request, executed: false, threshold };
}

// ─── Quorum-gated policy changes (ADR-136 §6) ───────────────────────

export interface PolicyChangeResult {
  request: KillAuthorizationRequest;
  executed: boolean;
  mode: KillAuthorizationMode;
  threshold: number;
}

/**
 * Initiate (or continue) a quorum-gated change to a `kill.authorization.*`
 * flag. The threshold applied is ALWAYS the current mode's threshold —
 * never the proposed one (prevents lowering the bar before the change).
 */
export async function initiatePolicyChange(
  params: InitiatePolicyChangeParams,
  executor: KillAuthorizationExecutor,
): Promise<PolicyChangeResult> {
  const mode = await getAuthorizationMode();
  const threshold = await getQuorumThreshold();
  const timeoutMs = await getAuthorizationTimeoutMs();

  const firstSignature: KillSignature = {
    userId: params.userId,
    credentialId: params.credentialId,
    at: new Date().toISOString(),
    proposedValue: params.proposedValue,
  };

  if (mode === 'single') {
    const request = await createRequest({
      action: 'policy-change',
      target: params.flagKey,
      userId: params.userId,
      credentialId: params.credentialId,
      timeoutMs,
      firstSignature,
    });
    request.status = 'EXECUTED';
    request.executedAt = new Date();
    await saveRequest(request);

    await executor.applyPolicyChange({
      flagKey: params.flagKey,
      value: params.proposedValue,
      userId: params.userId,
    });

    return { request, executed: true, mode, threshold };
  }

  // Quorum mode: single-signature requests are REJECTED unless the
  // threshold is met by distinct humans (ADR-136 §6 enforcement).
  const request = await createRequest({
    action: 'policy-change',
    target: params.flagKey,
    userId: params.userId,
    credentialId: params.credentialId,
    timeoutMs,
    firstSignature,
  });

  if (isThresholdMet(request, threshold)) {
    request.status = 'EXECUTED';
    request.executedAt = new Date();
    await saveRequest(request);
    await executor.applyPolicyChange({
      flagKey: params.flagKey,
      value: params.proposedValue,
      userId: params.userId,
    });
    return { request, executed: true, mode, threshold };
  }

  return { request, executed: false, mode, threshold };
}

// ─── Queries ────────────────────────────────────────────────────────

export async function listRequests(limit = 50): Promise<KillAuthorizationRequest[]> {
  const rows = await db
    .select()
    .from(killAuthorizationRequests)
    .orderBy(killAuthorizationRequests.initiatedAt)
    .limit(limit)
    .all();
  return rows.map(toRequest);
}

export async function getRequest(requestId: string): Promise<KillAuthorizationRequest | null> {
  return loadRequest(requestId);
}

export async function listPendingRequests(): Promise<KillAuthorizationRequest[]> {
  const rows = await db
    .select()
    .from(killAuthorizationRequests)
    .where(eq(killAuthorizationRequests.status, 'PENDING_QUORUM'))
    .all();
  return rows.map(toRequest);
}

// ─── Errors ─────────────────────────────────────────────────────────

export class KillAuthorizationError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'KillAuthorizationError';
    this.code = code;
  }
}
