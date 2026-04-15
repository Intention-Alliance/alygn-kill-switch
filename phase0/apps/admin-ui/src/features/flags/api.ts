import type { Flag, AuditEntry } from './types';

const BASE_URL = '/v1/flags';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // CSRF token from cookie for double-submit pattern
  const csrfCookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='));

  if (csrfCookie) {
    const tokenValue = csrfCookie.split('=')[1];
    if (tokenValue) {
      headers['X-CSRF-Token'] = tokenValue;
    }
  }

  // Trace context headers are injected by OTel HTTP interceptor
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text().catch(() => 'Request failed');
    throw new Error(error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchFlags(): Promise<Flag[]> {
  const response = await fetch(BASE_URL, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include',
  });
  return handleResponse<Flag[]>(response);
}

export async function fetchFlag(id: string): Promise<Flag> {
  const response = await fetch(`${BASE_URL}/${id}`, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include',
  });
  return handleResponse<Flag>(response);
}

export async function createFlag(flag: Omit<Flag, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>): Promise<Flag> {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(flag),
  });
  return handleResponse<Flag>(response);
}

export async function updateFlag(
  id: string,
  flag: Partial<Omit<Flag, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>
): Promise<Flag> {
  const response = await fetch(`${BASE_URL}/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(flag),
  });
  return handleResponse<Flag>(response);
}

export async function deleteFlag(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.text().catch(() => 'Delete failed');
    throw new Error(error || `HTTP ${response.status}`);
  }
}

export async function fetchFlagAudit(id: string): Promise<AuditEntry[]> {
  const response = await fetch(`${BASE_URL}/${id}/audit`, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include',
  });
  return handleResponse<AuditEntry[]>(response);
}

export async function toggleEmergency(): Promise<void> {
  const response = await fetch(`${BASE_URL}/all_chaos_disabled`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.text().catch(() => 'Emergency toggle failed');
    throw new Error(error || `HTTP ${response.status}`);
  }
}