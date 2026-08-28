/**
 * Inference Gate Middleware — Phase 1 traffic-pause enforcement + P1-1
 * fingerprint-scoped halt.
 *
 * While the kill-switch is in a paused state (STOPPED), any POST to
 * /v1/inference/* is rejected with HTTP 503 + `Retry-After: 5` and the
 * paused-request counter is incremented. When running, requests pass
 * through untouched.
 *
 * P1-1 (Andler's refinement): a per-fingerprint blocklist is checked
 * BEFORE the global isTrafficPaused() check. A fingerprint blocked by an
 * UNSAFE output verdict gets 503 for ITS OWN generation requests while
 * the rest of the fleet keeps flowing. The global kill_switch_state is
 * only flipped by the escalation rule (ALL active fingerprints UNSAFE in
 * the eval window) or manual stops — never on a single UNSAFE.
 *
 * This is the Phase 1 mechanism behind the swappable PauseMechanism
 * abstraction in services/traffic-pause.ts. Phase 2 replaces this with an
 * NGINX upstream pause; Phase 3 with an app-level request queue hold.
 *
 * ADR-141: Kill-switch traffic pause.
 */

import { isTrafficPaused, recordPausedRequest } from '../services/traffic-pause';
import { isOllamaProxyRequest } from '../routes/ollama-proxy';
import {
  deriveFingerprint,
  isFingerprintBlocked,
  pruneFingerprintHaltState,
  type FingerprintSource,
} from '../services/fingerprint-halt';

export const INFERENCE_GATE_RETRY_AFTER_SECONDS = 5;

export interface InferenceGateResult {
  gated: boolean;
  retryAfter?: number;
  /** Why the request was gated — 'fingerprint' (scoped halt) or 'global' (kill-switch STOPPED). */
  reason?: 'fingerprint' | 'global';
}

/**
 * Check whether an inference request should be gated (rejected).
 *
 * Covers the legacy /v1/inference/* lane AND the Ollama proxy generation
 * lanes (/v1/chat/completions, /v1/completions, /api/chat, /api/generate —
 * infra consult #3, 2026-08-27). Metadata lanes (/v1/models, /api/tags) are
 * NOT gated — they are read-only and must stay available for health checks.
 *
 * Lane matching uses the shared `isOllamaProxyRequest` matcher (query
 * strings stripped) so the gate can never drift from the proxy's verified
 * lane definitions.
 *
 * Gate order (P1-1): fingerprint blocklist FIRST (scoped halt), then the
 * global traffic-pause check. A blocked fingerprint is rejected even when
 * the global state is RUNNING; a global STOPPED rejects everyone.
 *
 * @param method           HTTP method
 * @param url              request URL
 * @param fingerprintSource identity signals for the scoped-halt check
 *                          (machineId/sessionId → apiKey → ip+ua)
 * @returns `{ gated: true, retryAfter, reason }` when the request must be
 *          rejected with 503; `{ gated: false }` to pass through.
 */
export function checkInferenceGate(
  method: string,
  url: string,
  fingerprintSource?: FingerprintSource,
): InferenceGateResult {
  const isInferenceWrite =
    method === 'POST' &&
    (url.startsWith('/v1/inference/') || isOllamaProxyRequest(method, url).verified);

  if (!isInferenceWrite) {
    return { gated: false };
  }

  // ── P1-1: fingerprint-scoped halt (BEFORE the global check) ──
  // A fingerprint blocked by an UNSAFE verdict is rejected for its own
  // generation requests while the rest of the fleet keeps flowing.
  if (fingerprintSource) {
    pruneFingerprintHaltState();
    const { fingerprint } = deriveFingerprint(fingerprintSource);
    if (isFingerprintBlocked(fingerprint)) {
      return { gated: true, retryAfter: INFERENCE_GATE_RETRY_AFTER_SECONDS, reason: 'fingerprint' };
    }
  }

  if (!isTrafficPaused()) {
    return { gated: false };
  }

  recordPausedRequest();
  return { gated: true, retryAfter: INFERENCE_GATE_RETRY_AFTER_SECONDS, reason: 'global' };
}
