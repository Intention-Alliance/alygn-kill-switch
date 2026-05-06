/**
 * Kill Switch Drizzle SQLite Schema
 *
 * Central schema for:
 *  - Better-Auth v2 tables (user, session, account, verification)
 *  - Kill Switch state persistence
 *  - Feature flags
 *  - Flag audit log
 *  - Machine inventory
 *
 * ADR-121: SQLite over file adapter for durability + crash safety.
 * ADR-122: Drizzle ORM for type-safe queries tied to schema.
 */

import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// ─── Better-Auth v2 Required Tables ──────────────────────────────────────

export const users = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
    name: text('name'),
    image: text('image'),
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

export const killSwitchAuditLog = sqliteTable(
  'kill_switch_audit_log',
  {
    id: text('id').primaryKey(),
    previousState: text('previous_state').notNull(),
    newState: text('new_state').notNull(),
    initiatedBy: text('initiated_by').notNull().default('system'),
    reason: text('reason').notNull().default('manual'),
    ipAddress: text('ip_address'),
    traceId: text('trace_id'),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    stateTimestampIdx: index('ks_audit_state_time_idx').on(table.newState, table.timestamp),
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
    flagId: text('flag_id').notNull().references(() => featureFlags.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),                        // 'created' | 'updated' | 'deleted'
    oldValue: text('old_value'),
    newValue: text('new_value'),
    userId: text('user_id').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    flagIdIdx: index('flag_audit_flag_id_idx').on(table.flagId),
    actionTimeIdx: index('flag_audit_action_time_idx').on(table.action, table.timestamp),
  }),
);

// ─── Machines Inventory ──────────────────────────────────────────────────

export const machines = sqliteTable(
  'machine',
  {
    id: text('id').primaryKey(),
    hostname: text('hostname').notNull(),
    ipAddress: text('ip_address').notNull(),
    status: text('status').notNull().default('online'),     // online | offline | degraded | maintenance
    lastHeartbeat: integer('last_heartbeat', { mode: 'timestamp' }),
    tags: text('tags'),                                      // JSON string array
    metadata: text('metadata'),                              // JSON string object
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => ({
    hostnameIdx: uniqueIndex('machine_hostname_idx').on(table.hostname),
    ipIdx: index('machine_ip_idx').on(table.ipAddress),
  }),
);
