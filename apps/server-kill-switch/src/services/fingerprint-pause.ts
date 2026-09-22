/**
 * Fingerprint-Scoped Pause Layer — P1-1 (Stage 2 fingerprint-scoped variant).
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §d.
 *
 * Phase 1 traffic-pause is GLOBAL ONLY (in-memory `_paused` flag → every
 * inference request 503s). A single UNSAFE verdict halts the entire
 * traffic plane — which is human-dependent for self-heal and defeats the
 * purpose of an automated kill. This module adds a SCOPED pause layer:
 *
 *   - UNSAFE output verdict → halt traffic for THAT fingerprint only.
 *     Other fingerprints continue to flow.
 *   - Fingerprint derivation priority (first non-empty wins — see
 *     `deriveFingerprint` in `./fingerprint-blocklist.ts` for the
 *     authoritative implementation):
 *       1. `body.machineId`   — explicit machine identity from the
 *                                inference request body.
 *       2. `body.sessionId`   — session identity from the request body.
 *       3. `body.fingerprint` — caller-supplied fingerprint in the body.
 *       4. Header `x-fingerprint` — set by the openclaw-webhook or the
 *                                   orchestrator that knows the session.
 *       5. Header `x-api-key`  — kill-switch API key or PCA key
 *                                 (hashed, not persisted raw).
 *       6. Header `authorization` (Bearer token) — auth identity
 *                                                  (hashed).
 *       7. IP + User-Agent hash — fallback when no explicit identity
 *                                  is present (hashed; IP never
 *                                  persisted raw).
 *   - Escalation-to-global: when ALL distinct active fingerprints in
 *     the eval window show UNSAFE (i.e. no SAFE fingerprint is active
 *     in the window), escalate to global pause via the existing
 *     `pauseInferenceTraffic()` path. Stays scoped otherwise. A single
 *     UNSAFE verdict in a 10-fingerprint system halts only that one
 *     fingerprint and keeps the other nine flowing.
 *   - Self-heal: a fingerprint re-enters allowed traffic when a later
 *     request from it verifies SAFE, OR when the TTL expires
 *     (default 5 min). TTL exists so a missed verifier reply never
 *     permanently bans a fingerprint.
 *
 * Pure-logic helpers (blocklist state, fingerprint derivation,
 * self-heal, TTL sweep) live in `fingerprint-blocklist.ts` so tests can
 * import them WITHOUT dragging in Drizzle (which gets clobbered by
 * other test files that mock `drizzle-orm` with stripped exports).
 *
 * The blocklist lives in-process (module-level Map). This is intentional
 * for Phase 1: the kill-switch restarts with the blocklist empty (no
 * stale bans across deploys), and per-fingerprint state is small enough
 * that an in-memory map is fast and bounded. Phase 2 can swap in a Redis-
 * backed blocklist behind the same interface if multi-instance rollout
 * requires cross-instance sharing.
 */

import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
// Import Drizzle operators from the `drizzle-orm/sql` sub-path rather
// than the top-level barrel. Some test files mock `drizzle-orm` to
// strip/override individual operators, but the sub-path is unaffected
// by those top-level mocks. This keeps the escalation query working
// even when the test runner has loaded other test files that mock
// `drizzle-orm` with partial exports.
import { and, eq, gt, isNotNull } from 'drizzle-orm/sql'
import { db } from '../db'
import { verificationEvents } from '../db/schema'
import {
	blockFingerprint as blockFingerprintImpl,
	selfHealOnSafe as selfHealOnSafeImpl,
} from './fingerprint-blocklist'
import {
	isTrafficPaused,
	pauseInferenceTraffic,
	resumeInferenceTraffic,
} from './traffic-pause'

// Re-export the pure-logic helpers so existing callers that import
// from `../fingerprint-pause` keep working without change.
export {
	type BlockedFingerprint,
	blockFingerprint,
	checkFingerprintBlocked,
	deriveFingerprint,
	FINGERPRINT_BLOCK_TTL_MS,
	type FingerprintSource,
	getBlockedFingerprintCount,
	getBlockedFingerprints,
	resetFingerprintPauseState,
	selfHealOnSafe,
	sweepExpiredBlocks,
	unblockFingerprint,
} from './fingerprint-blocklist'

// ─── Constants ────────────────────────────────────────────────────

/**
 * Window for the escalation-to-global check. The check queries
 * verification_event for UNSAFE verdicts in the last `ESCALATION_WINDOW_MS`
 * milliseconds. If every active fingerprint in that window shows UNSAFE,
 * the kill-switch transitions to global pause.
 */
export const ESCALATION_WINDOW_MS = 60 * 1000

// ─── Types ────────────────────────────────────────────────────────

/**
 * Active-fingerprint counts in the escalation window. The escalation
 * rule compares these two values directly: escalate only when
 * `unsafeActive === totalActive && totalActive > 0`.
 */
export interface EscalationCounts {
	/** Distinct fingerprints with ANY verdict in the window. */
	totalActive: number
	/** Distinct fingerprints with at least one UNSAFE verdict in the window. */
	unsafeActive: number
}

export interface EscalationCheckResult {
	/** True when escalation fired this call. */
	escalated: boolean
	/** Number of distinct active fingerprints in the window. */
	activeFingerprints: number
	/** Number of distinct UNSAFE fingerprints in the window. */
	unsafeFingerprints: number
	/** Whether the kill-switch was already in a paused state at check time. */
	alreadyPaused: boolean
}

// ─── Pure query helper (extracted for testability) ───────────────

/**
 * Pure DB query for the escalation rule. Counts distinct fingerprints
 * (a.k.a. `machine_id`) that were active in the last `windowMs`
 * milliseconds, broken down by verdict:
 *
 *   - `totalActive`  — distinct fingerprints with ANY verdict in the
 *                       window (SAFE | UNSAFE | REVIEW). These are the
 *                       fingerprints currently sending traffic.
 *   - `unsafeActive` — distinct fingerprints with at least one UNSAFE
 *                       verdict in the window.
 *
 * The escalation rule is `unsafeActive === totalActive && totalActive > 0`
 * — i.e. every fingerprint that spoke in the window showed UNSAFE. If
 * even one fingerprint is SAFE (or silent with no UNSAFE), the scoped
 * halt design stays in effect and the other fingerprints keep flowing.
 *
 * The DB handle is injected so tests can exercise the SAME query
 * shape that production uses (no raw-SQL bypass). Production passes
 * the module-level singleton; tests pass an in-memory Drizzle handle.
 *
 * On query error returns `{ totalActive: 0, unsafeActive: 0 }` — the
 * caller treats that as "no signal" and does not escalate.
 */
export async function queryEscalationCounts(
	database: BunSQLiteDatabase<any>,
	windowMs: number,
): Promise<EscalationCounts> {
	const windowStart = new Date(Date.now() - windowMs)
	try {
		// Total distinct active fingerprints (any verdict) in the window.
		const totalRows = await database
			.selectDistinct({ machineId: verificationEvents.machineId })
			.from(verificationEvents)
			.where(
				and(
					isNotNull(verificationEvents.machineId),
					gt(verificationEvents.createdAt, windowStart),
				),
			)
		// Distinct UNSAFE fingerprints in the window.
		const unsafeRows = await database
			.selectDistinct({ machineId: verificationEvents.machineId })
			.from(verificationEvents)
			.where(
				and(
					eq(verificationEvents.verdict, 'UNSAFE'),
					isNotNull(verificationEvents.machineId),
					gt(verificationEvents.createdAt, windowStart),
				),
			)
		const totalActive = new Set(
			totalRows
				.map((r: { machineId: string | null }) => r.machineId)
				.filter((m: string | null): m is string => Boolean(m)),
		).size
		const unsafeActive = new Set(
			unsafeRows
				.map((r: { machineId: string | null }) => r.machineId)
				.filter((m: string | null): m is string => Boolean(m)),
		).size
		return { totalActive, unsafeActive }
	} catch (err) {
		console.warn(
			'[fingerprint-pause] escalation query failed (non-fatal):',
			err,
		)
		return { totalActive: 0, unsafeActive: 0 }
	}
}

// ─── Escalation-to-global ────────────────────────────────────────

/**
 * Check whether to escalate the kill-switch to global pause.
 *
 * The rule: if EVERY distinct active fingerprint (i.e. those with at
 * least one verdict in the window) has at least one UNSAFE verdict in
 * the window, escalate to global pause via the existing
 * `pauseInferenceTraffic()` path. Otherwise stay scoped — a single
 * UNSAFE in a multi-fingerprint system halts only that fingerprint and
 * the rest keep flowing.
 *
 * "Active" means "had a verdict in the window" — we don't count
 * fingerprints that have been silent for the full window because they
 * aren't currently sending traffic.
 *
 * The check is idempotent: if the kill-switch is already paused, no
 * double-pause is triggered (pauseInferenceTraffic is idempotent).
 *
 * @param windowMs eval window in ms (default `ESCALATION_WINDOW_MS`)
 * @param database  injectable DB handle for tests; production uses the
 *                  module-level singleton.
 */
export async function shouldEscalateToGlobal(
	windowMs: number = ESCALATION_WINDOW_MS,
	database: BunSQLiteDatabase<any> = db,
): Promise<EscalationCheckResult> {
	const { totalActive, unsafeActive } = await queryEscalationCounts(
		database,
		windowMs,
	)
	const alreadyPaused = isTrafficPaused()

	// Escalation rule: every active fingerprint in the window showed
	// UNSAFE, AND we have at least one active fingerprint, AND the
	// system isn't already paused. This is the correct scoped-halt
	// contract: SAFE fingerprints (or any fingerprint with no UNSAFE)
	// must keep flowing, even when other fingerprints are UNSAFE.
	if (totalActive > 0 && unsafeActive === totalActive && !alreadyPaused) {
		await pauseInferenceTraffic()
		return {
			escalated: true,
			activeFingerprints: totalActive,
			unsafeFingerprints: unsafeActive,
			alreadyPaused: false,
		}
	}

	return {
		escalated: false,
		activeFingerprints: totalActive,
		unsafeFingerprints: unsafeActive,
		alreadyPaused,
	}
}

/**
 * Inverse of `shouldEscalateToGlobal`: when SAFE verdicts return and the
 * kill-switch is globally paused, resume. Operates only when the global
 * pause was triggered by an escalation (not by a human kill-switch auth).
 *
 * Phase 1 simplification: we always resume on SAFE if paused. The
 * follow-up ticket can add a "sustained SAFE for N minutes" guard if
 * human kills need to stay sticky.
 */
export async function maybeResumeFromGlobal(): Promise<boolean> {
	if (!isTrafficPaused()) return false
	await resumeInferenceTraffic()
	return true
}

// ─── Module-side helpers (re-exported via fingerprint-blocklist.ts) ─

// FingerprintSource is already re-exported from fingerprint-blocklist.ts
// above; no need to alias it here. The implementation helpers below are
// exposed so consumers can call them through the `fingerprint-pause`
// entry point without knowing about the underlying module split.

/**
 * Block a fingerprint via the blocklist helper. Pure passthrough.
 */
export function blockFingerprintScoped(fingerprint: string, reason: string) {
	return blockFingerprintImpl(fingerprint, reason)
}

/**
 * Self-heal via the blocklist helper. Pure passthrough.
 */
export function selfHealOnSafeScoped(fingerprint: string, verdict: string) {
	return selfHealOnSafeImpl(fingerprint, verdict)
}
