/**
 * VerifierReachabilityTracker — Unit Tests (H1.1)
 *
 * Covers the startup retry loop: backoff sequence, degraded-mode persistence
 * (re-probe scheduling), and the recovery flip (degraded → active). Uses
 * injected fetch/sleep/schedule implementations so no real timers or network
 * calls are needed.
 */

import { describe, expect, it } from 'bun:test'
import type { VerificationConfig } from '../../../config/schema'
import { VerifierReachabilityTracker } from '../verifier-reachability'

const VERIFICATION: VerificationConfig = {
	verifierModel: 'qwen2.5:0.5b',
	verifierBaseUrl: 'http://localhost:11434',
	verifierTimeoutMs: 500,
	verifyEnabled: true,
	verifyMode: 'async',
	verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
	verifierTargetModel: 'dignity-verification-v0.1-preview',
}

// ─── Test helpers ────────────────────────────────────────────────

interface Harness {
	tracker: VerifierReachabilityTracker
	sleeps: number[]
	scheduled: Array<{ fn: () => void; ms: number }>
	fetchCalls: number
	stateChanges: boolean[]
}

/**
 * Wait until the tracker's fetch count reaches `target` (or a timeout). The
 * retry loop is async and awaits real `setTimeout`-based abort timers inside
 * validateVerifierReachability, so a single microtask flush is insufficient.
 */
async function waitForFetchCalls(
	h: Harness,
	target: number,
	timeoutMs = 500,
): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (h.fetchCalls < target) {
		if (Date.now() > deadline)
			throw new Error(
				`Timed out waiting for ${target} fetch calls (got ${h.fetchCalls})`,
			)
		await new Promise((resolve) => setTimeout(resolve, 1))
	}
}

/**
 * Wait until the tracker has registered `target` re-probe schedules. The
 * re-probe is scheduled AFTER the final backoff sleep, so fetch-call count
 * alone is insufficient to observe it.
 */
async function waitForScheduled(
	h: Harness,
	target: number,
	timeoutMs = 500,
): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (h.scheduled.length < target) {
		if (Date.now() > deadline)
			throw new Error(
				`Timed out waiting for ${target} scheduled re-probes (got ${h.scheduled.length})`,
			)
		await new Promise((resolve) => setTimeout(resolve, 1))
	}
}

/**
 * Wait until the tracker's reachability state equals `expected`. The flip to
 * active happens AFTER the successful probe resolves, so fetch-call count
 * alone is insufficient to observe it.
 */
async function waitForReachable(
	h: Harness,
	expected: boolean,
	timeoutMs = 500,
): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (h.tracker.getVerifierReachable() !== expected) {
		if (Date.now() > deadline)
			throw new Error(
				`Timed out waiting for reachable=${expected} (got ${h.tracker.getVerifierReachable()})`,
			)
		await new Promise((resolve) => setTimeout(resolve, 1))
	}
}

function makeHarness(opts: {
	reachableOnAttempt?: number // 1-based attempt that returns ok (undefined = never)
	maxRetries?: number
	reprobeIntervalMs?: number
	backoffMs?: readonly number[]
}): Harness {
	const sleeps: number[] = []
	const scheduled: Array<{ fn: () => void; ms: number }> = []
	const stateChanges: boolean[] = []
	let fetchCalls = 0

	const fetchImpl = async (): Promise<Response> => {
		fetchCalls++
		const ok =
			opts.reachableOnAttempt !== undefined &&
			fetchCalls >= opts.reachableOnAttempt
		return new Response(null, { status: ok ? 200 : 503 })
	}
	const sleepImpl = async (ms: number): Promise<void> => {
		sleeps.push(ms)
	}
	const scheduleImpl = (fn: () => void, ms: number): unknown => {
		scheduled.push({ fn, ms })
		return 1
	}

	const tracker = new VerifierReachabilityTracker({
		verification: VERIFICATION,
		maxRetries: opts.maxRetries ?? 5,
		reprobeIntervalMs: opts.reprobeIntervalMs ?? 300_000,
		backoffMs: opts.backoffMs,
		fetchImpl,
		sleepImpl,
		scheduleImpl,
		onStateChange: (reachable) => stateChanges.push(reachable),
	})

	// Return a live view of the mutable counters (the closure variables are
	// mutated by the injected fetch/sleep/schedule impls).
	return {
		tracker,
		get sleeps() {
			return sleeps
		},
		get scheduled() {
			return scheduled
		},
		get fetchCalls() {
			return fetchCalls
		},
		get stateChanges() {
			return stateChanges
		},
	}
}

// ─── Backoff sequence ────────────────────────────────────────────

describe('VerifierReachabilityTracker — backoff sequence', () => {
	it('probes immediately then backs off 5s→10s→20s→40s→60s on persistent failure', async () => {
		const h = makeHarness({ maxRetries: 5 })

		h.tracker.start()
		await waitForFetchCalls(h, 5)

		expect(h.fetchCalls).toBe(5)
		expect(h.sleeps).toEqual([5_000, 10_000, 20_000, 40_000, 60_000])
		expect(h.tracker.getVerifierReachable()).toBe(false)
	})

	it('uses a custom backoff array when provided', async () => {
		const h = makeHarness({ maxRetries: 3, backoffMs: [100, 200, 400] })

		h.tracker.start()
		await waitForFetchCalls(h, 3)

		expect(h.fetchCalls).toBe(3)
		expect(h.sleeps).toEqual([100, 200, 400])
	})
})

// ─── Recovery flip ───────────────────────────────────────────────

describe('VerifierReachabilityTracker — recovery flip', () => {
	it('flips to active when a later attempt succeeds (recovery)', async () => {
		const h = makeHarness({ reachableOnAttempt: 3, maxRetries: 5 })

		h.tracker.start()
		await waitForReachable(h, true)

		expect(h.fetchCalls).toBe(3)
		expect(h.tracker.getVerifierReachable()).toBe(true)
		// Only the recovery flip is emitted (no degradation first).
		expect(h.stateChanges).toEqual([true])
		// No re-probe scheduled on success.
		expect(h.scheduled).toEqual([])
	})

	it('flips to active on the first attempt', async () => {
		const h = makeHarness({ reachableOnAttempt: 1, maxRetries: 5 })

		h.tracker.start()
		await waitForReachable(h, true)

		expect(h.fetchCalls).toBe(1)
		expect(h.tracker.getVerifierReachable()).toBe(true)
		expect(h.stateChanges).toEqual([true])
	})
})

// ─── Degraded-mode persistence ───────────────────────────────────

describe('VerifierReachabilityTracker — degraded-mode persistence', () => {
	it('stays degraded and schedules a re-probe after all attempts fail', async () => {
		const h = makeHarness({ maxRetries: 5, reprobeIntervalMs: 300_000 })

		h.tracker.start()
		await waitForFetchCalls(h, 5)
		await waitForScheduled(h, 1)

		expect(h.tracker.getVerifierReachable()).toBe(false)
		// Exactly one re-probe scheduled at the configured interval.
		expect(h.scheduled).toHaveLength(1)
		expect(h.scheduled[0].ms).toBe(300_000)
		// No state-change flip emitted — the tracker starts degraded (reachable
		// is already false), so staying degraded is not a transition.
		expect(h.stateChanges).toEqual([])
	})

	it('re-probes on the scheduled interval and recovers when the verifier comes back', async () => {
		const h = makeHarness({
			maxRetries: 2,
			reprobeIntervalMs: 60_000,
			backoffMs: [10, 20],
		})

		h.tracker.start()
		await waitForFetchCalls(h, 2)
		await waitForScheduled(h, 1)

		// First run: 2 attempts fail → degraded + re-probe scheduled.
		expect(h.fetchCalls).toBe(2)
		expect(h.tracker.getVerifierReachable()).toBe(false)
		expect(h.scheduled).toHaveLength(1)

		// Simulate the verifier coming back: fire the scheduled re-probe. The
		// re-probe re-enters the retry loop (fetch count grows by maxRetries).
		h.scheduled[0].fn()
		await waitForFetchCalls(h, 4)

		// Re-probe ran another full retry loop (2 more attempts).
		expect(h.fetchCalls).toBe(4)
		expect(h.tracker.getVerifierReachable()).toBe(false)
	})

	it('uses the configured reprobe interval', async () => {
		const h = makeHarness({
			maxRetries: 1,
			reprobeIntervalMs: 123_456,
			backoffMs: [5],
		})

		h.tracker.start()
		await waitForFetchCalls(h, 1)
		await waitForScheduled(h, 1)

		expect(h.scheduled).toHaveLength(1)
		expect(h.scheduled[0].ms).toBe(123_456)
	})
})

// ─── Lifecycle ───────────────────────────────────────────────────

describe('VerifierReachabilityTracker — lifecycle', () => {
	it('is idempotent — start() twice runs the loop once', async () => {
		const h = makeHarness({ maxRetries: 2, backoffMs: [10, 20] })

		h.tracker.start()
		h.tracker.start()
		await waitForFetchCalls(h, 2)

		expect(h.fetchCalls).toBe(2)
	})

	it('stop() prevents further probing', async () => {
		const h = makeHarness({ maxRetries: 5 })

		h.tracker.start()
		h.tracker.stop()
		await new Promise((resolve) => setTimeout(resolve, 0))

		// The loop checks `stopped` before each probe — after stop() the first
		// probe may or may not have run, but no re-probe is scheduled.
		expect(h.scheduled).toEqual([])
	})
})
