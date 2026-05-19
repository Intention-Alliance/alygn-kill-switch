# SQLite Schema Additions — Kill Switch Dashboard Rebuild

**Version:** 1.0.0  
**Date:** 2026-05-13  
**Requires:** Drizzle ORM, bun:sqlite, SQLite 3.35+

---

## 1. Overview

These five new tables extend the existing schema (`apps/server-kill-switch/src/db/schema.ts`) to support:

- **Persistent audit log** (survives restart — replaces in-memory array in `kill-switch.ts`)
- **Dynamic machine inventory** (replaces hardcoded `INITIAL_MACHINES` in `machines/page.tsx`)
- **Persistent settings** (SQLite-backed — replaces dead local state in `settings/page.tsx`)
- **Per-machine flag overrides** (enables Q6: machine overrides global flag values)
- **Per-machine agent registry** (enables Q2: per-machine agent registration)

---

## 2. New Drizzle Schema Definitions

### 2.1 kill_switch_audit_log (Extended)

**Note:** This table already exists in `schema.ts` but is **missing critical fields** that the task requires. The existing `kill_switch_audit_log` only has `id, previousState, newState, initiatedBy, reason, ipAddress, traceId, timestamp`. We add: `userId`, `severity`, `machineId`, `metadata`.

**Decision:** **ALTER the existing table** rather than create a new one, because it already has 3 of the 4 required fields. The existing `initiatedBy` column maps to `userId`, so we only need to add `severity, machineId, metadata` columns.

**Drizzle schema** (replace existing `killSwitchAuditLog` in `apps/server-kill-switch/src/db/schema.ts`):

```typescript
export const killSwitchAuditLog = sqliteTable(
  'kill_switch_audit_log',
  {
    id: text('id').primaryKey(),                                    // nanoid
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull()
      .$defaultFn(() => new Date()),                                // unixepoch
    userId: text('user_id').notNull(),                              // email or 'system'
    reason: text('reason').notNull(),                               // e.g. 'Critical damage score detected'
    previousState: text('previous_state').notNull(),               // ARMED | RUNNING | ...
    newState: text('new_state').notNull(),                          // RUNNING | STOPPED | ...
    traceId: text('trace_id').notNull(),                            // OpenTelemetry trace
    machineId: text('machine_id'),                                  // nullable — which machine triggered it
    severity: text('severity').notNull().default('info'),           // 'critical'|'warning'|'info'|'debug'
    metadata: text('metadata'),                                     // nullable JSON string
  },
  (table) => ({
    severityTimeIdx: index('ks_audit_severity_time_idx').on(table.severity, table.timestamp),
    machineTimeIdx: index('ks_audit_machine_time_idx').on(table.machineId, table.timestamp),
    stateTimeIdx: index('ks_audit_state_time_idx').on(table.newState, table.timestamp),
  }),
);
```

**Key:** Use `crypto.randomUUID()` for `id` (consistent with existing patterns in `routes/flags.ts`).

### 2.2 machines

**Note:** A `machine` table already exists in `schema.ts` with a **different shape** (has `ipAddress, tags, metadata, lastHeartbeat` but missing `name, role, hasDpu, specs`).

**Decision:** **Replace the existing `machines` table** with the full schema required by the task spec.

**Drizzle schema** (replace existing `machines` in `apps/server-kill-switch/src/db/schema.ts`):

```typescript
export const machines = sqliteTable(
  'machine',
  {
    id: text('id').primaryKey(),                                    // e.g. 'machine-andlersrv-001'
    name: text('name').notNull(),                                   // e.g. 'andlersrv'
    hostname: text('hostname').notNull().unique(),                  // e.g. 'andlersrv.tail62d797.ts.net'
    status: text('status').notNull().default('active'),             // 'active'|'inactive'|'offline'
    role: text('role').notNull(),                                   // e.g. 'Primary Controller'
    hasDpu: integer('has_dpu', { mode: 'boolean' }).notNull()
      .default(false),                                              // SQLite boolean (0/1)
    specs: text('specs'),                                           // JSON: { cpu, ram, gpu, dpu }
    lastSeen: integer('last_seen', { mode: 'timestamp' }),          // unixepoch
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    hostnameIdx: uniqueIndex('machine_hostname_idx').on(table.hostname),
    statusIdx: index('machine_status_idx').on(table.status),
  }),
);
```

**Note:** The old `ipAddress, tags, metadata, updatedAt` columns are **dropped**. `ipAddress` moves into `specs` JSON. `tags` moves into `metadata` on `kill_switch_audit_log`. `updatedAt` is unnecessary since we only track `lastSeen` for machines.

### 2.3 settings

**New table** — nothing in the existing schema covers settings persistence.

```typescript
export const settings = sqliteTable(
  'setting',
  {
    key: text('key').primaryKey(),                                  // e.g. 'auto_poll_interval'
    value: text('value').notNull(),                                 // all values stored as text
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
      .$defaultFn(() => new Date()),
  },
);
```

**Design decision:** All values stored as `text`. The API layer handles type coercion:
- `"5000"` → `parseInt(value, 10)` for numbers
- `"true"` / `"false"` → `value === 'true'` for booleans
- Raw strings for string settings

This is consistent with SQLite's lack of native boolean/number types for simple K/V storage.

### 2.4 machine_flags

**New table** — per-machine flag overrides (composite primary key).

```typescript
export const machineFlags = sqliteTable(
  'machine_flag',
  {
    machineId: text('machine_id').notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    flagKey: text('flag_key').notNull(),                            // foreign key to feature_flags.key
    value: text('value'),                                           // nullable — if null, use global default
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.machineId, table.flagKey] }),  // composite PK
    flagKeyIdx: index('machine_flag_key_idx').on(table.flagKey),
  }),
);
```

**Add import at top of schema.ts:**
```typescript
import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';
```

### 2.5 agents

**New table** — per-machine agent registry.

```typescript
export const agents = sqliteTable(
  'agent',
  {
    id: text('id').primaryKey(),                                    // nanoid
    machineId: text('machine_id').notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),                                   // e.g. 'alygn-scoring-agent'
    version: text('version').notNull(),                             // e.g. '1.2.0'
    capabilities: text('capabilities'),                             // JSON: ['scoring','interception','heartbeat']
    lastHeartbeat: integer('last_heartbeat', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    machineIdx: index('agent_machine_idx').on(table.machineId),
    heartbeatIdx: index('agent_heartbeat_idx').on(table.lastHeartbeat),
  }),
);
```

---

## 3. Raw SQL Auto-Migration Statements

Add to `apps/server-kill-switch/src/db/index.ts` in the `initDatabase()` function, after the existing `CREATE TABLE` statements:

```sql
-- Replace existing kill_switch_audit_log (ALTER TABLE approach for existing DBs)
-- For fresh installs, CREATE the full table. For existing DBs, ALTER.

-- Fresh install: drop old, create new (safe since table was unused in-memory anyway)
DROP TABLE IF EXISTS kill_switch_audit_log;

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
);

-- New tables
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
);

CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS machine_flag (
  machine_id TEXT NOT NULL REFERENCES machine(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (machine_id, flag_key)
);

CREATE TABLE IF NOT EXISTS agent (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machine(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  capabilities TEXT,
  last_heartbeat INTEGER,
  created_at INTEGER NOT NULL
);

-- New indexes
CREATE INDEX IF NOT EXISTS ks_audit_severity_time_idx ON kill_switch_audit_log(severity, timestamp);
CREATE INDEX IF NOT EXISTS ks_audit_machine_time_idx ON kill_switch_audit_log(machine_id, timestamp);
CREATE INDEX IF NOT EXISTS machine_status_idx ON machine(status);
CREATE INDEX IF NOT EXISTS machine_flag_key_idx ON machine_flag(flag_key);
CREATE INDEX IF NOT EXISTS agent_machine_idx ON agent(machine_id);
CREATE INDEX IF NOT EXISTS agent_heartbeat_idx ON agent(last_heartbeat);
```

**Note on existing `machine` table:** The old `machine` table in `index.ts` (with `hostname, ip_address, status, last_heartbeat, tags, metadata, created_at, updated_at`) must be dropped. The in-memory migration in `index.ts` should include:

```sql
DROP TABLE IF EXISTS machine;
DROP TABLE IF EXISTS machine_flag;   -- depends on machine
DROP TABLE IF EXISTS agent;          -- depends on machine
```

Then recreate them with the new schemas above. This is safe because the old `machine` table was unused by any running code (the frontend used `INITIAL_MACHINES` hardcoded).

---

## 4. Default Data Seeding

### 4.1 Initial Machine

Seed the `andlersrv` machine on first startup:

```typescript
// apps/server-kill-switch/src/db/seed.ts (new file)
import { db } from './index';
import { machines } from './schema';

export async function seedDefaults() {
  // Seed default machine if none exist
  const existing = await db.select().from(machines).all();
  if (existing.length === 0) {
    await db.insert(machines).values({
      id: 'machine-andlersrv-001',
      name: 'andlersrv',
      hostname: 'andlersrv.tail62d797.ts.net',
      status: 'active',
      role: 'Primary Controller',
      hasDpu: false,
      specs: JSON.stringify({
        cpu: 'AMD Ryzen 9',
        ram: '64GB',
        gpu: 'NVIDIA RTX 4090',
        dpu: null,
      }),
      lastSeen: new Date(),
      createdAt: new Date(),
    }).run();
    console.log('[seed] Default machine "andlersrv" created');
  }
}
```

Call `seedDefaults()` from `index.ts` after `initDatabase()`.

### 4.2 Default Settings

Pre-populate on first run if `setting` table is empty:

```typescript
// In seed.ts
const DEFAULT_SETTINGS: Record<string, string> = {
  auto_poll_interval: '5000',
  enable_notifications: 'true',
  audit_log_retention_days: '30',
  session_timeout_minutes: '60',
  ip_allowlist_enabled: 'false',
  rate_limit_per_minute: '100',
};

export async function seedSettings() {
  const existing = await db.select().from(settings).all();
  if (existing.length === 0) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await db.insert(settings).values({
        key,
        value,
        updatedAt: new Date(),
      }).run();
    }
    console.log('[seed] Default settings created');
  }
}
```

---

## 5. Full Schema Diff

### Current `schema.ts` (after changes):

| Table | Status | Change |
|-------|--------|--------|
| `users` (user) | Keep | No change |
| `sessions` (session) | Keep | No change |
| `accounts` (account) | Keep | No change |
| `verifications` (verification) | Keep | No change |
| `killSwitchState` (kill_switch_state) | Keep | No change |
| `killSwitchAuditLog` (kill_switch_audit_log) | **Replace** | Add `userId, severity, machineId, metadata` |
| `featureFlags` (feature_flag) | Keep | No change |
| `flagAuditLog` (flag_audit_log) | Keep | No change |
| `machines` (machine) | **Replace** | Add `name, role, hasDpu, specs`; drop `ipAddress, tags, metadata` |
| `settings` (setting) | **New** | Key-value persistence |
| `machineFlags` (machine_flag) | **New** | Per-machine flag overrides |
| `agents` (agent) | **New** | Per-machine agent registry |

### Files to Modify:

1. `apps/server-kill-switch/src/db/schema.ts` — Replace `killSwitchAuditLog` and `machines`; add `settings, machineFlags, agents`
2. `apps/server-kill-switch/src/db/index.ts` — Add `CREATE TABLE` statements for new/modified tables; add new indexes
3. `apps/server-kill-switch/src/db/seed.ts` — **Create** with `seedDefaults()` and `seedSettings()`
4. `apps/server-kill-switch/src/index.ts` — Add `await seedDefaults(); await seedSettings();` after `initDatabase()`

---

## 6. Migration Strategy for Existing Databases

For developers who already have a `kill-switch.sqlite` database:

1. **`kill_switch_audit_log`:** Data loss is acceptable — the old table was written to but never used by the dashboard (the service used in-memory array). Drop and recreate.
2. **`machine`:** No real data loss — the table existed but was never populated by the frontend (hardcoded). Drop and recreate.
3. **New tables:** Safe to create — no conflicts.

**Alternative for production:** If preserving data matters, use a migration-based approach with `drizzle-kit generate` + `drizzle-kit migrate`. But given this is still in development (96/100 auth score, broken features), the `DROP + CREATE` approach is faster and acceptable.

---

## 7. Type Exports

Update `apps/server-kill-switch/src/types.ts` to export the new types:

```typescript
export type {
  KillSwitchState,
  KillSwitchStatus,
  ActivationRecord,
  UserRole,
  User,
  StateChangeMessage,
  AgentEventMessage,
} from '@align/shared-types';

export type {
  Flag,
  FlagValue,
  FlagUpdateMessage,
} from '@align/shared-types';

export { STATES } from './services/kill-switch';
export { ALLOWED_IPS, CIDR_RANGES } from './services/ip-allowlist';
export { RATE_LIMIT_MAX } from './middleware/rate-limit';
export { AUTH_RATE_LIMIT_MAX } from './middleware/auth-rate-limit';
```
