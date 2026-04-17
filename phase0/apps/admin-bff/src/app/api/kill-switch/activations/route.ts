// Proxy: GET /api/kill-switch/activations → kill-switch-api /v1/kill-switch/activations

import { NextRequest, NextResponse } from 'next/server';
import { getBackendToken } from '@/lib/session';

const KILL_SWITCH_API = process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000';

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get('admin_token')?.value;
  const backendToken = sessionId ? getBackendToken(sessionId) : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (backendToken) {
    headers['Authorization'] = `Bearer ${backendToken}`;
  }

  // Forward query params (from, to, page, limit, user)
  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const url = `${KILL_SWITCH_API}/v1/kill-switch/activations${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, { headers });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}