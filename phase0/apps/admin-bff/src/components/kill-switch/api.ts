// Kill Switch API — BFF version
// All calls go through /api/kill-switch (proxied by Next.js)

import type { KillSwitchStatus, ActivationRecord } from './types';

const BASE_URL = '/api/kill-switch';

export class KillSwitchApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'KillSwitchApiError';
    this.status = status;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new KillSwitchApiError(error.message || 'Request failed', response.status);
  }
  return response.json();
}

export async function getStatus(): Promise<KillSwitchStatus> {
  const response = await fetch(`${BASE_URL}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<KillSwitchStatus>(response);
}

export async function activateChaos(reason: string): Promise<KillSwitchStatus> {
  const response = await fetch(`${BASE_URL}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'STOPPING', reason }),
  });
  return handleResponse<KillSwitchStatus>(response);
}

export interface ActivationsQuery {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  user?: string;
}

export interface ActivationsResponse {
  data: ActivationRecord[];
  total: number;
  page: number;
  limit: number;
}

export async function getActivations(query: ActivationsQuery = {}): Promise<ActivationsResponse> {
  const params = new URLSearchParams();
  if (query.from) params.append('from', query.from);
  if (query.to) params.append('to', query.to);
  if (query.page) params.append('page', String(query.page));
  if (query.limit) params.append('limit', String(query.limit));
  if (query.user) params.append('user', query.user);

  const qs = params.toString();
  const url = `${BASE_URL}/activations${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<ActivationsResponse>(response);
}