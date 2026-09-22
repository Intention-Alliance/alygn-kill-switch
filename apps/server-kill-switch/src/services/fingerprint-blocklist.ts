/**
 * Fingerprint Blocklist — pure-logic layer (no DB dependency).
 *
 * Extracted from `fingerprint-pause.ts` so tests can import the
 * blocklist helpers WITHOUT dragging in Drizzle (`gt`/`eq`/`and`/
 * `isNotNull` operators) — which gets clobbered when other test files
 * mock `drizzle-orm` with stripped exports. The DB-dependent
 * escalation logic remains in `fingerprint-pause.ts`.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §d (P1-1 fingerprint-scoped variant).
 */

import { createHash } from 'node:crypto'

// ─── Constants ────────────────────────────────────────────────────

/**
 * Self-heal TTL for a fingerprint block. After this many milliseconds
 * the block is automatically lifted so a missed verifier reply never
 * permanently bans a fingerprint. 5 minutes is enough for the verifier
 * to land a follow-up verdict; longer than a typical inference round-
 * trip; short enough that transient bans don't pile up.
 */
export const FINGERPRINT_BLOCK_TTL_MS = 5 * 60 * 1000

// ─── Types ────────────────────────────────────────────────────────

export interface BlockedFingerprint {
	fingerprint: string
	reason: string
	blockedAt: number
	/** Expires at `blockedAt + FINGERPRINT_BLOCK_TTL_MS`. */
	expiresAt: number
	/** Number of UNSAFE verdicts that contributed to this block. */
	unsafeCount: number
}

export interface FingerprintSource {
	body?: { machineId?: string; sessionId?: string; fingerprint?: string } | null
	headers?: Record<string, string | string[] | undefined>
	ip?: string
}

// ─── Module-level state ──────────────────────────────────────────

const _blocks = new Map<string, BlockedFingerprint>()

/** Test-only reset (mirrors `resetTrafficPauseState`). */
export function resetFingerprintPauseState(): void {
	_blocks.clear()
}

/** Number of currently blocked fingerprints (for tests + dashboard). */
export function getBlockedFingerprintCount(): number {
	return _blocks.size
}

/** Snapshot of all currently blocked fingerprints (read-only). */
export function getBlockedFingerprints(): readonly BlockedFingerprint[] {
	return [..._blocks.values()]
}

// ─── Fingerprint derivation ──────────────────────────────────────

/**
 * Derive a fingerprint from a request. Priority order:
 *   1. Body.machineId (the machine that issued the inference)
 *   2. Body.sessionId / Body.fingerprint
 *   3. Header `x-fingerprint` (sent by the openclaw-webhook or the
 *      orchestrator that knows the session identity)
 *   4. API-key identity (the kill-switch API key or PCA key)
 *   5. Source IP + User-Agent hash (fallback when no explicit identity
 *      is present)
 *
 * Returns "" when no identity signal is available. Callers should
 * treat "" as "unknown caller" — the gate can choose to default-allow
 * (we don't block unknowns because we can't identify them) or
 * default-deny.
 *
 * The IP+UA fallback uses a SHA-256 hash so we don't persist raw IPs
 * in the in-memory blocklist. The IP is only used inside the hash.
 */
export function deriveFingerprint(src: FingerprintSource): string {
	const body = src.body ?? null
	// 1. Body machineId
	if (body?.machineId?.trim()) {
		return `machine:${body.machineId.trim()}`
	}
	// 2. Body sessionId / fingerprint
	if (body?.sessionId?.trim()) {
		return `session:${body.sessionId.trim()}`
	}
	if (body?.fingerprint?.trim()) {
		return `fp:${body.fingerprint.trim()}`
	}
	// 3. Header x-fingerprint
	const headerFp = getHeader(src.headers, 'x-fingerprint')
	if (headerFp) {
		return `fp:${headerFp}`
	}
	// 4. API-key identity (kill-switch or PCA key)
	const apiKey = getHeader(src.headers, 'x-api-key')
	if (apiKey) {
		return `apikey:${shortHash(apiKey)}`
	}
	const auth = getHeader(src.headers, 'authorization')
	if (auth) {
		// Strip the "Bearer " prefix so we don't hash the literal word.
		const token = auth.replace(/^Bearer\s+/i, '')
		return `bearer:${shortHash(token)}`
	}
	// 5. IP + UA fallback
	if (src.ip) {
		const ua = getHeader(src.headers, 'user-agent') ?? ''
		return `ipua:${shortHash(`${src.ip}|${ua}`)}`
	}
	// No identity signal — caller decides whether to allow.
	return ''
}

// ─── Block / unblock ─────────────────────────────────────────────

/**
 * Block a fingerprint. Idempotent: re-blocking the same fingerprint
 * extends the TTL and increments the unsafeCount.
 *
 * @param fingerprint the derived fingerprint (must be non-empty)
 * @param reason human-readable reason for the block (logged + surfaced
 *               to the dashboard)
 */
export function blockFingerprint(
	fingerprint: string,
	reason: string,
): BlockedFingerprint {
	if (!fingerprint) {
		throw new Error('blockFingerprint: empty fingerprint')
	}
	const existing = _blocks.get(fingerprint)
	const now = Date.now()
	const next: BlockedFingerprint = existing
		? {
				fingerprint,
				reason,
				blockedAt: existing.blockedAt,
				expiresAt: now + FINGERPRINT_BLOCK_TTL_MS,
				unsafeCount: existing.unsafeCount + 1,
			}
		: {
				fingerprint,
				reason,
				blockedAt: now,
				expiresAt: now + FINGERPRINT_BLOCK_TTL_MS,
				unsafeCount: 1,
			}
	_blocks.set(fingerprint, next)
	return next
}

/**
 * Unblock a fingerprint. Called when a SAFE verdict lands for a
 * blocked fingerprint (self-heal) or when the TTL expires.
 */
export function unblockFingerprint(fingerprint: string): boolean {
	return _blocks.delete(fingerprint)
}

/**
 * Check whether a fingerprint is currently blocked. Honors the TTL: a
 * block past its expiry is treated as not-blocked AND silently cleared.
 *
 * Returns the active block when present, undefined otherwise.
 */
export function checkFingerprintBlocked(
	fingerprint: string,
): BlockedFingerprint | undefined {
	if (!fingerprint) return undefined
	const block = _blocks.get(fingerprint)
	if (!block) return undefined
	if (Date.now() >= block.expiresAt) {
		_blocks.delete(fingerprint)
		return undefined
	}
	return block
}

/**
 * Sweep expired blocks. Called on a periodic interval (from
 * startServer) and from `shouldEscalateToGlobal` so the in-memory map
 * doesn't grow unboundedly.
 *
 * @returns the number of blocks removed
 */
export function sweepExpiredBlocks(): number {
	const now = Date.now()
	let removed = 0
	for (const [fp, block] of _blocks) {
		if (now >= block.expiresAt) {
			_blocks.delete(fp)
			removed++
		}
	}
	return removed
}

// ─── Self-heal ───────────────────────────────────────────────────

/**
 * Called after every verifier verdict. If the verdict is SAFE AND the
 * fingerprint is currently blocked, unblock it (self-heal).
 *
 * @returns true when the fingerprint was unblocked by this call
 */
export function selfHealOnSafe(fingerprint: string, verdict: string): boolean {
	if (verdict !== 'SAFE') return false
	if (!fingerprint) return false
	if (!_blocks.has(fingerprint)) return false
	_blocks.delete(fingerprint)
	return true
}

// ─── Helpers ──────────────────────────────────────────────────────

function getHeader(
	headers: Record<string, string | string[] | undefined> | undefined,
	name: string,
): string | undefined {
	if (!headers) return undefined
	const v = headers[name.toLowerCase()]
	return Array.isArray(v) ? v[0] : v
}

function shortHash(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)
}
