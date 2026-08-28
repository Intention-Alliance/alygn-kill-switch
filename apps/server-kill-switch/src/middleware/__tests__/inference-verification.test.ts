/**
 * Inference Verification Middleware Tests
 *
 * Verifies that the middleware correctly:
 * - Passes machineId from the request body to the verification service
 * - Returns { verified: false } when verification is not applicable
 * - Handles async mode (no blocking, fire-and-forget)
 * - Handles sync mode (blocking on UNSAFE)
 *
 * P2-1 fix verification: machineId is threaded from request body →
 * checkInferenceVerification → VerificationService.handleInferenceRequest.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import type {
	HandleInferenceResult,
	VerificationService,
} from '../../services/verification/verification-service'
import type { VerificationResult } from '../../services/verification/verifier'
import {
	checkInferenceVerification,
	verifyInferenceOutput,
} from '../inference-verification'

// ─── Mock VerificationService ────────────────────────────────────

let lastMachineId: string | undefined
let lastRequestId: string | undefined

function createMockService(
	overrides: {
		mode?: 'async' | 'sync'
		verdict?: 'SAFE' | 'UNSAFE' | 'REVIEW'
	} = {},
): VerificationService {
	const mode = overrides.mode ?? 'async'
	const verdict = overrides.verdict ?? 'SAFE'
	const result: VerificationResult = {
		verdict,
		confidence: 0.95,
		reason: verdict === 'UNSAFE' ? 'harmful content' : 'test-safe',
		degraded: false,
		latencyMs: 10,
		model: 'test-model',
	}
	const base = {
		mode,
		handleInferenceRequest: (opts: {
			prompt: string
			output: string
			requestId: string
			machineId?: string
		}) => {
			lastMachineId = opts.machineId
			lastRequestId = opts.requestId
			if (mode === 'sync') {
				return Promise.resolve({
					mode: 'sync',
					result,
				} satisfies HandleInferenceResult)
			}
			return Promise.resolve({ mode: 'async' } satisfies HandleInferenceResult)
		},
	}
	return base as unknown as VerificationService
}

describe('checkInferenceVerification', () => {
	beforeEach(() => {
		lastMachineId = undefined
		lastRequestId = undefined
	})

	it('returns { verified: false } for non-inference requests (GET)', () => {
		const service = createMockService()
		const result = checkInferenceVerification(
			'GET',
			'/v1/health',
			null,
			service,
			'req-1',
		)
		expect(result.verified).toBe(false)
		expect(result.awaitDecision).toBeUndefined()
	})

	it('returns { verified: false } for non-inference paths', () => {
		const service = createMockService()
		const result = checkInferenceVerification(
			'POST',
			'/v1/auth/login',
			{ prompt: 'hi' },
			service,
			'req-2',
		)
		expect(result.verified).toBe(false)
	})

	it('returns { verified: false } when body is null', () => {
		const service = createMockService()
		const result = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			null,
			service,
			'req-3',
		)
		expect(result.verified).toBe(false)
	})

	it('returns { verified: false } when body has no prompt/output', () => {
		const service = createMockService()
		const result = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			{ foo: 'bar' } as any,
			service,
			'req-4',
		)
		expect(result.verified).toBe(false)
	})

	it('threads machineId from request body to verification service (P2-1 fix)', async () => {
		const service = createMockService()
		const body = {
			prompt: 'Write a poem',
			output: 'Roses are red',
			machineId: 'machine-42',
		}
		const result = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			body,
			service,
			'req-5',
			body.machineId,
		)
		expect(result.verified).toBe(true)
		// In async mode, the handle is fired — wait a tick for the promise to resolve
		await new Promise((r) => setTimeout(r, 10))
		expect(lastMachineId).toBe('machine-42')
		expect(lastRequestId).toBe('req-5')
	})

	it('works without machineId (undefined is acceptable)', async () => {
		const service = createMockService()
		const body = {
			prompt: 'Write a poem',
			output: 'Roses are red',
		}
		const result = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			body,
			service,
			'req-6',
			undefined,
		)
		expect(result.verified).toBe(true)
		await new Promise((r) => setTimeout(r, 10))
		expect(lastMachineId).toBeUndefined()
	})

	it('fires verification in async mode without awaitDecision (fire-and-forget)', () => {
		const service = createMockService({ mode: 'async' })
		const body = { prompt: 'test', output: 'result' }
		const result = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			body,
			service,
			'req-7',
			'm-7',
		)
		expect(result.verified).toBe(true)
		expect(result.awaitDecision).toBeUndefined()
	})

	it('provides awaitDecision in sync mode for SAFE (no reject)', async () => {
		const syncService = createMockService({ mode: 'sync', verdict: 'SAFE' })
		const body = { prompt: 'test', output: 'result', machineId: 'm-8' }
		const result = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			body,
			syncService,
			'req-8',
			'm-8',
		)
		expect(result.verified).toBe(true)
		expect(result.awaitDecision).toBeDefined()
		const decision = await result.awaitDecision!
		expect(decision.verified).toBe(true)
		expect(decision.reject).toBeUndefined()
	})

	it('rejects with 403 in sync mode when verdict is UNSAFE', async () => {
		const unsafeService = createMockService({ mode: 'sync', verdict: 'UNSAFE' })
		const body = { prompt: 'hack', output: 'malicious', machineId: 'm-9' }
		const result = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			body,
			unsafeService,
			'req-9',
			'm-9',
		)
		const decision = await result.awaitDecision!
		expect(decision.reject).toBeDefined()
		expect(decision.reject?.status).toBe(403)
		expect(decision.reject?.body).toHaveProperty('error')
	})
})

// ─── verifyInferenceOutput — P1-1 (Stage 2 fix) ──────────────────
// Output post-relay verification. Same VerificationService.handleInferenceRequest
// contract, but the caller is `index.ts` after `relayInferenceRequest()` returns.
// Threads (prompt, output, requestId, machineId, outputTruncated, streamMode)
// so the verification_event row gets both prompt+output hashes.

describe('verifyInferenceOutput (P1-1)', () => {
	let lastHandleCall: {
		prompt: string
		output: string
		requestId: string
		machineId?: string
		outputTruncated?: boolean
	} | null

	beforeEach(() => {
		lastHandleCall = null
	})

	function captureService(): VerificationService {
		return {
			mode: 'async',
			handleInferenceRequest: (opts) => {
				lastHandleCall = {
					prompt: opts.prompt,
					output: opts.output,
					requestId: opts.requestId,
					machineId: opts.machineId,
					outputTruncated: opts.outputTruncated,
				}
				return Promise.resolve({
					mode: 'async',
				} satisfies HandleInferenceResult)
			},
		} as unknown as VerificationService
	}

	it('does nothing when both prompt and output are empty', () => {
		const service = captureService()
		verifyInferenceOutput(
			{ prompt: '', output: '', requestId: 'r-empty' },
			service,
		)
		// No handle call expected — nothing to verify.
		expect(lastHandleCall).toBeNull()
	})

	it('fires verification with captured prompt + output post-relay', async () => {
		const service = captureService()
		verifyInferenceOutput(
			{
				prompt: 'Write a poem',
				output: 'Roses are red',
				requestId: 'r-1',
				machineId: 'm-1',
			},
			service,
		)
		await new Promise((r) => setTimeout(r, 10))
		expect(lastHandleCall).toEqual({
			prompt: 'Write a poem',
			output: 'Roses are red',
			requestId: 'r-1',
			machineId: 'm-1',
			outputTruncated: undefined,
		})
	})

	it('threads outputTruncated flag through to the service (P1-3)', async () => {
		const service = captureService()
		verifyInferenceOutput(
			{
				prompt: 'long prompt',
				output: 'truncated output text',
				requestId: 'r-2',
				outputTruncated: true,
				streamMode: true,
			},
			service,
		)
		await new Promise((r) => setTimeout(r, 10))
		expect(lastHandleCall?.outputTruncated).toBe(true)
	})

	it('does not throw when the service handle rejects (fire-and-forget)', async () => {
		const failingService = {
			mode: 'async',
			handleInferenceRequest: () => Promise.reject(new Error('verifier down')),
		} as unknown as VerificationService
		// Should NOT throw — errors are logged, not propagated.
		expect(() => {
			verifyInferenceOutput(
				{ prompt: 'p', output: 'o', requestId: 'r-fail' },
				failingService,
			)
		}).not.toThrow()
		// Let the unhandled rejection queue clear.
		await new Promise((r) => setTimeout(r, 10))
	})

	it('shares the same requestId as the prompt pre-screen row (correlation)', async () => {
		const service = captureService()
		// Simulate the index.ts flow: same requestId is passed to both the
		// pre-screen check (via checkInferenceVerification) and the output
		// post-relay check (via verifyInferenceOutput).
		const requestId = 'r-correlation-42'
		const preScreen = checkInferenceVerification(
			'POST',
			'/v1/inference/generate',
			{ prompt: 'p', output: '' }, // request body only has prompt
			service,
			requestId,
		)
		expect(preScreen.verified).toBe(true)
		await new Promise((r) => setTimeout(r, 10))

		verifyInferenceOutput(
			{ prompt: 'p', output: 'response text', requestId, machineId: 'm-corr' },
			service,
		)
		await new Promise((r) => setTimeout(r, 10))
		// Last handle call is the post-relay call (the pre-screen fired first,
		// but lastHandleCall is overwritten by the second call).
		expect(lastHandleCall?.requestId).toBe(requestId)
		expect(lastHandleCall?.output).toBe('response text')
	})
})
