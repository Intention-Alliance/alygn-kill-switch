"use server";

import type {
  SecretInfo,
  SecretsLoaderHealth,
  SecretsAuditEvent,
  RotateResult,
  SecretsPageData,
} from "@/types/secrets";

/**
 * Mock server action layer for /admin/secrets.
 *
 * This file is intentionally shaped like the real Keridz handlers so that the
 * swap is mechanical when the backend endpoints land:
 *   - replace the body of fetchInitialSecrets() with a call to GET /api/admin/secrets
 *   - replace rotateSecret() with a call to POST /api/admin/secrets/:name/rotate
 * The UI components never depend on these mocks.
 */

const MOCK_SECRET: SecretInfo = {
  name: "OLLAMA_TAILSCALE_AUTH_TOKEN",
  maskedValue: "tsau_••••••••aaaa",
  lastRotatedAt: "2026-07-19T12:04:33.000Z",
  state: "armed",
  previewSuffix: "aaaa",
  dependentConfigs: [
    {
      name: "openclaw-webhook",
      type: "service",
      path: "/etc/openclaw/secrets.env",
    },
    {
      name: "nginx 11435",
      type: "service",
      path: "/etc/nginx/secrets-11435.env",
    },
    {
      name: "nginx 8080",
      type: "service",
      path: "/etc/nginx/secrets-8080.env",
    },
  ],
  reloadTargets: [
    { name: "openclaw-webhook", pid: 12345, method: "sighup" },
    { name: "nginx", pid: 12340, method: "sighup" },
  ],
};

const MOCK_HEALTH: SecretsLoaderHealth = {
  state: "ok",
  fsWatch: "ok",
  sighup: "armed",
  lastPollAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
  nextPollInSeconds: 6 * 60 * 60,
  uptimeSeconds: 4 * 24 * 60 * 60 + 3 * 60 * 60,
  lockouts: 0,
};

const MOCK_AUDIT: SecretsAuditEvent[] = [
  {
    id: "evt-1",
    at: "2026-07-21T12:04:33.000Z",
    event: "rotate",
    name: "OLLAMA_TAILSCALE_AUTH_TOKEN",
    actor: "andler@tail-andler-dev",
    result: "ok",
    meta: { filesWritten: 3, appsReloaded: 2 },
  },
  {
    id: "evt-2",
    at: "2026-07-21T12:01:08.000Z",
    event: "view",
    name: "OLLAMA_TAILSCALE_AUTH_TOKEN",
    actor: "andler@tail-andler-dev",
  },
  {
    id: "evt-3",
    at: "2026-07-21T11:58:14.000Z",
    event: "401-storm",
    name: "OLLAMA_TAILSCALE_AUTH_TOKEN",
    actor: "system",
    result: "N=12, 60s",
  },
  {
    id: "evt-4",
    at: "2026-07-21T11:30:00.000Z",
    event: "sighup",
    name: "nginx 11435",
    actor: "fs.watch",
    result: "reloaded",
  },
  {
    id: "evt-5",
    at: "2026-07-21T11:29:55.000Z",
    event: "poll",
    name: "3 config files",
    actor: "cron",
    result: "unchanged",
  },
];

export async function fetchInitialSecrets(): Promise<SecretsPageData> {
  // TODO(keridz): replace with GET /api/admin/secrets
  await new Promise((r) => setTimeout(r, 120));
  return {
    secrets: [MOCK_SECRET],
    health: MOCK_HEALTH,
    audit: MOCK_AUDIT,
  };
}

export async function rotateSecret(name: string): Promise<RotateResult> {
  // TODO(keridz): replace with POST /api/admin/secrets/:name/rotate
  await new Promise((r) => setTimeout(r, 400));
  const rotatedAt = new Date().toISOString();
  return {
    name,
    rotatedAt,
    dependentConfigs: MOCK_SECRET.dependentConfigs,
    reloadTargets: MOCK_SECRET.reloadTargets,
    filesWritten: MOCK_SECRET.dependentConfigs.length,
    appsReloaded: MOCK_SECRET.reloadTargets.length,
  };
}

export async function fetchFullAudit(): Promise<SecretsAuditEvent[]> {
  // TODO(keridz): replace with GET /api/admin/secrets/audit?limit=200
  await new Promise((r) => setTimeout(r, 120));
  return MOCK_AUDIT;
}
