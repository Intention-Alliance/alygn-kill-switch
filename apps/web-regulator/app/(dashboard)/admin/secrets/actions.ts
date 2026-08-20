"use server";

import type {
  SecretInfo,
  SecretsLoaderHealth,
  SecretsAuditEvent,
  RotateResult,
  SecretsPageData,
} from "@/types/secrets";

/**
 * Server actions for /admin/secrets.
 *
 * These functions wrap the kill-switch-api's `/api/admin/secrets/*` endpoints.
 * They run server-side (so we can read the ADMIN_UI_API_KEY from env without
 * exposing it to the browser). The rotated secret value NEVER leaves the
 * server — none of the response shapes contain the raw value.
 *
 * The kill-switch-api lives at the same host as web-regulator (the private
 * mesh). KILL_SWITCH_API_URL defaults to the loopback for server-side fetches.
 * The admin UI calls the actions; the actions call the kill-switch-api with
 * the bearer token.
 *
 * @author Keridz ⚙️ (be-coder)
 */

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

/**
 * Neutral loader-health placeholder.
 *
 * The kill-switch-api currently exposes list/rotate/audit endpoints but no
 * dedicated secrets-loader health endpoint. Rather than fabricate a fake
 * "ok" health payload, we return a neutral "checking" state so the UI shows
 * a loading/unknown state instead of invented numbers. When a real health
 * endpoint lands, swap this for a call to it.
 */
function neutralHealth(): SecretsLoaderHealth {
  return {
    state: "checking",
    fsWatch: "error",
    sighup: "disarmed",
    lastPollAt: "",
    nextPollInSeconds: 0,
    uptimeSeconds: 0,
    lockouts: 0,
  };
}

// ─── Public actions ─────────────────────────────────────────────

export async function fetchInitialSecrets(): Promise<SecretsPageData> {
  const { secrets } = await callApi<{ secrets: SecretInfo[] }>("/api/admin/secrets");
  const audit = await fetchFullAudit();
  return {
    secrets,
    health: neutralHealth(),
    audit,
  };
}

export async function rotateSecret(name: string): Promise<RotateResult> {
  const res = await callApi<RotateResult & { maskedValue?: string }>(
    `/api/admin/secrets/${encodeURIComponent(name)}/rotate`,
    { method: "POST" },
  );
  // The backend returns maskedValue; the RotateResult type doesn't carry it.
  // Return only the fields the UI expects.
  return {
    name: res.name,
    rotatedAt: res.rotatedAt,
    dependentConfigs: res.dependentConfigs,
    reloadTargets: res.reloadTargets,
    filesWritten: res.filesWritten,
    appsReloaded: res.appsReloaded,
  };
}

export async function fetchFullAudit(): Promise<SecretsAuditEvent[]> {
  const { entries } = await callApi<{ entries: SecretsAuditEvent[] }>(
    "/api/admin/secrets/audit?limit=200",
  );
  return entries;
}
