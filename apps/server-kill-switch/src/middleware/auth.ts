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
  // ── Fast path: Bearer token / API key (instant, no I/O) ──
  // Check this FIRST — it's a synchronous comparison and avoids the
  // Better-Auth session roundtrip entirely for machine-to-machine calls.
  if (service.authenticate(req)) {
    const validEmail = process.env.ADMIN_EMAIL || 'admin@alygn.com';
    return { authenticated: true, user: { email: validEmail, role: 'admin' } };
  }

  // ── Slow path: Better-Auth v2 session cookie (for dashboard users) ──
  // Only reached when no API key / Bearer token is present.
  const hasCookie = req.headers?.cookie?.includes('better-auth');
  if (hasCookie) {
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
  }

  return { authenticated: false };
}
