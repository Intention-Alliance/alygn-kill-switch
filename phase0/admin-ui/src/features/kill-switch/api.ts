import type { KillSwitchStatus, ActivationRecord } from './types';

const BASE_URL = '/v1/kill-switch';

interface ApiError {
  message: string;
  status?: number;
}

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
    const error: ApiError = await response.json().catch(() => ({
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new KillSwitchApiError(error.message, response.status);
  }
  return response.json();
}

function getAuthHeaders(): HeadersInit {
  // Auth token comes from httpOnly cookie (set by server), not localStorage
  // CSRF token from cookie for double-submit pattern
  const csrfCookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='));

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (csrfCookie) {
    const tokenValue = csrfCookie.split('=')[1];
    if (tokenValue) {
      headers['X-CSRF-Token'] = tokenValue;
    }
  }

  // Trace context headers are injected by OTel HTTP interceptor
  return headers;
}

export async function getStatus(): Promise<KillSwitchStatus> {
  try {
    const response = await fetch(`${BASE_URL}/status`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse<KillSwitchStatus>(response);
  } catch (error) {
    if (error instanceof KillSwitchApiError) {
      throw error;
    }
    throw new KillSwitchApiError('Network error: Unable to fetch kill switch status', 0);
  }
}

export async function activateChaos(reason: string): Promise<KillSwitchStatus> {
  try {
    const response = await fetch(`${BASE_URL}/chaos`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ reason }),
    });
    return handleResponse<KillSwitchStatus>(response);
  } catch (error) {
    if (error instanceof KillSwitchApiError) {
      throw error;
    }
    throw new KillSwitchApiError('Network error: Unable to activate kill switch', 0);
  }
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
  try {
    const params = new URLSearchParams();
    if (query.from) params.append('from', query.from);
    if (query.to) params.append('to', query.to);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));
    if (query.user) params.append('user', query.user);

    const queryString = params.toString();
    const url = `${BASE_URL}/activations${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse<ActivationsResponse>(response);
  } catch (error) {
    if (error instanceof KillSwitchApiError) {
      throw error;
    }
    throw new KillSwitchApiError('Network error: Unable to fetch activation history', 0);
  }
}
