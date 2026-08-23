/**
 * Kill Switch Drizzle SQLite Schema
 *
 * Central schema for:
 *  - Better-Auth v2 tables (user, session, account, verification)
 *  - Kill Switch state persistence
 *  - Audit log (extended with severity, machineId, metadata)
 *  - Feature flags + audit
 *  - Machine inventory (full rebuild)
 *  - Settings persistence (new)
 *  - Per-machine flag overrides (new)
 *  - Per-machine agent registry (new)
 *
 * ADR-121: SQLite over file adapter for durability + crash safety.
 * ADR-122: Drizzle ORM for type-safe queries tied to schema.
 * ADR-133: Kill Switch dashboard rebuild — extended schema.
 */

import { sqliteTable, text, integer, real, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';

// ─── Better-Auth v2 Required Tables ──────────────────────────────────────

export const users = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
    name: text('name'),
    image: text('image'),
    role: text('role').default('admin'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => ({
    emailIdx: uniqueIndex('user_email_idx').on(table.email),
  }),
);

export const sessions = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('session_user_id_idx').on(table.userId),
    tokenIdx: uniqueIndex('session_token_idx').on(table.token),
  }),
);

export const accounts = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('account_user_id_idx').on(table.userId),
  }),
);

export const verifications = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    identifierIdx: index('verification_identifier_idx').on(table.identifier),
  }),
);

// ─── Kill Switch State ───────────────────────────────────────────────────

export const killSwitchState = sqliteTable(
  'kill_switch_state',
  {
    id: text('id').primaryKey(),
    state: text('state').notNull().default('ARMED'),         // ARMED | RUNNING | STOPPING | STOPPED | LOCKED
    updatedBy: text('updated_by').notNull().default('system'),
    reason: text('reason').notNull().default('manual'),
    ipAddress: text('ip_address'),
    traceId: text('trace_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
);

// ─── Kill Switch Audit Log (Extended — ADR-133) ──────────────────────────

export const killSwitchAuditLog = sqliteTable(
  'kill_switch_audit_log',
  {
    id: text('id').primaryKey(),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
    userId: text('user_id').notNull(),
    reason: text('reason').notNull(),
    previousState: text('previous_state').notNull(),
    newState: text('new_state').notNull(),
    traceId: text('trace_id').notNull(),
    machineId: text('machine_id'),
    severity: text('severity').notNull().default('info'),
    metadata: text('metadata'), // JSON string
    // ─── ADR-140: Immutable Audit Log (hash chain + signatures) ───
    // prev_hash: sha256 of the previous entry's self_hash (chain link).
    // self_hash: sha256(canonical_json(entry) + prev_hash) — tamper-evident.
    // actor_signature: WebAuthn assertion (humans) or HMAC (services).
    // server_hmac: server-side HMAC over the canonical entry (non-repudiation).
    // plain_explanation: human-readable string (Dignity Test #6 reviewable reasoning).
    prevHash: text('prev_hash').notNull().default('GENESIS'),
    selfHash: text('self_hash').notNull().default(''),
    actorSignature: text('actor_signature'),
    serverHmac: text('server_hmac').notNull().default(''),
    plainExplanation: text('plain_explanation').notNull().default(''),
  },
  (table) => ({
    severityTimeIdx: index('ks_audit_severity_time_idx').on(table.severity, table.timestamp),
    machineTimeIdx: index('ks_audit_machine_time_idx').on(table.machineId, table.timestamp),
    stateTimeIdx: index('ks_audit_state_time_idx').on(table.newState, table.timestamp),
    selfHashIdx: index('ks_audit_self_hash_idx').on(table.selfHash),
  }),
);

// ─── Feature Flags ───────────────────────────────────────────────────────

export const featureFlags = sqliteTable(
  'feature_flag',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    value: integer('value', { mode: 'boolean' }).notNull(),
    description: text('description'),
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    createdBy: text('created_by').notNull().default('admin'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => ({
    keyIdx: uniqueIndex('feature_flag_key_idx').on(table.key),
  }),
);

export const flagAuditLog = sqliteTable(
  'flag_audit_log',
  {
    id: text('id').primaryKey(),
    // v1.1.1: nullable + ON DELETE SET NULL — preserves audit history after flag deletion
    flagId: text('flag_id').references(() => featureFlags.id, { onDelete: 'set null' }),
    action: text('action').notNull(),                        // 'created' | 'updated' | 'deleted' | 'override-set' | 'override-cleared' | 'override-rejected'
    oldValue: text('old_value'),
    newValue: text('new_value'),
    userId: text('user_id').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    // v1.1 (ADR-133 / § 8.2a): nullable; audit is append-only and must survive machine
    // deletion, so intentionally NO FK to machines.id (one-way cascade only).
    machineId: text('machine_id'),
  },
  (table) => ({
    flagIdIdx: index('flag_audit_flag_id_idx').on(table.flagId),
    actionTimeIdx: index('flag_audit_action_time_idx').on(table.action, table.timestamp),
    machineIdIdx: index('flag_audit_machine_id_idx').on(table.machineId),
  }),
);

// ─── Machines Inventory (Rebuilt — ADR-133) ──────────────────────────────

export const machines = sqliteTable(
  'machine',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    hostname: text('hostname').notNull().unique(),
    status: text('status').notNull().default('active'),       // active | inactive | offline
    role: text('role').notNull(),
    hasDpu: integer('has_dpu', { mode: 'boolean' }).notNull().default(false),
    specs: text('specs'),                                      // JSON: { cpu, ram, gpu, dpu }
    // ADR-138: monitoring-only until onboarding is fully completed — the
    // machine may report telemetry but cannot receive active responses.
    monitoringOnly: integer('monitoring_only', { mode: 'boolean' }).notNull().default(true),
    // ADR-137/138: zone assignment (default 'unassigned' until the admin
    // places the machine during onboarding).
    zone: text('zone').notNull().default('unassigned'),
    lastSeen: integer('last_seen', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    hostnameIdx: uniqueIndex('machine_hostname_idx').on(table.hostname),
    statusIdx: index('machine_status_idx').on(table.status),
  }),
);

// ─── Settings Persistence (New — ADR-133) ────────────────────────────────

export const settings = sqliteTable(
  'setting',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
);

// ─── Per-Machine Flag Overrides (New — ADR-133) ──────────────────────────

export const machineFlags = sqliteTable(
  'machine_flag',
  {
    machineId: text('machine_id').notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    flagKey: text('flag_key').notNull(),
    value: text('value'),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.machineId, table.flagKey] }),
    flagKeyIdx: index('machine_flag_key_idx').on(table.flagKey),
  }),
);

// ─── Secrets Audit Log (S-A1 — persisted audit trail for secret rotations/401s/lockouts) ──

export const secretsAuditLog = sqliteTable(
  'secrets_audit_log',
  {
    id: text('id').primaryKey(),
    at: integer('at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    name: text('name').notNull(),
    event: text('event').notNull(),         // 'rotate' | 'view' | '401' | 'lockout' | 'unlock' | 'reload' | 'rotate-consumer'
    sourceIp: text('source_ip'),
    result: text('result').notNull(),          // 'ok' | 'error' | 'blocked' | 'unauthorized' | 'locked'
    actor: text('actor'),
    meta: text('meta'),                         // JSON string
  },
  (table) => ({
    nameTimeIdx: index('secrets_audit_name_time_idx').on(table.name, table.at),
    eventTimeIdx: index('secrets_audit_event_time_idx').on(table.event, table.at),
  }),
);

// ─── Per-Machine Agent Registry (New — ADR-133) ──────────────────────────

export const agents = sqliteTable(
  'agent',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id').notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: text('version').notNull(),
    capabilities: text('capabilities'),                       // JSON array of capability strings
    lastHeartbeat: integer('last_heartbeat', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    machineIdx: index('agent_machine_idx').on(table.machineId),
    heartbeatIdx: index('agent_heartbeat_idx').on(table.lastHeartbeat),
  }),
);

// ─── Webhook API Keys (Card 0e2f9fec — DB-backed key management for openclaw-webhook) ──
//
// Single source of truth for the M2M keys that authenticate requests to
// the openclaw-webhook gateway. Replaces the env-var-only model that had
// three sources of truth (nginx, openclaw-webhook env, Vercel) and was
// producing 401s because the openclaw-webhook process had no key in env.
//
// Mirror of accounting-dashboard's `stores.apiKeyHash` pattern (camelCase,
// sha256 hex, Drizzle uniqueIndex). M2M auth, not user auth.
//
// Card 0e2f9fec / spec: docs/webhook-api-keys-db-spec.md §5, §12a
export const webhookApiKeys = sqliteTable(
  'webhook_api_keys',
  {
    id: text('id').primaryKey(),                              // ulid
    keyPrefix: text('key_prefix', { length: 8 }).notNull(),   // first 8 chars of the key (lookup + display)
    apiKeyHash: text('api_key_hash', { length: 64 }).notNull(), // sha256 hex of the full key
    name: text('name').notNull(),                              // human label, e.g. "bootstrap"
    scopes: text('scopes').notNull(),                          // csv: "live-chat,blog-pipeline,webhook-request"
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    createdBy: text('created_by').notNull().default('system'),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    lastUsedIp: text('last_used_ip'),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    revokedBy: text('revoked_by'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    notes: text('notes'),
  },
  (table) => ({
    apiKeyHashUnique: uniqueIndex('webhook_api_keys_apiKeyHash_unique').on(table.apiKeyHash),
    prefixIdx: index('webhook_api_keys_prefix_idx').on(table.keyPrefix),
    activeIdx: index('webhook_api_keys_active_idx').on(table.revokedAt, table.expiresAt),
  }),
);

// Append-only audit log for every key lifecycle event + every use attempt.
// SOC signal: who created/rotated/revoked what, and which keys are being
// brute-forced (use_failed rate per key). Mirrors secrets_audit_log shape.
export const webhookApiKeyAudit = sqliteTable(
  'webhook_api_key_audit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    keyId: text('key_id'),                                     // nullable: 'unknown' for unknown-prefix attempts
    action: text('action').notNull(),                          // 'create' | 'rotate' | 'revoke' | 'use' | 'use_failed'
    actor: text('actor').notNull(),                            // admin id, 'system', or 'request:<ip>'
    at: integer('at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    meta: text('meta'),                                        // JSON string, action-specific
    webhookPath: text('webhook_path'),                          // request pathname for use/use_failed audit entries
  },
  (table) => ({
    keyIdIdx: index('webhook_api_key_audit_key_id_idx').on(table.keyId),
    atIdx: index('webhook_api_key_audit_at_idx').on(table.at),
    actionAtIdx: index('webhook_api_key_audit_action_at_idx').on(table.action, table.at),
  }),
);

// ─── AI-Agnostic Discovery (ADR-135) ────────────────────────────────
//
// Provisional discovery registry. NOTHING here is authoritative until a
// human confirms the machine (ADR-135 §5 — NO auto-admission, ADR-138
// onboarding). Tables:
//   discovered_machine   — machines seen via heartbeat/mDNS/sweep
//   discovered_provider  — provider adapters detected per machine
//   discovered_model     — models enumerated per machine/provider
//   integrity_event      — tamper/swap events from fingerprint drift

export const discoveredMachines = sqliteTable(
  'discovered_machine',
  {
    id: text('id').primaryKey(),
    hostname: text('hostname').notNull(),
    ip: text('ip'),
    source: text('source').notNull(),                    // mdns | arp-sweep | heartbeat
    state: text('state').notNull().default('NEW_MACHINE'), // ADR-138 lifecycle: NEW_MACHINE → PENDING_CONFIRMATION → ADMITTED | DENIED; ADMITTED → PENDING_REVIEW on high-severity integrity drift (re-onboarding). NEW_MACHINE is the provisional state (covers PENDING_CONFIRMATION for sweep-discovered hosts without an agent identity).
    fingerprint: text('fingerprint'),                     // JSON HardwareFingerprint
    integritySignature: text('integrity_signature'),      // JSON IntegritySignature
    firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
    confirmedBy: text('confirmed_by'),
  },
  (table) => ({
    hostnameIdx: index('discovered_machine_hostname_idx').on(table.hostname),
    stateIdx: index('discovered_machine_state_idx').on(table.state),
    lastSeenIdx: index('discovered_machine_last_seen_idx').on(table.lastSeen),
  }),
);

export const discoveredProviders = sqliteTable(
  'discovered_provider',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id').notNull()
      .references(() => discoveredMachines.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),            // ollama | huggingface | llamaindex | vllm | openai-compatible
    baseUrl: text('base_url'),
    version: text('version'),
    status: text('status').notNull().default('detected'), // detected | healthy | unhealthy
    detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    lastHealthyAt: integer('last_healthy_at', { mode: 'timestamp' }),
  },
  (table) => ({
    machineIdx: index('discovered_provider_machine_idx').on(table.machineId),
    providerIdx: index('discovered_provider_provider_idx').on(table.providerId),
  }),
);

export const discoveredModels = sqliteTable(
  'discovered_model',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id').notNull()
      .references(() => discoveredMachines.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    name: text('name').notNull(),
    sizeBytes: integer('size_bytes'),
    quantization: text('quantization'),
    family: text('family'),
    served: integer('served', { mode: 'boolean' }).notNull().default(false),
    detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    machineIdx: index('discovered_model_machine_idx').on(table.machineId),
    providerIdx: index('discovered_model_provider_idx').on(table.providerId),
    modelIdx: index('discovered_model_model_idx').on(table.modelId),
  }),
);

export const integrityEvents = sqliteTable(
  'integrity_event',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id').notNull()
      .references(() => discoveredMachines.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),                       // tamper | swap | reconfirmed
    severity: text('severity').notNull().default('low'),  // low | medium | high
    driftedFields: text('drifted_fields'),                // JSON string[]
    detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    machineIdx: index('integrity_event_machine_idx').on(table.machineId),
    timeIdx: index('integrity_event_time_idx').on(table.detectedAt),
  }),
);

// ─── Onboarding & Multi-Tenant Registration (ADR-138) ───────────────
//
// Human-in-the-loop registration: a discovered machine requests
// registration, a full-privilege admin reviews the discovery report and
// APPROVEs (→ ADMITTED, machine tenant created) or DENies (→ DENIED,
// zero authority). Every decision is recorded here and in the audit log.
// Repeated denials from the same hostname/IP raise a rogue-device alert.

export const registrationRequests = sqliteTable(
  'registration_request',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id').notNull()
      .references(() => discoveredMachines.id, { onDelete: 'cascade' }),
    requestedBy: text('requested_by').notNull().default('system'), // agent hostname / sweep source
    status: text('status').notNull().default('PENDING'),           // PENDING | APPROVED | DENIED
    denialReason: text('denial_reason'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    machineIdx: index('registration_request_machine_idx').on(table.machineId),
    statusIdx: index('registration_request_status_idx').on(table.status),
    createdAtIdx: index('registration_request_created_at_idx').on(table.createdAt),
  }),
);

export const rogueDeviceAlerts = sqliteTable(
  'rogue_device_alert',
  {
    id: text('id').primaryKey(),
    hostname: text('hostname').notNull(),
    ip: text('ip'),
    denialCount: integer('denial_count').notNull().default(1),
    lastDeniedAt: integer('last_denied_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
    resolvedBy: text('resolved_by'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    hostnameIdx: index('rogue_device_alert_hostname_idx').on(table.hostname),
    ipIdx: index('rogue_device_alert_ip_idx').on(table.ip),
    resolvedIdx: index('rogue_device_alert_resolved_idx').on(table.resolved),
  }),
);

// ─── Human-Signature Kill Authorization (ADR-136) ──────────────────
//
// WebAuthn (FIDO2) hardware authenticator credentials. Private keys
// never leave the authenticator; only the public key is stored here.
// Each row is one registered authenticator (YubiKey / passkey / roaming
// security key) bound to a user. `credentialId` is the base64url
// credential ID, `publicKey` is the base64url-encoded COSE public key
// bytes, `counter` is the authenticator signature counter used for
// replay detection (monotonic per credential).

export const webauthnCredentials = sqliteTable(
  'webauthn_credential',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(), // base64url
    publicKey: text('public_key').notNull(),               // base64url COSE bytes
    counter: integer('counter').notNull().default(0),
    transports: text('transports'),                        // JSON string[]
    name: text('name'),                                    // human label, e.g. "YubiKey 5C"
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  },
  (table) => ({
    userIdIdx: index('webauthn_credential_user_id_idx').on(table.userId),
    credentialIdUnique: uniqueIndex('webauthn_credential_credential_id_unique').on(table.credentialId),
    activeIdx: index('webauthn_credential_active_idx').on(table.revokedAt),
  }),
);

// ─── Kill Authorization Requests (ADR-136 §3) ──────────────────────
//
// Quorum workflow state. A request is created when a human initiates a
// kill (or a quorum-gated policy change) with their WebAuthn signature.
// In `single` mode the request executes immediately; in `quorum` mode
// it enters PENDING_QUORUM until the configured threshold of DISTINCT
// approvers is met (initiator cannot be the sole approver).
// `signatures` is a JSON array of { userId, credentialId, at } entries.

export const killAuthorizationRequests = sqliteTable(
  'kill_authorization_request',
  {
    id: text('id').primaryKey(),
    action: text('action').notNull(),          // 'kill' | 'policy-change'
    target: text('target').notNull(),          // machine id | 'fleet' | flag key
    initiatedBy: text('initiated_by').notNull(),
    initiatedByCredentialId: text('initiated_by_credential_id').notNull(),
    initiatedAt: integer('initiated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    status: text('status').notNull().default('PENDING_QUORUM'), // PENDING_QUORUM | EXECUTED | EXPIRED | REJECTED
    signatures: text('signatures').notNull().default('[]'),     // JSON array
    executedAt: integer('executed_at', { mode: 'timestamp' }),
    timeoutMs: integer('timeout_ms').notNull().default(600_000),
  },
  (table) => ({
    statusIdx: index('kill_authorization_request_status_idx').on(table.status),
    initiatedAtIdx: index('kill_authorization_request_initiated_at_idx').on(table.initiatedAt),
    targetIdx: index('kill_authorization_request_target_idx').on(table.target),
  }),
);

// ─── Webhook Keys (ADR-139) — Per-Org Vault, Per-Machine Scope ────────
//
// Webhook API keys authorize AI EXECUTION calls (MCP, org chats, tool
// invocations). They are structurally SEPARATE from human WebAuthn
// credentials (ADR-136): a webhook key can NEVER authorize a kill.
// Enforced in the middleware layer (webhookAuth), not by convention.
//
// Scope is configured by humans (full-privilege admin) via the Settings
// UI (Phase 5 / ADR-141 — extension point only, no UI built here).
// Each key is bound to an allowed IP map + machine/zone/model scope.
export const webhookKeys = sqliteTable(
  'webhook_keys',
  {
    id: text('id').primaryKey(),                              // ulid-ish, opaque
    orgId: text('org_id').notNull(),                          // owning organization
    hashedSecret: text('hashed_secret', { length: 64 }).notNull(), // sha256 hex of the full key
    keyPrefix: text('key_prefix', { length: 8 }).notNull(),   // first 8 chars (lookup + display)
    name: text('name').notNull(),                             // human label
    allowedMachines: text('allowed_machines').notNull().default('[]'), // JSON string[] — machine ids
    allowedZones: text('allowed_zones').notNull().default('[]'),       // JSON string[] — zone names
    allowedModels: text('allowed_models').notNull().default('[]'),     // JSON string[] — model ids
    ipMap: text('ip_map').notNull().default('[]'),            // JSON string[] — allowed source IPs
    createdByAdminId: text('created_by_admin_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    rotatedAt: integer('rotated_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  },
  (table) => ({
    hashedSecretUnique: uniqueIndex('webhook_keys_hashed_secret_unique').on(table.hashedSecret),
    orgIdx: index('webhook_keys_org_idx').on(table.orgId),
    prefixIdx: index('webhook_keys_prefix_idx').on(table.keyPrefix),
    activeIdx: index('webhook_keys_active_idx').on(table.revokedAt),
  }),
);

// ─── First-Access Verification (ADR-139 §4 — semi-rigid) ──────────────
//
// Tracks which IP/device has been human-verified for a given key. On
// first access from a NEW IP/device the call is HELD and a verification
// challenge is raised (OTP to admin's registered channel + optional
// passkey). On verification → verified_at set → subsequent calls from
// that IP/device proceed directly. New IP/device → re-challenge.
export const firstAccess = sqliteTable(
  'first_access',
  {
    id: text('id').primaryKey(),
    keyId: text('key_id').notNull()
      .references(() => webhookKeys.id, { onDelete: 'cascade' }),
    ip: text('ip').notNull(),
    deviceFp: text('device_fp').notNull(),                    // device fingerprint (from request)
    verifiedAt: integer('verified_at', { mode: 'timestamp' }),
    challengeId: text('challenge_id'),                        // pending OTP/passkey challenge
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    keyIpDeviceIdx: uniqueIndex('first_access_key_ip_device_unique').on(table.keyId, table.ip, table.deviceFp),
    keyIdx: index('first_access_key_idx').on(table.keyId),
    verifiedIdx: index('first_access_verified_idx').on(table.verifiedAt),
  }),
);

// ─── Chain Anchors (ADR-140 §6.1 — daily head anchor) ─────────────────
//
// One row per day: the daily chain-head hash signed by the server HMAC
// key. This is the trusted verification point — a verifier with the
// anchored head can re-walk the chain independently. External publish
// (notary / WORM / blockchain) is a stub (out of scope for this card).
export const chainAnchors = sqliteTable(
  'chain_anchor',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull().unique(),                    // YYYY-MM-DD
    chainHeadHash: text('chain_head_hash').notNull(),          // self_hash of the last entry that day
    entryCount: integer('entry_count').notNull().default(0),
    signedPayload: text('signed_payload').notNull(),           // JSON: { date, chainHeadHash, entryCount } + HMAC
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    dateIdx: uniqueIndex('chain_anchor_date_unique').on(table.date),
  }),
);

// ─── Inference Verification Events (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §e.3) ──
//
// Durable review trail for inference verification results. Stores HASHES of
// prompt/output (not raw content) to keep the audit trail tamper-evident
// without persisting sensitive inference content. Written by the
// verification service on every verification; published to
// `bcp:verification:events` for the dashboard.
export const verificationEvents = sqliteTable(
  'verification_event',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull(),
    machineId: text('machine_id'),
    verdict: text('verdict').notNull(),          // SAFE | UNSAFE | REVIEW
    confidence: real('confidence'),
    reason: text('reason'),
    model: text('model').notNull(),
    degraded: integer('degraded', { mode: 'boolean' }).notNull().default(false),
    promptHash: text('prompt_hash'),             // sha256 of prompt (avoid storing raw prompt)
    outputHash: text('output_hash'),             // sha256 of output (avoid storing raw output)
    triggeredKill: integer('triggered_kill', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    requestIdx: index('verification_event_request_idx').on(table.requestId),
    verdictIdx: index('verification_event_verdict_idx').on(table.verdict),
    timeIdx: index('verification_event_time_idx').on(table.createdAt),
  }),
);
