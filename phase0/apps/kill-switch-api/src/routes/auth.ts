/**
 * Auth routes — Login, logout, session check, IP detection
 *
 * Backed by Better-Auth for proper session management.
 * Maps our existing /v1/auth/* endpoints to Better-Auth's handler.
 */

import type { KillSwitchService } from '../services/kill-switch';
import { parseBody } from '../utils/body-parser';
import { parseCookies } from '../utils/cookies';
import type { AuthRateLimiter } from '../middleware/auth-rate-limit';
import { auth, ADMIN_EMAIL } from '../auth/better-auth';

/**
 * Convert a Node.js IncomingMessage to a Web Request for Better-Auth.
 * Optionally override body (since the Node stream has already been consumed).
 */
function nodeToWebRequest(req: any, bodyOverride?: string): Request {
  const headers = new Headers();
  const headerKeys = Object.keys(req.headers || {});
  for (const key of headerKeys) {
    const val = req.headers[key];
    if (Array.isArray(val)) val.forEach((v: string) => headers.append(key, v));
    else if (val != null) headers.set(key, val);
  }

  const proto = req.socket?.encrypted ? 'https' : 'http';
  const host = headers.get('host') || 'localhost:3000';
  const url = `${proto}://${host}${req.url}`;

  const init: RequestInit = {
    method: req.method || 'GET',
    headers,
  };

  // Only include body for methods that support it
  if (bodyOverride != null) {
    init.body = bodyOverride;
  } else if (req.method !== 'GET' && req.method !== 'HEAD') {
    // If body hasn't been consumed yet, pass the stream
    init.body = req;
  }

  // Node.js native: duplex half is needed for stream body in fetch API
  if (init.body) {
    (init as any).duplex = 'half';
  }

  return new Request(url, init);
}

export async function handleAuthRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  _service: KillSwitchService,
  authRateLimiter?: AuthRateLimiter,
): Promise<boolean> {
  const isAuthEndpoint = url.startsWith('/v1/auth/');
  if (!isAuthEndpoint) return false;

  // ─── POST /v1/auth/login ─────────────────────────────────────

  if (method === 'POST' && url === '/v1/auth/login') {
    let body: any;
    try {
      body = await parseBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Invalid JSON body' }));
      return true;
    }

    const { email, password } = body;

    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Email and password required' }));
      return true;
    }

    // Rewrite URL to Better-Auth's sign-in endpoint
    const originalUrl = req.url;
    const originalMethod = req.method;
    req.url = '/v1/auth/sign-in/email';
    req.method = 'POST';

    // Build web request with captured body (body has been consumed from stream)
    const signInBody = JSON.stringify({ email, password });
    const webRequest = nodeToWebRequest(req, signInBody);

    // Restore original state
    req.url = originalUrl;
    req.method = originalMethod;

    try {
      const response = await auth.handler(webRequest);
      const data = await response.json();

      // Forward set-cookie
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        res.setHeader('Set-Cookie', setCookie);
      }

      if (response.ok) {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        authRateLimiter?.reset(ip);
      }

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    } catch (err: any) {
      console.error('[auth/login] Better-Auth error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Internal server error' }));
      return true;
    }
  }

  // ─── GET /v1/auth/me ────────────────────────────────────────

  if (method === 'GET' && url === '/v1/auth/me') {
    try {
      const originalUrl = req.url;
      const originalMethod = req.method;
      req.url = '/v1/auth/get-session';
      req.method = 'GET';

      const webRequest = nodeToWebRequest(req);

      req.url = originalUrl;
      req.method = originalMethod;

      const response = await auth.handler(webRequest);
      const data = await response.json();

      if (data && data.user) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ user: data.user }));
        return true;
      }

      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not authenticated' }));
      return true;
    } catch (err: any) {
      console.error('[auth/me] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Internal server error' }));
      return true;
    }
  }

  // ─── POST /v1/auth/logout ───────────────────────────────────

  if (method === 'POST' && url === '/v1/auth/logout') {
    try {
      const originalUrl = req.url;
      req.url = '/v1/auth/sign-out';

      const webRequest = nodeToWebRequest(req);
      req.url = originalUrl;

      const response = await auth.handler(webRequest);

      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        res.setHeader('Set-Cookie', setCookie);
      }

      const data = await response.json();
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    } catch (err: any) {
      console.error('[auth/logout] Error:', err.message);
      // Fallback: clear cookie
      res.setHeader('Set-Cookie', 'better-auth.session_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Logged out' }));
      return true;
    }
  }

  // ─── GET /v1/auth/ip ────────────────────────────────────────

  if (method === 'GET' && url === '/v1/auth/ip') {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip }));
    return true;
  }

  return false;
}
