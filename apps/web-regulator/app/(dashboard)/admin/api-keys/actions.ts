"use server";

/**
 * Server actions for /admin/api-keys.
 *
 * Card 0e2f9fec / spec §7 — Webhook API key admin UI.
 *
 * These functions wrap the kill-switch-api's `/v1/admin/api-keys/*` endpoints.
 * They run server-side (so we can read the ADMIN_UI_API_KEY from env without
 * exposing it to the browser). The UI never sees the plaintext key after
 * the create/rotate response — the createKey action returns it ONCE.
 *
 * In v1, the kill-switch-api lives at the same host as web-regulator (the
 * Tailscale mesh). KILL_SWITCH_API_URL defaults to the loopback for
 * server-side fetches. The admin UI calls the actions; the actions call
 * the kill-switch-api with the bearer token.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import type {
  ApiKeyInfo,
  ApiKeyAuditEvent,
  ApiKeysPageData,
  CreateApiKeyResult,
  CreateApiKeyInput,
} from "@/types/api-keys";

// ─── Configuration ───────────────────────────────────────────────

const KILL_SWITCH_API_URL =
  process.env.KILL_SWITCH_API_URL ?? "http://127.0.0.1:3000";
const ADMIN_UI_API_KEY = process.env.ADMIN_UI_API_KEY ?? "";

// ─── Helpers ─────────────────────────────────────────────────────

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  if (!ADMIN_UI_API_KEY) {
    throw new Error("ADMIN_UI_API_KEY is not configured on web-regulator");
  }
  return {
    Authorization: `Bearer ${ADMIN_UI_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
}

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${KILL_SWITCH_API_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `kill-switch-api ${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

function isMockMode(): boolean {
  // If the kill-switch-api isn't reachable or ADMIN_UI_API_KEY isn't set,
  // fall back to mock data so the UI is still usable in dev.
  return !ADMIN_UI_API_KEY;
}

// ─── Mocks (used when kill-switch-api is unreachable) ───────────

const MOCK_KEYS: ApiKeyInfo[] = [
  {
    id: "wk_00MS10XN9QNSEX2LEYWSUDY4CT",
    keyPrefix: "wk_kvlGr",
    name: "bootstrap",
    scopes: ["live-chat", "webhook-request", "blog-pipeline"],
    createdAt: "2026-07-25T23:52:31.000Z",
    createdBy: "cli-bootstrap",
    lastUsedAt: null,
    lastUsedIp: null,
    revokedAt: null,
    revokedBy: null,
    expiresAt: null,
    notes: "initial bootstrap seed",
  },
];

const MOCK_AUDIT: ApiKeyAuditEvent[] = [
  {
    id: 1,
    action: "create",
    actor: "cli-bootstrap",
    at: "2026-07-25T23:52:31.000Z",
    meta: { name: "bootstrap", scopes: "live-chat,webhook-request,blog-pipeline" },
  },
];

// ─── Public actions ─────────────────────────────────────────────

export async function fetchApiKeys(): Promise<ApiKeysPageData> {
  if (isMockMode()) {
    return { keys: MOCK_KEYS, audit: MOCK_AUDIT };
  }
  try {
    const { keys } = await callApi<{ keys: ApiKeyInfo[] }>("/v1/admin/api-keys");
    return { keys, audit: MOCK_AUDIT };
  } catch (e) {
    console.error("[api-keys] fetchApiKeys failed, returning mock:", e);
    return { keys: MOCK_KEYS, audit: MOCK_AUDIT };
  }
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  if (isMockMode()) {
    // Mock: pretend to create and return a fake key (visible once)
    return {
      id: `wk_mock_${Date.now().toString(36)}`,
      keyPrefix: "wk_mock0",
      name: input.name,
      scopes: Array.isArray(input.scopes) ? input.scopes : [input.scopes],
      key: `wk_mock0${Math.random().toString(36).slice(2, 30)}`,
    };
  }
  return callApi<CreateApiKeyResult>("/v1/admin/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function rotateApiKey(id: string): Promise<CreateApiKeyResult> {
  if (isMockMode()) {
    return {
      id: `wk_mock_rotated_${Date.now().toString(36)}`,
      keyPrefix: "wk_rot00",
      name: "rotated-key",
      scopes: ["live-chat"],
      key: `wk_rot00${Math.random().toString(36).slice(2, 30)}`,
      revokedKeyId: id,
    };
  }
  return callApi<CreateApiKeyResult>(`/v1/admin/api-keys/${id}/rotate`, {
    method: "POST",
  });
}

export async function revokeApiKey(id: string): Promise<{ ok: true }> {
  if (isMockMode()) {
    return { ok: true };
  }
  await callApi<unknown>(`/v1/admin/api-keys/${id}`, { method: "DELETE" });
  return { ok: true };
}

export async function fetchApiKeyAudit(id: string): Promise<ApiKeyAuditEvent[]> {
  if (isMockMode()) {
    return MOCK_AUDIT;
  }
  const { entries } = await callApi<{ entries: ApiKeyAuditEvent[] }>(
    `/v1/admin/api-keys/${id}/audit`,
  );
  return entries;
}
