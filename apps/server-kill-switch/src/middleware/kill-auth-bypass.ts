/**
 * Kill Authorization auth-bypass decision (ADR-136)
 *
 * The kill-authorization assertion-token paths carry their own WebAuthn
 * assertion token, so they bypass the normal Bearer/session check. The
 * chaos endpoint is included: it no longer accepts Bearer tokens (human
 * WebAuthn assertion only).
 *
 * The bypass is restricted to POST (the assertion-token write paths:
 * initiate/approve). The GET read endpoints
 * (GET /v1/kill-authorization/requests, /requests/:id) return request
 * metadata — signatures with userId, credentialId, IPs, reasons, targets —
 * and MUST go through normal auth (session or assertion token) so
 * unauthenticated callers cannot enumerate them.
 */
export function isKillAuthBypassPath(method: string, url: string): boolean {
  return (
    (method === 'POST' && url.startsWith('/v1/kill-authorization/')) ||
    (method === 'POST' && url === '/v1/kill-switch/chaos') ||
    // ADR-140 §6: audit verify/anchor carry their own WebAuthn assertion
    // token (admin-only), so they bypass the normal Bearer/session check.
    (method === 'POST' && url.startsWith('/v1/audit/'))
  );
}
