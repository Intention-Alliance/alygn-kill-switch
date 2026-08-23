/**
 * Inference Verification Middleware — request-path hook.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.4.
 *
 * Runs AFTER the inference gate (paused → 503 short-circuits first) and after
 * auth, but BEFORE the route dispatcher. Reads the inference request body,
 * extracts `prompt`/`output` (if present), and fires the VerificationService.
 *
 * ASYNC mode: fires handleInferenceRequest() and passes the request through
 * immediately (does not await). Zero added latency.
 *
 * SYNC mode: awaits and rejects with 403 if the verdict is UNSAFE.
 *
 * The kill-switch server is the control plane; if inference flows through a
 * different gateway, this hook must be deployed where inference actually
 * flows. The service + verifier are dependency-injected and reusable.
 */

import type { VerificationService } from '../services/verification/verification-service';
import type { VerificationResult } from '../services/verification/verifier';

export interface VerificationHookResult {
  verified: boolean;
  result?: VerificationResult;
  reject?: { status: number; body: unknown };
  /** Present in SYNC mode — the caller awaits this to get the final decision. */
  awaitDecision?: Promise<VerificationHookResult>;
}

/**
 * Check inference verification for a request.
 *
 * ASYNC mode: fires the service (fire-and-forget) and returns immediately
 * with `{ verified: true }` — the request passes through with zero added
 * latency.
 *
 * SYNC mode: returns `{ verified: true, awaitDecision }`; the caller awaits
 * `awaitDecision` and, if it resolves with a `reject`, responds 403.
 *
 * @param method     HTTP method
 * @param url        request URL
 * @param body       parsed request body (or null)
 * @param service    the VerificationService
 * @param requestId  a stable request id for correlation
 * @param machineId  optional machine id
 */
export function checkInferenceVerification(
  method: string,
  url: string,
  body: { prompt?: string; output?: string } | null,
  service: VerificationService,
  requestId: string,
  machineId?: string,
): VerificationHookResult {
  // Only applies to POST /v1/inference/* requests.
  if (!(method === 'POST' && url.startsWith('/v1/inference/'))) {
    return { verified: false };
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  const output = typeof body?.output === 'string' ? body.output : '';

  // Nothing to verify — pass through.
  if (!prompt && !output) {
    return { verified: false };
  }

  const handle = service.handleInferenceRequest({ prompt, output, requestId, machineId });

  if (service.mode === 'async') {
    // Fire-and-forget — never reject the request. The verifier runs detached.
    void handle.catch((err) => {
      console.error('[inference-verification] Async verification failed (non-fatal):', err instanceof Error ? err.message : err);
    });
    return { verified: true };
  }

  // SYNC mode: await the decision. UNSAFE → reject with 403.
  const awaitDecision = handle.then((r) => {
    if (r.result?.verdict === 'UNSAFE') {
      return {
        verified: true,
        result: r.result,
        reject: {
          status: 403,
          body: {
            error: 'Inference output failed safety verification',
            verdict: 'UNSAFE',
            reason: r.result.reason,
          },
        },
      } as VerificationHookResult;
    }
    return { verified: true, result: r.result } as VerificationHookResult;
  });

  return { verified: true, awaitDecision };
}
