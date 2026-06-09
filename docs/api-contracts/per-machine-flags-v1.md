# API Contract — Per-Machine Flag Overrides v1

> **Status:** LOCKED — 2026-06-02 (Chanshuk, dev-lead)
> **Binding for:** § 8.2a (Keridz, BE) and § 8.2b–d (Gimglich, FE) of
> `docs/KILL-SWITCH-IMPLEMENTATION-PLAN.md`.
> **Reviewers:** Nikaya (Stage 2) and Wobblus (orchestrator).
>
> This document is the **single source of truth** for the per-machine flag
> override surface area. Both coders MUST read it before writing code. Any
> deviation (path, method, response shape, status code, audit shape) is a
> blocking issue — flag it in the implementation report, do not silently
> diverge.

---

## 0. Background and Scope

ADR-133 establishes that flags can be set both **globally** and **per-machine**,
with the resolution order being **machine override > global flag > default**.

Until v1.1, only the global `feature_flag` table and the `GET /v1/flags` /
`POST /v1/flags` / `PUT /v1/flags/:id` / `DELETE /v1/flags/:id` endpoints
exist. v1.1 fills the machine-scoped surface that has been waiting since
ADR-133.

The `machine_flag` table already exists in the schema (verified
`apps/server-kill-switch/src/db/schema.ts` lines 202–214):

```ts
export const machineFlags = sqliteTable(
  'machine_flag',
  {
    machineId: text('machine_id').notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    flagKey: text('flag_key').notNull(),
    value: text('value'),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.machineId, table.flagKey] }),
    flagKeyIdx: index('machine_flag_key_idx').on(table.flagKey),
  }),
);
```

Cascade behaviour: when a machine is deleted, all its overrides are deleted.
When a global flag is deleted (existing `DELETE /v1/flags/:id` handler), the
BE coder MUST also delete all `machine_flag` rows referencing that key
(see § 6.1 below).

The existing 5 predefined flags (mirrored from
`app/(dashboard)/flags/page.tsx` lines 27–55):

| key | type | global default |
|---|---|---|
| `llm_interception_enabled` | `boolean` | `false` |
| `auto_stop_threshold` | `number` | `0.7` (range 0.0–1.0) |
| `damage_logging_level` | `string` (enum) | `"standard"` |
| `alert_on_critical_score` | `boolean` | `true` |
| `request_sampling_rate` | `number` | `1.0` (range 0.0–1.0) |

---

## 1. Endpoint Inventory

Three new endpoints. All go through the existing Next.js rewrite
`/api/machines/:path*` → `<backend>/v1/machines/:path*` already declared in
`apps/web-regulator/next.config.ts` (line 70–71). **No `next.config.ts`
change is required.**

| Method | Frontend path | Backend path | Auth |
|---|---|---|---|
| `GET` | `/api/machines/:id/flags` | `GET /v1/machines/:id/flags` | admin |
| `PUT` | `/api/machines/:id/flags/:key` | `PUT /v1/machines/:id/flags/:key` | admin |
| `DELETE` | `/api/machines/:id/flags/:key` | `DELETE /v1/machines/:id/flags/:key` | admin |

**Path params:**

- `:id` — machine ID, must exist in the `machine` table
- `:key` — flag key, must match a row in `feature_flag.key`

---

## 2. Auth

Reuse the existing pattern in `apps/server-kill-switch/src/routes/flags.ts`:

```ts
// from current POST handler (lines 88–92)
if (userRole !== 'admin') {
  json(res, 403, { error: 'Admin role required' });
  return true;
}
```

The new handlers MUST accept the same `userId` and `userRole` parameters
already passed by `index.ts` line 88, and MUST check `userRole === 'admin'`
on every mutating endpoint. The `GET` endpoint also requires admin role
(same posture as the existing `GET /v1/flags` — verified in current code
where admin-only write paths share the same auth context).

Unauthenticated → **401 `{ error: "Unauthorized" }`**.
Authenticated non-admin → **403 `{ error: "Admin role required" }`**.

---

## 3. Response Shapes (concrete JSON)

### 3.1 `GET /v1/machines/:id/flags` → `200 OK`

Returns the merged view (global flags + per-machine overrides) for the
specified machine. The frontend uses this to render the per-machine flag
editor and the "Flags" section of the machine details panel.

```json
{
  "machineId": "m_abc123",
  "flags": [
    {
      "key": "llm_interception_enabled",
      "value": false,
      "type": "boolean",
      "description": "Master toggle for LLM request interception. When false, all requests pass through unscored. Toggle per-machine for granular control.",
      "overridden": true
    },
    {
      "key": "auto_stop_threshold",
      "value": 0.7,
      "type": "number",
      "description": "Score threshold for automatic blocking (0.0–1.0). Lower values = stricter blocking. Set to 1.0 to disable auto-blocking while still logging scores.",
      "overridden": false
    },
    {
      "key": "damage_logging_level",
      "value": "standard",
      "type": "string",
      "description": "Verbosity: minimal (blocked only), standard (blocked + near-threshold), verbose (all scored). Higher levels increase storage usage.",
      "overridden": false
    },
    {
      "key": "alert_on_critical_score",
      "value": true,
      "type": "boolean",
      "description": "Notify admins when a request scores in the critical band.",
      "overridden": false
    },
    {
      "key": "request_sampling_rate",
      "value": 1.0,
      "type": "number",
      "description": "Fraction of requests sampled for scoring (0.0–1.0). 1.0 = all requests.",
      "overridden": false
    }
  ],
  "overrides": [
    {
      "flagKey": "llm_interception_enabled",
      "value": "true",
      "updatedAt": "2026-06-02T22:30:14.000Z"
    }
  ]
}
```

**Field semantics (binding):**

- `flags[].value` — **resolved** value (override if present, else global).
  The frontend MUST display this value as the current effective value.
- `flags[].overridden` — `true` iff a row exists in `machine_flag` for this
  `(machineId, key)` pair. The frontend MUST render an "overriding global"
  badge when `true`.
- `flags[].type` — `"boolean" | "number" | "string"`. Mirrors the type
  declared in the global `feature_flag` row (added in v1.1; for legacy rows
  the BE coder should infer type from the stored value).
- `overrides[]` — raw machine-flag rows for this machine, returned as
  strings. The frontend uses this for the "Revert to global" affordance
  (delete each entry here to clear the override).

**Type coercion rule (binding):** when the BE coder reads `value` from
`machine_flag` (which is `text`), they MUST coerce to the same JS type as
the global flag's resolved value before serialising into `flags[].value`.
Boolean: `"true"` / `"1"` → `true`, anything else → `false`. Number:
`Number(value)`. String: pass through. Unparseable → omit the entry from
`flags` and log a warning.

### 3.2 `PUT /v1/machines/:id/flags/:key` → `200 OK`

**Request body** (Content-Type `application/json`):

```json
{
  "value": "STOPPED"
}
```

The `value` field accepts `string | boolean | number`. The BE coder MUST
store it as a string in `machine_flag.value` (the column is `text`).

**Validation (binding):**

- `value` MUST be present and not `undefined`. Missing → **400**.
- For flags with type `number` (per the global flag's declared type or
  inferred legacy type), `value` MUST coerce via `Number(value)` to a
  finite number. NaN / Infinity → **400**.
- For flags with type `string` (and the `damage_logging_level` enum),
  `value` MUST be one of: `"minimal"`, `"standard"`, `"verbose"`. Anything
  else → **400** with `{ error: "Invalid value for damage_logging_level" }`.
- For `auto_stop_threshold`, the persisted value MUST be in `[0.0, 1.0]`.
  Out of range → **400** with `{ error: "auto_stop_threshold must be in [0.0, 1.0]" }`.
- For `request_sampling_rate`, the persisted value MUST be in `[0.0, 1.0]`.
  Same 400 shape.
- The machine MUST exist (FK to `machine.id`). Missing → **404**.
- The flag key MUST exist in `feature_flag.key`. Missing → **404**.

**Success response (200):**

```json
{
  "flagKey": "llm_interception_enabled",
  "value": true,
  "updatedAt": "2026-06-02T22:35:02.000Z",
  "overridden": true
}
```

`value` in the response is the **resolved effective value** (always coerced
back to the right JS type). `updatedAt` is the row's `updated_at` from
`machine_flag`.

### 3.3 `DELETE /v1/machines/:id/flags/:key` → `204 No Content`

No request body. No response body.

**Status codes:**

- **204** — override cleared (row was present, now deleted; OR row was
  already absent — idempotent).
- **404** — machine not found.
- **401 / 403** — auth failures as in § 2.

**Audit log:** still written (action `override-cleared`), even on the
idempotent no-op path, with `metadata = { wasPresent: boolean }`. See § 6.

---

## 4. Error Shapes

All error responses use a single shape:

```json
{ "error": "Human-readable message" }
```

| Status | When | Example body |
|---|---|---|
| 400 | Missing/invalid body, out-of-range number, bad enum | `{ "error": "auto_stop_threshold must be in [0.0, 1.0]" }` |
| 401 | Not authenticated | `{ "error": "Unauthorized" }` |
| 403 | Authenticated but not admin | `{ "error": "Admin role required" }` |
| 404 | Machine not found | `{ "error": "Machine not found: m_abc123" }` |
| 404 | Flag key not found | `{ "error": "Flag not found: foo_bar" }` |
| 500 | Internal error | `{ "error": "Internal server error" }` |

The BE coder MUST NOT leak `err.message` in the 500 body (use the existing
500 handler at the bottom of `routes/flags.ts`). The frontend `ApiError`
catches any non-2xx response and surfaces `err.message` (which is the raw
response body when it can be read as text — see `lib/api-client.ts`
`handleResponse`).

---

## 5. Next.js Rewrites

**No change required.** The existing rule:

```ts
{
  source: "/api/machines/:path*",
  destination: `${backendUrl}/v1/machines/:path*`,
}
```

…already covers all three new endpoints because `:path*` is greedy and
captures `/m_abc123/flags/llm_interception_enabled` transparently.

If a future endpoint needs a stricter mapping, add it BEFORE this rule —
Next.js matches rewrites in declaration order and the most-specific match
wins for non-greedy captures. For v1.1, leave the config alone.

---

## 6. Audit Logging (binding)

### 6.1 Schema reality check

The current `flag_audit_log` table does **not** have a `machineId` column
(verified `schema.ts` lines 152–169). The task spec says "Every PUT/DELETE
logs to `flagAuditLog` with `machineId` populated".

**Resolution (Chanshuk decision, 2026-06-02):** extend the table with a
nullable `machine_id` column. This is a **Drizzle-only** change — no manual
SQL. After extending `schema.ts`:

```bash
cd apps/server-kill-switch
bun run db:push    # confirms the diff against the running DB
bun run db:generate   # produces a migration file
```

(The `db:push` step is a *verification*; the May 12 migration has already
shipped the `machine_flag` table. Adding `machine_id` to `flag_audit_log`
is incremental and Drizzle will emit a `ALTER TABLE` snapshot.)

If for any reason `db:push` would block on data, the BE coder should run
`db:generate` and report the generated SQL for review. **Never** hand-write
SQL migrations.

### 6.2 Audit row shape (binding)

| Column | Source | PUT value | DELETE value |
|---|---|---|---|
| `id` | `crypto.randomUUID()` | yes | yes |
| `flag_id` | `feature_flag.id` (lookup by `flagKey`) | yes | yes |
| `action` | enum | `"override-set"` | `"override-cleared"` |
| `old_value` | prior `machine_flag.value` (string), or `null` | yes | yes |
| `new_value` | new `machine_flag.value` (string), or `null` | yes | `null` |
| `user_id` | from auth context | yes | yes |
| `timestamp` | `new Date()` | yes | yes |
| `machine_id` | from path `:id` | yes | yes |

The BE coder MUST mirror the helper `logFlagAction` already in
`routes/flags.ts` (lines 32–49). A new helper `logMachineFlagAction` is
acceptable, but the call sites in the new handlers MUST be exercised
unconditionally — even on 404 (machine/flag) for *informational* logs
(`action = "override-rejected"`), so audits are tamper-evident.

### 6.3 Cascade on global flag delete (v1.1 risk item)

The existing `DELETE /v1/flags/:id` handler does **not** clean up
`machine_flag` rows that reference the deleted key. v1.1 patches this:

```ts
// inside existing DELETE /v1/flags/:id handler, after the featureFlags delete
await db.delete(machineFlags).where(eq(machineFlags.flagKey, existing.key)).run();
```

This must land in the same change set as the new endpoints.

---

## 7. WebSocket / Real-Time (optional but encouraged)

The existing `bcp:flags:updates` channel is used by global flag mutations
(see `routes/flags.ts` lines 168 and 195). For consistency, the new
per-machine handlers SHOULD publish to the **same channel** with an enriched
payload:

```json
{
  "type": "flag-override-update",
  "action": "set" | "cleared",
  "machineId": "m_abc123",
  "flagKey": "llm_interception_enabled",
  "value": "true",
  "userId": "u_xyz"
}
```

The `useKillSwitchWebSocket` hook is currently kill-switch-only; the
frontend may subscribe to flag updates later. For v1.1 the publishing
SHOULD be implemented (1 line per handler) but is **not blocking** for
Stage 1 review. If the BE coder skips it, the FE coder's `MachineFlagEditor`
will fall back to refetch on open, which is acceptable for v1.1.

---

## 8. Test Plan (Stage 1 — Chanshuk)

After both coders complete, the dev-lead verifies:

1. `bun run type-check` succeeds in `apps/web-regulator/` **and**
   `apps/server-kill-switch/`.
2. `curl /api/machines/<id>/flags` (admin auth) returns the 5-row merged
   view per § 3.1.
3. `curl -X PUT /api/machines/<id>/flags/auto_stop_threshold -d '{"value": 0.5}'`
   returns the § 3.2 success shape; a follow-up GET reflects `overridden: true`.
4. `curl -X DELETE /api/machines/<id>/flags/auto_stop_threshold` returns 204;
   a follow-up GET reflects `overridden: false`.
5. `curl /api/flags` (no `machineId`) still returns the **same global shape**
   as before — no regression.
6. `flag_audit_log` has new rows with `machine_id` populated and
   `action` ∈ `{override-set, override-cleared}`.
7. Frontend flow: log in → `/machines/<id>` → sidebar shows Quick Actions
   wired to live kill-switch state (no dead-code branch). 8.1c test from
   the plan.
8. `app/page.tsx` no longer imports `MachineDetailPanel` and no longer
   references `selectedCluster` / `setSelectedCluster` / `handleClosePanel`
   / `getMachineForCluster` (grep clean).

---

## 9. Out of Scope (v1.1)

- Machine-scoped kill-switch state (still global; no per-machine chaos state).
- Bulk-set multiple flag overrides in a single request.
- `POST /v1/machines/:id/flags/:key` — `PUT` is sufficient and idempotent
  (creating vs updating is the same operation against the PK).
- Conflict detection on concurrent PUT (last-write-wins; the audit log is
  the source of truth for history).

These may be addressed in a follow-up release.

---

*Contract locked 2026-06-02 22:07 CST by Chanshuk (dev-lead). Reference
this file from every subagent task; do not paraphrase.*
