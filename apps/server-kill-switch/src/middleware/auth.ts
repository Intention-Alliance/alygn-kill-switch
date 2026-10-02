/**
 * Auth middleware — Session-based authentication via Better-Auth v2
 *
 * Verifies the Better-Auth session cookie (v2 format).
 * Falls back to Bearer token / API key for backward compatibility.
 *
 * ADR-121: SQLite-backed sessions survive restarts.
 * The old file adapter lost sessions on container recycle.
 *
 * ADR-136: kill-authorization endpoints must NOT accept the service
 * credential fast path. `checkSessionAuth` is the session-only variant
 * used by the kill path; `checkAuth` keeps the API-key fast path for
 * non-kill routes.
 */

import type { KillSwitchService } from '../services/kill-switch';
import { auth } from '../lib/auth';

export interface AuthResult {
  authenticated: boolean;
  user?: { email: string; role: string };
}

/**
 * Session-only authentication: verifies the Better-Auth session cookie.
 * Deliberately skips the `service.authenticate` Bearer/API-key fast path
 * so a machine credential can never be mistaken for a human admin
 * (ADR-136 §4).
 */
export async function checkSessionAuth(req: any): Promise<AuthResult> {
  const hasCookie = req.headers?.cookie?.includes('better-auth');
  if (!hasCookie) {
    return { authenticated: false };
  }

  try {
    const headers = new Headers();
    headers.set('cookie', req.headers.cookie);

    const data = await Promise.race([
      auth.api.getSession({ headers }) as any,
      new Promise((_, reject) => setTimeout(() => reject(new Error('auth timeout')), 3000)),
    ]) as any;

    if (data?.user) {
      return {
        authenticated: true,
        user: { email: data.user.email, role: data.user.role || 'viewer' },
      };
    }
  } catch (err: any) {
    console.error('[auth-middleware] Session check failed:', err.message);
  }

  return { authenticated: false };
}

export async function checkAuth(
  service: KillSwitchService,
  req: any,
): Promise<AuthResult> {
  // ── Fast path: Bearer token / API key (instant, no I/O) ──
  // Check this FIRST — it's a synchronous comparison and avoids the
  // Better-Auth session roundtrip entirely for machine-to-machine calls.
  // Non-kill routes only; the kill path uses `checkSessionAuth`.
  if (service.authenticate(req)) {
    const validEmail = process.env.ADMIN_EMAIL || 'admin@alygn.com';
    return { authenticated: true, user: { email: validEmail, role: 'admin' } };
  }

  // ── Slow path: Better-Auth v2 session cookie (for dashboard users) ──
  return checkSessionAuth(req);
}
