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
  // v1.2: value is TEXT (typed values serialized as strings). Fresh DBs get
  // the TEXT column directly; existing DBs are migrated below (v1.2 rebuild).
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS feature_flag (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
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

  // ─── v1.2 migration: feature_flag.value INTEGER(boolean) → TEXT ──────
  // Feature flags carry typed values (boolean | number | string). The old
  // schema stored booleans as INTEGER; numbers/strings could not be stored
  // faithfully (POST /v1/flags coerced everything through Boolean(value)).
  // Rebuild preserves data: existing 0/1 values become 'false'/'true'.
  try {
    const flagCols = sqlite
      .query('PRAGMA table_info(feature_flag)')
      .all() as Array<{ name: string; type: string }>;
    const valueCol = flagCols.find((c) => c.name === 'value');
    if (valueCol && valueCol.type.toUpperCase().includes('INT')) {
      console.log('[db] v1.2 migration: feature_flag.value INTEGER → TEXT');

      sqlite.run('PRAGMA foreign_keys=OFF');
      sqlite.run('BEGIN');
      try {
        sqlite.run(`
          CREATE TABLE feature_flag_new (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            description TEXT,
            enabled INTEGER DEFAULT 1,
            created_by TEXT NOT NULL DEFAULT 'admin',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        // 0/1 → 'false'/'true'; anything else is stored as-is (string).
        sqlite.run(`
          INSERT INTO feature_flag_new
          SELECT id, key,
                 CASE WHEN value = 1 THEN 'true' WHEN value = 0 THEN 'false' ELSE CAST(value AS TEXT) END,
                 description, enabled, created_by, created_at, updated_at
          FROM feature_flag
        `);
        sqlite.run('DROP TABLE feature_flag');
        sqlite.run('ALTER TABLE feature_flag_new RENAME TO feature_flag');
        sqlite.run('CREATE UNIQUE INDEX IF NOT EXISTS feature_flag_key_idx ON feature_flag(key)');
        sqlite.run('COMMIT');
        console.log('[db] v1.2 migration complete');
      } catch (e) {
        sqlite.run('ROLLBACK');
        console.error('[db] v1.2 migration failed — rolled back:', e);
        throw e;
      } finally {
        sqlite.run('PRAGMA foreign_keys=ON');
      }
    } else {
      console.log('[db] v1.2 migration: already on TEXT schema (skipped)');
    }
  } catch (e: any) {
    // feature_flag may not exist yet on a fresh DB (created above with TEXT).
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

  // ─── ADR-139: Webhook Keys (per-org vault, per-machine scope) ────────
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
  `);
  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS webhook_keys_hashed_secret_unique ON webhook_keys(hashed_secret)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_keys_org_idx ON webhook_keys(org_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_keys_prefix_idx ON webhook_keys(key_prefix)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webhook_keys_active_idx ON webhook_keys(revoked_at)`);

  // ─── ADR-139 §4: First-Access Verification (semi-rigid) ──────────────
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS first_access (
      id TEXT PRIMARY KEY,
      key_id TEXT NOT NULL REFERENCES webhook_keys(id) ON DELETE CASCADE,
      ip TEXT NOT NULL,
      device_fp TEXT NOT NULL,
      verified_at INTEGER,
      challenge_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS first_access_key_ip_device_unique ON first_access(key_id, ip, device_fp)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS first_access_key_idx ON first_access(key_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS first_access_verified_idx ON first_access(verified_at)`);

  // ─── ADR-140 §6.1: Chain Anchors (daily head anchor) ─────────────────
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS chain_anchor (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      chain_head_hash TEXT NOT NULL,
      entry_count INTEGER NOT NULL DEFAULT 0,
      signed_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS chain_anchor_date_unique ON chain_anchor(date)`);

  // ─── Inference Verification Events (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §e.3) ──
  // Durable review trail for inference verification results. Stores HASHES of
  // prompt/output (not raw content). Written by the verification service.
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS verification_event (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      machine_id TEXT,
      verdict TEXT NOT NULL,
      confidence REAL,
      reason TEXT,
      model TEXT NOT NULL,
      degraded INTEGER NOT NULL DEFAULT 0,
      prompt_hash TEXT,
      output_hash TEXT,
      triggered_kill INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  sqlite.run(`CREATE INDEX IF NOT EXISTS verification_event_request_idx ON verification_event(request_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS verification_event_verdict_idx ON verification_event(verdict)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS verification_event_time_idx ON verification_event(created_at)`);

  // ─── AI-Agnostic Discovery tables (ADR-135) ───────────────────────
  // Provisional registry — nothing is authoritative until human
  // confirmation (NO auto-admission, ADR-135 §5).
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS discovered_machine (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      ip TEXT,
      source TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'NEW_MACHINE',
      fingerprint TEXT,
      integrity_signature TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      confirmed_at INTEGER,
      confirmed_by TEXT
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS discovered_provider (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES discovered_machine(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      base_url TEXT,
      version TEXT,
      status TEXT NOT NULL DEFAULT 'detected',
      detected_at INTEGER NOT NULL,
      last_healthy_at INTEGER
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS discovered_model (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES discovered_machine(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size_bytes INTEGER,
      quantization TEXT,
      family TEXT,
      served INTEGER NOT NULL DEFAULT 0,
      detected_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS integrity_event (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES discovered_machine(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'low',
      drifted_fields TEXT,
      detected_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_machine_hostname_idx ON discovered_machine(hostname)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_machine_state_idx ON discovered_machine(state)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_machine_last_seen_idx ON discovered_machine(last_seen)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_provider_machine_idx ON discovered_provider(machine_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_provider_provider_idx ON discovered_provider(provider_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_model_machine_idx ON discovered_model(machine_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_model_provider_idx ON discovered_model(provider_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS discovered_model_model_idx ON discovered_model(model_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS integrity_event_machine_idx ON integrity_event(machine_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS integrity_event_time_idx ON integrity_event(detected_at)`);

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

  // ─── ADR-140: Immutable Audit Log — hash-chain columns (idempotent ALTER) ──
  // prev_hash, self_hash, actor_signature, server_hmac, plain_explanation.
  // Each ALTER is wrapped in try/catch for 'duplicate column name' (idempotent).
  const auditCols = [
    ['prev_hash', "TEXT NOT NULL DEFAULT 'GENESIS'"],
    ['self_hash', "TEXT NOT NULL DEFAULT ''"],
    ['actor_signature', 'TEXT'],
    ['server_hmac', "TEXT NOT NULL DEFAULT ''"],
    ['plain_explanation', "TEXT NOT NULL DEFAULT ''"],
  ] as const;
  for (const [col, def] of auditCols) {
    try {
      sqlite.run(`ALTER TABLE kill_switch_audit_log ADD COLUMN ${col} ${def}`);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('duplicate column name')) throw e;
    }
  }
  sqlite.run(`CREATE INDEX IF NOT EXISTS ks_audit_self_hash_idx ON kill_switch_audit_log(self_hash)`);

  // ─── ADR-140: INSERT-only triggers on the audit log (no UPDATE/DELETE) ──
  // SQLite has no per-statement trigger type, so we use INSTEAD OF triggers
  // on a view is not possible for a base table; instead we enforce via
  // BEFORE UPDATE / BEFORE DELETE triggers that RAISE(ABORT). This makes the
  // append-only guarantee structural, not conventional.
  sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS kill_switch_audit_log_no_update
    BEFORE UPDATE ON kill_switch_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_audit_log is append-only (ADR-140): UPDATE forbidden');
    END
  `);
  sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS kill_switch_audit_log_no_delete
    BEFORE DELETE ON kill_switch_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_audit_log is append-only (ADR-140): DELETE forbidden');
    END
  `);

  // Feature flag indexes
  sqlite.run(`CREATE INDEX IF NOT EXISTS feature_flag_key_idx ON feature_flag(key)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS flag_audit_flag_id_idx ON flag_audit_log(flag_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS flag_audit_action_time_idx ON flag_audit_log(action, timestamp)`);

  // Machine indexes (ADR-133 — status, lastSeen)
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_hostname_idx ON machine(hostname)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_status_idx ON machine(status)`);

  // ─── Seed local machine ────────────────────────────────────────────
  // Ensure the dashboard always has at least the local host registered so
  // the web-regulator never renders an empty machine inventory. Uses
  // INSERT OR IGNORE (hostname is UNIQUE) so it is safe on every restart.
  const seedHostname = process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost';
  const seedMachineId = `machine-${seedHostname.split('.')[0]}`;
  const seedMachineName = process.env.ALYGN_MACHINE_NAME ?? seedHostname.split('.')[0];
  sqlite.run(
    `INSERT OR IGNORE INTO machine (id, name, hostname, status, role, specs, created_at)
     VALUES (?, ?, ?, 'active', 'primary', '{"gpu":"none","cpu":"arch","cores":8}', strftime('%s','now') * 1000)`,
    [seedMachineId, seedMachineName, seedHostname]
  );

  // Machine flag index
  sqlite.run(`CREATE INDEX IF NOT EXISTS machine_flag_key_idx ON machine_flag(flag_key)`);

  // Agent indexes (ADR-133 — machineId, lastHeartbeat)
  sqlite.run(`CREATE INDEX IF NOT EXISTS agent_machine_idx ON agent(machine_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS agent_heartbeat_idx ON agent(last_heartbeat)`);

  // ─── ADR-138: Onboarding & Multi-Tenant Registration ───────────────
  // monitoring_only + zone on the machine table (idempotent ALTER TABLE).
  try {
    sqlite.run(`ALTER TABLE machine ADD COLUMN monitoring_only INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column name')) throw e;
  }
  try {
    sqlite.run(`ALTER TABLE machine ADD COLUMN zone TEXT NOT NULL DEFAULT 'unassigned'`);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column name')) throw e;
  }

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS registration_request (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES discovered_machine(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL DEFAULT 'system',
      status TEXT NOT NULL DEFAULT 'PENDING',
      denial_reason TEXT,
      reviewed_by TEXT,
      reviewed_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS rogue_device_alert (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      ip TEXT,
      denial_count INTEGER NOT NULL DEFAULT 1,
      last_denied_at INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_by TEXT,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  sqlite.run(`CREATE INDEX IF NOT EXISTS registration_request_machine_idx ON registration_request(machine_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS registration_request_status_idx ON registration_request(status)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS registration_request_created_at_idx ON registration_request(created_at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS rogue_device_alert_hostname_idx ON rogue_device_alert(hostname)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS rogue_device_alert_ip_idx ON rogue_device_alert(ip)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS rogue_device_alert_resolved_idx ON rogue_device_alert(resolved)`);

  // ─── ADR-143: WebAuthn credential storage ─────────────────────────
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS webauthn_credential (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      name TEXT,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    )
  `);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webauthn_credential_user_id_idx ON webauthn_credential(user_id)`);
  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS webauthn_credential_credential_id_unique ON webauthn_credential(credential_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS webauthn_credential_active_idx ON webauthn_credential(revoked_at)`);

  // ─── ADR-136 §3: Kill authorization requests ────────────────────────
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS kill_authorization_request (
      id TEXT PRIMARY KEY,
      initiated_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      target TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      signature_credential_id TEXT,
      quorum_approvals TEXT,
      executed_at INTEGER,
      initiated_at INTEGER NOT NULL,
      completed_at INTEGER
    )
  `);
  sqlite.run(`CREATE INDEX IF NOT EXISTS kill_authorization_request_status_idx ON kill_authorization_request(status)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS kill_authorization_request_initiated_at_idx ON kill_authorization_request(initiated_at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS kill_authorization_request_target_idx ON kill_authorization_request(target)`);

  // ─── Inference log (intercepted requests from agent-plane) ────────────
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS inference_log (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      machine_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      action TEXT NOT NULL,
      reasons TEXT,
      alert INTEGER NOT NULL DEFAULT 0,
      scored INTEGER NOT NULL DEFAULT 1,
      prompt_preview TEXT,
      model TEXT
    )
  `);
  sqlite.run(`CREATE INDEX IF NOT EXISTS inference_log_time_idx ON inference_log(timestamp)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS inference_log_machine_idx ON inference_log(machine_id)`);

  const db = drizzle(sqlite, { schema });

  console.log(`[db] SQLite initialized: ${dbPath} (WAL mode, tables verified)`);

  return { db, sqlite };
}

// Export a pre-initialized db instance for convenience
const { db, sqlite } = initDatabase();
export { db, sqlite };
