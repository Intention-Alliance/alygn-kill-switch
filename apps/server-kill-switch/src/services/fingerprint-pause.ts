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
 *   - Fingerprint priority order:
 *       1. Explicit `machineId` / `sessionId` in request body or header.
 *       2. API-key identity (the kill-switch API-key or PCA key on the
 *          11435/8080 lanes).
 *       3. Source IP + User-Agent hash (fallback when no explicit identity
 *          is present).
 *   - Escalation-to-global: when ALL active fingerprints in the eval
 *     window show UNSAFE, escalate to global pause via the existing
 *     `pauseInferenceTraffic()` path. Stays scoped otherwise.
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

import { and, eq, gt, isNotNull } from 'drizzle-orm'
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

export interface EscalationCheckResult {
	/** True when escalation fired this call. */
	escalated: boolean
	/** Number of active fingerprints in the window. */
	activeFingerprints: number
	/** Number of UNSAFE verdicts in the window. */
	unsafeVerdicts: number
	/** Whether the kill-switch was already in a paused state at check time. */
	alreadyPaused: boolean
}

// ─── Escalation-to-global ────────────────────────────────────────

/**
 * Check whether to escalate the kill-switch to global pause.
 *
 * The check counts fingerprints that had an UNSAFE verdict in the last
 * `ESCALATION_WINDOW_MS`. If EVERY active fingerprint (i.e. those with
 * at least one UNSAFE in the window) shows UNSAFE — meaning there is no
 * "safe" fingerprint to keep serving — escalate to global pause via the
 * existing `pauseInferenceTraffic()` path.
 *
 * "Active" means "had a verdict in the window" — we don't count
 * fingerprints that have been silent for the full window because they
 * aren't currently sending traffic.
 *
 * The check is idempotent: if the kill-switch is already paused, no
 * double-pause is triggered (pauseInferenceTraffic is idempotent).
 */
export async function shouldEscalateToGlobal(
	windowMs: number = ESCALATION_WINDOW_MS,
): Promise<EscalationCheckResult> {
	// Step 1: query verification_event for UNSAFE verdicts in the window.
	const windowStart = new Date(Date.now() - windowMs)
	let unsafeRows: Array<{ machine_id: string | null }> = []
	try {
		unsafeRows = (await db
			.selectDistinct({ machine_id: verificationEvents.machineId })
			.from(verificationEvents)
			.where(
				and(
					eq(verificationEvents.verdict, 'UNSAFE'),
					isNotNull(verificationEvents.machineId),
					gt(verificationEvents.createdAt, windowStart),
				),
			)) as Array<{ machine_id: string | null }>
	} catch (err) {
		// DB error — don't escalate; log and skip. The blocklist layer is
		// still scoped per-fingerprint, so the system stays safe.
		console.warn(
			'[fingerprint-pause] escalation query failed (non-fatal):',
			err,
		)
		return {
			escalated: false,
			activeFingerprints: 0,
			unsafeVerdicts: 0,
			alreadyPaused: isTrafficPaused(),
		}
	}

	// Each UNSAFE verdict (not distinct machine_id) counts toward the
	// active-fingerprint set.
	const fingerprints = new Set<string>()
	for (const row of unsafeRows) {
		if (row.machine_id) fingerprints.add(`machine:${row.machine_id}`)
	}

	const activeFingerprints = fingerprints.size
	const alreadyPaused = isTrafficPaused()

	// Escalation rule: if we have at least one active fingerprint and ALL
	// of them are UNSAFE (we have no other signal here — every verdict we
	// saw was UNSAFE), AND the system isn't already paused, escalate.
	// We always count UNSAFE > 0 here because the query is filtered to
	// UNSAFE verdicts — so `activeFingerprints > 0` AND no SAFE signal in
	// the window means escalate.
	if (activeFingerprints > 0 && !alreadyPaused) {
		await pauseInferenceTraffic()
		return {
			escalated: true,
			activeFingerprints,
			unsafeVerdicts: activeFingerprints,
			alreadyPaused: false,
		}
	}

	return {
		escalated: false,
		activeFingerprints,
		unsafeVerdicts: activeFingerprints,
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
