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

import { describe, it, expect, beforeEach } from 'bun:test';
import { checkInferenceVerification } from '../inference-verification';
import type { VerificationService, HandleInferenceResult } from '../../services/verification/verification-service';
import type { VerificationResult } from '../../services/verification/verifier';

// ─── Mock VerificationService ────────────────────────────────────

let lastMachineId: string | undefined;
let lastRequestId: string | undefined;

function createMockService(overrides: { mode?: 'async' | 'sync'; verdict?: 'SAFE' | 'UNSAFE' | 'REVIEW' } = {}): VerificationService {
  const mode = overrides.mode ?? 'async';
  const verdict = overrides.verdict ?? 'SAFE';
  const result: VerificationResult = {
    verdict,
    confidence: 0.95,
    reason: verdict === 'UNSAFE' ? 'harmful content' : 'test-safe',
    degraded: false,
    latencyMs: 10,
  };
  const base = {
    mode,
    handleInferenceRequest: (opts: { prompt: string; output: string; requestId: string; machineId?: string }) => {
      lastMachineId = opts.machineId;
      lastRequestId = opts.requestId;
      if (mode === 'sync') {
        return Promise.resolve({ mode: 'sync', result } satisfies HandleInferenceResult);
      }
      return Promise.resolve({ mode: 'async' } satisfies HandleInferenceResult);
    },
  };
  return base as unknown as VerificationService;
}

describe('checkInferenceVerification', () => {
  beforeEach(() => {
    lastMachineId = undefined;
    lastRequestId = undefined;
  });

  it('returns { verified: false } for non-inference requests (GET)', () => {
    const service = createMockService();
    const result = checkInferenceVerification('GET', '/v1/health', null, service, 'req-1');
    expect(result.verified).toBe(false);
    expect(result.awaitDecision).toBeUndefined();
  });

  it('returns { verified: false } for non-inference paths', () => {
    const service = createMockService();
    const result = checkInferenceVerification('POST', '/v1/auth/login', { prompt: 'hi' }, service, 'req-2');
    expect(result.verified).toBe(false);
  });

  it('returns { verified: false } when body is null', () => {
    const service = createMockService();
    const result = checkInferenceVerification('POST', '/v1/inference/generate', null, service, 'req-3');
    expect(result.verified).toBe(false);
  });

  it('returns { verified: false } when body has no prompt/output', () => {
    const service = createMockService();
    const result = checkInferenceVerification('POST', '/v1/inference/generate', { foo: 'bar' }, service, 'req-4');
    expect(result.verified).toBe(false);
  });

  it('threads machineId from request body to verification service (P2-1 fix)', async () => {
    const service = createMockService();
    const body = {
      prompt: 'Write a poem',
      output: 'Roses are red',
      machineId: 'machine-42',
    };
    const result = checkInferenceVerification('POST', '/v1/inference/generate', body, service, 'req-5', body.machineId);
    expect(result.verified).toBe(true);
    // In async mode, the handle is fired — wait a tick for the promise to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(lastMachineId).toBe('machine-42');
    expect(lastRequestId).toBe('req-5');
  });

  it('works without machineId (undefined is acceptable)', async () => {
    const service = createMockService();
    const body = {
      prompt: 'Write a poem',
      output: 'Roses are red',
    };
    const result = checkInferenceVerification('POST', '/v1/inference/generate', body, service, 'req-6', undefined);
    expect(result.verified).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(lastMachineId).toBeUndefined();
  });

  it('fires verification in async mode without awaitDecision (fire-and-forget)', () => {
    const service = createMockService({ mode: 'async' });
    const body = { prompt: 'test', output: 'result' };
    const result = checkInferenceVerification('POST', '/v1/inference/generate', body, service, 'req-7', 'm-7');
    expect(result.verified).toBe(true);
    expect(result.awaitDecision).toBeUndefined();
  });

  it('provides awaitDecision in sync mode for SAFE (no reject)', async () => {
    const syncService = createMockService({ mode: 'sync', verdict: 'SAFE' });
    const body = { prompt: 'test', output: 'result', machineId: 'm-8' };
    const result = checkInferenceVerification('POST', '/v1/inference/generate', body, syncService, 'req-8', 'm-8');
    expect(result.verified).toBe(true);
    expect(result.awaitDecision).toBeDefined();
    const decision = await result.awaitDecision!;
    expect(decision.verified).toBe(true);
    expect(decision.reject).toBeUndefined();
  });

  it('rejects with 403 in sync mode when verdict is UNSAFE', async () => {
    const unsafeService = createMockService({ mode: 'sync', verdict: 'UNSAFE' });
    const body = { prompt: 'hack', output: 'malicious', machineId: 'm-9' };
    const result = checkInferenceVerification('POST', '/v1/inference/generate', body, unsafeService, 'req-9', 'm-9');
    const decision = await result.awaitDecision!;
    expect(decision.reject).toBeDefined();
    expect(decision.reject!.status).toBe(403);
    expect(decision.reject!.body).toHaveProperty('error');
  });
});