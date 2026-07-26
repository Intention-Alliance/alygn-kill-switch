/**
 * Types for the Webhook API Keys admin UI.
 *
 * Card 0e2f9fec / spec §7.
 * Mirrors the response shape of the kill-switch-api's
 * `/v1/admin/api-keys/*` endpoints.
 */

export type ApiKeyScope = "live-chat" | "webhook-request" | "blog-pipeline" | "admin";

export interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  expiresAt: string | null;
  notes: string | null;
}

export interface ApiKeyAuditEvent {
  id: number | string;
  action: string;
  actor: string;
  at: string;
  meta: Record<string, unknown> | null;
}

export interface ApiKeysPageData {
  keys: ApiKeyInfo[];
  audit: ApiKeyAuditEvent[];
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[] | string;
  expiresAt?: string;
  notes?: string;
}

export interface CreateApiKeyResult {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  /** Plaintext key — shown ONCE. Never returned again. */
  key: string;
  /** Only present on rotate. */
  revokedKeyId?: string;
}
