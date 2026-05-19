/**
 * Auth middleware — Session-based authentication via Better-Auth v2
 *
 * Verifies the Better-Auth session cookie (v2 format).
 * Falls back to Bearer token / API key for backward compatibility.
 *
 * ADR-121: SQLite-backed sessions survive restarts.
 * The old file adapter lost sessions on container recycle.
 */

import type { KillSwitchService } from '../services/kill-switch';
import { auth } from '../lib/auth';

export async function checkAuth(
  service: KillSwitchService,
  req: any,
): Promise<{ authenticated: boolean; user?: { email: string; role: string } }> {
  // ── Try Better-Auth v2 session cookie (direct API call) ──
  try {
    const headers = new Headers();
    if (req.headers?.cookie) {
      headers.set('cookie', req.headers.cookie);
    }

    const data = await auth.api.getSession({ headers }) as any;

    if (data?.user) {
      return {
        authenticated: true,
        user: { email: data.user.email, role: data.user.role || 'viewer' },
      };
    }
  } catch (err: any) {
    console.error('[auth-middleware] Session check failed:', err.message);
    // Fall through to legacy check
  }

  // ── Fallback: Bearer token / API key ──
  if (service.authenticate(req)) {
    const validEmail = process.env.ADMIN_EMAIL || 'admin@alygn.com';
    return { authenticated: true, user: { email: validEmail, role: 'admin' } };
  }

  return { authenticated: false };
}
