/**
 * Inference Verification Middleware — request-path hook.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.4.
 *
 * P1-1 FIX (Stage 2 — Nikaya 78/100, 3×P1 verified): the original spec only
 * ran a pre-screen check on the request body's `prompt` field; the output
 * side of the (prompt, output) classification pair was NEVER POPULATED
 * — there was no relay in the kill-switch, so the verifier only ever saw
 * prompts. That left a telemetry gap (no `output` in verification_event
 * rows) and a safety gap (output-level UNSAFE verdicts never fired).
 *
 * The Stage 2 fix implements OPTION (c) HYBRID (per Wobblus):
 *
 *   1. PROMPT pre-screen (existing): fire-and-forget on the request body.
 *      Keeps the prompt side of the classification fast and ensures the
 *      dashboard shows prompt-only verdicts even when the relay is
 *      disabled or fails.
 *
 *   2. OUTPUT post-relay (NEW): after `relayInferenceRequest()` returns the
 *      upstream response, fire a second verifier call on the captured
 *      (prompt, output) pair. The verifier writes a verification_event
 *      row with `outputHash` populated. UNSAFE verdicts trigger the
 *      kill-switch STOPPED transition per existing stream-halting doctrine
 *      (next request is blocked by the inference gate).
 *
 * Both rows share the same `requestId` so the dashboard can correlate the
 * prompt pre-screen verdict with the output post-relay verdict for the
 * same client request.
 *
 * ASYNC mode: fires `handleInferenceRequest()` and passes the request
 * through immediately (does not await). Zero added latency.
 *
 * SYNC mode: awaits and rejects with 403 if the verdict is UNSAFE.
 *
 * The kill-switch server is the control plane; if inference flows through a
 * different gateway, this hook must be deployed where inference actually
 * flows. The service + verifier are dependency-injected and reusable.
 */

import type { VerificationService } from '../services/verification/verification-service'
import type { VerificationResult } from '../services/verification/verifier'

export interface VerificationHookResult {
	verified: boolean
	result?: VerificationResult
	reject?: { status: number; body: unknown }
	/** Present in SYNC mode — the caller awaits this to get the final decision. */
	awaitDecision?: Promise<VerificationHookResult>
}

/**
 * Fire-and-forget OUTPUT post-relay verification.
 *
 * Called by `index.ts` after `relayInferenceRequest()` returns. Runs the
 * verifier on the captured (prompt, output) pair. Writes a fresh
 * verification_event row keyed by `requestId` (same id as the prompt
 * pre-screen row, when present). UNSAFE verdict triggers the kill-switch
 * STOPPED transition via the existing `autoKillOnUnsafe` path, blocking
 * the NEXT inference request.
 *
 * Streaming degradation: when `outputTruncated === true`, the row's reason
 * is annotated with `output-truncated:streamed-above-256KB-cap` so the
 * dashboard can show the verifier saw only the first 256 KB.
 *
 * This function never throws into the request path — async verification
 * runs detached and errors are logged, not propagated to the client.
 */
export function verifyInferenceOutput(
	ctx: {
		prompt: string
		output: string
		requestId: string
		machineId?: string
		/** True when the verifier saw only the first 256 KB of a longer output. */
		outputTruncated?: boolean
		/** True when the upstream response was a streaming NDJSON response. */
		streamMode?: boolean
	},
	service: VerificationService,
): void {
	if (!ctx.prompt && !ctx.output) {
		return // nothing to verify — nothing to log
	}
	const handle = service.handleInferenceRequest({
		prompt: ctx.prompt,
		output: ctx.output,
		requestId: ctx.requestId,
		machineId: ctx.machineId,
		// P1-3: thread the truncation flag through so the verification_event
		// row gets the `output-truncated:streamed-above-256KB-cap` marker.
		outputTruncated: ctx.outputTruncated,
	})
	void handle
		.then((r) => {
			// Surface the truncation context as a console line so it shows up in
			// the operator's logs even before the dashboard is consulted. The
			// verification_event row's reason column carries the same flag.
			if (ctx.outputTruncated && r.result) {
				console.warn(
					`[inference-verification] output truncated for requestId=${ctx.requestId}: ` +
						`verifier saw only the first ${256 * 1024} bytes of a streamed response`,
				)
			}
		})
		.catch((err) => {
			console.error(
				'[inference-verification] Output post-relay verification failed (non-fatal):',
				err instanceof Error ? err.message : err,
			)
		})
}

/**
 * Check inference verification for a request.
 *
 * ASYNC mode: fires the service (fire-and-forget) and returns immediately
 * with `{ verified: true }` — the request passes through with zero added
 * latency.
 *
 * SYNC mode: returns `{ verified: true, awaitDecision }`; the caller awaits
 * `awaitDecision` and, if it resolves with a `reject`, responds 403.
 *
 * @param method     HTTP method
 * @param url        request URL
 * @param body       parsed request body (or null)
 * @param service    the VerificationService
 * @param requestId  a stable request id for correlation
 * @param machineId  optional machine id
 */
export function checkInferenceVerification(
	method: string,
	url: string,
	body: { prompt?: string; output?: string } | null,
	service: VerificationService,
	requestId: string,
	machineId?: string,
	/**
	 * P1-1 (Stage 2 fingerprint-scoped refinement): per-request fingerprint
	 * source used to derive the fingerprint for the scoped halt layer. When
	 * omitted, the service falls back to `machine:<machineId>` or skips the
	 * fingerprint-scoped block.
	 */
	fingerprintSource?: FingerprintSource,
): VerificationHookResult {
	// Only applies to POST /v1/inference/* requests.
	if (!(method === 'POST' && url.startsWith('/v1/inference/'))) {
		return { verified: false }
	}

	const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
	const output = typeof body?.output === 'string' ? body.output : ''

	// Nothing to verify — pass through.
	if (!prompt && !output) {
		return { verified: false }
	}

	const handle = service.handleInferenceRequest({
		prompt,
		output,
		requestId,
		machineId,
		// P1-1: thread the fingerprint source so the service can derive the
		// request fingerprint and block it on UNSAFE (scoped halt).
		fingerprintSource,
	})

	if (service.mode === 'async') {
		// Fire-and-forget — never reject the request. The verifier runs detached.
		void handle.catch((err) => {
			console.error(
				'[inference-verification] Async verification failed (non-fatal):',
				err instanceof Error ? err.message : err,
			)
		})
		return { verified: true }
	}

	// SYNC mode: await the decision. UNSAFE → reject with 403.
	const awaitDecision = handle.then((r) => {
		if (r.result?.verdict === 'UNSAFE') {
			return {
				verified: true,
				result: r.result,
				reject: {
					status: 403,
					body: {
						error: 'Inference output failed safety verification',
						verdict: 'UNSAFE',
						reason: r.result.reason,
					},
				},
			} as VerificationHookResult
		}
		return { verified: true, result: r.result } as VerificationHookResult
	})

	return { verified: true, awaitDecision }
}
