/**
 * Auth middleware — Session-based authentication via Better-Auth
 *
 * First tries Better-Auth session cookie, then falls back to
 * Bearer token / API key for backward compatibility.
 */

import type { KillSwitchService } from '../services/kill-switch';
import { auth } from '../auth/better-auth';

export async function checkAuth(
  service: KillSwitchService,
  req: any,
): Promise<{ authenticated: boolean; user?: { email: string; role: string } }> {
  // ── Try Better-Auth session cookie ──
  try {
    const headers = new Headers();
    if (req.headers?.cookie) {
      headers.set('cookie', req.headers.cookie);
    }
    headers.set('accept', 'application/json');

    const proto = req.socket?.encrypted ? 'https' : 'http';
    const host = req.headers?.['host'] || 'localhost:3000';

    const webReq = new Request(
      `${proto}://${host}/v1/auth/get-session`,
      { method: 'GET', headers },
    );

    const response = await auth.handler(webReq);

    if (response.ok) {
      const data = await response.json();
      if (data && data.user) {
        return {
          authenticated: true,
          user: { email: data.user.email, role: 'admin' },
        };
      }
    }
  } catch {
    // Fall through to legacy check
  }

  // ── Fallback: Bearer token / API key ──
  if (service.authenticate(req)) {
    const validEmail = process.env.ADMIN_EMAIL || 'admin@alygn.com';
    return { authenticated: true, user: { email: validEmail, role: 'admin' } };
  }

  return { authenticated: false };
}
