/**
 * Inference Gate Middleware — Phase 1 traffic-pause enforcement.
 *
 * While the kill-switch is in a paused state (STOPPED), any POST to
 * /v1/inference/* is rejected with HTTP 503 + `Retry-After: 5` and the
 * paused-request counter is incremented. When running, requests pass
 * through untouched.
 *
 * This is the Phase 1 mechanism behind the swappable PauseMechanism
 * abstraction in services/traffic-pause.ts. Phase 2 replaces this with an
 * NGINX upstream pause; Phase 3 with an app-level request queue hold.
 *
 * ADR-141: Kill-switch traffic pause.
 */

import { isTrafficPaused, recordPausedRequest } from '../services/traffic-pause';

export const INFERENCE_GATE_RETRY_AFTER_SECONDS = 5;

/**
 * Check whether an inference request should be gated (rejected) because
 * traffic is paused.
 *
 * @returns `{ gated: true, retryAfter }` when the request must be
 *          rejected with 503; `{ gated: false }` to pass through.
 */
export function checkInferenceGate(
  method: string,
  url: string,
): { gated: boolean; retryAfter?: number } {
  const isInferenceWrite =
    method === 'POST' && url.startsWith('/v1/inference/');

  if (!isInferenceWrite) {
    return { gated: false };
  }

  if (!isTrafficPaused()) {
    return { gated: false };
  }

  recordPausedRequest();
  return { gated: true, retryAfter: INFERENCE_GATE_RETRY_AFTER_SECONDS };
}
