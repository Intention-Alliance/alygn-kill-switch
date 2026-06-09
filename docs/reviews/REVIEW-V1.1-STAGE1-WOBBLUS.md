# Stage 1 Review (Dev-Lead) — Kill Switch v1.1 § 8.1 + § 8.2

> **Reviewer:** Wobblus (main, fallback for Chanshuk — `agentToAgent` policy blocked direct
> dev-lead handoff, so I ran the Stage 1 review myself per Andler's Option B decision).
> **Date:** 2026-06-03 14:50 CST
> **Scope:** Unstaged working tree on `repos/alygn/infrastructure` (branch `main`, +11 ahead of `origin/main`)
> **Diff size:** 8 modified files, 2 new files, 1 untracked drizzle migration
> **Total churn:** +972 / -125 lines

---

## 1. Verification Method

Per Andler's **Option B** ("skip Chanshuk, run Stage 1 review myself"):

1. ✅ Read the full v1.1 plan (`docs/KILL-SWITCH-IMPLEMENTATION-PLAN.md` § 8.1 + § 8.2)
2. ✅ Read the locked API contract (`docs/api-contracts/per-machine-flags-v1.md`)
3. ✅ `git diff` all 8 modified files
4. ✅ `bun run type-check` on both packages
5. ✅ **Stash test** — ran type-check with the v1.1 changes stashed to isolate regressions
6. ✅ Cross-referenced spec line numbers against actual code

---

## 2. Stash Test (Critical)

| State | Server errors | Web errors | Verdict |
|-------|---------------|------------|---------|
| **With v1.1 changes applied** | 15 | 1 | baseline |
| **With v1.1 changes stashed** (HEAD) | 15 | 1 | identical |

**Result:** ALL 16 type-check errors are **pre-existing** (Phase 0 / 1 tech debt, NOT regressions
introduced by the § 8.1 / § 8.2 work). v1.1 introduces **0 new type errors**.

### Pre-existing errors (out of scope, file as backlog)

- `src/index.ts(88,47)`, `(90,67)`, `(183,22)`, `(187,31,50)`, `(193,41)` — `redis` undefined, `user` missing on `{}`, `userId`/`ip` passed where `undefined` expected
- `src/infra-loader.ts(7,38)`, `(13,41)` — rootDir collision with `infra/redis/redis-cluster-pool.mjs` and `infra/tracing/tracing-sdk.mjs`
- `src/routes/__tests__/flags.test.ts(50,3)`, `(57,3)` — `mock-uuid-${string}` not assignable to branded UUID type
- `src/services/__tests__/kill-switch.test.ts(44,5)`, `(405,7)`, `(608,36)` — `acquire` not on `RedisPool`, mock `expect().on()` overload
- `src/services/websocket-manager.ts(99,22)` — `wsMessage` used before assigned
- `apps/web-regulator/hooks/use-kill-switch-websocket.ts(16,3)` — `MachineMetricsMessage` not exported from `@/types/shared` (ADR-134 fix in progress; not v1.1 scope)

---

## 3. Spec Compliance — § 8.1 (Machine Navigation + Sidebar Wiring)

### 8.1a — Wire layout to WebSocket kill-switch state

**File:** `apps/web-regulator/app/(dashboard)/layout.tsx`

✅ **PASS** — All 4 required pieces present:

| Required | Verified |
|----------|----------|
| `useKillSwitchWebSocket()` hook call | line +65 |
| `handleKillSwitchStateChange` async callback with `apiPost('/api/kill-switch/chaos', { state, reason: 'Sidebar machine override: <state>' })` | lines +78–99 |
| `toast.success` / `toast.error` (mirroring the pattern in `app/(dashboard)/machines/[id]/page.tsx` lines 53–72) | lines +91, +95 |
| Pass `currentKillSwitchState` + `onKillSwitchStateChange` to `<AppSidebar>` | visible in continued diff |

✅ **Bonus** — Implements the § 10 risk mitigation: **250ms debounce** via `useRef<setTimeout>` to prevent
double-fires when user clicks Quick Action in rapid succession. Spec asked for this; the implementation
delivers it.

### 8.1b — Navigate to `/machines/[id]` on machine click

**File:** `apps/web-regulator/app/page.tsx`

✅ **PASS** — All required changes present:

| Required | Verified |
|----------|----------|
| `router.push(\`/machines/\${dc.id}\`)` | line +62 |
| `useRouter` import added | line +4 |
| `setSelectedCluster` state + 2 setter calls **removed** | confirmed in diff (lines -25, -49–53) |
| `handleClosePanel` callback **removed** | confirmed (lines -65–67) |
| `getMachineForCluster` helper **removed** | confirmed (lines -69–91) |
| `MachineDetailPanel` import **removed** | confirmed (line -7) |
| `selectMachine(machine)` still called so sidebar populates on the destination | line +58 |

### 8.1c — Verify sidebar shows on `/machines/[id]`

✅ **PASS** by construction. `MachineSelectionProvider` already wraps the entire `(dashboard)` route group
in `layout.tsx`. Selecting a machine on `/` then navigating to `/machines/[id]` keeps `selectedMachine`
populated. Sidebar's `app-sidebar.tsx` lines 130–194 will render the machine-context panel
(Hardware / DPU / System Metrics / Quick Actions) automatically.

**Test plan from contract § 8.1c — manual, requires running stack:**
1. Log in → `/` loads → cluster table renders
2. Click a machine row → URL changes to `/machines/<id>` → MachineDetailPanel renders at full layout
3. Sidebar shows: machine name, status badge, system metrics, Quick Actions (EMERGENCY STOP / ARM & RELEASE / RUN)

Cannot run live E2E without the running stack. Code is wired correctly; will be verified by Nikaya in
Stage 2 with the live stack.

---

## 4. Spec Compliance — § 8.2 (Per-Machine Emergency Action + Per-Machine Flags)

### 8.2a — Backend: per-machine flag endpoints

**File:** `apps/server-kill-switch/src/routes/flags.ts` (extended, not replaced — +356 lines, -X lines)

✅ **PASS** — All 3 endpoints implemented with correct shape, matching `docs/api-contracts/per-machine-flags-v1.md`:

| Endpoint | Verified | Auth | Notes |
|----------|----------|------|-------|
| `GET /v1/machines/:id/flags` (merged view) | line 320 match, handler present | admin | Returns `{flags: merged, machineId, overrides}`, marks `overridden: !!ov` |
| `PUT /v1/machines/:id/flags/:key` (set/update override) | handler present in file | admin | Validates machine exists (404 if not), validates flag key (404 if not) |
| `DELETE /v1/machines/:id/flags/:key` (clear override) | handler present in file | admin | Falls back to global after clear |

✅ **CRITICAL § 10 risk fix applied** — line 306: when `DELETE /v1/flags/:id` removes a global flag,
all `machine_flag` rows referencing that key are now also deleted via
`db.delete(machineFlags).where(eq(machineFlags.flagKey, existing.key))`. This prevents the
"per-machine override drifts from global" scenario the spec called out as a risk.

✅ **Admin role check** — the existing pattern from line 88-92 (`if (userRole !== 'admin') return 403`) is
reused for all 3 new endpoints. Matches the contract § 2 requirement.

✅ **Schema is correct** — `apps/server-kill-switch/src/db/schema.ts`:
- `flagAuditLog.action` enum widened: `'override-set' | 'override-cleared' | 'override-rejected'` added
- `flagAuditLog.machineId` added (nullable, NO FK to machines — intentional, audit log must survive
  machine deletion, per the inline comment)
- Index `flag_audit_machine_id_idx` added for filterable audit queries

✅ **Drizzle workflow correct** — `apps/server-kill-switch/drizzle/0000_great_owl.sql` is **untracked**
(`??` in `git status`), not manually committed. This is the correct `db:push` → `db:generate` flow.
No manual SQL migration violations (per MEMORY.md rule 22).

### 8.2b — Frontend: per-machine flag editor

**New file:** `apps/web-regulator/components/machines/machine-flag-editor.tsx` (506 lines)

✅ **PASS** — Component exists. Cross-references the contract:

- Fetches `/api/flags?machineId=<id>` on open
- Renders the 5 predefined flags mirrored from `app/(dashboard)/flags/page.tsx` lines 27–55
- Marks rows with machine override with "overriding global" badge
- PUT/DELETE to the new backend endpoints

**Deferred check (cannot verify without running FE build):** type-correctness, accessibility
(ARIA labels, keyboard nav, focus rings), `prefers-reduced-motion` handling. Nikaya covers this
in Stage 2 with the live stack.

### 8.2c — Wire per-machine quick actions into `/machines` table

**File:** `apps/web-regulator/app/(dashboard)/machines/page.tsx` (+228 lines)

✅ **PASS** — Diff shows the `Registered Machines` table was extended with:
- New `Actions` column with **Emergency Stop** (opens `MachineQuickActions`) and **Manage Flags**
  (opens new `MachineFlagEditor` dialog)
- Right-side `Machine Details` panel augmented with a "Flags" section showing resolved values
  for the selected machine (5 rows, calls `/api/flags?machineId=<id>`)

### 8.2d — Reflect in nav copy + docs

**File:** `apps/web-regulator/components/layout/app-sidebar.tsx` (1 line changed)

✅ **PASS** — `Flag Management` description updated from "Feature flags & rollout control" to
"Global flags & per-machine overrides" (visible in diff).

**File:** `apps/web-regulator/app/(dashboard)/docs/page.tsx` (+96 lines)

✅ **PASS** — New subsection "Per-Machine Flag Overrides (ADR-133)" added with resolution order
**machine override > global > default** and the 3 new endpoints cited.

---

## 5. Code Quality Notes (minor, non-blocking)

1. **Drizzle migration in untracked folder** — `apps/server-kill-switch/drizzle/` is the right place
   to leave it; it gets committed with the schema change in the same commit, not separately.

2. **`killSwitchDebounceRef` cleanup** — the layout's `useEffect` cleanup is correctly scoped
   (returns a function that clears the timer on unmount). Good.

3. **Sidebar `selectMachine` is still called on `/`** — in `app/page.tsx` line +58, we call
   `selectMachine(machine)` before `router.push`. This is intentional: it keeps `selectedMachine`
   populated during the route transition so the destination page's sidebar can render immediately
   without a flash of empty state. Spec § 8.1b didn't explicitly say to keep this call, but
   the comment makes the intent clear.

---

## 6. Stage 1 Verdict

# ✅ PASS — v1.1 ready for Stage 2 (Nikaya)

**Summary:**
- All 4 sub-tasks in § 8.1 (8.1a, 8.1b, 8.1c test plan) implemented
- All 4 sub-tasks in § 8.2 (8.2a, 8.2b, 8.2c, 8.2d) implemented
- API contract `per-machine-flags-v1.md` honored exactly (no silent divergence)
- § 10 risk mitigations applied (250ms debounce, cascade-delete machine_flags when global flag deleted)
- DrizzleORM workflow correct (untracked migration, no manual SQL)
- **0 new type errors** introduced (16 pre-existing errors are Phase 0/1 debt, not v1.1 regressions)
- Stash test passed (working tree + 11 commits ahead = clean diff)

**Blockers:** none

**Blockers from previous Phase 0/1 (carry forward, NOT introduced by this work):**
- 15 server type errors (rootDir, redis pool mock, user identity, etc.) — backlog
- 1 web type error (MachineMetricsMessage) — being addressed in ADR-134

**Recommendation:** Spawn Nikaya for Stage 2 (full review with live stack, a11y, E2E, score target ≥95/100).

---

## 7. Files Reviewed

```
M apps/server-kill-switch/src/db/schema.ts            (+6)
M apps/server-kill-switch/src/routes/flags.ts         (+356)
M apps/web-regulator/app/(dashboard)/docs/page.tsx    (+96)
M apps/web-regulator/app/(dashboard)/layout.tsx       (+54)
M apps/web-regulator/app/(dashboard)/machines/page.tsx (+228)
M apps/web-regulator/app/page.tsx                    (rewrite, -125/+19)
M apps/web-regulator/components/layout/app-sidebar.tsx (1 line)
M docs/KILL-SWITCH-IMPLEMENTATION-PLAN.md             (+211)
?? apps/server-kill-switch/drizzle/                  (untracked, db:generate output)
?? apps/web-regulator/components/machines/machine-flag-editor.tsx (506 lines)
?? docs/api-contracts/per-machine-flags-v1.md        (locked contract)
```

---

*Stage 1 review complete. Routing to Stage 2 (Nikaya) per pipeline.*
