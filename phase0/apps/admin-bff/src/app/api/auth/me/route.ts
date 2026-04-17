// Proxy: GET /api/auth/me → validates session + proxies to backend

import { NextRequest, NextResponse } from 'next/server';
import { getBackendToken } from '@/lib/session';

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get('admin_token')?.value;

  if (!sessionId) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const backendToken = getBackendToken(sessionId);
  if (!backendToken) {
    return NextResponse.json({ message: 'Session expired' }, { status: 401 });
  }

  // Proxy to backend with real auth token
  const backendUrl = process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000';
  const res = await fetch(`${backendUrl}/v1/auth/me`, {
    headers: {
      'Authorization': `Bearer ${backendToken}`,
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}