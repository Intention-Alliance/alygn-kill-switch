// SSE endpoint: /api/kill-switch/events
// Server-side polls kill-switch-api every 2s, pushes state changes to client

import { NextRequest } from 'next/server';
import { getBackendToken } from '@/lib/session';

const KILL_SWITCH_API = process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000';
const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auth check — same pattern as other routes
  const sessionId = request.cookies.get('admin_token')?.value;
  const backendToken = sessionId ? getBackendToken(sessionId) : null;

  if (!backendToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${backendToken}`,
  };

  // Build SSE stream
  const encoder = new TextEncoder();
  let lastState: string | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Client disconnected
          closed = true;
        }
      };

      // Initial fetch
      try {
        const res = await fetch(`${KILL_SWITCH_API}/v1/kill-switch/status`, { headers });
        const status = await res.json();
        lastState = status.state ?? null;
        send(`event: state-change\ndata: ${JSON.stringify(status)}\n\n`);
      } catch {
        send(`event: error\ndata: {"message":"Initial fetch failed"}\n\n`);
      }

      // Polling interval
      const pollTimer = setInterval(async () => {
        if (closed) return clearInterval(pollTimer);
        try {
          const res = await fetch(`${KILL_SWITCH_API}/v1/kill-switch/status`, { headers });
          const status = await res.json();
          if (status.state !== lastState) {
            lastState = status.state;
            send(`event: state-change\ndata: ${JSON.stringify(status)}\n\n`);
          }
        } catch {
          send(`event: error\ndata: {"message":"Poll failed"}\n\n`);
        }
      }, POLL_INTERVAL_MS);

      // Heartbeat interval
      const heartbeatTimer = setInterval(() => {
        if (closed) return clearInterval(heartbeatTimer);
        send(`event: heartbeat\ndata: ${Date.now()}\n\n`);
      }, HEARTBEAT_INTERVAL_MS);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}