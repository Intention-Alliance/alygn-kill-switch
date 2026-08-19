/**
 * Shared API Client — HTTP helpers for kill-switch backend calls.
 *
 * All requests include credentials (httpOnly cookies) and
 * CSRF tokens from the double-submit cookie pattern.
 *
 * These calls go through Next.js rewrites (/api/* → backend:3000/v1/*),
 * so the client never sees the internal backend URL.
 */

// ─── Helpers ─────────────────────────────────────────────────────────

function getCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const csrfCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return csrfCookie?.split("=")[1] ?? undefined;
}

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return headers;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "Request failed");
    throw new ApiError(body || `HTTP ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

// ─── API Methods ─────────────────────────────────────────────────────

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    headers: getHeaders(),
    credentials: "include",
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: getHeaders(),
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: getHeaders(),
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
    headers: getHeaders(),
    credentials: "include",
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PATCH",
    headers: getHeaders(),
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}
