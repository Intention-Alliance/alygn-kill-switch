/**
 * Test DB isolation helper (Phase 4)
 *
 * The kill-switch app uses a module-level singleton `db` from
 * `db/index.ts`. When bun test runs all files in one process, that
 * singleton is shared — so a test file that drops/recreates tables
 * leaks state into other test files (the exact isolation problem the
 * Phase 3 review flagged).
 *
 * This helper mocks `db/index` with a REAL in-memory SQLite database
 * (via bun:sqlite + drizzle) so each test file gets an isolated DB with
 * real behavior (triggers, rowid ordering) while never touching the
 * shared singleton. Call `mockDbIndex()` at the TOP of a test file,
 * BEFORE importing any module that imports `db/index`.
 *
 * The tables the Phase 4 code touches are created here (webhook_keys,
 * first_access, chain_anchor, kill_switch_audit_log with the ADR-140
 * hash-chain columns + INSERT-only triggers).
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { Database } from 'bun:sqlite'
import { mock } from 'bun:test'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../db/schema'

export function mockDbIndex() {
	const sqlite = new Database(':memory:', { create: true })
	sqlite.run('PRAGMA journal_mode=WAL')
	sqlite.run('PRAGMA foreign_keys=ON')
	const db = drizzle(sqlite, { schema })

	// ─── Phase 4 tables (mirrors db/index.ts auto-migration) ──────────
	sqlite.run(`
    CREATE TABLE IF NOT EXISTS webhook_keys (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      hashed_secret TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      allowed_machines TEXT NOT NULL DEFAULT '[]',
      allowed_zones TEXT NOT NULL DEFAULT '[]',
      allowed_models TEXT NOT NULL DEFAULT '[]',
      ip_map TEXT NOT NULL DEFAULT '[]',
      created_by_admin_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rotated_at INTEGER,
      revoked_at INTEGER,
      last_used_at INTEGER
    )
  `)
	sqlite.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS webhook_keys_hashed_secret_unique ON webhook_keys(hashed_secret)`,
	)
	sqlite.run(
		`CREATE INDEX IF NOT EXISTS webhook_keys_org_idx ON webhook_keys(org_id)`,
	)
	sqlite.run(
		`CREATE INDEX IF NOT EXISTS webhook_keys_prefix_idx ON webhook_keys(key_prefix)`,
	)
	sqlite.run(
		`CREATE INDEX IF NOT EXISTS webhook_keys_active_idx ON webhook_keys(revoked_at)`,
	)

	sqlite.run(`
    CREATE TABLE IF NOT EXISTS first_access (
      id TEXT PRIMARY KEY,
      key_id TEXT NOT NULL,
      ip TEXT NOT NULL,
      device_fp TEXT NOT NULL,
      verified_at INTEGER,
      challenge_id TEXT,
      created_at INTEGER NOT NULL
    )
  `)
	sqlite.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS first_access_key_ip_device_unique ON first_access(key_id, ip, device_fp)`,
	)
	sqlite.run(
		`CREATE INDEX IF NOT EXISTS first_access_key_idx ON first_access(key_id)`,
	)
	sqlite.run(
		`CREATE INDEX IF NOT EXISTS first_access_verified_idx ON first_access(verified_at)`,
	)

	sqlite.run(`
    CREATE TABLE IF NOT EXISTS chain_anchor (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      chain_head_hash TEXT NOT NULL,
      entry_count INTEGER NOT NULL DEFAULT 0,
      signed_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)
	sqlite.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS chain_anchor_date_unique ON chain_anchor(date)`,
	)

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
      metadata TEXT,
      prev_hash TEXT NOT NULL DEFAULT 'GENESIS',
      self_hash TEXT NOT NULL DEFAULT '',
      actor_signature TEXT,
      server_hmac TEXT NOT NULL DEFAULT '',
      plain_explanation TEXT NOT NULL DEFAULT ''
    )
  `)
	sqlite.run(
		`CREATE INDEX IF NOT EXISTS ks_audit_self_hash_idx ON kill_switch_audit_log(self_hash)`,
	)
	sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS kill_switch_audit_log_no_update
    BEFORE UPDATE ON kill_switch_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_audit_log is append-only (ADR-140): UPDATE forbidden');
    END
  `)
	sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS kill_switch_audit_log_no_delete
    BEFORE DELETE ON kill_switch_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_audit_log is append-only (ADR-140): DELETE forbidden');
    END
  `)

	mock.module(path.resolve(__dirname, '../db/index.ts'), () => ({
		db,
		sqlite,
		initDatabase: () => ({ db, sqlite }),
	}))

	return { db, sqlite }
}
