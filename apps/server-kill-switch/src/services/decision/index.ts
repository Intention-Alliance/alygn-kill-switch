/**
 * Server-side decision wiring — S3.
 *
 * Builds the registry the server uses for POST /v1/decision. The server is
 * the only place the TypeSafe key lives, so `jev` is registered here (and
 * only here). The verifier is wrapped structurally so this module does not
 * depend on the verification service's internals.
 */

import type { VerifierLike } from '@align/decision-core';
import { buildRegistry, type ProviderRegistry } from '@align/decision-core';
import { getConfig } from '../../config';

// Re-export so consumers import everything from the barrel.
export { readDecisionFlags } from './flags';

/** Structural adapter over the existing InferenceVerifier. */
export function createVerifierLike(): VerifierLike {
  // Lazy import to avoid a cycle and to keep the verifier untouched.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { InferenceVerifier } = require('../verification/verifier');
  const verifier = new InferenceVerifier({});
  return {
    verify: (input: { prompt: string; output: string }) => verifier.verify(input),
  };
}

export function buildServerRegistry(opts?: { verifier?: VerifierLike }): ProviderRegistry {
  const config = getConfig() as any;
  const decision = config?.decision ?? {};
  const verification = config?.verification ?? {};

  return buildRegistry({
    threshold: 0.7,
    verifier: opts?.verifier ?? createVerifierLike(),
    jev: decision.typesafeApiKey
      ? {
          apiKey: decision.typesafeApiKey,
          baseUrl: decision.typesafeBaseUrl,
          model: 'jev-latest',
          timeoutMs: 500,
        }
      : undefined,
    // Laya runs in a local Python sidecar; register it when a base URL is
    // configured. Absent/unreachable fails closed to review.
    laya: decision.layaBaseUrl
      ? {
          baseUrl: decision.layaBaseUrl,
          model: decision.layaModel,
          timeoutMs: decision.layaTimeoutMs,
        }
      : undefined,
  });
}
