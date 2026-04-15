// Auth middleware — Cookie-based authentication
// Checks admin_token cookie or Bearer token / API key

import type { KillSwitchService } from '../services/kill-switch';
import { parseCookies } from '../utils/cookies';

export function checkAuth(service: KillSwitchService, req: any): { authenticated: boolean; user?: { email: string; role: string } } {
  // Check cookie first
  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN;
  const validEmail = process.env.ADMIN_EMAIL || 'admin@alyygn.com';

  if (token && token === validPassword) {
    return { authenticated: true, user: { email: validEmail, role: 'admin' } };
  }

  // Check Bearer token / API key
  if (service.authenticate(req)) {
    return { authenticated: true, user: { email: validEmail, role: 'admin' } };
  }

  return { authenticated: false };
}