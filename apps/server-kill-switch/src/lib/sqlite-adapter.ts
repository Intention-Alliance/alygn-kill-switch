/**
 * SQLite-Persisted Auth Adapter
 *
 * Wraps the in-memory adapter with SQLite persistence.
 * Replaces the old file-adapter (JSON) which lost sessions on container recycle.
 *
 * Uses Bun's built-in SQLite (bun:sqlite) directly — NOT Drizzle — to avoid
 * circular dependencies between the adapter and Drizzle schema.
 *
 * Lifecycle:
 *   1. Startup: load all auth tables from SQLite → memory
 *   2. Every mutation: persist the table back to SQLite
 *   3. Crashes/restarts: state survives (SQLite on disk)
 */

import { memoryAdapter } from '@better-auth/memory-adapter';
import type { BetterAuthOptions, DBAdapter } from 'better-auth';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

// ─── SQLite Setup ─────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || './data';
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = `${DATA_DIR}/auth.sqlite`;
const sqlite = new Database(DB_PATH, { create: true });

// WAL mode for concurrent access
sqlite.run('PRAGMA journal_mode=WAL');
sqlite.run('PRAGMA busy_timeout=5000');

// ─── Schema Migration ─────────────────────────────────────────────────────

function migrateAuthTables(): void {
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER DEFAULT 0,
      name TEXT,
      image TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS "session" (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS "account" (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at TEXT,
      refresh_token_expires_at TEXT,
      scope TEXT,
      id_token TEXT,
      password TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS "verification" (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

migrateAuthTables();

// ─── Load State from SQLite → Memory ──────────────────────────────────────

const TABLE_NAMES = ['user', 'session', 'account', 'verification'] as const;
type TableName = (typeof TABLE_NAMES)[number];

function loadTable(name: TableName): any[] {
  try {
    const rows = sqlite.query(`SELECT * FROM "${name}"`).all();
    console.log(`[sqlite-adapter] Loaded ${rows.length} ${name}(s) from ${DB_PATH}`);
    return rows;
  } catch (err: any) {
    console.error(`[sqlite-adapter] Failed to load ${name}: ${err.message}`);
    return [];
  }
}

function saveTable(name: TableName): void {
  const records = inMemoryDB[name] || [];

  // Delete all and re-insert. Simple approach fine for small admin tables.
  // For large-scale use, switch to upsert-per-record.
  const del = sqlite.query(`DELETE FROM "${name}"`);
  del.run();

  if (records.length === 0) return;

  // Get column names from the schema
  const colInfo = sqlite.query(`PRAGMA table_info("${name}")`).all() as any[];
  const columns = colInfo.map((c: any) => c.name);

  // Insert all records
  for (const record of records) {
    const cols = columns.filter((c: string) => record[c] !== undefined);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map((c: string) => record[c]);

    try {
      sqlite.run(`INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`, ...values);
    } catch (err: any) {
      console.error(`[sqlite-adapter] Failed to insert into ${name}: ${err.message}`);
    }
  }
}

const inMemoryDB: Record<string, any[]> = {};
for (const name of TABLE_NAMES) {
  inMemoryDB[name] = loadTable(name);
}

const userCount = inMemoryDB['user']?.length || 0;
console.log(`[sqlite-adapter] Auth DB ready with ${userCount} user(s)`);

// ─── Adapter Factory ───────────────────────────────────────────────────────

export function sqliteAdapter(options: BetterAuthOptions): DBAdapter<BetterAuthOptions> {
  const baseAdapter = memoryAdapter(inMemoryDB)(options);
  const wrapped: any = { ...baseAdapter };

  const mutatorMethods = ['create', 'update', 'updateMany', 'delete', 'deleteMany'];

  for (const key of mutatorMethods) {
    if (typeof (baseAdapter as any)[key] === 'function') {
      const original = (baseAdapter as any)[key];
      wrapped[key] = async (...args: any[]) => {
        const modelName = args[0]?.model;
        const result = await original.call(baseAdapter, ...args);
        if (modelName && TABLE_NAMES.includes(modelName as TableName)) {
          saveTable(modelName as TableName);
        }
        return result;
      };
    }
  }

  if (typeof baseAdapter.transaction === 'function') {
    const origTransaction = baseAdapter.transaction;
    wrapped.transaction = async (cb: any) => {
      const result = await origTransaction.call(baseAdapter, cb);
      for (const name of TABLE_NAMES) {
        saveTable(name);
      }
      return result;
    };
  }

  return wrapped as DBAdapter<BetterAuthOptions>;
}
