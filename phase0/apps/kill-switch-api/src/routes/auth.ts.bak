// Auth routes — Login, logout, session check, IP detection

import type { KillSwitchService } from '../services/kill-switch';
import { parseBody } from '../utils/body-parser';
import { parseCookies } from '../utils/cookies';
import { secureCompare } from '../utils/secure-compare';
import type { AuthRateLimiter } from '../middleware/auth-rate-limit';

export async function handleAuthRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  service: KillSwitchService,
  authRateLimiter?: AuthRateLimiter,
): Promise<boolean> {
  const isAuthEndpoint = url.startsWith('/v1/auth/');
  if (!isAuthEndpoint) return false;

  // POST /v1/auth/login
  if (method === 'POST' && url === '/v1/auth/login') {
    try {
      const body = await parseBody(req);
      const { email, password } = body;
      const validEmail = process.env.ADMIN_EMAIL || 'admin@alygn.com';
      const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN;

      if (secureCompare(email, validEmail) && secureCompare(password, validPassword)) {
        const user = { email, role: 'admin' };
        // Reset auth rate limiter on successful login
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        authRateLimiter?.reset(ip);
        res.setHeader('Set-Cookie', `admin_token=${validPassword}; Path=/; HttpOnly; SameSite=Strict;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''} Max-Age=3600`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ user }));
        return true;
      }

      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Invalid credentials' }));
      return true;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Invalid request body' }));
      return true;
    }
  }

  // GET /v1/auth/me
  if (method === 'GET' && url === '/v1/auth/me') {
    const cookies = parseCookies(req);
    const token = cookies.admin_token;
    const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN;

    if (token && secureCompare(token, validPassword)) {
      const validEmail = process.env.ADMIN_EMAIL || 'admin@alygn.com';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ user: { email: validEmail, role: 'admin' } }));
      return true;
    }

    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not authenticated' }));
    return true;
  }

  // POST /v1/auth/logout
  if (method === 'POST' && url === '/v1/auth/logout') {
    res.setHeader('Set-Cookie', `admin_token=; Path=/; HttpOnly; SameSite=Strict;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''} Max-Age=0`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Logged out' }));
    return true;
  }

  // GET /v1/auth/ip
  if (method === 'GET' && url === '/v1/auth/ip') {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip }));
    return true;
  }

  return false;
}