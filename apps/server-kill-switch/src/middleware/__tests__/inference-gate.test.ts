import { describe, it, expect, beforeEach } from 'bun:test';
import {
  checkInferenceGate,
  INFERENCE_GATE_RETRY_AFTER_SECONDS,
} from '../inference-gate';
import {
  pauseInferenceTraffic,
  resumeInferenceTraffic,
  getPausedRequestCount,
  resetTrafficPauseState,
} from '../../services/traffic-pause';

beforeEach(() => {
  // Force-reset module state so prior test files that triggered a STOPPED
  // transition don't leak a paused state into this file.
  resetTrafficPauseState();
});

describe('checkInferenceGate', () => {
  it('passes through inference POSTs when running', () => {
    const result = checkInferenceGate('POST', '/v1/inference/chat');
    expect(result).toEqual({ gated: false });
  });

  it('rejects inference POSTs with 503 + Retry-After when paused', async () => {
    await pauseInferenceTraffic();
    const result = checkInferenceGate('POST', '/v1/inference/chat');
    expect(result.gated).toBe(true);
    expect(result.retryAfter).toBe(INFERENCE_GATE_RETRY_AFTER_SECONDS);
    expect(result.retryAfter).toBe(5);
  });

  it('increments the paused-request counter on each rejected request', async () => {
    await pauseInferenceTraffic();
    checkInferenceGate('POST', '/v1/inference/chat');
    checkInferenceGate('POST', '/v1/inference/embed');
    expect(getPausedRequestCount()).toBe(2);
  });

  it('does not gate non-inference POSTs while paused', async () => {
    await pauseInferenceTraffic();
    const result = checkInferenceGate('POST', '/v1/kill-switch/chaos');
    expect(result).toEqual({ gated: false });
  });

  it('does not gate GET requests to inference paths while paused', async () => {
    await pauseInferenceTraffic();
    const result = checkInferenceGate('GET', '/v1/inference/status');
    expect(result).toEqual({ gated: false });
  });

  it('does not gate inference POSTs after resume', async () => {
    await pauseInferenceTraffic();
    await resumeInferenceTraffic();
    const result = checkInferenceGate('POST', '/v1/inference/chat');
    expect(result).toEqual({ gated: false });
  });
});
