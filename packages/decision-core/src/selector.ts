/**
 * Selector — the single fail-closed entry point.
 *
 * Invariants (asserted in tests):
 *   #1  result.degraded === true  →  action = 'review'
 *   #2  confidence < review_threshold  →  action = 'review'
 *   #3  action === 'forward' && degraded  →  action = 'review' (belt & braces)
 *
 * `decideWithProvider` NEVER throws and NEVER returns action='forward' while
 * degraded === true. That is the safety property of the whole feature.
 *
 * KS-LAYA (§B.2 + §B.5):
 *   - Ordered fallback chain (Option C): code default `["laya","jev"]` plus a
 *     `decision.providerChain` flag override resolved at runtime.
 *   - "Laya unavailable" = TRANSPORT failures only (connect error / 5xx /
 *     timeout / unparseable). A SEMANTIC failure (the provider answered but the
 *     answer was unusable) fails closed to review and does NOT fall back —
 *     confidence-based fallback is deferred (no calibrated threshold yet).
 *   - Fallback visibility: when a fallback answers, the result is marked
 *     `degraded: true` (→ review) and carries `fallbackFrom`; the caller is
 *     notified via `onFallback` so it can write an audit-chain entry. Never
 *     silently serve from Jev.
 *   - Training-readiness gate (Option C): while `decision.laya.ready` is false,
 *     Laya is filtered out of the serving chain (never serves live traffic) and
 *     runs in SHADOW mode alongside the live provider via `onShadow`.
 */

import type {
	DecisionFlagReader,
	DecisionInput,
	DecisionResult,
	ProviderName,
} from '@align/shared-types'
import type { ProviderRegistry } from './registry'

/**
 * Default provider when no flag is set. Matches the DB default
 * (`flag-definitions.ts` → `decision.provider` = 'laya').
 */
export const DEFAULT_PROVIDER: ProviderName = 'laya'

/**
 * Code default fallback chain (KS-LAYA §B.2, Option C). Guarantees safe
 * behaviour with no flags set: Laya first, Jev as the true last resort.
 */
export const DEFAULT_PROVIDER_CHAIN: readonly ProviderName[] = ['laya', 'jev']

export const DEFAULT_REVIEW_THRESHOLD = 0.6
/** Decision budget default (D2: 500ms). */
export const DEFAULT_TIMEOUT_MS = 500
/** Hard outer guard: a provider that ignores its own timeout still cannot hang. */
export const HARD_TIMEOUT_SLACK_MS = 250

const VALID_PROVIDERS: ProviderName[] = [
	'keyword',
	'ollama',
	'jev',
	'laya',
	'dignity',
]

/** machine override > global > declared default. Unknown value → default. */
export function resolveProviderName(flags: DecisionFlagReader): ProviderName {
	const raw = flags.getFlag('decision.provider')
	if (typeof raw === 'string' && (VALID_PROVIDERS as string[]).includes(raw)) {
		return raw as ProviderName
	}
	return DEFAULT_PROVIDER
}

function dedupe(names: ProviderName[]): ProviderName[] {
	return [...new Set(names)]
}

/**
 * Resolve the ordered provider chain (KS-LAYA §B.2, Option C).
 *
 *   1. `decision.providerChain` — comma-separated ordered list; unknown names
 *      are dropped. When it yields at least one valid provider it wins.
 *   2. Otherwise: the resolved single provider (`decision.provider`) followed by
 *      the code default chain `["laya","jev"]`, deduped. With no flags set this
 *      is exactly `["laya","jev"]`.
 */
export function resolveProviderChain(
	flags: DecisionFlagReader,
): ProviderName[] {
	const raw = flags.getFlag('decision.providerChain')
	if (typeof raw === 'string' && raw.trim().length > 0) {
		const parsed = raw
			.split(',')
			.map((s) => s.trim())
			.filter((s): s is ProviderName =>
				(VALID_PROVIDERS as string[]).includes(s),
			)
		if (parsed.length > 0) return dedupe(parsed)
	}
	return dedupe([resolveProviderName(flags), ...DEFAULT_PROVIDER_CHAIN])
}

/** Reads decision.review_threshold, clamped to [0,1], default 0.6. */
export function resolveReviewThreshold(flags: DecisionFlagReader): number {
	const raw = flags.getFlag('decision.review_threshold')
	if (raw === null || raw === undefined) return DEFAULT_REVIEW_THRESHOLD
	const n = typeof raw === 'number' ? raw : Number(raw)
	if (!Number.isFinite(n)) return DEFAULT_REVIEW_THRESHOLD
	return Math.min(1, Math.max(0, n))
}

/** Reads decision.jev.timeoutMs, clamped to [50, 30000], default 500 (D2). */
export function resolveTimeoutMs(flags: DecisionFlagReader): number {
	const raw = flags.getFlag('decision.jev.timeoutMs')
	if (raw === null || raw === undefined) return DEFAULT_TIMEOUT_MS
	const n = typeof raw === 'number' ? raw : Number(raw)
	if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS
	return Math.min(30_000, Math.max(50, n))
}

/** Default Laya budget: CPU inference is 193-464ms, so it is wider than Jev's. */
export const DEFAULT_LAYA_TIMEOUT_MS = 1000

/** Reads decision.laya.timeoutMs, clamped to [50, 30000], default 1000. */
export function resolveLayaTimeoutMs(flags: DecisionFlagReader): number {
	const raw = flags.getFlag('decision.laya.timeoutMs')
	if (raw === null || raw === undefined) return DEFAULT_LAYA_TIMEOUT_MS
	const n = typeof raw === 'number' ? raw : Number(raw)
	if (!Number.isFinite(n)) return DEFAULT_LAYA_TIMEOUT_MS
	return Math.min(30_000, Math.max(50, n))
}

/**
 * Reads the training-readiness gate `decision.laya.ready` (KS-LAYA §B.5).
 *
 * Defaults to FALSE — the safe state. Only Andler flips this (not an agent).
 * While false, Laya never serves live traffic; it runs in shadow mode.
 */
export function resolveLayaReady(flags: DecisionFlagReader): boolean {
	const raw = flags.getFlag('decision.laya.ready')
	if (raw === null || raw === undefined) return false
	if (typeof raw === 'boolean') return raw
	if (typeof raw === 'number') return raw === 1
	if (typeof raw === 'string') return raw === 'true' || raw === '1'
	return false
}

/**
 * Per-provider decision budget. Jev is designed for 500ms (D2); Laya on CPU
 * needs more headroom, so it has its own flag rather than sharing Jev's.
 */
export function resolveBudgetMs(
	name: ProviderName,
	flags: DecisionFlagReader,
): number {
	return name === 'laya' ? resolveLayaTimeoutMs(flags) : resolveTimeoutMs(flags)
}

function failClosed(
	name: string,
	reason: string,
	latencyMs: number,
): DecisionResult {
	return {
		label: 'review',
		score: 0.5,
		confidence: 0,
		action: 'review',
		reasons: [reason],
		provider: name,
		degraded: true,
		failureKind: 'transport',
		latencyMs,
	}
}

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	onTimeout: () => T,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => resolve(onTimeout()), ms)
		promise.then(
			(v) => {
				clearTimeout(timer)
				resolve(v)
			},
			(e) => {
				clearTimeout(timer)
				reject(e)
			},
		)
	})
}

/** Enforce the three fail-closed invariants on a provider result. */
function applyInvariants(
	result: DecisionResult,
	threshold: number,
): DecisionResult {
	// Invariant #1: degraded → review.
	if (result.degraded) return { ...result, action: 'review' }
	// Invariant #2: low confidence → review.
	if (result.confidence < threshold) return { ...result, action: 'review' }
	// Invariant #3: belt & braces.
	if (result.action === 'forward' && result.degraded) {
		return { ...result, action: 'review' }
	}
	return result
}

type ProviderOutcome =
	| { kind: 'ok'; result: DecisionResult }
	| { kind: 'semantic'; result: DecisionResult }
	| { kind: 'transport'; reason: string }

/** Run one provider under its budget; classify the failure. Never throws. */
async function runProvider(
	name: ProviderName,
	provider: { decide(input: DecisionInput): Promise<DecisionResult> },
	input: DecisionInput,
	flags: DecisionFlagReader,
	started: number,
): Promise<ProviderOutcome> {
	const hardTimeout = resolveBudgetMs(name, flags) + HARD_TIMEOUT_SLACK_MS
	let result: DecisionResult
	try {
		result = await withTimeout(provider.decide(input), hardTimeout, () =>
			failClosed(name, `provider timeout: ${name}`, Date.now() - started),
		)
	} catch (err: any) {
		return {
			kind: 'transport',
			reason: `provider error: ${err?.message ?? 'unknown'}`,
		}
	}
	if (result.degraded) {
		// Only an explicit TRANSPORT failure advances the chain (KS-LAYA §B.2).
		// A provider that answered but produced an unusable result — or one that
		// did not classify its failure — is treated as SEMANTIC: fail closed to
		// review, do not fall back (confidence fallback is deferred).
		if (result.failureKind === 'transport') {
			return {
				kind: 'transport',
				reason: result.reasons[0] ?? `provider unavailable: ${name}`,
			}
		}
		return { kind: 'semantic', result }
	}
	return { kind: 'ok', result }
}

/** Fallback visibility payload (KS-LAYA §B.2). */
export interface FallbackInfo {
	/** The primary provider that was unavailable. */
	primary: string
	/** The provider that actually answered. */
	answeredBy: string
	/** Why the primary was skipped (transport reason). */
	reason: string
}

/** Shadow-mode payload (KS-LAYA §B.5). */
export interface ShadowInfo {
	/** Always 'laya' today. */
	provider: string
	/** What Laya would have decided. */
	result: DecisionResult
	/** The provider that actually served the live decision. */
	servedBy: string
	/** The live decision, for agreement computation. */
	live: DecisionResult
}

export interface DecideWithProviderOpts {
	defaultProvider?: ProviderName
	defaultThreshold?: number
	/** Called when a fallback provider answered (audit-chain entry). */
	onFallback?: (info: FallbackInfo) => void | Promise<void>
	/** Called with the shadow (non-serving) Laya result while the gate is closed. */
	onShadow?: (info: ShadowInfo) => void | Promise<void>
	/**
	 * Await the shadow call before returning. Default false: shadow runs
	 * fire-and-forget so it never adds latency to the live kill-switch path.
	 * Tests set this true for determinism.
	 */
	awaitShadow?: boolean
}

/**
 * The single fail-closed entry point. NEVER throws.
 */
export async function decideWithProvider(
	input: DecisionInput,
	flags: DecisionFlagReader,
	registry: ProviderRegistry,
	opts?: DecideWithProviderOpts,
): Promise<DecisionResult> {
	const started = Date.now()
	const chain = opts?.defaultProvider
		? [opts.defaultProvider]
		: resolveProviderChain(flags)
	const threshold = opts?.defaultThreshold ?? resolveReviewThreshold(flags)
	const layaReady = resolveLayaReady(flags)

	// ─── Training-readiness gate (Option C, §B.5) ───────────────────────
	// While Laya is not ready it must NEVER serve live traffic. Filter it out
	// of the serving chain and run it in shadow mode alongside the live provider.
	const servingChain = chain.filter((n) => n !== 'laya' || layaReady)
	const shadowLaya = !layaReady && chain.includes('laya')

	const runShadow = async (
		servedBy: string,
		live: DecisionResult,
	): Promise<void> => {
		if (!shadowLaya || !opts?.onShadow) return
		const provider = registry.get('laya')
		if (!provider) return
		const outcome = await runProvider('laya', provider, input, flags, started)
		const result =
			outcome.kind === 'ok'
				? applyInvariants(outcome.result, threshold)
				: outcome.kind === 'semantic'
					? { ...outcome.result, action: 'review' as const }
					: failClosed('laya', outcome.reason, Date.now() - started)
		await opts.onShadow({ provider: 'laya', result, servedBy, live })
	}

	const scheduleShadow = (servedBy: string, live: DecisionResult): void => {
		if (!shadowLaya || !opts?.onShadow) return
		if (opts.awaitShadow) return // awaited by the caller below
		// Fire-and-forget: shadow must never affect the live path.
		void Promise.resolve(runShadow(servedBy, live)).catch(() => {})
	}

	// Gate removed every provider → fail closed (never silently serve).
	if (servingChain.length === 0) {
		const name = chain[0] ?? DEFAULT_PROVIDER
		const result = failClosed(
			name,
			`provider unavailable: ${name}`,
			Date.now() - started,
		)
		if (opts?.awaitShadow) await runShadow(name, result)
		else scheduleShadow(name, result)
		return result
	}

	const primary = servingChain[0]
	let lastTransportReason = ''
	let primaryReason = ''

	for (let i = 0; i < servingChain.length; i++) {
		const name = servingChain[i]
		const provider = registry.get(name)
		if (!provider) {
			lastTransportReason = `provider unavailable: ${name}`
			if (i === 0) primaryReason = lastTransportReason
			continue
		}

		const outcome = await runProvider(name, provider, input, flags, started)

		if (outcome.kind === 'semantic') {
			// Fail closed; do NOT advance the chain.
			const result = { ...outcome.result, action: 'review' as const }
			if (opts?.awaitShadow) await runShadow(name, result)
			else scheduleShadow(name, result)
			return result
		}

		if (outcome.kind === 'transport') {
			lastTransportReason = outcome.reason
			if (i === 0) primaryReason = outcome.reason
			continue
		}

		// Provider answered.
		let result = applyInvariants(outcome.result, threshold)

		if (i > 0) {
			// Fallback visibility (§B.2): mark degraded (→ review) and name the
			// provider that actually answered. Never silently serve from Jev.
			result = {
				...result,
				degraded: true,
				action: 'review',
				fallbackFrom: primary,
				reasons: [
					...result.reasons,
					`fallback: ${name} answered after ${primary} unavailable (${lastTransportReason})`,
				],
			}
			try {
				await opts?.onFallback?.({
					primary,
					answeredBy: name,
					reason: lastTransportReason,
				})
			} catch {
				// Audit failure must not change the decision.
			}
		}

		if (opts?.awaitShadow) await runShadow(name, result)
		else scheduleShadow(name, result)
		return result
	}

	// Every provider in the chain failed at the transport layer.
	const result = failClosed(
		primary,
		primaryReason || lastTransportReason || `provider unavailable: ${primary}`,
		Date.now() - started,
	)
	if (opts?.awaitShadow) await runShadow(primary, result)
	else scheduleShadow(primary, result)
	return result
}
