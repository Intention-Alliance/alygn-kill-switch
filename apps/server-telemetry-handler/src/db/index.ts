/**
 * Telemetry SQLite Database Connection
 *
 * Creates and manages a dedicated SQLite database for telemetry time-series data.
 * Uses WAL mode, foreign keys, and auto-creates tables on startup.
 *
 * Pattern follows server-kill-switch/src/db/index.ts — raw CREATE TABLE IF NOT EXISTS
 * for startup reliability without depending on drizzle-kit migrations at runtime.
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import * as schema from './schema';

const DEFAULT_DATA_DIR = process.env.DATA_DIR || './data';
const DEFAULT_DB_PATH = `${DEFAULT_DATA_DIR}/telemetry.sqlite`;

/**
 * Initialize the telemetry database connection.
 * Creates the data directory and database file if they don't exist.
 * Enables WAL mode and foreign key enforcement.
 * Auto-creates telemetry_metric and telemetry_alert tables.
 */
export function initTelemetryDatabase(databasePath: string = DEFAULT_DB_PATH): {
  database: ReturnType<typeof drizzle>;
  sqliteInstance: Database;
} {
  mkdirSync(DEFAULT_DATA_DIR, { recursive: true });

  const sqliteInstance = new Database(databasePath, { create: true });

  // Performance and integrity pragmas
  sqliteInstance.run('PRAGMA journal_mode=WAL');
  sqliteInstance.run('PRAGMA foreign_keys=ON');
  sqliteInstance.run('PRAGMA busy_timeout=5000');

  // ─── Auto-migrate: create tables ──────────────────────────────────

  sqliteInstance.run(`
    CREATE TABLE IF NOT EXISTS telemetry_metric (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL,
      monitor_name TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      unit TEXT NOT NULL,
      labels TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  sqliteInstance.run(`
    CREATE TABLE IF NOT EXISTS telemetry_alert (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL,
      monitor_name TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      threshold_value REAL NOT NULL,
      actual_value REAL NOT NULL,
      severity TEXT NOT NULL,
      acknowledged INTEGER DEFAULT 0,
      triggered_kill_switch INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL
    )
  `);

  // ─── Indexes ──────────────────────────────────────────────────────

  sqliteInstance.run(`CREATE INDEX IF NOT EXISTS tm_machine_time_idx ON telemetry_metric(machine_id, timestamp)`);
  sqliteInstance.run(`CREATE INDEX IF NOT EXISTS tm_monitor_time_idx ON telemetry_metric(monitor_name, timestamp)`);
  sqliteInstance.run(`CREATE INDEX IF NOT EXISTS tm_metric_time_idx ON telemetry_metric(metric_name, timestamp)`);

  sqliteInstance.run(`CREATE INDEX IF NOT EXISTS ta_severity_time_idx ON telemetry_alert(severity, timestamp)`);
  sqliteInstance.run(`CREATE INDEX IF NOT EXISTS ta_machine_time_idx ON telemetry_alert(machine_id, timestamp)`);
  sqliteInstance.run(`CREATE INDEX IF NOT EXISTS ta_monitor_time_idx ON telemetry_alert(monitor_name, timestamp)`);

  const database = drizzle(sqliteInstance, { schema });

  console.log(`[telemetry-db] SQLite initialized: ${databasePath} (WAL mode, tables verified)`);

  return { database, sqliteInstance };
}

// ─── Singleton instances ────────────────────────────────────────────────

const { database, sqliteInstance } = initTelemetryDatabase();

export { database, sqliteInstance };
export type TelemetryDatabase = typeof database;
