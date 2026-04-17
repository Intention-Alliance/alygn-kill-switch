// Proxy: POST /api/auth/logout → clears session + proxies to backend

import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  // Clear the session token
  const sessionId = request.cookies.get('admin_token')?.value;
  if (sessionId) {
    deleteSession(sessionId);
  }

  // Also tell the backend to clear its session
  const backendUrl = process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000';
  await fetch(`${backendUrl}/v1/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => { /* non-fatal */ });

  const response = NextResponse.json({ message: 'Logged out' });
  response.cookies.set('admin_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });

  return response;
}