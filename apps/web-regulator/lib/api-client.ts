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
    const raw = await response.text().catch(() => "");
    throw new ApiError(
      friendlyErrorMessage(raw, response.status),
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

/**
 * Convert a raw error response body into a user-friendly message.
 *
 * Backends sometimes return JSON error payloads (e.g.
 * `{"error":"Rate limit exceeded","limit":60}`) which, if surfaced
 * verbatim, render as raw JSON in the UI. This extracts a readable
 * message and maps common status codes to friendly copy.
 */
export function friendlyErrorMessage(raw: string, status: number): string {
  // Rate limiting — always show friendly copy regardless of body shape.
  if (status === 429) {
    return "Too many requests. Please wait a moment.";
  }

  // Try to parse a JSON error body and pull out a human-readable field.
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidate =
        parsed.error ?? parsed.message ?? parsed.detail ?? parsed.reason;
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    } catch {
      // Not JSON — fall through to raw text below.
    }
  }

  // Plain text body (or empty) — fall back to a generic message.
  const trimmed = raw.trim();
  if (trimmed) return trimmed;
  return `Request failed (HTTP ${status})`;
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

export async function apiPost<T>(path: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { ...getHeaders(), ...(headers ?? {}) },
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
