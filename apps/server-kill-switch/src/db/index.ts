/**
 * SQLite Database Connection with Auto-Migration
 *
 * Bun-native SQLite via Drizzle ORM.
 * Uses WAL mode for concurrent reads during writes.
 * Auto-creates tables on startup if they don't exist.
 *
 * ADR-133: Extended schema — replaces old kill_switch_audit_log and machine
 * tables, adds setting, machine_flag, agent tables with indexes.
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import * as schema from './schema';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = `${DATA_DIR}/kill-switch.sqlite`;

/**
 * Initialize the database connection and ensure all tables exist.
 * Uses raw CREATE TABLE IF NOT EXISTS for startup reliability
 * (avoids dependency on drizzle-kit for production startup).
 *
 * ADR-133: Drops old machine table (unused/legacy schema), recreates
 * with full fields. Drops old kill_switch_audit_log (was in-memory
 * backed), recreates with severity/machineId/metadata columns.
 */
export function initDatabase(dbPath: string = DB_PATH) {
  mkdirSync(DATA_DIR, { recursive: true });

  const sqlite = new Database(dbPath, { create: true });

  // WAL mode for better concurrent performance
  sqlite.run('PRAGMA journal_mode=WAL');
  sqlite.run('PRAGMA foreign_keys=ON');
  sqlite.run('PRAGMA busy_timeout=5000');

  // ─── Auto-migrate: create tables if they don't exist ───────────────

  // Better-Auth v2 tables
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER DEFAULT 0,
      name TEXT,
      image TEXT,
      role TEXT DEFAULT 'admin',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      id_token TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Kill Switch state
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS kill_switch_state (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'ARMED',
      updated_by TEXT NOT NULL DEFAULT 'system',
      reason TEXT NOT NULL DEFAULT 'manual',
      ip_address TEXT,
      trace_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // ─── ADR-133: Conditional migration — check if new schema is already applied
  // Only DROP old tables if this is a first-time migration from legacy schema.
  // The setting table is our canary — it only exists in the new schema.
  const hasSettingTable = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='setting'")
    .get() as { name: string } | undefined;

  const isNewSchema = !!hasSettingTable;

  if (!isNewSchema) {
    console.log('[db] First-time migration from legacy schema — dropping old tables...');

    // Drop old kill_switch_audit_log (legacy schema had different columns)
    sqlite.run(`DROP TABLE IF EXISTS kill_switch_audit_log`);

    // Drop old machine + dependents (legacy schema)
    sqlite.run(`DROP TABLE IF EXISTS machine_flag`);
    sqlite.run(`DROP TABLE IF EXISTS agent`);
    sqlite.run(`DROP TABLE IF EXISTS machine`);
  }

  // ─── ADR-133: kill_switch_audit_log (extended) ────────────────────
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS kill_switch_audit_log (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      previous_state TEXT NOT NULL,
      new_state TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      machine_id TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      metadata TEXT
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS machine (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      role TEXT NOT NULL,
      has_dpu INTEGER NOT NULL DEFAULT 0,
      specs TEXT,
      last_seen INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // ─── New tables (ADR-133) ──────────────────────────────────────────

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS machine_flag (
      machine_id TEXT NOT NULL REFERENCES machine(id) ON DELETE CASCADE,
      flag_key TEXT NOT NULL,
      value TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (machine_id, flag_key)
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS agent (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES machine(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      capabilities TEXT,
      last_heartbeat INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Feature flags
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS feature_flag (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value INTEGER NOT NULL,
      description TEXT,
      enabled INTEGER DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Flag audit log
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS flag_audit_log (
      id TEXT PRIMARY KEY,
      flag_id TEXT REFERENCES feature_flag(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      user_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // v1.1: Add machine_id column to existing flag_audit_log tables (idempotent)
  try {
    sqlite.run(`ALTER TABLE flag_audit_log ADD COLUMN machine_id TEXT`);
  } catch (e) {
    // Column already exists — safe to ignore
    if (!(e instanceof Error) || !e.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // v1.1.1 hotfix (2026-06-09): Migrate flag_audit_log.flag_id to nullable + ON DELETE SET NULL.
  // Before: flag_id TEXT NOT NULL REFERENCES feature_flag(id) ON DELETE CASCADE.
  //   Problem: deleting a flag silently erased all its audit history, undermining
  //   tamper-evident governance claims on the kill-switch system.
  // After: flag_id TEXT REFERENCES feature_flag(id) ON DELETE SET NULL.
  //   Audit rows survive deletion with flag_id = NULL; FK becomes NULL on parent delete.
  // Idempotent: checks PRAGMA table_info for NOT NULL flag, only migrates if needed.
  try {
    const cols = sqlite
      .query("PRAGMA table_info(flag_audit_log)")
      .all() as Array<{ name: string; notnull: number }>;
    const flagIdCol = cols.find((c) => c.name === 'flag_id');
    if (flagIdCol && flagIdCol.notnull === 1) {
      console.log('[db] v1.1.1 migration: flag_audit_log.flag_id → nullable + SET NULL');

      // SQLite table rebuild pattern (preserves all data + indexes)
      sqlite.run('PRAGMA foreign_keys=OFF');
      sqlite.run('BEGIN');
      try {
        sqlite.run(`
          CREATE TABLE flag_audit_log_new (
            id TEXT PRIMARY KEY,
            flag_id TEXT REFERENCES feature_flag(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            user_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            machine_id TEXT
          )
        `);
        sqlite.run(`
          INSERT INTO flag_audit_log_new
          SELECT id, flag_id, action, old_value, new_value, user_id, timestamp, machine_id
          FROM flag_audit_log
        `);
        sqlite.run('DROP TABLE flag_audit_log');
        sqlite.run('ALTER TABLE flag_audit_log_new RENAME TO flag_audit_log');
        sqlite.run('COMMIT');
        console.log('[db] v1.1.1 migration complete');
      } catch (e) {
        sqlite.run('ROLLBACK');
        console.error('[db] v1.1.1 migration failed — rolled back:', e);
        throw e;
      } finally {
        sqlite.run('PRAGMA foreign_keys=ON');
      }
    } else {
      console.log('[db] v1.1.1 migration: already on nullable schema (skipped)');
    }
  } catch (e: any) {
    // Flag_audit_log table may not exist yet (fresh DB): CREATE TABLE IF NOT EXISTS
    // above will already be correct. Safe to ignore.
    if (e.message && !e.message.includes('no such table')) {
      throw e;
    }
  }

  // ─── Secrets Audit Log (S-A1) ────────────────────────────────────
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS secrets_audit_log (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      name TEXT NOT NULL,
      event TEXT NOT NULL,
      source_ip TEXT,
      result TEXT NOT NULL,
      actor TEXT,
      meta TEXT
    )
  `);

  sqlite.run(`CREATE INDEX IF NOT EXISTS secrets_audit_name_time_idx ON secrets_audit_log(name, at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS secrets_audit_event_time_idx ON secrets_audit_log(event, at)`);

  // ─── Webhook API Keys (Card 0e2f9fec) ─────────────────────────
  // sha256-hashed M2M keys for the openclaw-webhook gateway.
  // Mirror of accounting-dashboard's `stores.apiKeyHash` pattern.
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS webhook_api_keys (
      id TEXT PRIMARY KEY,
      key_prefix TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      last_used_at INTEGER,
      last_used_ip TEXT,
      revoked_at INTEGER,
      revoked_by TEXT,
      expires_at INTEGER,
      notes TEXT
    )
  `);

  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS webhook_api_keys_apiKeyHash_unique ON webhook_api_keys(api_key_hash)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_api_keys_prefix_idx ON webhook_api_keys(key_prefix)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_api_keys_active_idx ON webhook_api_keys(revoked_at, expires_at)`);

  // Append-only audit log (id INTEGER PRIMARY KEY AUTOINCREMENT to match spec §5)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS webhook_api_key_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      at INTEGER NOT NULL,
      meta TEXT
    )
  `);

  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_api_key_audit_key_id_idx ON webhook_api_key_audit(key_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_api_key_audit_at_idx ON webhook_api_key_audit(at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_api_key_audit_action_at_idx ON webhook_api_key_audit(action, at)`);

  // ─── Indexes ───────────────────────────────────────────────────────

  // Auth indexes
  sqlite.run(`CREATE INDEX IF NOT EXISTS user_email_idx ON user(email)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS session_token_idx ON session(token)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier)`);

  // Kill switch audit log indexes (ADR-133 — timestamp + machineId + severity)
  sqlite.run(`CREATE INDEX IF NOT EXISTS ks_audit_severity_time_idx ON kill_switch_audit_log(severity, timestamp)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS ks_audit_machine_time_idx ON kill_switch_audit_log(machine_id, timestamp)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS ks_audit_state_time_idx ON kill_switch_audit_log(new_state, timestamp)`);

  // Feature flag indexes
  sqlite.run(`CREATE INDEX IF NOT EXISTS feature_flag_key_idx ON feature_flag(key)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS flag_audit_flag_id_idx ON flag_audit_log(flag_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS flag_audit_action_time_idx ON flag_audit_log(action, timestamp)`);

  // Machine indexes (ADR-133 — status, lastSeen)
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_hostname_idx ON machine(hostname)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_status_idx ON machine(status)`);

  // Machine flag index
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_flag_key_idx ON machine_flag(flag_key)`);

  // Agent indexes (ADR-133 — machineId, lastHeartbeat)
  sqlite.run(`CREATE INDEX IF NOT EXISTS agent_machine_idx ON agent(machine_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS agent_heartbeat_idx ON agent(last_heartbeat)`);

  const db = drizzle(sqlite, { schema });

  console.log(`[db] SQLite initialized: ${dbPath} (WAL mode, tables verified)`);

  return { db, sqlite };
}

// Export a pre-initialized db instance for convenience
const { db, sqlite } = initDatabase();
export { db, sqlite };
