// Proxy: GET/POST /api/kill-switch → kill-switch-api /v1/kill-switch/*
// Uses session token to get backend credentials

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

  const res = await fetch(`${KILL_SWITCH_API}/v1/kill-switch/status`, { headers });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('admin_token')?.value;
  const backendToken = sessionId ? getBackendToken(sessionId) : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (backendToken) {
    headers['Authorization'] = `Bearer ${backendToken}`;
  }

  const body = await request.json();
  const res = await fetch(`${KILL_SWITCH_API}/v1/kill-switch/chaos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}