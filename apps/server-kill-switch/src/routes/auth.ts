/**
 * Auth routes — Catch-all handler delegating to Better-Auth
 *
 * All /v1/auth/* requests are forwarded directly to Better-Auth's handler
 * via `auth.handler()`. This catches every Better-Auth internal path:
 *   - /v1/auth/sign-in/email
 *   - /v1/auth/sign-up/email
 *   - /v1/auth/get-session
 *   - /v1/auth/sign-out
 *   - /v1/auth/callback/*
 *   - ...any future Better-Auth paths
 *
 * Legacy explicit routes (/v1/auth/login, /v1/auth/me, /v1/auth/logout,
 * /v1/auth/ip) are preserved for backward compatibility with existing
 * frontend clients that call them directly.
 *
 * ADR-121: Sessions are durable across restarts (SQLite + drizzleAdapter).
 */

import type { KillSwitchService } from '../services/kill-switch';
import type { AuthRateLimiter } from '../middleware/auth-rate-limit';
import { auth } from '../lib/auth';
import { validatePassword } from '../utils/password-validation';
import { parseBody } from '../utils/body-parser';

/**
 * Convert a Node.js IncomingMessage to a Web Request for Better-Auth.
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

  if (bodyOverride != null) {
    init.body = bodyOverride;
  } else if (req.body != null && typeof req.body === 'string' && req.method !== 'GET' && req.method !== 'HEAD') {
    // req.body is a string (e.g., Bun.serve() adapter sets it)
    init.body = req.body;
  } else if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Fallback: pass the raw req as a ReadableStream body
    init.body = req;
  }

  if (init.body) {
    (init as any).duplex = 'half';
  }

  return new Request(url, init);
}

/**
 * Forward a Better-Auth response back to the Node.js response.
 * Copies status code, headers (especially Set-Cookie for session tokens),
 * and body.
 */
async function forwardAuthResponse(
  response: Response,
  res: any,
  authRateLimiter?: AuthRateLimiter,
  reqIp?: string,
  reqUrl?: string,
): Promise<void> {
  // Copy all response headers (Set-Cookie is critical for sessions)
  // Collect Set-Cookie values to avoid overwriting — multiple cookies
  // (session + CSRF) must all be forwarded to the client.
  const cookies: string[] = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      cookies.push(value);
    } else {
      res.setHeader(key, value);
    }
  });
  if (cookies.length > 0) {
    // Node.js accepts an array of strings for multiple Set-Cookie headers
    res.setHeader('Set-Cookie', cookies.length === 1 ? cookies[0] : cookies);
  }

  // Only reset rate limiter on successful sign-in, not get-session/sign-out
  if (response.ok && authRateLimiter && reqIp && reqUrl) {
    if (reqUrl.includes('/sign-in') || reqUrl.includes('/login')) {
      authRateLimiter.reset(reqIp);
    }
  }

  // Read and forward the body
  const body = await response.text();

  res.writeHead(response.status);
  res.end(body);
}

export async function handleAuthRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  _service: KillSwitchService,
  authRateLimiter?: AuthRateLimiter,
): Promise<boolean> {
  // ─── Legacy auth path redirects ───
  // Map old client paths to native Better-Auth paths so the catch-all
  // handler below sees paths that Better-Auth understands natively.
  const LEGACY_AUTH_REDIRECTS: Record<string, string> = {
    '/v1/auth/login': '/v1/auth/sign-in/email',
    '/v1/auth/me': '/v1/auth/get-session',
    '/v1/auth/logout': '/v1/auth/sign-out',
  };

  const legacyRedirect = LEGACY_AUTH_REDIRECTS[url];
  if (legacyRedirect) {
    req.url = legacyRedirect;
    // fall through to catch-all below
  }

  // ─── Password complexity validation for sign-up ───
  if (method === 'POST' && (url === '/v1/auth/sign-up/email' || url === '/v1/auth/sign-up')) {
    const body = await parseBody(req);
    if (!body?.password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Password is required' }));
      return true;
    }
    const validation = validatePassword(body.password);
    if (!validation.valid) {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Password does not meet complexity requirements', errors: validation.errors }));
      return true;
    }
    // Set body for the catch-all to forward to Better-Auth
    req.body = JSON.stringify(body);
  }

  // GET /v1/auth/ip — utility endpoint
  if (method === 'GET' && url === '/v1/auth/ip') {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip }));
    return true;
  }

  // ─── Catch-all: forward ALL other /v1/auth/* paths to Better-Auth ───
  // This catches native Better-Auth client paths:
  //   /v1/auth/sign-in/email, /v1/auth/sign-up/email,
  //   /v1/auth/get-session, /v1/auth/sign-out,
  //   /v1/auth/callback/*, /v1/auth/forget-password, etc.

  if (url.startsWith('/v1/auth/')) {
    try {
      const webRequest = nodeToWebRequest(req);
      const response = await auth.handler(webRequest);
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      await forwardAuthResponse(response, res, authRateLimiter, ip, url);
      return true;
    } catch (err: any) {
      console.error(`[auth/catch-all] Error for ${method} ${url}:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Internal server error' }));
      return true;
    }
  }

  return false;
}
