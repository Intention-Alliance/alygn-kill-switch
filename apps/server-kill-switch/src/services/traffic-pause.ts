/**
 * Traffic Pause Service — the missing 5th kill-switch piece.
 *
 * When the KillSwitch state transitions to STOPPED, every active inference
 * request must be paused (held/queued) AND new requests rejected at the
 * proxy layer until state returns to RUNNING.
 *
 * Phase 1 (this file): a global in-memory paused-request counter + a
 * swappable pause mechanism. The actual mechanism is behind a clean
 * abstraction (`PauseMechanism`) so Phase 2 (NGINX upstream pause) and
 * Phase 3 (app-level request queue hold) can swap in without touching the
 * state-change wiring.
 *
 * Phase 1 mechanism: `inference-gate` middleware rejects any POST to
 * /v1/inference/* with HTTP 503 + `Retry-After: 5` while paused.
 *
 * ADR-141: Kill-switch traffic pause.
 */

import { isFeatureEnabled } from '../config';

// ─── Pause mechanism abstraction ──────────────────────────────────
// A mechanism knows how to pause and resume inference traffic. Phase 1
// uses the in-memory counter + inference-gate middleware. Phase 2/3 swap
// in NGINX upstream pause / app-level request queue hold.
export interface PauseMechanism {
  readonly name: string;
  pause(): void | Promise<void>;
  resume(): void | Promise<void>;
}

// ─── Phase 1: in-memory counter mechanism ─────────────────────────
// The counter is intentionally a module-level mutable so the middleware
// and the service share the same instance without DI plumbing. Reads are
// cheap and race-safe for the demo; increments are guarded by a simple
// in-flight lock to prevent double-increment on concurrent pause calls.
let _pausedRequestCount = 0;
let _paused = false;
let _pauseInFlight: Promise<void> | null = null;

export function getPausedRequestCount(): number {
  return _pausedRequestCount;
}

export function isTrafficPaused(): boolean {
  return _paused;
}

/**
 * Increment the paused-request counter. Called by the inference-gate
 * middleware when it rejects a request while paused. Idempotent-safe:
 * each rejected request counts once.
 */
export function recordPausedRequest(): void {
  _pausedRequestCount += 1;
}

/**
 * Reset the counter (used by tests and on resume).
 */
export function resetPausedRequestCount(): void {
  _pausedRequestCount = 0;
}

/**
 * Force-reset the entire traffic-pause module state (paused flag +
 * counter). Test-only helper — bypasses the feature-flag guard so tests
 * can establish a clean baseline regardless of prior test files that may
 * have left the module paused.
 */
export function resetTrafficPauseState(): void {
  _paused = false;
  _pausedRequestCount = 0;
  _pauseInFlight = null;
}

const inMemoryMechanism: PauseMechanism = {
  name: 'in-memory-counter',
  pause() {
    _paused = true;
  },
  resume() {
    _paused = false;
    _pausedRequestCount = 0;
  },
};

// ─── Active mechanism (swappable) ─────────────────────────────────
let _activeMechanism: PauseMechanism = inMemoryMechanism;

/**
 * Swap the active pause mechanism. Phase 2/3 call this to install the
 * NGINX upstream pause or app-level request queue hold. Defaults to the
 * Phase 1 in-memory counter.
 */
export function setPauseMechanism(mechanism: PauseMechanism): void {
  _activeMechanism = mechanism;
}

export function getActiveMechanismName(): string {
  return _activeMechanism.name;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Pause inference traffic. Idempotent: calling while already paused is a
 * no-op and never double-increments the counter. Concurrent pause calls
 * are serialized through an in-flight promise so the counter is only
 * incremented once per pause cycle.
 */
export async function pauseInferenceTraffic(): Promise<void> {
  if (!isFeatureEnabled('killSwitchTrafficPauseEnabled')) {
    return;
  }
  if (_paused) return; // already paused — idempotent

  // Serialize concurrent pause calls: only the first actually pauses.
  if (_pauseInFlight) {
    await _pauseInFlight;
    return;
  }

  _pauseInFlight = (async () => {
    await _activeMechanism.pause();
    _paused = true;
  })().finally(() => {
    _pauseInFlight = null;
  });

  await _pauseInFlight;
}

/**
 * Resume inference traffic. Idempotent: calling while already running is
 * a no-op. Resets the paused-request counter.
 */
export async function resumeInferenceTraffic(): Promise<void> {
  if (!isFeatureEnabled('killSwitchTrafficPauseEnabled')) {
    return;
  }
  if (!_paused) return; // already running — idempotent

  await _activeMechanism.resume();
  _paused = false;
  _pausedRequestCount = 0;
}
