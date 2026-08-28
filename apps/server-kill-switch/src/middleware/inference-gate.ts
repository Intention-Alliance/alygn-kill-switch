/**
 * Inference Gate Middleware — Phase 1 traffic-pause enforcement + P1-1
 * fingerprint-scoped pause layer (Stage 2 fix).
 *
 * Two layers of gating, checked in order:
 *
 *   1. FINGERPRINT-SCOPED PAUSE (P1-1, Stage 2 refinement): if the
 *      request's fingerprint is in the per-fingerprint blocklist (see
 *      `services/fingerprint-pause.ts`), reject with 503 + `Retry-After: 5`
 *      and include `fingerprint` + `reason` in the response body so the
 *      caller knows WHICH fingerprint is blocked (not just "global").
 *
 *   2. GLOBAL PAUSE (Phase 1, ADR-141): if the kill-switch is STOPPED
 *      globally (transitioned via WebAuthn assertion OR escalated via
 *      all-fingerprints-UNSAFE), reject with 503 + `Retry-After: 5`.
 *
 * A clean fingerprint (no block match) falls through to the global-pause
 * check — so an escalation still halts traffic from clean fingerprints.
 *
 * When running and the fingerprint is not blocked, requests pass through
 * untouched.
 *
 * ADR-141: Kill-switch traffic pause.
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §d (P1-1 fingerprint-scoped variant).
 */

import {
	checkFingerprintBlocked,
	deriveFingerprint,
	type FingerprintSource,
} from '../services/fingerprint-pause'
import { isTrafficPaused, recordPausedRequest } from '../services/traffic-pause'

export const INFERENCE_GATE_RETRY_AFTER_SECONDS = 5

export interface InferenceGateDecision {
	gated: boolean
	retryAfter?: number
	/**
	 * When gated=true, identifies WHY:
	 *   - 'fingerprint-blocked': scoped to the request's fingerprint
	 *   - 'global-pause': kill-switch STOPPED (or escalated from all-fingerprints-UNSAFE)
	 */
	reason?: 'fingerprint-blocked' | 'global-pause'
	/** When reason='fingerprint-blocked', the blocked fingerprint (for response body). */
	fingerprint?: string
	/** When reason='fingerprint-blocked', the block reason (for response body). */
	blockReason?: string
	/** The derived fingerprint for this request (always populated for inference writes). */
	derivedFingerprint?: string
}

/**
 * Check whether an inference request should be gated.
 *
 * @param method HTTP method
 * @param url    request URL (path only — no query string)
 * @param source optional fingerprint source (body, headers, ip). When
 *               omitted, no fingerprint check runs (the gate falls back to
 *               the global pause only). index.ts always passes this for
 *               POST /v1/inference/* so the gate can derive the fingerprint.
 *
 * @returns InferenceGateDecision. When `gated=false`, the request may
 *          pass through. When `gated=true`, the caller MUST respond 503
 *          with `retryAfter` and (when reason='fingerprint-blocked') the
 *          fingerprint + blockReason in the body.
 */
export function checkInferenceGate(
	method: string,
	url: string,
	source?: FingerprintSource,
): InferenceGateDecision {
	const isInferenceWrite = method === 'POST' && url.startsWith('/v1/inference/')
	if (!isInferenceWrite) {
		return { gated: false }
	}

	// ── Layer 1: fingerprint-scoped pause ──────────────────────────
	// Derive the fingerprint from the request, then check the blocklist.
	// An empty fingerprint (no identity signal at all) is treated as
	// "unknown caller" — we DO NOT block unknowns, only known UNSAFE
	// callers. The global-pause layer below is the safety net for unknowns.
	let derivedFingerprint: string | undefined
	if (source) {
		derivedFingerprint = deriveFingerprint(source)
		const block = checkFingerprintBlocked(derivedFingerprint)
		if (block) {
			recordPausedRequest()
			return {
				gated: true,
				retryAfter: INFERENCE_GATE_RETRY_AFTER_SECONDS,
				reason: 'fingerprint-blocked',
				fingerprint: derivedFingerprint,
				blockReason: block.reason,
				derivedFingerprint,
			}
		}
		// Fingerprint is clean — fall through to global pause check below.
	}

	// ── Layer 2: global pause ─────────────────────────────────────
	if (!isTrafficPaused()) {
		return { gated: false, derivedFingerprint }
	}

	recordPausedRequest()
	return {
		gated: true,
		retryAfter: INFERENCE_GATE_RETRY_AFTER_SECONDS,
		reason: 'global-pause',
		derivedFingerprint,
	}
}
