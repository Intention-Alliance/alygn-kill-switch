// Proxy: POST /api/auth/login → kill-switch-api /v1/auth/login
// Creates an opaque session token instead of exposing backend credentials

import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api';
import { createSessionToken, SESSION_MAX_AGE } from '@/lib/session';

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Proxy to backend for authentication
  const backendRes = await fetch(
    `${process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000'}/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const data = await backendRes.json();

  if (!backendRes.ok || !data.user) {
    return NextResponse.json(data, { status: backendRes.status });
  }

  // Create opaque session token (NOT the backend password)
  const sessionToken = createSessionToken();

  const response = NextResponse.json(
    { user: data.user },
    { status: 200 }
  );

  response.cookies.set('admin_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}