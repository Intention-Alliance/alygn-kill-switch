/**
 * Dignity Verifier Dashboard — Shared SQLite + Drizzle access
 *
 * Single lazy connection to the self-contained SQLite store. Owns the
 * `CREATE TABLE IF NOT EXISTS` bootstrap for the domain tables so the
 * dashboard can run without a separate migration step (the auth tables are
 * created by Better-Auth's drizzle adapter on first use; the domain tables
 * are declared here and created idempotently on first access).
 *
 * BUILD-SAFETY: this module uses Bun-only APIs (bun:sqlite). Next.js build
 * workers run under Node, so the connection is initialized lazily on first
 * request (getDb) rather than at module load.
 */

import { mkdirSync } from "node:fs";

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const DB_PATH = `${DATA_DIR}/dignity-verifier.db`;

export type DrizzleDb = ReturnType<typeof import("drizzle-orm/bun-sqlite")["drizzle"]>;
export type SqliteDatabase = InstanceType<typeof import("bun:sqlite")["Database"]>;

let dbInstance: DrizzleDb | null = null;
let sqliteInstance: SqliteDatabase | null = null;

/**
 * Idempotent bootstrap of the domain tables. Mirrors the Drizzle schema in
 * db-schema.ts. Uses `CREATE TABLE IF NOT EXISTS` so it is safe to run on
 * every process start and against an existing database.
 */
function bootstrapDomainTables(sqlite: SqliteDatabase): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dataset_example (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      output TEXT NOT NULL,
      verdict TEXT NOT NULL,
      reason TEXT,
      category TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'seed',
      verified_by_teacher INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_run (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      base_model TEXT NOT NULL,
      target_model TEXT NOT NULL,
      lora_rank INTEGER NOT NULL DEFAULT 8,
      epochs INTEGER NOT NULL DEFAULT 3,
      batch_size INTEGER NOT NULL DEFAULT 4,
      learning_rate TEXT NOT NULL DEFAULT '2e-4',
      dataset_size INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      accuracy INTEGER,
      log_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eval_result (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES training_run(id) ON DELETE SET NULL,
      model TEXT NOT NULL,
      total_tests INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      accuracy INTEGER NOT NULL,
      details TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      params TEXT NOT NULL DEFAULT '{}',
      started_at INTEGER,
      finished_at INTEGER,
      exit_code INTEGER,
      log_tail TEXT NOT NULL DEFAULT '',
      artifact_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

/**
 * Lazily open the SQLite connection + Drizzle instance and bootstrap the
 * domain tables. Returns the Drizzle query builder.
 */
export async function getDb(): Promise<DrizzleDb> {
  if (dbInstance) return dbInstance;

  mkdirSync(DATA_DIR, { recursive: true });

  const { Database } = await import("bun:sqlite");
  const { drizzle } = await import("drizzle-orm/bun-sqlite");

  const sqlite = new Database(DB_PATH);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  bootstrapDomainTables(sqlite);

  sqliteInstance = sqlite;
  dbInstance = drizzle(sqlite);
  return dbInstance;
}

/**
 * Lazily open the raw bun:sqlite handle (for direct exec / pragma access).
 * Initializes the same connection as getDb.
 */
export async function getSqlite(): Promise<SqliteDatabase> {
  if (sqliteInstance) return sqliteInstance;
  await getDb();
  return sqliteInstance as unknown as SqliteDatabase;
}

export { DATA_DIR, DB_PATH };
