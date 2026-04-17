// Server-side API client — calls kill-switch-api internally
// Browser NEVER sees these URLs — all proxied through Next.js
// Uses session tokens (NOT raw backend credentials)

import { getBackendToken } from './session';

const KILL_SWITCH_API = process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000';

export async function proxyToBackend(
  request: Request,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<Response> {
  const url = `${KILL_SWITCH_API}${path}`;

  // Get backend token from session
  const sessionId = request.headers.get('cookie')?.match(/admin_token=([^;]+)/)?.[1];
  const backendToken = sessionId ? getBackendToken(sessionId) : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Forwarded-For': request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'unknown',
    'X-Real-IP': request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'unknown',
  };

  if (backendToken) {
    headers['Authorization'] = `Bearer ${backendToken}`;
  }

  // Also forward API key if present
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const init: RequestInit = {
    method: options?.method || 'GET',
    headers,
  };

  if (options?.body) {
    init.body = JSON.stringify(options.body);
  }

  return fetch(url, init);
}

export { KILL_SWITCH_API };