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

import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { VerificationService } from '../verification-service';
import type { InferenceVerifier, VerificationResult } from '../verifier';
import { isFingerprintBlocked, unblockFingerprint, resetFingerprintHaltState } from '../../fingerprint-halt';

// ─── Mock verifier ──────────────────────────────────────────────

function makeVerifier(verdict: VerificationResult['verdict'], degraded = false): InferenceVerifier {
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
  } as unknown as InferenceVerifier;
}

// ─── Mock kill switch ───────────────────────────────────────────

function makeKillSwitch(initialState = 'RUNNING') {
  let state = initialState;
  const transitions: Array<{ newState: string; metadata: any }> = [];
  return {
    getCurrentState: async () => state,
    transitionTo: async (newState: string, metadata: any) => {
      transitions.push({ newState, metadata });
      state = newState;
      return {
        id: 'audit-1',
        previousState: 'RUNNING',
        newState,
        timestamp: new Date().toISOString(),
        traceId: 'trace-1',
        initiatedBy: metadata?.userId || 'system',
        reason: metadata?.reason || 'manual',
        ip: metadata?.ip || 'unknown',
      };
    },
    transitions,
    setState: (s: string) => { state = s; },
  };
}

// ─── Mock publish ───────────────────────────────────────────────

function makePublish() {
  const messages: Array<{ channel: string; msg: string }> = [];
  return {
    publish: async (channel: string, msg: string) => { messages.push({ channel, msg }); },
    messages,
  };
}

beforeEach(() => {
  resetFingerprintHaltState();
});

// ─── Tests ──────────────────────────────────────────────────────

describe('VerificationService — UNSAFE handling (P1-1 scoped halt)', () => {
  it('UNSAFE with a fingerprint → scoped halt (block), NO global transition (single fingerprint)', async () => {
    const ks = makeKillSwitch('RUNNING');
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      killSwitch: ks as any,
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({
      prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:abc', fingerprintSource: 'machineId',
    });

    expect(result.mode).toBe('sync');
    expect(result.result?.verdict).toBe('UNSAFE');
    // P1-1: the fingerprint is blocked, the GLOBAL state is NOT flipped.
    expect(result.blockedFingerprint?.fingerprint).toBe('fp:abc');
    expect(result.escalatedToGlobal).toBe(false);
    expect(ks.transitions.length).toBe(0);
  });

  it('UNSAFE blocks the fingerprint in the blocklist (next request from it is gated)', async () => {
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      persistEvents: false,
    });
    await service.handleInferenceRequest({
      prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:blocked', fingerprintSource: 'apiKey',
    });
    expect(isFingerprintBlocked('fp:blocked')).toBe(true);
    // Cleanup so other tests start fresh.
    unblockFingerprint('fp:blocked');
  });

  it('UNSAFE escalates to global STOPPED when ALL active fingerprints are UNSAFE (2+ active)', async () => {
    const ks = makeKillSwitch('RUNNING');
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      killSwitch: ks as any,
      persistEvents: false,
    });
    // Two distinct fingerprints both UNSAFE inside the eval window.
    await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:one', fingerprintSource: 'machineId' });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r2', fingerprint: 'fp:two', fingerprintSource: 'machineId' });

    expect(result.escalatedToGlobal).toBe(true);
    expect(ks.transitions.length).toBe(1);
    expect(ks.transitions[0].newState).toBe('STOPPED');
    expect(ks.transitions[0].metadata.reason).toBe('inference-unsafe');
    expect(ks.transitions[0].metadata.userId).toBe('system:verifier');
    expect(ks.transitions[0].metadata.ip).toBe('internal');
    // Cleanup.
    unblockFingerprint('fp:one');
    unblockFingerprint('fp:two');
  });

  it('UNSAFE without a fingerprint → NO global flip (P1-1: never flip global on a single UNSAFE)', async () => {
    const ks = makeKillSwitch('RUNNING');
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      killSwitch: ks as any,
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1' });

    expect(result.result?.verdict).toBe('UNSAFE');
    expect(result.blockedFingerprint).toBeUndefined();
    expect(ks.transitions.length).toBe(0);
  });

  it('UNSAFE does not double-transition when already STOPPED (escalation path)', async () => {
    const ks = makeKillSwitch('STOPPED');
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      killSwitch: ks as any,
      persistEvents: false,
    });
    // Two active fingerprints → escalation attempted, but already STOPPED.
    await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:one', fingerprintSource: 'machineId' });
    await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r2', fingerprint: 'fp:two', fingerprintSource: 'machineId' });

    // Already STOPPED → skip transition (no audit spam).
    expect(ks.transitions.length).toBe(0);
    unblockFingerprint('fp:one');
    unblockFingerprint('fp:two');
  });

  it('UNSAFE with autoKillOnUnsafe=false → no block, no kill', async () => {
    const ks = makeKillSwitch('RUNNING');
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      autoKillOnUnsafe: false,
      killSwitch: ks as any,
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:x', fingerprintSource: 'machineId' });

    expect(result.result?.verdict).toBe('UNSAFE');
    expect(result.blockedFingerprint).toBeUndefined();
    expect(ks.transitions.length).toBe(0);
  });

  it('UNSAFE with no killSwitch injected → scoped halt still works, no throw', async () => {
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:y', fingerprintSource: 'machineId' });
    expect(result.result?.verdict).toBe('UNSAFE');
    expect(result.blockedFingerprint?.fingerprint).toBe('fp:y');
    unblockFingerprint('fp:y');
  });

  it('SAFE verdict unblocks a previously-blocked fingerprint (self-heal)', async () => {
    const service = new VerificationService({
      verifier: makeVerifier('UNSAFE'),
      mode: 'sync',
      persistEvents: false,
    });
    await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:heal', fingerprintSource: 'machineId' });
    expect(isFingerprintBlocked('fp:heal')).toBe(true);

    // A later SAFE verdict from the same fingerprint re-enters it.
    const safeService = new VerificationService({
      verifier: makeVerifier('SAFE'),
      mode: 'sync',
      persistEvents: false,
    });
    await safeService.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r2', fingerprint: 'fp:heal', fingerprintSource: 'machineId' });
    expect(isFingerprintBlocked('fp:heal')).toBe(false);
  });
});

describe('VerificationService — SAFE / REVIEW / degraded', () => {
  it('SAFE → no kill', async () => {
    const ks = makeKillSwitch('RUNNING');
    const service = new VerificationService({
      verifier: makeVerifier('SAFE'),
      mode: 'sync',
      killSwitch: ks as any,
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1' });
    expect(result.result?.verdict).toBe('SAFE');
    expect(ks.transitions.length).toBe(0);
  });

  it('REVIEW → no kill, event published', async () => {
    const ks = makeKillSwitch('RUNNING');
    const pub = makePublish();
    const service = new VerificationService({
      verifier: makeVerifier('REVIEW'),
      mode: 'sync',
      killSwitch: ks as any,
      publish: pub.publish,
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1' });

    expect(result.result?.verdict).toBe('REVIEW');
    expect(ks.transitions.length).toBe(0);
    // Event published on bcp:verification:events
    expect(pub.messages.length).toBe(1);
    expect(pub.messages[0].channel).toBe('bcp:verification:events');
    const payload = JSON.parse(pub.messages[0].msg);
    expect(payload.payload.verdict).toBe('REVIEW');
    expect(payload.payload.triggeredKill).toBe(false);
  });

  it('degraded → REVIEW, no kill', async () => {
    const ks = makeKillSwitch('RUNNING');
    const service = new VerificationService({
      verifier: makeVerifier('REVIEW', true),
      mode: 'sync',
      killSwitch: ks as any,
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1' });
    expect(result.result?.verdict).toBe('REVIEW');
    expect(result.result?.degraded).toBe(true);
    expect(ks.transitions.length).toBe(0);
  });
});

describe('VerificationService — async vs sync mode', () => {
  it('ASYNC mode returns immediately (does not await verifier)', async () => {
    let verifyCalled = false;
    const slowVerifier = {
      verify: async () => {
        verifyCalled = true;
        await new Promise((r) => setTimeout(r, 50));
        return { verdict: 'SAFE', confidence: 0.9, reason: '', latencyMs: 50, model: 'm', degraded: false };
      },
      health: async () => ({ ok: true, model: 'm', latencyMs: 1 }),
    } as unknown as InferenceVerifier;

    const service = new VerificationService({
      verifier: slowVerifier,
      mode: 'async',
      persistEvents: false,
    });

    const start = Date.now();
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1' });
    const elapsed = Date.now() - start;

    // Returns immediately with no result (fire-and-forget).
    expect(result.mode).toBe('async');
    expect(result.result).toBeUndefined();
    expect(elapsed).toBeLessThan(50);
    // The verifier is invoked (detached) but not awaited by the caller.
    expect(verifyCalled).toBe(true);
  });

  it('SYNC mode awaits and returns the result', async () => {
    const service = new VerificationService({
      verifier: makeVerifier('SAFE'),
      mode: 'sync',
      persistEvents: false,
    });
    const result = await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1' });
    expect(result.mode).toBe('sync');
    expect(result.result?.verdict).toBe('SAFE');
  });
});

describe('VerificationService — event persistence', () => {
  it('persists a verification_event row when persistEvents=true', async () => {
    // We don't want to hit the real DB in this unit test, so we mock the
    // verification-event module's recordVerificationEvent.
    let recorded: any = null;
    mock.module('../verification-event', () => ({
      recordVerificationEvent: async (input: any) => {
        recorded = input;
        return 'event-id';
      },
      VERIFICATION_EVENTS_CHANNEL: 'bcp:verification:events',
    }));

    const service = new VerificationService({
      verifier: makeVerifier('SAFE'),
      mode: 'sync',
      persistEvents: true,
    });
    await service.handleInferenceRequest({ prompt: 'p', output: 'o', requestId: 'r1', machineId: 'm1' });

    expect(recorded).not.toBeNull();
    expect(recorded.requestId).toBe('r1');
    expect(recorded.machineId).toBe('m1');
    expect(recorded.result.verdict).toBe('SAFE');
    expect(recorded.triggeredKill).toBe(false);
  });

  it('persists the fingerprint via machineId (P1-1)', async () => {
    let recorded: any = null;
    mock.module('../verification-event', () => ({
      recordVerificationEvent: async (input: any) => {
        recorded = input;
        return 'event-id';
      },
      VERIFICATION_EVENTS_CHANNEL: 'bcp:verification:events',
    }));

    const service = new VerificationService({
      verifier: makeVerifier('SAFE'),
      mode: 'sync',
      persistEvents: true,
    });
    await service.handleInferenceRequest({
      prompt: 'p', output: 'o', requestId: 'r1', fingerprint: 'fp:abc', fingerprintSource: 'machineId',
    });

    expect(recorded.machineId).toBe('fp:abc');
  });

  it('recordDegradedEvent writes a REVIEW + degraded row without running the verifier (P2-8)', async () => {
    let recorded: any = null;
    mock.module('../verification-event', () => ({
      recordVerificationEvent: async (input: any) => {
        recorded = input;
        return 'event-id';
      },
      VERIFICATION_EVENTS_CHANNEL: 'bcp:verification:events',
    }));

    const service = new VerificationService({
      verifier: makeVerifier('SAFE'),
      mode: 'sync',
      persistEvents: true,
    });
    await service.recordDegradedEvent({ requestId: 'r-malformed', machineId: 'm-1', reason: 'malformed_json_body' });

    expect(recorded).not.toBeNull();
    expect(recorded.requestId).toBe('r-malformed');
    expect(recorded.machineId).toBe('m-1');
    expect(recorded.result.verdict).toBe('REVIEW');
    expect(recorded.result.degraded).toBe(true);
    expect(recorded.result.reason).toBe('malformed_json_body');
    expect(recorded.triggeredKill).toBe(false);
  });
});
