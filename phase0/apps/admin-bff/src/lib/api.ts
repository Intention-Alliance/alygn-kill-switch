// Server-side API client — calls kill-switch-api internally
// Browser NEVER sees these URLs — all proxied through Next.js

const KILL_SWITCH_API = process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000';

export async function proxyToBackend(
  request: Request,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<Response> {
  const url = `${KILL_SWITCH_API}${path}`;
  const cookie = request.headers.get('cookie') || '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    cookie,
  };

  const init: RequestInit = {
    method: options?.method || 'GET',
    headers,
  };

  if (options?.body) {
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, init);
  const data = await res.json();

  return Response.json(data, { status: res.status });
}

export { KILL_SWITCH_API };