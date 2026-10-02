/**
 * Verifier Reachability Tracker — startup retry loop + degraded-mode re-probe.
 *
 * H1.1: The kill-switch previously probed the Ollama verifier ONCE via a
 * single `setTimeout` in `src/index.ts`. The `alygn-ollama-proxy` container is
 * often not yet reachable when the kill-switch boots, so the verifier logged
 * "unreachable" and stayed degraded until a manual restart.
 *
 * This tracker replaces the single probe with a retry loop:
 *   - 5 attempts with exponential backoff (5s → 10s → 20s → 40s → 60s)
 *   - On success: flips verification from degraded → active, logs recovery
 *   - On persistent failure (all attempts): schedules a re-probe every
 *     `reprobeIntervalMs` (default 5 min), keeps the service in degraded mode
 *     (does NOT crash).
 *
 * The tracker is a server worker (class) with injectable `fetchImpl`,
 * `sleepImpl`, and `scheduleImpl` so the backoff sequence, degraded-mode
 * persistence, and recovery flip are all unit-testable without real timers or
 * network calls.
 */

import type { VerificationConfig } from '../../config/schema'
import { validateVerifierReachability } from '../../config/validate-env'

// Default exponential backoff between attempts (ms). 5 attempts → 5s→60s ramp.
const DEFAULT_BACKOFF_MS: readonly number[] = [
	5_000, 10_000, 20_000, 40_000, 60_000,
]
const DEFAULT_MAX_RETRIES = 5
const DEFAULT_REPROBE_INTERVAL_MS = 300_000

export interface VerifierReachabilityOpts {
	verification: VerificationConfig
	/** Number of startup probe attempts before falling back to re-probe mode. Default 5. */
	maxRetries?: number
	/** Interval (ms) between re-probes while degraded. Default 300000 (5 min). */
	reprobeIntervalMs?: number
	/** Backoff delays (ms) between attempts. Default [5s,10s,20s,40s,60s]. */
	backoffMs?: readonly number[]
	/** Injectable fetch for tests. Defaults to global fetch. */
	fetchImpl?: (
		input: string | URL | Request,
		init?: RequestInit,
	) => Promise<Response>
	/** Injectable sleep for tests. Defaults to a real setTimeout-based sleep. */
	sleepImpl?: (ms: number) => Promise<void>
	/** Injectable timer scheduler for the degraded-mode re-probe. Defaults to setTimeout. */
	scheduleImpl?: (fn: () => void, ms: number) => unknown
	/** Called whenever reachability state flips (recovery or degradation). */
	onStateChange?: (reachable: boolean) => void
}

export class VerifierReachabilityTracker {
	private readonly verification: VerificationConfig
	private readonly maxRetries: number
	private readonly reprobeIntervalMs: number
	private readonly backoffMs: readonly number[]
	private readonly fetchImpl: (
		input: string | URL | Request,
		init?: RequestInit,
	) => Promise<Response>
	private readonly sleepImpl: (ms: number) => Promise<void>
	private readonly scheduleImpl: (fn: () => void, ms: number) => unknown
	private readonly onStateChange?: (reachable: boolean) => void

	private reachable = false
	private started = false
	private stopped = false
	private reprobeTimer: unknown = null

	constructor(opts: VerifierReachabilityOpts) {
		this.verification = opts.verification
		this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
		this.reprobeIntervalMs =
			opts.reprobeIntervalMs ?? DEFAULT_REPROBE_INTERVAL_MS
		this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
		this.fetchImpl = opts.fetchImpl ?? fetch
		this.sleepImpl = opts.sleepImpl ?? defaultSleep
		this.scheduleImpl = opts.scheduleImpl ?? defaultSchedule
		this.onStateChange = opts.onStateChange
	}

	/** Current reachability state — true when the verifier is active. */
	getVerifierReachable(): boolean {
		return this.reachable
	}

	/** Whether the tracker has been started. */
	isStarted(): boolean {
		return this.started
	}

	/**
	 * Start the retry loop. Runs the probe sequence immediately (async, does not
	 * block the caller). On success flips to active; on persistent failure
	 * schedules the degraded-mode re-probe.
	 */
	start(): void {
		if (this.started) return
		this.started = true
		this.stopped = false
		void this.runRetryLoop()
	}

	/** Stop the tracker and cancel any pending re-probe timer. */
	stop(): void {
		this.stopped = true
		if (this.reprobeTimer !== null) {
			clearTimeout(this.reprobeTimer as ReturnType<typeof setTimeout>)
			this.reprobeTimer = null
		}
	}

	/**
	 * Run the startup probe sequence with exponential backoff.
	 * On success → active. On persistent failure → schedule re-probe (degraded).
	 */
	private async runRetryLoop(): Promise<void> {
		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			if (this.stopped) return

			const ok = await this.probeOnce()
			if (ok) {
				this.setReachable(true)
				console.log(
					`[verification] Verifier model '${this.verification.verifierModel}' at ` +
						`'${this.verification.verifierBaseUrl}' reachable (attempt ${attempt + 1}/${this.maxRetries}) — inference verification active`,
				)
				return
			}

			console.warn(
				`[verification] Verifier probe attempt ${attempt + 1}/${this.maxRetries} failed — ` +
					`'${this.verification.verifierModel}' at '${this.verification.verifierBaseUrl}' unreachable`,
			)

			// Wait the backoff for this attempt before the next action. The final
			// backoff (60s) elapses before the degraded-mode re-probe is scheduled.
			const delay =
				this.backoffMs[Math.min(attempt, this.backoffMs.length - 1)] ?? 0
			await this.sleepImpl(delay)
			if (this.stopped) return
		}

		// All attempts failed — stay degraded, schedule periodic re-probe.
		this.setReachable(false)
		console.warn(
			`[verification] Verifier unreachable after ${this.maxRetries} attempts — verification degraded ` +
				`(REVIEW + no auto-kill). Re-probing every ${this.reprobeIntervalMs}ms.`,
		)
		this.scheduleReProbe()
	}

	/** Probe the verifier once. Returns true when reachable. */
	private async probeOnce(): Promise<boolean> {
		try {
			return await validateVerifierReachability(
				this.verification,
				2_000,
				this.fetchImpl,
			)
		} catch {
			return false
		}
	}

	/** Schedule the degraded-mode re-probe. Idempotent — one timer at a time. */
	private scheduleReProbe(): void {
		if (this.stopped) return
		if (this.reprobeTimer !== null) return

		this.reprobeTimer = this.scheduleImpl(() => {
			this.reprobeTimer = null
			void this.runRetryLoop()
		}, this.reprobeIntervalMs)
	}

	/** Flip reachability state and notify the listener on change. */
	private setReachable(value: boolean): void {
		if (this.reachable === value) return
		this.reachable = value
		this.onStateChange?.(value)
	}
}

// ─── Default injectables ─────────────────────────────────────────

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultSchedule(
	fn: () => void,
	ms: number,
): ReturnType<typeof setTimeout> {
	return setTimeout(fn, ms)
}
