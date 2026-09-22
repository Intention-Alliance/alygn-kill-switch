import { beforeEach, describe, expect, it } from 'bun:test'
import {
	getPausedRequestCount,
	pauseInferenceTraffic,
	resetTrafficPauseState,
	resumeInferenceTraffic,
} from '../../services/traffic-pause'
import {
	checkInferenceGate,
	INFERENCE_GATE_RETRY_AFTER_SECONDS,
} from '../inference-gate'

beforeEach(() => {
	// Force-reset module state so prior test files that triggered a STOPPED
	// transition don't leak a paused state into this file.
	resetTrafficPauseState()
})

describe('checkInferenceGate', () => {
	it('passes through inference POSTs when running', () => {
		const result = checkInferenceGate('POST', '/v1/inference/chat')
		expect(result).toEqual({ gated: false })
	})

	it('rejects inference POSTs with 503 + Retry-After when paused', async () => {
		await pauseInferenceTraffic()
		const result = checkInferenceGate('POST', '/v1/inference/chat')
		expect(result.gated).toBe(true)
		expect(result.retryAfter).toBe(INFERENCE_GATE_RETRY_AFTER_SECONDS)
		expect(result.retryAfter).toBe(5)
	})

	it('increments the paused-request counter on each rejected request', async () => {
		await pauseInferenceTraffic()
		checkInferenceGate('POST', '/v1/inference/chat')
		checkInferenceGate('POST', '/v1/inference/embed')
		expect(getPausedRequestCount()).toBe(2)
	})

	it('does not gate non-inference POSTs while paused', async () => {
		await pauseInferenceTraffic()
		const result = checkInferenceGate('POST', '/v1/kill-switch/chaos')
		expect(result).toEqual({ gated: false })
	})

	it('does not gate GET requests to inference paths while paused', async () => {
		await pauseInferenceTraffic()
		const result = checkInferenceGate('GET', '/v1/inference/status')
		expect(result).toEqual({ gated: false })
	})

	it('does not gate inference POSTs after resume', async () => {
		await pauseInferenceTraffic()
		await resumeInferenceTraffic()
		const result = checkInferenceGate('POST', '/v1/inference/chat')
		expect(result).toEqual({ gated: false })
	})
})

// ─── P1-1 fingerprint-scoped pause (Stage 2 refinement) ──────────

import {
	blockFingerprint,
	resetFingerprintPauseState as resetFpState,
} from '../../services/fingerprint-pause'

describe('checkInferenceGate (fingerprint-scoped, P1-1)', () => {
	beforeEach(() => {
		resetFpState()
		resetTrafficPauseState()
	})

	it('returns the derived fingerprint in the decision (no gate)', () => {
		const result = checkInferenceGate('POST', '/v1/inference/chat', {
			body: { machineId: 'm-1' },
			headers: {},
			ip: '127.0.0.1',
		})
		expect(result.gated).toBe(false)
		expect(result.derivedFingerprint).toBe('machine:m-1')
	})

	it('returns gated=true with reason=fingerprint-blocked when the fingerprint is in the blocklist', () => {
		blockFingerprint('machine:m-blocked', 'UNSAFE')
		const result = checkInferenceGate('POST', '/v1/inference/chat', {
			body: { machineId: 'm-blocked' },
			headers: {},
			ip: '127.0.0.1',
		})
		expect(result.gated).toBe(true)
		expect(result.reason).toBe('fingerprint-blocked')
		expect(result.fingerprint).toBe('machine:m-blocked')
		expect(result.blockReason).toBe('UNSAFE')
		expect(result.retryAfter).toBe(INFERENCE_GATE_RETRY_AFTER_SECONDS)
	})

	it('lets unblocked fingerprints through when others are blocked (scoped halt)', () => {
		blockFingerprint('machine:m-blocked', 'UNSAFE')
		const result = checkInferenceGate('POST', '/v1/inference/chat', {
			body: { machineId: 'm-clean' },
			headers: {},
			ip: '127.0.0.1',
		})
		expect(result.gated).toBe(false)
		expect(result.derivedFingerprint).toBe('machine:m-clean')
	})

	it('fingerprint check runs BEFORE global pause (scoped survives global)', async () => {
		blockFingerprint('machine:m-blocked', 'UNSAFE')
		await pauseInferenceTraffic()
		// Even with global pause on, the blocked fingerprint is gated
		// specifically with reason=fingerprint-blocked, not global-pause.
		const result = checkInferenceGate('POST', '/v1/inference/chat', {
			body: { machineId: 'm-blocked' },
			headers: {},
			ip: '127.0.0.1',
		})
		expect(result.gated).toBe(true)
		expect(result.reason).toBe('fingerprint-blocked')
		// A clean fingerprint would hit global-pause.
		const clean = checkInferenceGate('POST', '/v1/inference/chat', {
			body: { machineId: 'm-clean' },
			headers: {},
			ip: '127.0.0.1',
		})
		expect(clean.gated).toBe(true)
		expect(clean.reason).toBe('global-pause')
	})

	it('falls back to global-pause when no fingerprint source is supplied', async () => {
		await pauseInferenceTraffic()
		// No `source` argument → no fingerprint check → fall through to global.
		const result = checkInferenceGate('POST', '/v1/inference/chat')
		expect(result.gated).toBe(true)
		expect(result.reason).toBe('global-pause')
	})

	it('unknown fingerprint (empty string) is treated as "unknown caller" — does not block', () => {
		blockFingerprint('machine:m-blocked', 'UNSAFE')
		// No body.machineId, no header, no IP → deriveFingerprint returns "".
		// We don't block unknowns; only known UNSAFE callers.
		const result = checkInferenceGate('POST', '/v1/inference/chat', {
			body: null,
			headers: {},
		})
		expect(result.gated).toBe(false)
		expect(result.derivedFingerprint).toBe('')
	})
})
