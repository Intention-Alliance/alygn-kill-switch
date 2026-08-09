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

import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';

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
  },
  (table) => ({
    severityTimeIdx: index('ks_audit_severity_time_idx').on(table.severity, table.timestamp),
    machineTimeIdx: index('ks_audit_machine_time_idx').on(table.machineId, table.timestamp),
    stateTimeIdx: index('ks_audit_state_time_idx').on(table.newState, table.timestamp),
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
    state: text('state').notNull().default('NEW_MACHINE'), // NEW_MACHINE | PENDING_CONFIRMATION | CONFIRMED | DENIED — NEW_MACHINE is the provisional state (covers PENDING_CONFIRMATION; no code path writes it, retained for forward-compat, ADR-138)
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
