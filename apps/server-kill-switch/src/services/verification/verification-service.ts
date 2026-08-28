/**
 * Verification Service — orchestration layer for inference verification.
 *
 * Decides WHEN to verify and WHAT to do with the verdict. This is the module
 * the middleware/route calls.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.3.
 *
 * Modes:
 *   - ASYNC (default): fire-and-forget verification, return immediately.
 *     Zero added latency. An UNSAFE result triggers a FINGERPRINT-SCOPED
 *     halt for the NEXT request (Stage 2 P1-1 refinement).
 *   - SYNC (opt-in): await verification and return the result. The middleware
 *     rejects UNSAFE with 403 before the response is sent.
 *
 * Stage 2 P1-1 fingerprint-scoped halt (replaces the legacy global STOPPED):
 *   - UNSAFE verdict → `blockFingerprint(fingerprint, reason)` adds the
 *     request's fingerprint to the in-memory blocklist. The
 *     inference-gate middleware rejects the NEXT request from that
 *     fingerprint with 503 + `Retry-After: 5` + reason. Other
 *     fingerprints continue to flow.
 *   - SAFE verdict → `selfHealOnSafe(fingerprint)` lifts the block if
 *     present (self-heal) and queries `shouldEscalateToGlobal` to
 *     resume any globally-paused traffic when SAFE verdicts return.
 *   - Escalation-to-global: when every active fingerprint in the eval
 *     window shows UNSAFE, the kill-switch transitions to global STOPPED
 *     via the existing `killSwitch.transitionTo()` path. Otherwise the
 *     halt stays scoped.
 *   - The legacy `triggerStop()` (global STOPPED) is retained as a
 *     fallback when no fingerprint is supplied (e.g. anonymous
 *     background verification tasks).
 *
 * STOPPED→STOPPED double-transition guard: if already STOPPED, don't
 * transition again (avoid audit log spam). Log the event but skip the
 * transition.
 */

import {
	blockFingerprint,
	deriveFingerprint,
	type FingerprintSource,
	maybeResumeFromGlobal,
	selfHealOnSafe,
	shouldEscalateToGlobal,
} from '../fingerprint-pause'
import type { KillSwitchService } from '../kill-switch'
import { type PublishFn, recordVerificationEvent } from './verification-event'
import { InferenceVerifier, type VerificationResult } from './verifier'

export type VerificationMode = 'async' | 'sync'

export interface VerificationServiceOpts {
	verifier?: InferenceVerifier
	mode?: VerificationMode // default 'async'
	autoKillOnUnsafe?: boolean // default true
	killSwitch?: KillSwitchService // injected for the STOPPED transition
	publish?: PublishFn // Redis pubsub for bcp:verification:events
	persistEvents?: boolean // default true — write verification_event rows
}

export interface VerificationContext {
	prompt: string
	output: string
	requestId: string
	machineId?: string
	/**
	 * P1-3 (Stage 2): when true, the verifier only saw the first 256 KB of a
	 * longer streamed response. Recorded in the verification_event row's
	 * `reason` field so the dashboard surfaces the degradation. Default false.
	 */
	outputTruncated?: boolean
	/**
	 * P1-1 (Stage 2 fingerprint-scoped refinement): per-request fingerprint
	 * source used to derive the fingerprint. When supplied, UNSAFE verdicts
	 * trigger a per-fingerprint blocklist add (scoped halt) instead of an
	 * immediate global STOPPED. Falls back to `machine:<machineId>` when no
	 * fingerprint source is supplied.
	 */
	fingerprintSource?: FingerprintSource
}

export interface HandleInferenceResult {
	mode: VerificationMode
	result?: VerificationResult
}

export class VerificationService {
	private readonly verifier: InferenceVerifier
	/** Verification mode — 'async' (default) or 'sync'. Public so the middleware can branch. */
	readonly mode: VerificationMode
	private readonly autoKillOnUnsafe: boolean
	private readonly killSwitch?: KillSwitchService
	private readonly publish?: PublishFn
	private readonly persistEvents: boolean

	constructor(opts: VerificationServiceOpts = {}) {
		this.verifier = opts.verifier ?? new InferenceVerifier()
		this.mode = opts.mode ?? 'async'
		this.autoKillOnUnsafe = opts.autoKillOnUnsafe ?? true
		this.killSwitch = opts.killSwitch
		this.publish = opts.publish
		this.persistEvents = opts.persistEvents ?? true
	}

	/**
	 * Called by the inference middleware/route with the request context.
	 *
	 * ASYNC mode: fire-and-forget verification, return immediately. The
	 * verifier runs in a detached task that cannot throw into the response
	 * path (wrapped in try/catch, never rejects the request).
	 *
	 * SYNC mode: await verification and return the result.
	 */
	async handleInferenceRequest(
		ctx: VerificationContext,
	): Promise<HandleInferenceResult> {
		if (this.mode === 'sync') {
			const result = await this.verifyAndAct(ctx)
			return { mode: 'sync', result }
		}

		// ASYNC — fire-and-forget. Detached task; never reject the request.
		void this.verifyAndAct(ctx).catch((err) => {
			console.error(
				'[verification] Async verification failed (non-fatal):',
				err instanceof Error ? err.message : err,
			)
		})
		return { mode: 'async' }
	}

	/**
	 * Run verification + act on the verdict.
	 */
	private async verifyAndAct(
		ctx: VerificationContext,
	): Promise<VerificationResult> {
		const result = await this.verifier.verify({
			prompt: ctx.prompt,
			output: ctx.output,
		})

		let triggeredKill = false

		if (result.verdict === 'UNSAFE' && this.autoKillOnUnsafe) {
			// P1-1 (Stage 2 fingerprint-scoped refinement): block the request's
			// fingerprint first, then check whether to escalate to global
			// STOPPED. The legacy global-stop path remains as a fallback for
			// verifications with no fingerprint source / no machineId.
			const fingerprint = ctx.fingerprintSource
				? deriveFingerprint(ctx.fingerprintSource)
				: ctx.machineId
					? `machine:${ctx.machineId}`
					: ''
			if (fingerprint) {
				blockFingerprint(
					fingerprint,
					`UNSAFE verdict: ${result.reason || 'no reason'}`,
				)
			}
			// Check whether every active fingerprint shows UNSAFE — if so,
			// escalate to global STOPPED. Otherwise stay scoped.
			const escalation = await shouldEscalateToGlobal()
			if (escalation.escalated) {
				triggeredKill = await this.triggerStop(ctx.machineId)
			}
		} else if (result.verdict === 'SAFE') {
			// P1-1 self-heal: SAFE verdict unblocks the request's fingerprint
			// (if blocked) and may resume globally-paused traffic.
			const fingerprint = ctx.fingerprintSource
				? deriveFingerprint(ctx.fingerprintSource)
				: ctx.machineId
					? `machine:${ctx.machineId}`
					: ''
			const unblocked = selfHealOnSafe(fingerprint, 'SAFE')
			if (unblocked) {
				console.log(
					`[verification] Self-heal: unblocked fingerprint '${fingerprint}' after SAFE verdict`,
				)
			}
			// If globally paused, check whether we should resume.
			const resumed = await maybeResumeFromGlobal()
			if (resumed) {
				console.log(
					`[verification] Self-heal: resumed global pause after SAFE verdict`,
				)
			}
		}

		// REVIEW or degraded → publish event, no kill.
		if (result.verdict === 'REVIEW' || result.degraded) {
			// (already handled above for UNSAFE; this branch covers REVIEW/degraded)
		}

		if (this.persistEvents) {
			await recordVerificationEvent(
				{
					requestId: ctx.requestId,
					machineId: ctx.machineId,
					prompt: ctx.prompt,
					output: ctx.output,
					result,
					triggeredKill,
					// P1-3: surface the streaming-degradation marker on the row.
					outputTruncated: ctx.outputTruncated,
				},
				this.publish,
			)
		} else if (this.publish) {
			// Still publish even if not persisting rows.
			try {
				await this.publish(
					'bcp:verification:events',
					JSON.stringify({
						type: 'verification-event',
						payload: {
							requestId: ctx.requestId,
							machineId: ctx.machineId ?? null,
							verdict: result.verdict,
							confidence: result.confidence,
							reason: result.reason || null,
							model: result.model,
							degraded: result.degraded,
							triggeredKill,
							latencyMs: result.latencyMs,
							timestamp: new Date().toISOString(),
						},
					}),
				)
			} catch (err) {
				console.warn(
					'[verification] Redis publish dropped:',
					err instanceof Error ? err.message : err,
				)
			}
		}

		return result
	}

	/**
	 * Trigger the STOPPED transition via the kill switch. Guards against the
	 * STOPPED→STOPPED double-transition (invalid per VALID_TRANSITIONS) to
	 * avoid audit log spam: if already STOPPED, log the event but skip the
	 * transition.
	 *
	 * @param machineId the machine whose inference was flagged UNSAFE — threaded
	 *   into the transition metadata so the audit log records which machine
	 *   triggered the automated kill (spec §d.1).
	 */
	private async triggerStop(machineId?: string): Promise<boolean> {
		if (!this.killSwitch) {
			console.warn(
				'[verification] UNSAFE verdict but no killSwitch injected — cannot auto-kill',
			)
			return false
		}

		try {
			const current = await this.killSwitch.getCurrentState()
			if (current === 'STOPPED') {
				// Already stopped — skip the double-transition to avoid audit spam.
				console.warn(
					'[verification] UNSAFE verdict but kill-switch already STOPPED — skipping transition',
				)
				return false
			}

			await this.killSwitch.transitionTo('STOPPED', {
				reason: 'inference-unsafe',
				userId: 'system:verifier',
				ip: 'internal',
				machineId,
			})
			return true
		} catch (err: unknown) {
			// 409 invalid-transition (e.g. concurrent STOPPED) — ignore, already handled.
			const statusCode = (err as { statusCode?: number })?.statusCode
			if (statusCode === 409) {
				console.warn(
					'[verification] Kill-switch transition rejected (409) — likely already STOPPED:',
					err instanceof Error ? err.message : err,
				)
				return false
			}
			console.error(
				'[verification] Failed to trigger STOPPED:',
				err instanceof Error ? err.message : err,
			)
			return false
		}
	}
}
