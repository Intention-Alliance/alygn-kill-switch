/**
 * SQLite Database Connection with Auto-Migration
 *
 * Bun-native SQLite via Drizzle ORM.
 * Uses WAL mode for concurrent reads during writes.
 * Auto-creates tables on startup if they don't exist.
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

  // Kill Switch audit log
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS kill_switch_audit_log (
      id TEXT PRIMARY KEY,
      previous_state TEXT NOT NULL,
      new_state TEXT NOT NULL,
      initiated_by TEXT NOT NULL DEFAULT 'system',
      reason TEXT NOT NULL DEFAULT 'manual',
      ip_address TEXT,
      trace_id TEXT,
      timestamp INTEGER NOT NULL
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
      flag_id TEXT NOT NULL REFERENCES feature_flag(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      user_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // Machines inventory
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS machine (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      ip_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      last_heartbeat INTEGER,
      tags TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create indexes
  sqlite.run(`CREATE INDEX IF NOT EXISTS user_email_idx ON user(email)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS session_token_idx ON session(token)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS ks_audit_state_time_idx ON kill_switch_audit_log(new_state, timestamp)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS feature_flag_key_idx ON feature_flag(key)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS flag_audit_flag_id_idx ON flag_audit_log(flag_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS flag_audit_action_time_idx ON flag_audit_log(action, timestamp)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_hostname_idx ON machine(hostname)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_ip_idx ON machine(ip_address)`);

  const db = drizzle(sqlite, { schema });

  console.log(`[db] SQLite initialized: ${dbPath} (WAL mode, tables verified)`);

  return { db, sqlite };
}

// Export a pre-initialized db instance for convenience
const { db, sqlite } = initDatabase();
export { db, sqlite };
