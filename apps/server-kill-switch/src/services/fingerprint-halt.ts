/**
 * Fingerprint-Scoped Traffic Halt — per-fingerprint blocklist (P1-1).
 *
 * Andler's refinement over the original "UNSAFE → global STOPPED" rule:
 * a single UNSAFE verdict must NOT flip the global kill_switch_state.
 * Instead, traffic is halted for THE FINGERPRINT THAT PRODUCED THE UNSAFE
 * OUTPUT — the rest of the fleet keeps flowing.
 *
 * Fingerprint derivation priority (per request):
 *   1. explicit `machineId` / `sessionId` in the request body or headers
 *      (Ollama request bodies carry `options`; opencode/openclaw may not —
 *      we check body fields first, then headers)
 *   2. API-key identity (the X-API-Key / PCA key on the 11435/8080 lanes)
 *   3. IP + user-agent hash fallback
 *
 * SPOOFABILITY TRADEOFF: machineId/sessionId are CLIENT-CONTROLLED (body or
 * header) and take priority over the stable, authenticated apiKey. They are
 * the most GRANULAR identity signal, not the strongest — a compromised
 * client can rotate machineId to evade a scoped block. The escalation
 * backstop covers this: sustained rotation produces >=2 distinct active
 * UNSAFE fingerprints inside the eval window, which triggers the global
 * STOPPED transition (see shouldEscalateToGlobal). The apiKey lane is the
 * authenticated identity; prefer it when machineId cannot be trusted.
 *
 * Scoped-pause semantics:
 *   - A blocked fingerprint's generation requests are rejected with 503
 *     (checked in inference-gate BEFORE the global isTrafficPaused()).
 *   - The global kill_switch_state (single-row ARMED/RUNNING/STOPPING/
 *     STOPPED/LOCKED) stays reserved for manual stops and the escalation
 *     rule — NEVER flipped on a single UNSAFE.
 *   - Escalation to global STOPPED ONLY when ALL active fingerprints show
 *     UNSAFE in the eval window (i.e. the whole fleet is compromised).
 *   - Self-heal: a blocked fingerprint re-enters when a later request from
 *     it verifies SAFE, or after the block TTL expires.
 *
 * Persistence: the fingerprint identifier is threaded into
 * verification_event.machineId so the audit trail records which identity
 * was halted (see verification-event.ts).
 */

import { createHash } from 'node:crypto';

// ─── Config ─────────────────────────────────────────────────────────

/** How long a fingerprint stays blocked before TTL self-heal (default 10 min). */
export const FINGERPRINT_BLOCK_TTL_MS = 10 * 60_000;

/**
 * Eval window for the all-UNSAFE escalation rule. UNSAFE verdicts older
 * than this are not counted as "active" fingerprints.
 */
export const FINGERPRINT_EVAL_WINDOW_MS = 5 * 60_000;

/** Minimum number of distinct UNSAFE fingerprints before escalation is even considered. */
export const FINGERPRINT_ESCALATION_MIN_ACTIVE = 2;

// ─── Types ─────────────────────────────────────────────────────────

export interface FingerprintSource {
  /** Explicit machineId from body/header (highest priority). */
  machineId?: string;
  /** Explicit sessionId from body/header. */
  sessionId?: string;
  /** API-key identity (X-API-Key on the proxy lanes). */
  apiKey?: string;
  /** Client IP (fallback). */
  ip?: string;
  /** User-Agent (fallback, hashed with IP). */
  userAgent?: string;
}

export interface FingerprintBlock {
  fingerprint: string;
  source: 'machineId' | 'sessionId' | 'apiKey' | 'ip-ua';
  blockedAt: number;
  expiresAt: number;
  unsafeCount: number;
}

export interface FingerprintHaltState {
  /** Fingerprint → block record. */
  blocks: Map<string, FingerprintBlock>;
  /** Fingerprint → last UNSAFE verdict timestamps (for the eval window). */
  unsafeHistory: Map<string, number[]>;
}

// ─── Module state (in-memory; single process — the kill-switch is one container) ──

let _blocks = new Map<string, FingerprintBlock>();
let _unsafeHistory = new Map<string, number[]>();

// ─── Fingerprint derivation ────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Build a FingerprintSource from the raw request parts (body + headers + ip).
 * Shared by the inference-gate check (index.ts) and the proxy route so the
 * fingerprint derivation can never drift between the two call sites.
 *
 * Header names are checked case-insensitively (Node lowercases incoming
 * headers, but the mock/tests may not).
 */
export function fingerprintSourceFromParts(opts: {
  body?: { machineId?: string; sessionId?: string } | null;
  headers?: Record<string, string | undefined>;
  ip?: string;
}): FingerprintSource {
  const headers = opts.headers ?? {};
  const body = opts.body ?? null;
  const machineId =
    body?.machineId ??
    headers['x-machine-id'] ??
    headers['X-Machine-Id'];
  const sessionId =
    body?.sessionId ??
    headers['x-session-id'] ??
    headers['X-Session-Id'];
  return {
    machineId,
    sessionId,
    apiKey: headers['x-api-key'] ?? headers['X-API-Key'],
    ip: opts.ip,
    userAgent: headers['user-agent'] ?? headers['User-Agent'],
  };
}

/**
 * Derive a stable fingerprint for a request.
 *
 * Priority:
 *   1. machineId (body or header) — the most GRANULAR identity signal
 *      (client-controlled; see the spoofability tradeoff in the module
 *      header — NOT the strongest signal, the apiKey lane is)
 *   2. sessionId (body or header)
 *   3. API-key identity (X-API-Key header — the PCA key on the proxy lanes)
 *   4. IP + user-agent hash (weakest, but always available)
 *
 * The fingerprint is a sha256 hex string so it can be stored in
 * verification_event.machineId without leaking raw identity values.
 */
export function deriveFingerprint(source: FingerprintSource): {
  fingerprint: string;
  source: 'machineId' | 'sessionId' | 'apiKey' | 'ip-ua';
} {
  if (source.machineId && source.machineId.trim().length > 0) {
    return { fingerprint: `fp:${sha256(`machineId:${source.machineId.trim()}`)}`, source: 'machineId' };
  }
  if (source.sessionId && source.sessionId.trim().length > 0) {
    return { fingerprint: `fp:${sha256(`sessionId:${source.sessionId.trim()}`)}`, source: 'sessionId' };
  }
  if (source.apiKey && source.apiKey.trim().length > 0) {
    return { fingerprint: `fp:${sha256(`apiKey:${source.apiKey.trim()}`)}`, source: 'apiKey' };
  }
  const ip = source.ip ?? 'unknown';
  const ua = source.userAgent ?? '';
  return { fingerprint: `fp:${sha256(`ip:${ip}|ua:${ua}`)}`, source: 'ip-ua' };
}

// ─── Blocklist operations ──────────────────────────────────────────

/**
 * Is this fingerprint currently blocked?
 * Expired blocks are lazily evicted (TTL self-heal).
 */
export function isFingerprintBlocked(fingerprint: string): boolean {
  const block = _blocks.get(fingerprint);
  if (!block) return false;
  if (Date.now() >= block.expiresAt) {
    _blocks.delete(fingerprint);
    return false;
  }
  return true;
}

/**
 * Block a fingerprint for the TTL. Idempotent — re-blocking refreshes
 * the expiry and increments the unsafe count.
 *
 * @param ttlMs override the block TTL (default FINGERPRINT_BLOCK_TTL_MS).
 *   Tests use a short TTL to exercise the expiry self-heal.
 */
export function blockFingerprint(
  fingerprint: string,
  source: FingerprintBlock['source'],
  ttlMs: number = FINGERPRINT_BLOCK_TTL_MS,
): FingerprintBlock {
  const now = Date.now();
  const existing = _blocks.get(fingerprint);
  const block: FingerprintBlock = {
    fingerprint,
    source,
    blockedAt: existing?.blockedAt ?? now,
    expiresAt: now + ttlMs,
    unsafeCount: (existing?.unsafeCount ?? 0) + 1,
  };
  _blocks.set(fingerprint, block);
  return block;
}

/**
 * Unblock a fingerprint (SAFE-verdict self-heal or manual).
 */
export function unblockFingerprint(fingerprint: string): void {
  _blocks.delete(fingerprint);
}

/**
 * Record an UNSAFE verdict for a fingerprint (for the escalation eval window).
 */
export function recordUnsafeVerdict(fingerprint: string): void {
  const now = Date.now();
  const history = _unsafeHistory.get(fingerprint) ?? [];
  history.push(now);
  // Prune entries outside the eval window.
  const cutoff = now - FINGERPRINT_EVAL_WINDOW_MS;
  _unsafeHistory.set(
    fingerprint,
    history.filter((t) => t >= cutoff),
  );
}

/**
 * Record a SAFE verdict for a fingerprint — clears its unsafe history
 * (a later SAFE verdict means the fingerprint is behaving again).
 */
export function recordSafeVerdict(fingerprint: string): void {
  _unsafeHistory.delete(fingerprint);
}

/**
 * Escalation check: should the GLOBAL kill-switch be STOPPED?
 *
 * Rule: ALL active fingerprints (those with an UNSAFE verdict inside the
 * eval window) must be blocked, AND there must be at least
 * FINGERPRINT_ESCALATION_MIN_ACTIVE of them. If only one fingerprint is
 * compromised, stay scoped — the rest of the fleet keeps running.
 */
export function shouldEscalateToGlobal(): boolean {
  const now = Date.now();
  const cutoff = now - FINGERPRINT_EVAL_WINDOW_MS;

  // Active = fingerprints with an UNSAFE verdict inside the eval window.
  const active: string[] = [];
  for (const [fp, timestamps] of _unsafeHistory) {
    const recent = timestamps.filter((t) => t >= cutoff);
    if (recent.length > 0) active.push(fp);
  }

  if (active.length < FINGERPRINT_ESCALATION_MIN_ACTIVE) return false;

  // ALL active fingerprints must be blocked.
  return active.every((fp) => isFingerprintBlocked(fp));
}

/**
 * Get the current blocklist snapshot (observability + tests).
 */
export function getFingerprintBlocks(): FingerprintBlock[] {
  return [..._blocks.values()].map((b) => ({ ...b }));
}

/**
 * Get the current unsafe-history snapshot (observability + tests).
 */
export function getUnsafeHistory(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [fp, timestamps] of _unsafeHistory) {
    out[fp] = [...timestamps];
  }
  return out;
}

/**
 * Reset all fingerprint-halt state. Test-only helper.
 */
export function resetFingerprintHaltState(): void {
  _blocks = new Map();
  _unsafeHistory = new Map();
}

/**
 * Prune expired blocks and stale unsafe history (housekeeping).
 * Called opportunistically on each check; cheap for small maps.
 */
export function pruneFingerprintHaltState(): void {
  const now = Date.now();
  for (const [fp, block] of _blocks) {
    if (now >= block.expiresAt) _blocks.delete(fp);
  }
  const cutoff = now - FINGERPRINT_EVAL_WINDOW_MS;
  for (const [fp, timestamps] of _unsafeHistory) {
    const recent = timestamps.filter((t) => t >= cutoff);
    if (recent.length === 0) _unsafeHistory.delete(fp);
    else _unsafeHistory.set(fp, recent);
  }
}
