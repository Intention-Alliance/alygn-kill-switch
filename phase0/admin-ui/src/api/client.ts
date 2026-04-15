const API_BASE = '/admin/api';

interface ApiError {
  status: number;
  message: string;
  traceId?: string;
}

class ApiClientError extends Error {
  status: number;
  traceId?: string;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.status = error.status;
    this.traceId = error.traceId;
  }
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Trace context is injected by OTel HTTP interceptor
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

  return headers;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include httpOnly cookies
  });

  if (!response.ok) {
    const traceId = response.headers.get('X-Trace-ID') ?? undefined;

    if (response.status === 401 || response.status === 403) {
      // Auth failure - redirect handled by interceptor
      window.location.href = '/admin/login';
      throw new ApiClientError({
        status: response.status,
        message: 'Authentication required',
        traceId,
      });
    }

    let message = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Use default message
    }

    throw new ApiClientError({ status: response.status, message, traceId });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const searchParams = params
      ? `?${new URLSearchParams(params).toString()}`
      : '';
    return request<T>(`${endpoint}${searchParams}`);
  },

  post<T>(endpoint: string, body?: unknown): Promise<T> {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(endpoint: string, body: unknown): Promise<T> {
    return request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  delete<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: 'DELETE' });
  },
};

export { ApiClientError };
export type { ApiError };