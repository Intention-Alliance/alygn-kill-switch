// Proxy: POST /api/auth/login → kill-switch-api /v1/auth/login

import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await proxyToBackend(request, '/v1/auth/login', {
    method: 'POST',
    body,
  });

  // Forward Set-Cookie header from backend
  const data = await res.json();
  const response = NextResponse.json(data, { status: res.status });

  // Set the auth cookie on the BFF domain too
  const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN || '';
  if (data.user) {
    response.cookies.set('admin_token', validPassword, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 3600,
    });
  }

  return response;
}