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
    ts: integer('ts', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    keyName: text('key_name').notNull(),
    action: text('action').notNull(),         // 'rotate' | 'view' | '401' | 'lockout' | 'unlock' | 'reload' | 'rotate-consumer'
    sourceIp: text('source_ip'),
    result: text('result').notNull(),          // 'ok' | 'error' | 'blocked' | 'unauthorized' | 'locked'
    actor: text('actor'),
    meta: text('meta'),                         // JSON string
  },
  (table) => ({
    keyTimeIdx: index('secrets_audit_key_time_idx').on(table.keyName, table.ts),
    actionTimeIdx: index('secrets_audit_action_time_idx').on(table.action, table.ts),
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
