// Proxy: GET/POST /api/kill-switch → kill-switch-api /v1/kill-switch/*

import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/api';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/v1/kill-switch/status');
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend(request, '/v1/kill-switch/chaos', {
    method: 'POST',
    body,
  });
}