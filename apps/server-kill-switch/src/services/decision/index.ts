/**
 * Server-side decision wiring — S3.
 *
 * Builds the registry the server uses for POST /v1/decision. The server is
 * the only place the TypeSafe key lives, so `jev` is registered here (and
 * only here). The verifier is wrapped structurally so this module does not
 * depend on the verification service's internals.
 */

import type { DecideWithProviderOpts, VerifierLike } from '@align/decision-core'
import { buildRegistry, type ProviderRegistry } from '@align/decision-core'
import { getConfig } from '../../config'
import { appendAuditEntry } from '../audit-chain'
import { recordShadowDecision } from './shadow'

// Re-export so consumers import everything from the barrel.
export { readDecisionFlags } from './flags'
export {
	countShadowDecisions,
	getShadowReadiness,
	recordShadowDecision,
	SHADOW_AGREEMENT_THRESHOLD,
	SHADOW_MIN_DECISIONS,
} from './shadow'

/** Structural adapter over the existing InferenceVerifier. */
export function createVerifierLike(): VerifierLike {
	// Lazy import to avoid a cycle and to keep the verifier untouched.
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { InferenceVerifier } = require('../verification/verifier')
	const verifier = new InferenceVerifier({})
	return {
		verify: (input: { prompt: string; output: string }) =>
			verifier.verify(input),
	}
}

export function buildServerRegistry(opts?: {
	verifier?: VerifierLike
}): ProviderRegistry {
	const config = getConfig() as any
	const decision = config?.decision ?? {}
	const _verification = config?.verification ?? {}

	return buildRegistry({
		threshold: 0.7,
		verifier: opts?.verifier ?? createVerifierLike(),
		jev: decision.typesafeApiKey
			? {
					apiKey: decision.typesafeApiKey,
					baseUrl: decision.typesafeBaseUrl,
					model: 'jev-latest',
					timeoutMs: 500,
				}
			: undefined,
		// Laya runs in a local Python sidecar; register it when a base URL is
		// configured. Absent/unreachable fails closed to review.
		laya: decision.layaBaseUrl
			? {
					baseUrl: decision.layaBaseUrl,
					model: decision.layaModel,
					timeoutMs: decision.layaTimeoutMs,
				}
			: undefined,
	})
}

/**
 * Build the selector options for a decision (KS-LAYA §B.2 + §B.5).
 *
 *   - onFallback → an ADR-140 audit-chain entry naming the provider that
 *     actually answered. Never silently serve from Jev.
 *   - onShadow   → a decision_shadow_log row while the Laya readiness gate is
 *     closed (Laya logs what it would have decided; it never serves).
 *
 * Both callbacks are best-effort: the selector swallows their errors so a
 * logging failure can never change a decision.
 */
export function buildDecisionOpts(machineId: string): DecideWithProviderOpts {
	return {
		onFallback: async (info) => {
			await appendAuditEntry({
				userId: 'system:decision',
				reason: `decision fallback: ${info.primary} unavailable → ${info.answeredBy}`,
				previousState: info.primary,
				newState: info.answeredBy,
				machineId,
				severity: 'warning',
				metadata: JSON.stringify({
					primary: info.primary,
					answeredBy: info.answeredBy,
					reason: info.reason,
				}),
				plainExplanation:
					`The primary decision provider "${info.primary}" was unavailable ` +
					`(${info.reason}); the fallback provider "${info.answeredBy}" answered. ` +
					`The decision is marked degraded and routed to review.`,
			})
		},
		onShadow: async (info) => {
			await recordShadowDecision({
				machineId,
				provider: info.provider,
				servedBy: info.servedBy,
				shadowLabel: info.result.label,
				shadowAction: info.result.action,
				shadowScore: info.result.score,
				shadowConfidence: info.result.confidence,
				shadowDegraded: info.result.degraded,
				liveLabel: info.live.label,
				reasons: info.result.reasons,
			})
		},
	}
}
