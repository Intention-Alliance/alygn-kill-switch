/**
 * VerificationService — Unit Tests
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §f.1.
 *
 * Covers: UNSAFE → transitionTo('STOPPED') with reason 'inference-unsafe';
 * SAFE → no kill; REVIEW → no kill + event published; autoKillOnUnsafe=false
 * → no kill; ASYNC mode returns immediately (does not await verifier); SYNC
 * mode awaits + rejects UNSAFE; degraded → REVIEW, no kill; STOPPED→STOPPED
 * double-transition guard.
 */

import { describe, expect, it, mock } from 'bun:test'
import { VerificationService } from '../verification-service'
import type { InferenceVerifier, VerificationResult } from '../verifier'

// ─── Mock verifier ──────────────────────────────────────────────

function makeVerifier(
	verdict: VerificationResult['verdict'],
	degraded = false,
): InferenceVerifier {
	return {
		verify: async () => ({
			verdict,
			confidence: verdict === 'REVIEW' ? 0.5 : 0.9,
			reason: 'mock reason',
			latencyMs: 10,
			model: 'mock-model',
			degraded,
		}),
		health: async () => ({ ok: true, model: 'mock-model', latencyMs: 10 }),
	} as unknown as InferenceVerifier
}

// ─── Mock kill switch ───────────────────────────────────────────

function makeKillSwitch(initialState = 'RUNNING') {
	let state = initialState
	const transitions: Array<{ newState: string; metadata: any }> = []
	return {
		getCurrentState: async () => state,
		transitionTo: async (newState: string, metadata: any) => {
			transitions.push({ newState, metadata })
			state = newState
			return {
				id: 'audit-1',
				previousState: 'RUNNING',
				newState,
				timestamp: new Date().toISOString(),
				traceId: 'trace-1',
				initiatedBy: metadata?.userId || 'system',
				reason: metadata?.reason || 'manual',
				ip: metadata?.ip || 'unknown',
			}
		},
		transitions,
		setState: (s: string) => {
			state = s
		},
	}
}

// ─── Mock publish ───────────────────────────────────────────────

function makePublish() {
	const messages: Array<{ channel: string; msg: string }> = []
	return {
		publish: async (channel: string, msg: string) => {
			messages.push({ channel, msg })
		},
		messages,
	}
}

// ─── Tests ──────────────────────────────────────────────────────

describe('VerificationService — UNSAFE handling', () => {
	it('UNSAFE → fingerprint-scoped block (P1-1) without escalation when no prior UNSAFE in window', async () => {
		const ks = makeKillSwitch('RUNNING')
		const service = new VerificationService({
			verifier: makeVerifier('UNSAFE'),
			mode: 'sync',
			killSwitch: ks as any,
			persistEvents: false,
		})
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
			machineId: 'machine-xyz',
			fingerprintSource: { body: { machineId: 'machine-xyz' } },
		})

		expect(result.mode).toBe('sync')
		expect(result.result?.verdict).toBe('UNSAFE')
		// No prior UNSAFE in the DB window → no escalation → no transition.
		expect(ks.transitions.length).toBe(0)
		// The fingerprint should be blocked now.
		const { checkFingerprintBlocked } = await import('../../fingerprint-pause')
		const block = checkFingerprintBlocked('machine:machine-xyz')
		expect(block).toBeDefined()
		expect(block?.reason).toContain('UNSAFE verdict')
	})

	it('UNSAFE threads the flagged machineId into the fingerprint block (P2-A + P1-1)', async () => {
		const ks = makeKillSwitch('RUNNING')
		const service = new VerificationService({
			verifier: makeVerifier('UNSAFE'),
			mode: 'sync',
			killSwitch: ks as any,
			persistEvents: false,
		})
		await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
			machineId: 'machine-xyz',
			fingerprintSource: { body: { machineId: 'machine-xyz' } },
		})

		// P1-1: the scoped blocklist records the fingerprint, NOT a global
		// transition. The machineId is part of the fingerprint derivation.
		const { checkFingerprintBlocked } = await import('../../fingerprint-pause')
		const block = checkFingerprintBlocked('machine:machine-xyz')
		expect(block).toBeDefined()
		expect(ks.transitions.length).toBe(0)
	})

	it('UNSAFE does not double-transition when already STOPPED', async () => {
		const ks = makeKillSwitch('STOPPED')
		const service = new VerificationService({
			verifier: makeVerifier('UNSAFE'),
			mode: 'sync',
			killSwitch: ks as any,
			persistEvents: false,
		})
		await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})

		// Already STOPPED → skip transition (no audit spam).
		expect(ks.transitions.length).toBe(0)
	})

	it('UNSAFE with autoKillOnUnsafe=false → no kill', async () => {
		const ks = makeKillSwitch('RUNNING')
		const service = new VerificationService({
			verifier: makeVerifier('UNSAFE'),
			mode: 'sync',
			autoKillOnUnsafe: false,
			killSwitch: ks as any,
			persistEvents: false,
		})
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})

		expect(result.result?.verdict).toBe('UNSAFE')
		expect(ks.transitions.length).toBe(0)
	})

	it('UNSAFE with no killSwitch injected → no kill, no throw', async () => {
		const service = new VerificationService({
			verifier: makeVerifier('UNSAFE'),
			mode: 'sync',
			persistEvents: false,
		})
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})
		expect(result.result?.verdict).toBe('UNSAFE')
	})
})

describe('VerificationService — SAFE / REVIEW / degraded', () => {
	it('SAFE → no kill', async () => {
		const ks = makeKillSwitch('RUNNING')
		const service = new VerificationService({
			verifier: makeVerifier('SAFE'),
			mode: 'sync',
			killSwitch: ks as any,
			persistEvents: false,
		})
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})
		expect(result.result?.verdict).toBe('SAFE')
		expect(ks.transitions.length).toBe(0)
	})

	it('REVIEW → no kill, event published', async () => {
		const ks = makeKillSwitch('RUNNING')
		const pub = makePublish()
		const service = new VerificationService({
			verifier: makeVerifier('REVIEW'),
			mode: 'sync',
			killSwitch: ks as any,
			publish: pub.publish,
			persistEvents: false,
		})
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})

		expect(result.result?.verdict).toBe('REVIEW')
		expect(ks.transitions.length).toBe(0)
		// Event published on bcp:verification:events
		expect(pub.messages.length).toBe(1)
		expect(pub.messages[0].channel).toBe('bcp:verification:events')
		const payload = JSON.parse(pub.messages[0].msg)
		expect(payload.payload.verdict).toBe('REVIEW')
		expect(payload.payload.triggeredKill).toBe(false)
	})

	it('degraded → REVIEW, no kill', async () => {
		const ks = makeKillSwitch('RUNNING')
		const service = new VerificationService({
			verifier: makeVerifier('REVIEW', true),
			mode: 'sync',
			killSwitch: ks as any,
			persistEvents: false,
		})
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})
		expect(result.result?.verdict).toBe('REVIEW')
		expect(result.result?.degraded).toBe(true)
		expect(ks.transitions.length).toBe(0)
	})
})

describe('VerificationService — async vs sync mode', () => {
	it('ASYNC mode returns immediately (does not await verifier)', async () => {
		let verifyCalled = false
		const slowVerifier = {
			verify: async () => {
				verifyCalled = true
				await new Promise((r) => setTimeout(r, 50))
				return {
					verdict: 'SAFE',
					confidence: 0.9,
					reason: '',
					latencyMs: 50,
					model: 'm',
					degraded: false,
				}
			},
			health: async () => ({ ok: true, model: 'm', latencyMs: 1 }),
		} as unknown as InferenceVerifier

		const service = new VerificationService({
			verifier: slowVerifier,
			mode: 'async',
			persistEvents: false,
		})

		const start = Date.now()
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})
		const elapsed = Date.now() - start

		// Returns immediately with no result (fire-and-forget).
		expect(result.mode).toBe('async')
		expect(result.result).toBeUndefined()
		expect(elapsed).toBeLessThan(50)
		// The verifier is invoked (detached) but not awaited by the caller.
		expect(verifyCalled).toBe(true)
	})

	it('SYNC mode awaits and returns the result', async () => {
		const service = new VerificationService({
			verifier: makeVerifier('SAFE'),
			mode: 'sync',
			persistEvents: false,
		})
		const result = await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
		})
		expect(result.mode).toBe('sync')
		expect(result.result?.verdict).toBe('SAFE')
	})
})

describe('VerificationService — event persistence', () => {
	it('persists a verification_event row when persistEvents=true', async () => {
		// We don't want to hit the real DB in this unit test, so we mock the
		// verification-event module's recordVerificationEvent.
		let recorded: any = null
		mock.module('../verification-event', () => ({
			recordVerificationEvent: async (input: any) => {
				recorded = input
				return 'event-id'
			},
			VERIFICATION_EVENTS_CHANNEL: 'bcp:verification:events',
		}))

		const service = new VerificationService({
			verifier: makeVerifier('SAFE'),
			mode: 'sync',
			persistEvents: true,
		})
		await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r1',
			machineId: 'm1',
		})

		expect(recorded).not.toBeNull()
		expect(recorded.requestId).toBe('r1')
		expect(recorded.machineId).toBe('m1')
		expect(recorded.result.verdict).toBe('SAFE')
		expect(recorded.triggeredKill).toBe(false)
	})

	// ─── P1-3: outputTruncated propagation ────────────────────────

	it('threads outputTruncated into the verification_event row (P1-3)', async () => {
		let recorded: any = null
		mock.module('../verification-event', () => ({
			recordVerificationEvent: async (input: any) => {
				recorded = input
				return 'event-id'
			},
			VERIFICATION_EVENTS_CHANNEL: 'bcp:verification:events',
		}))

		const service = new VerificationService({
			verifier: makeVerifier('SAFE'),
			mode: 'sync',
			persistEvents: true,
		})
		await service.handleInferenceRequest({
			prompt: 'p',
			output: 'truncated output text',
			requestId: 'r-trunc',
			outputTruncated: true,
		})

		expect(recorded).not.toBeNull()
		expect(recorded.outputTruncated).toBe(true)
	})

	it('records outputTruncated:false when caller does not set the flag', async () => {
		let recorded: any = null
		mock.module('../verification-event', () => ({
			recordVerificationEvent: async (input: any) => {
				recorded = input
				return 'event-id'
			},
			VERIFICATION_EVENTS_CHANNEL: 'bcp:verification:events',
		}))

		const service = new VerificationService({
			verifier: makeVerifier('SAFE'),
			mode: 'sync',
			persistEvents: true,
		})
		await service.handleInferenceRequest({
			prompt: 'p',
			output: 'o',
			requestId: 'r-no-trunc',
		})

		expect(recorded).not.toBeNull()
		expect(recorded.outputTruncated).toBeFalsy()
	})
})
