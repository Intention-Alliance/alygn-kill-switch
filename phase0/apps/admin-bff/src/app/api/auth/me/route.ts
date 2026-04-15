// Proxy: GET /api/auth/me → kill-switch-api /v1/auth/me

import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/api';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/v1/auth/me');
}