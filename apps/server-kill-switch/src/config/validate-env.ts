// ─── Verifier Config Validation (ADR-2026-08-23) ─────────────────

/**
 * Validate the inference verifier configuration.
 *
 * When `verifyEnabled` is true, the verifier model must be non-empty and the
 * verifier base URL must be a valid, reachable endpoint. This fails fast at
 * startup so the server never boots with a broken verifier while claiming
 * verification is active.
 *
 * When `verifyEnabled` is false (the safe default), validation is a no-op —
 * the system behaves exactly as today.
 *
 * @throws Error with a descriptive message if the verifier config is invalid.
 */
export function validateVerifierConfig(verification: VerificationConfig): void {
  if (!verification.verifyEnabled) {
    return;
  }

  const failures: string[] = [];

  if (!verification.verifierModel || verification.verifierModel.trim().length === 0) {
    failures.push('verifierModel must be non-empty when verification is enabled');
  }

  // Validate the base URL is a well-formed http(s) URL.
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(verification.verifierBaseUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      failures.push(`verifierBaseUrl must use http(s), got "${parsedUrl.protocol}"`);
    }
  } catch {
    failures.push(`verifierBaseUrl is not a valid URL: "${verification.verifierBaseUrl}"`);
  }

  if (failures.length > 0) {
    throw new Error(
      `Verifier configuration invalid:\n  - ${failures.join('\n  - ')}`,
    );
  }

  // Reachability check is async (network call) — see validateVerifierReachability.
  void parsedUrl;
}

/**
 * Asynchronously check that the verifier model endpoint is reachable.
 *
 * Probes the Ollama (or OpenAI-compatible) `/api/tags` endpoint at the
 * configured base URL. Returns true if reachable, false otherwise. This is
 * intentionally non-throwing so a transient network blip during startup does
 * not crash the server — the caller decides how to handle an unreachable
 * verifier (e.g. log a degraded-verification warning).
 */
export async function validateVerifierReachability(
  verification: VerificationConfig,
  timeoutMs = 2_000,
): Promise<boolean> {
  if (!verification.verifyEnabled) {
    return true;
  }

  try {
    const base = verification.verifierBaseUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/api/tags`, {
      clearTimeout(timer);
