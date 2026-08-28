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
import { isOllamaProxyRequest } from '../routes/ollama-proxy';

export interface VerificationHookResult {
  verified: boolean;
  result?: VerificationResult;
  reject?: { status: number; body: unknown };
  /** Present in SYNC mode — the caller awaits this to get the final decision. */
  awaitDecision?: Promise<VerificationHookResult>;
}

/**
 * Inference request body shape accepted by the verification hook.
 *
 * Covers the native kill-switch lane (`/v1/inference/*` — `prompt`/`output`)
 * plus the Ollama-native lanes proxied by the kill-switch:
 *   - `/v1/chat/completions` — OpenAI-style `messages` array
 *   - `/v1/completions`      — OpenAI-style `prompt` field
 *   - `/api/chat`            — Ollama chat `messages` array
 *   - `/api/generate`        — Ollama generate `prompt` field
 */
export interface InferenceRequestBody {
  /** Ollama/OpenAI model name (chat completions, generate, chat). */
  model?: string;
  prompt?: string;
  output?: string;
  messages?: Array<{ role?: string; content?: string }>;
  /** Optional machine id threaded into the verification context. */
  machineId?: string;
}

/**
 * Extract the prompt text from an inference request body.
 *
 * Priority:
 *   1. `prompt` (string) — `/v1/inference/*`, `/api/generate`
 *   2. `messages` array — last user message content (`/v1/chat/completions`,
 *      `/api/chat`). Falls back to the last message of any role if no user
 *      message exists.
 */
export function extractInferencePrompt(body: InferenceRequestBody | null): string {
  if (!body) return '';

  if (typeof body.prompt === 'string' && body.prompt.length > 0) {
    return body.prompt;
  }

  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const userMessage = [...body.messages].reverse().find((m) => m?.role === 'user');
    const target = userMessage ?? body.messages[body.messages.length - 1];
    if (target && typeof target.content === 'string') {
      return target.content;
    }
  }

  return '';
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
  body: InferenceRequestBody | null,
  service: VerificationService,
  requestId: string,
  machineId?: string,
): VerificationHookResult {
  // Only applies to POST inference lanes: the native /v1/inference/* lane
  // (backward compat) plus the Ollama-native lanes the kill-switch proxies
  // (infra consult #3 — 2026-08-27). Lane matching uses the shared
  // `isOllamaProxyRequest` matcher (query strings stripped) so verification
  // can never drift from the proxy's verified lane definitions.
  const isInferencePath =
    url.startsWith('/v1/inference/') || isOllamaProxyRequest(method, url).verified;

  if (!(method === 'POST' && isInferencePath)) {
    return { verified: false };
  }

  const prompt = extractInferencePrompt(body);
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
