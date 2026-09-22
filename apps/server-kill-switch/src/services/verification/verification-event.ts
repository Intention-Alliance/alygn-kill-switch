/**
 * Verification Event — persist verification_event rows + publish events.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.3, §e.3.
 *
 * Stores HASHES of prompt/output (not raw content) to keep the audit trail
 * tamper-evident without persisting sensitive inference content. Publishes a
 * `bcp:verification:events` message for the dashboard + audit.
 */

import { createHash } from 'node:crypto'
import { db } from '../../db'
import { verificationEvents } from '../../db/schema'
import type { VerificationResult } from './verifier'

export const VERIFICATION_EVENTS_CHANNEL = 'bcp:verification:events'

export interface VerificationEventInput {
	requestId: string
	machineId?: string
	prompt: string
	output: string
	result: VerificationResult
	triggeredKill: boolean
	/**
	 * P1-3 (Stage 2): when true, append a `output-truncated:streamed-above-256KB-cap`
	 * marker to the persisted reason so the dashboard surfaces that the
	 * verifier saw only a partial slice of the upstream response. Default false.
	 */
	outputTruncated?: boolean
}

export type PublishFn = (channel: string, msg: string) => Promise<void>

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * Compose the persisted `reason` string for a verification_event row.
 *
 * P1-3 (Stage 2): when `outputTruncated` is true, append a marker so the
 * dashboard can distinguish full-output verdicts from partial-output
 * verdicts. The original reason from the verifier is preserved as a
 * suffix for operator context.
 *
 * Exported for unit testing — the persistence path (db.insert) is
 * separately tested in verification-service.test.ts.
 *
 * @param verifierReason  the reason string from the verifier model (may be '')
 * @param outputTruncated true when the verifier saw only the first 256 KB
 *                        of a longer streamed response
 * @returns the composed reason string, or null when both are empty
 */
export function composeEventReason(
	verifierReason: string | undefined,
	outputTruncated: boolean | undefined,
): string | null {
	const suffix = outputTruncated
		? 'output-truncated:streamed-above-256KB-cap'
		: ''
	const composed = [verifierReason || '', suffix].filter(Boolean).join(' | ')
	return composed || null
}

/**
 * Persist a verification_event row and publish a `bcp:verification:events`
 * message. Both are best-effort: a persistence or publish failure must never
 * throw into the request path (async verification runs detached).
 *
 * Returns the persisted row id (or null if persistence failed).
 */
export async function recordVerificationEvent(
	input: VerificationEventInput,
	publish?: PublishFn,
): Promise<string | null> {
	const {
		requestId,
		machineId,
		prompt,
		output,
		result,
		triggeredKill,
		outputTruncated,
	} = input

	// P1-3: compose the reason with the truncation marker via the pure
	// helper so the logic is unit-testable without a live DB.
	const composedReason = composeEventReason(result.reason, outputTruncated)

	const row = {
		id: crypto.randomUUID(),
		requestId,
		machineId: machineId ?? null,
		verdict: result.verdict,
		confidence: result.confidence,
		reason: composedReason,
		model: result.model,
		degraded: result.degraded,
		promptHash: sha256(prompt),
		outputHash: sha256(output),
		triggeredKill,
		createdAt: new Date(),
	}

	let id: string | null = null
	try {
		await db.insert(verificationEvents).values(row)
		id = row.id
	} catch (err) {
		console.error(
			'[verification-event] Failed to persist verification_event:',
			err instanceof Error ? err.message : err,
		)
	}

	if (publish) {
		try {
			await publish(
				VERIFICATION_EVENTS_CHANNEL,
				JSON.stringify({
					type: 'verification-event',
					payload: {
						id: row.id,
						requestId,
						machineId: machineId ?? null,
						verdict: result.verdict,
						confidence: result.confidence,
						reason: composedReason,
						model: result.model,
						degraded: result.degraded,
						triggeredKill,
						latencyMs: result.latencyMs,
						timestamp: row.createdAt.toISOString(),
					},
				}),
			)
		} catch (err) {
			console.warn(
				'[verification-event] Redis publish dropped:',
				err instanceof Error ? err.message : err,
			)
		}
	}

	return id
}
