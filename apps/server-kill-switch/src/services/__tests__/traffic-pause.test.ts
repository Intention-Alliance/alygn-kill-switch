import { describe, it, expect, beforeEach } from 'bun:test';
import {
  pauseInferenceTraffic,
  resumeInferenceTraffic,
  getPausedRequestCount,
  isTrafficPaused,
  recordPausedRequest,
  resetTrafficPauseState,
  setPauseMechanism,
  getActiveMechanismName,
  type PauseMechanism,
} from '../traffic-pause';
import { getConfig } from '../../config';

// The feature flag is read from config at call time. Default is enabled,
// so these tests exercise the real pause/resume path. We reset module
// state between tests.

// ─── Feature-flag control (P2-1) ────────────────────────────────
// isFeatureEnabled reads getConfig().features[flag] at call time. We
// mutate the config singleton's features object directly to flip the
// flag per-test — no module mocking needed, and it works regardless of
// test-file execution order.
function setFlag(enabled: boolean) {
  getConfig().features.killSwitchTrafficPauseEnabled = enabled;
}

beforeEach(() => {
  // Force-reset module state (bypasses the feature-flag guard) so prior
  // test files that triggered a STOPPED transition don't leak a paused
  // state into this file.
  resetTrafficPauseState();
  // Restore the default in-memory mechanism (tests may swap it).
  setPauseMechanism({
    name: 'in-memory-counter',
    pause() {},
    resume() {},
  });
  // Default the feature flag back to enabled for each test.
  setFlag(true);
});

describe('pauseInferenceTraffic / resumeInferenceTraffic', () => {
  it('pauses traffic and flips the paused flag', async () => {
    expect(isTrafficPaused()).toBe(false);
    await pauseInferenceTraffic();
    expect(isTrafficPaused()).toBe(true);
  });

  it('resumes traffic and clears the paused flag', async () => {
    await pauseInferenceTraffic();
    expect(isTrafficPaused()).toBe(true);
    await resumeInferenceTraffic();
    expect(isTrafficPaused()).toBe(false);
  });

  it('is idempotent — calling pause twice does not double-increment the counter', async () => {
    await pauseInferenceTraffic();
    recordPausedRequest(); // one rejected request while paused
    expect(getPausedRequestCount()).toBe(1);

    // Second pause while already paused is a no-op.
    await pauseInferenceTraffic();
    expect(getPausedRequestCount()).toBe(1);
    expect(isTrafficPaused()).toBe(true);
  });

  it('resume resets the paused-request counter', async () => {
    await pauseInferenceTraffic();
    recordPausedRequest();
    recordPausedRequest();
    expect(getPausedRequestCount()).toBe(2);

    await resumeInferenceTraffic();
    expect(getPausedRequestCount()).toBe(0);
    expect(isTrafficPaused()).toBe(false);
  });

  it('resume while already running is a no-op', async () => {
    await resumeInferenceTraffic();
    expect(isTrafficPaused()).toBe(false);
    expect(getPausedRequestCount()).toBe(0);
  });
});

describe('race conditions — concurrent pause calls', () => {
  it('two concurrent pause calls do not double-increment the counter', async () => {
    await Promise.all([pauseInferenceTraffic(), pauseInferenceTraffic()]);
    expect(isTrafficPaused()).toBe(true);

    // Simulate one rejected request; the counter must be exactly 1,
    // proving the pause cycle only ran once.
    recordPausedRequest();
    expect(getPausedRequestCount()).toBe(1);
  });

  it('concurrent pause + resume settles to running state', async () => {
    await Promise.all([pauseInferenceTraffic(), pauseInferenceTraffic()]);
    await resumeInferenceTraffic();
    expect(isTrafficPaused()).toBe(false);
  });
});

describe('swappable pause mechanism', () => {
  it('defaults to the in-memory counter mechanism', () => {
    expect(getActiveMechanismName()).toBe('in-memory-counter');
  });

  it('invokes a swapped mechanism on pause/resume', async () => {
    const calls: string[] = [];
    const fake: PauseMechanism = {
      name: 'fake-nginx',
      pause() { calls.push('pause'); },
      resume() { calls.push('resume'); },
    };
    setPauseMechanism(fake);
    expect(getActiveMechanismName()).toBe('fake-nginx');

    await pauseInferenceTraffic();
    await resumeInferenceTraffic();
    expect(calls).toEqual(['pause', 'resume']);
  });
});

describe('config-disabled path (P2-1)', () => {
  it('pauseInferenceTraffic is a no-op when the feature flag is disabled', async () => {
    setFlag(false);
    expect(isTrafficPaused()).toBe(false);

    await pauseInferenceTraffic();

    // No paused flip, no counter increment.
    expect(isTrafficPaused()).toBe(false);
    expect(getPausedRequestCount()).toBe(0);
  });

  it('disabled → enabled: pause works normally once the flag is re-enabled', async () => {
    setFlag(false);
    await pauseInferenceTraffic();
    expect(isTrafficPaused()).toBe(false);

    setFlag(true);
    await pauseInferenceTraffic();
    expect(isTrafficPaused()).toBe(true);
  });

  it('enabled → disabled mid-pause: resume still works', async () => {
    setFlag(true);
    await pauseInferenceTraffic();
    expect(isTrafficPaused()).toBe(true);

    // Disable the flag while paused, then resume.
    setFlag(false);
    await resumeInferenceTraffic();
    expect(isTrafficPaused()).toBe(false);
    expect(getPausedRequestCount()).toBe(0);
  });
});
