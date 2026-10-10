/**
 * Selector — the fail-closed safety property + KS-LAYA chain/gate semantics.
 *
 * The invariants under test are the reason this feature can ship:
 *   #1 degraded → review
 *   #2 low confidence → review
 *   #3 never forward while degraded
 * Plus: unknown/unavailable provider → review, never forward.
 *
 * KS-LAYA (§B.2 + §B.5):
 *   - ordered fallback chain (code default ["laya","jev"] + flag override)
 *   - transport-only fallback; semantic failures fail closed without falling back
 *   - fallback visibility (degraded + fallbackFrom + onFallback)
 *   - training-readiness gate (Laya never serves while decision.laya.ready=false)
 *   - shadow mode (Laya logs what it would have decided)
 */

import { describe, expect, it } from 'bun:test'
import type {
	DecisionFlagReader,
	DecisionProvider,
	DecisionResult,
} from '@align/shared-types'
import { ProviderRegistry } from '../registry'
import {
	DEFAULT_PROVIDER,
	DEFAULT_PROVIDER_CHAIN,
	decideWithProvider,
	resolveLayaReady,
	resolveProviderChain,
	resolveProviderName,
	resolveReviewThreshold,
	resolveTimeoutMs,
} from '../selector'

function flags(map: Record<string, unknown>): DecisionFlagReader {
	return { getFlag: (k) => (k in map ? (map[k] as any) : null) }
}

function provider(
	name: string,
	result: Partial<DecisionResult>,
): DecisionProvider {
	return {
		name: name as any,
		decide: async () => ({
			label: 'safe',
			score: 0,
			confidence: 1,
			action: 'forward',
			reasons: [],
			provider: name,
			degraded: false,
			latencyMs: 1,
			...result,
		}),
	}
}

/** A provider that fails at the transport layer (connect error). */
function transportFail(name: string): DecisionProvider {
	return {
		name: name as any,
		decide: async () => ({
			label: 'review',
			score: 0.5,
			confidence: 0,
			action: 'review',
			reasons: [`${name}: sidecar unreachable`],
			provider: name,
			degraded: true,
			failureKind: 'transport',
			latencyMs: 1,
		}),
	}
}

/** A provider that answers but with an unusable (semantic) result. */
function semanticFail(name: string): DecisionProvider {
	return {
		name: name as any,
		decide: async () => ({
			label: 'review',
			score: 0.5,
			confidence: 0.5,
			action: 'review',
			reasons: [`${name}: unknown label`],
			provider: name,
			degraded: true,
			failureKind: 'semantic',
			latencyMs: 1,
		}),
	}
}

describe('resolveProviderName', () => {
	it('defaults to laya (the shipped default provider)', () => {
		expect(resolveProviderName(flags({}))).toBe(DEFAULT_PROVIDER)
		expect(DEFAULT_PROVIDER).toBe('laya')
	})

	it('accepts a valid provider', () => {
		expect(resolveProviderName(flags({ 'decision.provider': 'jev' }))).toBe(
			'jev',
		)
	})

	it('falls back to laya for an unknown value', () => {
		expect(resolveProviderName(flags({ 'decision.provider': 'bogus' }))).toBe(
			'laya',
		)
	})
})

describe('resolveProviderChain (KS-LAYA §B.2, Option C)', () => {
	it('defaults to ["laya","jev"] with no flags set', () => {
		expect(resolveProviderChain(flags({}))).toEqual(['laya', 'jev'])
		expect(DEFAULT_PROVIDER_CHAIN).toEqual(['laya', 'jev'])
	})

	it('honours a decision.providerChain override (ordered)', () => {
		expect(
			resolveProviderChain(flags({ 'decision.providerChain': 'jev,laya' })),
		).toEqual(['jev', 'laya'])
	})

	it('drops unknown names from the override', () => {
		expect(
			resolveProviderChain(
				flags({ 'decision.providerChain': 'jev,bogus,laya' }),
			),
		).toEqual(['jev', 'laya'])
	})

	it('falls back to the code default when the override is all-unknown', () => {
		expect(
			resolveProviderChain(flags({ 'decision.providerChain': 'bogus' })),
		).toEqual(['laya', 'jev'])
	})

	it('prepends the resolved single provider and dedupes', () => {
		expect(
			resolveProviderChain(flags({ 'decision.provider': 'keyword' })),
		).toEqual(['keyword', 'laya', 'jev'])
	})
})

describe('resolveLayaReady (KS-LAYA §B.5 gate)', () => {
	it('defaults to false (gate closed — shadow only)', () => {
		expect(resolveLayaReady(flags({}))).toBe(false)
	})

	it('accepts boolean / string / numeric truthy forms', () => {
		expect(resolveLayaReady(flags({ 'decision.laya.ready': true }))).toBe(true)
		expect(resolveLayaReady(flags({ 'decision.laya.ready': 'true' }))).toBe(
			true,
		)
		expect(resolveLayaReady(flags({ 'decision.laya.ready': '1' }))).toBe(true)
		expect(resolveLayaReady(flags({ 'decision.laya.ready': 1 }))).toBe(true)
		expect(resolveLayaReady(flags({ 'decision.laya.ready': 'false' }))).toBe(
			false,
		)
	})
})

describe('resolveReviewThreshold / resolveTimeoutMs', () => {
	it('defaults threshold to 0.6 and clamps', () => {
		expect(resolveReviewThreshold(flags({}))).toBe(0.6)
		expect(
			resolveReviewThreshold(flags({ 'decision.review_threshold': 1.5 })),
		).toBe(1)
		expect(
			resolveReviewThreshold(flags({ 'decision.review_threshold': -1 })),
		).toBe(0)
	})

	it('defaults timeout to 500 (D2) and clamps', () => {
		expect(resolveTimeoutMs(flags({}))).toBe(500)
		expect(resolveTimeoutMs(flags({ 'decision.jev.timeoutMs': 10 }))).toBe(50)
		expect(resolveTimeoutMs(flags({ 'decision.jev.timeoutMs': 99999 }))).toBe(
			30000,
		)
	})
})

describe('decideWithProvider — fail-closed invariants', () => {
	it('unknown provider → review + degraded (never forward)', async () => {
		const reg = new ProviderRegistry()
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.provider': 'jev', 'decision.providerChain': 'jev' }),
			reg,
		)
		expect(r.action).toBe('review')
		expect(r.degraded).toBe(true)
		expect(r.reasons.join(' ')).toContain('provider unavailable')
	})

	it('INVARIANT #1: a degraded result is forced to review', async () => {
		const reg = new ProviderRegistry()
		reg.register(
			provider('keyword', { degraded: true, action: 'forward', confidence: 1 }),
		)
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({
				'decision.provider': 'keyword',
				'decision.providerChain': 'keyword',
			}),
			reg,
		)
		expect(r.action).toBe('review')
	})

	it('INVARIANT #2: confidence below threshold is forced to review', async () => {
		const reg = new ProviderRegistry()
		reg.register(provider('keyword', { confidence: 0.3, action: 'forward' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({
				'decision.provider': 'keyword',
				'decision.providerChain': 'keyword',
				'decision.review_threshold': 0.6,
			}),
			reg,
		)
		expect(r.action).toBe('review')
	})

	it('a confident, non-degraded result passes through unchanged', async () => {
		const reg = new ProviderRegistry()
		reg.register(
			provider('keyword', {
				confidence: 0.9,
				action: 'block',
				label: 'unsafe',
			}),
		)
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({
				'decision.provider': 'keyword',
				'decision.providerChain': 'keyword',
			}),
			reg,
		)
		expect(r.action).toBe('block')
		expect(r.label).toBe('unsafe')
	})

	it('a provider that throws → review + degraded', async () => {
		const reg = new ProviderRegistry()
		reg.register({
			name: 'keyword' as any,
			decide: async () => {
				throw new Error('boom')
			},
		})
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({
				'decision.provider': 'keyword',
				'decision.providerChain': 'keyword',
			}),
			reg,
		)
		expect(r.action).toBe('review')
		expect(r.degraded).toBe(true)
		expect(r.reasons.join(' ')).toContain('provider error')
	})

	it('a provider that hangs → hard timeout → review + degraded', async () => {
		const reg = new ProviderRegistry()
		reg.register({
			name: 'keyword' as any,
			decide: () => new Promise(() => {}), // never resolves
		})
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({
				'decision.provider': 'keyword',
				'decision.providerChain': 'keyword',
				'decision.jev.timeoutMs': 50,
			}),
			reg,
		)
		expect(r.action).toBe('review')
		expect(r.degraded).toBe(true)
		expect(r.reasons.join(' ')).toContain('timeout')
	})
})

describe('decideWithProvider — fallback chain (KS-LAYA §B.2)', () => {
	it('primary answers → no fallback, not degraded', async () => {
		const reg = new ProviderRegistry()
		reg.register(provider('laya', { confidence: 0.9, action: 'block' }))
		reg.register(provider('jev', { confidence: 0.9, action: 'forward' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
		)
		expect(r.provider).toBe('laya')
		expect(r.degraded).toBe(false)
		expect(r.fallbackFrom).toBeUndefined()
	})

	it('primary transport-fails → fallback answers, degraded + fallbackFrom', async () => {
		const reg = new ProviderRegistry()
		reg.register(transportFail('laya'))
		reg.register(provider('jev', { confidence: 0.9, action: 'block' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
		)
		expect(r.provider).toBe('jev')
		expect(r.degraded).toBe(true)
		expect(r.action).toBe('review') // never silently serve from Jev
		expect(r.fallbackFrom).toBe('laya')
		expect(r.reasons.join(' ')).toContain('fallback')
	})

	it('calls onFallback with the answering provider (audit visibility)', async () => {
		const reg = new ProviderRegistry()
		reg.register(transportFail('laya'))
		reg.register(provider('jev', { confidence: 0.9, action: 'block' }))
		const seen: any[] = []
		await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
			{ onFallback: (info) => void seen.push(info) },
		)
		expect(seen.length).toBe(1)
		expect(seen[0].primary).toBe('laya')
		expect(seen[0].answeredBy).toBe('jev')
	})

	it('a SEMANTIC failure fails closed and does NOT fall back', async () => {
		const reg = new ProviderRegistry()
		reg.register(semanticFail('laya'))
		reg.register(provider('jev', { confidence: 0.9, action: 'block' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
		)
		expect(r.provider).toBe('laya')
		expect(r.action).toBe('review')
		expect(r.degraded).toBe(true)
		expect(r.fallbackFrom).toBeUndefined()
	})

	it('every provider transport-fails → review + degraded', async () => {
		const reg = new ProviderRegistry()
		reg.register(transportFail('laya'))
		reg.register(transportFail('jev'))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
		)
		expect(r.action).toBe('review')
		expect(r.degraded).toBe(true)
	})

	it('an unregistered primary is skipped for the next registered provider', async () => {
		const reg = new ProviderRegistry()
		reg.register(provider('jev', { confidence: 0.9, action: 'block' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
		)
		expect(r.provider).toBe('jev')
		expect(r.fallbackFrom).toBe('laya')
	})
})

describe('decideWithProvider — training-readiness gate (KS-LAYA §B.5)', () => {
	it('gate closed → Laya never serves; the next provider serves normally', async () => {
		const reg = new ProviderRegistry()
		reg.register(provider('laya', { confidence: 0.9, action: 'block' }))
		reg.register(provider('jev', { confidence: 0.9, action: 'block' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({}), // decision.laya.ready defaults false
			reg,
		)
		// The gate is deliberate configuration, not a failure: Jev is the primary
		// of the gated chain, so the result is NOT degraded and has no fallbackFrom
		// (marking it degraded would reproduce the "every decision fails closed"
		// landmine the gate exists to avoid).
		expect(r.provider).toBe('jev')
		expect(r.degraded).toBe(false)
		expect(r.fallbackFrom).toBeUndefined()
	})

	it('gate closed + Laya is the only provider → fail closed (never serve)', async () => {
		const reg = new ProviderRegistry()
		reg.register(provider('laya', { confidence: 0.9, action: 'block' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.providerChain': 'laya' }),
			reg,
		)
		expect(r.action).toBe('review')
		expect(r.degraded).toBe(true)
	})

	it('gate open → Laya serves', async () => {
		const reg = new ProviderRegistry()
		reg.register(provider('laya', { confidence: 0.9, action: 'block' }))
		const r = await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
		)
		expect(r.provider).toBe('laya')
		expect(r.action).toBe('block')
	})

	it('gate closed → shadow runs Laya and reports what it would have decided', async () => {
		const reg = new ProviderRegistry()
		reg.register(
			provider('laya', { confidence: 0.9, action: 'block', label: 'unsafe' }),
		)
		reg.register(
			provider('jev', { confidence: 0.9, action: 'forward', label: 'safe' }),
		)
		const shadows: any[] = []
		await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({}),
			reg,
			{ awaitShadow: true, onShadow: (info) => void shadows.push(info) },
		)
		expect(shadows.length).toBe(1)
		expect(shadows[0].provider).toBe('laya')
		expect(shadows[0].servedBy).toBe('jev')
		expect(shadows[0].result.label).toBe('unsafe')
		expect(shadows[0].live.label).toBe('safe')
	})

	it('gate open → no shadow run', async () => {
		const reg = new ProviderRegistry()
		reg.register(provider('laya', { confidence: 0.9, action: 'block' }))
		const shadows: any[] = []
		await decideWithProvider(
			{ kind: 'prompt', text: 'x', machineId: 'm1' },
			flags({ 'decision.laya.ready': true }),
			reg,
			{ awaitShadow: true, onShadow: (info) => void shadows.push(info) },
		)
		expect(shadows.length).toBe(0)
	})
})
