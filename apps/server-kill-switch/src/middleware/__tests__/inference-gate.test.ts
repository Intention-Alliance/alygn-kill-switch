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
import {
  blockFingerprint,
  deriveFingerprint,
  resetFingerprintHaltState,
} from '../../services/fingerprint-halt';

beforeEach(() => {
  // Force-reset module state so prior test files that triggered a STOPPED
  // transition don't leak a paused state into this file.
  resetTrafficPauseState();
  resetFingerprintHaltState();
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

  it('gates POST /v1/completions while paused (P1-1)', async () => {
    await pauseInferenceTraffic();
    const result = checkInferenceGate('POST', '/v1/completions');
    expect(result.gated).toBe(true);
    expect(result.retryAfter).toBe(INFERENCE_GATE_RETRY_AFTER_SECONDS);
  });

  it('gates query-string variants of generation lanes while paused (P1-2)', async () => {
    await pauseInferenceTraffic();
    const chat = checkInferenceGate('POST', '/api/chat?stream=true');
    expect(chat.gated).toBe(true);
    const completions = checkInferenceGate('POST', '/v1/completions?stream=true');
    expect(completions.gated).toBe(true);
    const generate = checkInferenceGate('POST', '/api/generate?stream=true');
    expect(generate.gated).toBe(true);
  });

  it('does not gate metadata lanes with query strings while paused', async () => {
    await pauseInferenceTraffic();
    const models = checkInferenceGate('GET', '/v1/models?format=json');
    expect(models).toEqual({ gated: false });
    const tags = checkInferenceGate('GET', '/api/tags?limit=10');
    expect(tags).toEqual({ gated: false });
  });

  // ─── P1-1: fingerprint-scoped halt ─────────────────────────────

  it('gates a BLOCKED fingerprint even when the global state is RUNNING (scoped halt)', () => {
    const { fingerprint } = deriveFingerprint({ machineId: 'machine-42' });
    blockFingerprint(fingerprint, 'machineId');
    const result = checkInferenceGate('POST', '/v1/chat/completions', {
      machineId: 'machine-42',
    });
    expect(result.gated).toBe(true);
    expect(result.reason).toBe('fingerprint');
    expect(result.retryAfter).toBe(INFERENCE_GATE_RETRY_AFTER_SECONDS);
  });

  it('lets a DIFFERENT fingerprint through while another is blocked', () => {
    const { fingerprint } = deriveFingerprint({ machineId: 'machine-42' });
    blockFingerprint(fingerprint, 'machineId');
    const blocked = checkInferenceGate('POST', '/api/generate', { machineId: 'machine-42' });
    expect(blocked.gated).toBe(true);
    const other = checkInferenceGate('POST', '/api/generate', { machineId: 'machine-99' });
    expect(other.gated).toBe(false);
  });

  it('does not gate when the fingerprint is not blocked (global RUNNING)', () => {
    const result = checkInferenceGate('POST', '/v1/chat/completions', { machineId: 'machine-42' });
    expect(result).toEqual({ gated: false });
  });

  it('gates by apiKey identity when no machineId is present', () => {
    const { fingerprint } = deriveFingerprint({ apiKey: 'key-1' });
    blockFingerprint(fingerprint, 'apiKey');
    const result = checkInferenceGate('POST', '/v1/completions', { apiKey: 'key-1' });
    expect(result.gated).toBe(true);
    expect(result.reason).toBe('fingerprint');
  });

  it('gates by ip+ua fallback when no identity is present', () => {
    const { fingerprint } = deriveFingerprint({ ip: '1.2.3.4', userAgent: 'ua' });
    blockFingerprint(fingerprint, 'ip-ua');
    const result = checkInferenceGate('POST', '/api/chat', { ip: '1.2.3.4', userAgent: 'ua' });
    expect(result.gated).toBe(true);
  });

  it('does not gate metadata lanes for a blocked fingerprint', () => {
    const { fingerprint } = deriveFingerprint({ machineId: 'machine-42' });
    blockFingerprint(fingerprint, 'machineId');
    const result = checkInferenceGate('GET', '/v1/models', { machineId: 'machine-42' });
    expect(result).toEqual({ gated: false });
  });

  it('global STOPPED still gates everyone (fingerprint check is additive)', async () => {
    await pauseInferenceTraffic();
    const result = checkInferenceGate('POST', '/v1/chat/completions', { machineId: 'machine-42' });
    expect(result.gated).toBe(true);
    expect(result.reason).toBe('global');
  });
});
