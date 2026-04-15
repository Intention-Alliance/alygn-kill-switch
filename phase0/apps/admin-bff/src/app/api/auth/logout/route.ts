// Proxy: POST /api/auth/logout → kill-switch-api /v1/auth/logout

import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api';

export async function POST(request: NextRequest) {
  const res = await proxyToBackend(request, '/v1/auth/logout', { method: 'POST' });
  const data = await res.json();

  const response = NextResponse.json(data, { status: res.status });
  response.cookies.set('admin_token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });

  return response;
}