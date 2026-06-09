# Kill Switch Dashboard — Complete Implementation Plan v1.1

> **v1.1 update (2026-06-02)** — Two user observations folded in sequentially:
> 1. **Machine navigation** — clicking a machine on `/` should navigate to `/machines/[id]` (not render inline). The machine-context sidebar panel must be wired with live kill-switch state.
> 2. **Per-machine emergency action + per-machine flags** — `/machines` and `/machines/[id]` must expose machine-scoped kill-switch control and machine-scoped flag overrides (not only the global `Flag Management` page).
>
> See **§ 8 Sequential Additions** at the end of this document for the full diff.

---

**Date:** 2026-05-13
**Scope:** Kill Switch Dashboard — Backend + Frontend + Docs
**Target Score:** 95/100
**Architecture Decision Record:** ADR-133

---

## 1. Strategic Summary

The Kill Switch Dashboard is a safety-critical interface for ALYGN's sovereign compliance infrastructure. It must:

1. **Function correctly** — No 429 errors, real-time updates, persistent audit logs
2. **Be documented** — In-app `/docs` explaining the protocol, flags, and admin procedures
3. **Match the monorepo design system** — Figtree font, OKLCH colors, shadcn/ui, Tailwind v4
4. **Be architecturally sound** — WebSocket real-time, split rate limits, SQLite persistence

---

## 2. Architecture Decisions

### 2.1 Kill Switch Protocol (ADR-133)

**Q1 → B:** Block specific LLM requests that violate protocol (scored above threshold)
**Q2:** Per-machine agent registration via `/v1/agents/register` endpoint
**Q3:** Scoring rubric + semantic analysis + keyword detection (combined)
**Q4:** DPU layer is future scope (hardware limitation); software layer handles scoring

**Protocol States:**
```
ARMED    → READY    → RUNNING  → STOPPING → STOPPED  → LOCKED
(armed)  (ready)    (active)   (windown) (halted)   (frozen)
```

**Kill Switch Action Flow:**
1. Agent (per-machine) intercepts LLM request
2. Request sent to scoring engine (semantic + keyword analysis)
3. Score above threshold → Request blocked, event logged
4. Score below threshold → Request forwarded to LLM
5. Admin dashboard shows all events in real-time via WebSocket

### 2.2 Feature Flags System

**Q5:** Predefined flags:
- `llm_interception_enabled` (boolean, global default: false)
- `auto_stop_threshold` (number, global default: 0.7, range 0.0-1.0)
- `damage_logging_level` (enum: "minimal"|"standard"|"verbose", global default: "standard")
- `alert_on_critical_score` (boolean, global default: true)
- `request_sampling_rate` (number, global default: 1.0, range 0.0-1.0)

**Q6:** Both global + per-machine. Per-machine overrides global.

**Flag Resolution Order:**
1. Check per-machine flag
2. If not set, check global flag
3. If not set, use default

### 2.3 Real-Time Updates

**Q7:** WebSocket via existing Redis pubsub (`bcp:kill-switch:chaos` channel)

**Architecture:**
- Backend: Elysia WebSocket plugin on `/ws` path
- Frontend: `useWebSocket()` hook in `@/hooks/use-websocket.ts`
- Messages: JSON protocol `{ type: "state-change" | "flag-update" | "agent-event", payload }`
- Fallback to polling every 5s if WebSocket unavailable

### 2.4 Rate Limiting

**Q8:** Separate rate limits:
- **Read paths** (`GET /v1/health`, `GET /v1/flags`, etc.): 60 req/min/IP
- **Write paths** (`POST /v1/kill-switch`, `PATCH /v1/flags`, etc.): 10 req/min/IP
- **Auth paths** (`POST /api/auth/*`): 5 attempts per 15 min/IP (existing)

### 2.5 UI/UX Design System

**Q9:** Match monorepo design system exactly:
- Font: Figtree Variable
- Colors: OKLCH primary (oklch(0.51 0.23 277) light, oklch(0.59 0.20 277) dark)
- Radius: 0.45rem
- Components: shadcn/ui
- Dark mode: Supported

**Q10:** `/docs` page in-app with full documentation.

---

## 3. Implementation Phases

### Phase 0: Architecture & Planning
**Agent:** Hugrukal (architect)
**Duration:** 45 min
**Tasks:**
1. Design WebSocket protocol spec (message types, payloads)
2. Design SQLite schema for audit log persistence (`killSwitchAuditLog` table)
3. Design machines API endpoint schema
4. Design settings persistence schema
5. Write ADR-133 (Kill Switch Protocol)
6. Create task breakdown with file list for coders

### Phase 1: Backend Infrastructure
**Agent:** Keridz (be-coder)
**Duration:** 2-3 hours
**Depends on:** Phase 0
**Tasks:**
1. **Split rate limiter** — Create `ReadRateLimiter` (60/min) + `WriteRateLimiter` (10/min)
2. **WebSocket server** — Add Elysia WebSocket plugin at `/ws`, subscribe to Redis pubsub
3. **SQLite audit persistence** — Write to `killSwitchAuditLog` table on every state change
4. **Machines API** — `GET /v1/machines`, `POST /v1/machines/register`, `GET /v1/machines/:id/status`
5. **Settings persistence** — `GET /v1/settings`, `POST /v1/settings`, store in SQLite
6. **Flag defaults** — Pre-seed 5 predefined flags on first startup

### Phase 2: Frontend Infrastructure
**Agent:** Gimglich (fe-coder)
**Duration:** 2-3 hours
**Depends on:** Phase 1
**Tasks:**
1. **WebSocket client** — `useWebSocket()` hook, reconnect logic, message handling
2. **Rate limiter fix** — Frontend: batch reads, debounce, show rate limit status
3. **Dashboard real-time** — Subscribe to WebSocket, update state without page reload
4. **Logs visualization** — Filterable, searchable, severity-based, time-range selector
5. **UI theme match** — Verify Figtree font, OKLCH colors, shadcn/ui components
6. **Machines page** — Wire to real API, add DPU security banner (existing)
7. **Settings page** — Wire to real API, all toggles persist

### Phase 3: Kill Switch Protocol Implementation
**Agent:** Keridz (be-coder)
**Duration:** 2 hours
**Depends on:** Phase 1
**Tasks:**
1. **Agent registration endpoint** — `POST /v1/agents/register` with machine ID + DPU info
2. **Scoring engine skeleton** — `POST /v1/agents/score` (returns mock score for now)
3. **Request interception flow** — Agent sends request → backend scores → blocks/allows
4. **Event logging** — Every scored request → audit log

### Phase 4: Documentation
**Agent:** Talanara (docs-writer)
**Duration:** 1.5 hours
**Depends on:** Phase 2 + 3
**Tasks:**
1. **Kill Switch Docs** — In-app `/docs` page with:
   - Protocol overview (states, transitions)
   - Flag system (global vs per-machine, resolution order)
   - Admin procedures (emergency stop, unlocking)
   - Agent registration guide
   - Troubleshooting
2. **API Documentation** — All endpoints documented
3. **README update** — Architecture diagram, setup instructions

### Phase 5: UI/UX Polish
**Agent:** Gimglich (fe-coder)
**Duration:** 1 hour
**Depends on:** Phase 2 + 4
**Tasks:**
1. **Design system alignment** — Match monorepo exactly (colors, radius, typography)
2. **Accessibility** — ARIA labels, keyboard navigation, reduced-motion support
3. **Mobile responsiveness** — All pages tested on mobile

### Phase 6: Review & QA
**Agent:** Nikaya (reviewer)
**Duration:** 1-2 hours
**Depends on:** Phase 5
**Tasks:**
1. **Code review** — All files, patterns, security
2. **Integration testing** — Full end-to-end: login → kill switch → flags → machines → settings
3. **Rate limit testing** — Verify no 429 on normal usage
4. **WebSocket testing** — Verify real-time updates
5. **Score target:** 95/100

---

## 4. File List (New + Modified)

### Backend (apps/server-kill-switch/src/)

**New:**
- `routes/websocket.ts` — WebSocket server with Redis pubsub
- `routes/machines.ts` — Machines API endpoints
- `routes/settings.ts` — Settings persistence API
- `services/audit-persistence.ts` — SQLite audit log persistence
- `services/agent-registry.ts` — Per-machine agent registration
- `services/scoring-engine.ts` — Request scoring (skeleton)
- `middleware/read-rate-limit.ts` — Read path rate limiter (60/min)
- `middleware/write-rate-limit.ts` — Write path rate limiter (10/min)
- `db/seed-flags.ts` — Predefined flag seeding

**Modified:**
- `middleware/rate-limit.ts` → Split into read/write
- `routes/flags.ts` → Add machine-scoped flag resolution
- `routes/kill-switch.ts` → Write to SQLite audit log, publish to Redis
- `lib/auth.ts` → No changes (already fixed)
- `index.ts` → Register new routes, WebSocket

### Frontend (apps/web-regulator/)

**New:**
- `hooks/use-websocket.ts` — WebSocket client hook
- `app/(dashboard)/docs/page.tsx` — In-app documentation
- `components/machines/machine-detail.tsx` — Real machine detail panel
- `components/settings/settings-form.tsx` — Real settings form with API
- `components/logs/log-filter.tsx` — Filterable log viewer
- `components/logs/log-table.tsx` — Enhanced log table

**Modified:**
- `components/kill-switch/emergency-stop-button.tsx` → Fix 429 (batch/debounce)
- `app/(dashboard)/kill-switch/page.tsx` → WebSocket integration
- `app/(dashboard)/flags/page.tsx` → Real flag defaults, machine-scoped
- `app/(dashboard)/machines/page.tsx` → Wire to real API
- `app/(dashboard)/settings/page.tsx` → Wire to real API
- `styles/globals.css` → Verify design system match

### Shared

- `types/shared.ts` → Add new types (Agent, Machine, Setting, WebSocketMessage)

---

## 5. Database Schema Additions

```sql
-- Kill Switch Audit Log (persistent)
CREATE TABLE kill_switch_audit_log (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  machine_id TEXT,
  severity TEXT DEFAULT 'info',
  metadata TEXT -- JSON
);

-- Machines registry
CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  role TEXT NOT NULL,
  has_dpu INTEGER NOT NULL DEFAULT 0,
  specs TEXT, -- JSON
  last_seen INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Settings (global)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Machine-scoped flags (override global)
CREATE TABLE machine_flags (
  machine_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (machine_id, flag_key)
);

-- Agents (per-machine registration)
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  capabilities TEXT, -- JSON
  last_heartbeat INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

## 6. Success Criteria

| Criterion | Target |
|-----------|--------|
| No 429 errors on normal usage | 0 rate limit rejections during dashboard session |
| Real-time updates | State changes visible within 1 second |
| Audit persistence | All state changes survive container restart |
| Flag defaults | 5 predefined flags pre-seeded on first startup |
| Machines API | Full CRUD, real data from SQLite |
| Settings persistence | All toggles survive logout + restart |
| Design match | Visual match to monorepo design system |
| In-app docs | Complete protocol documentation at `/docs` |
| Review score | ≥ 95/100 |

---

## 7. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| WebSocket complexity | Elysia has native WebSocket support; fallback to polling |
| SQLite migration on running system | Use Drizzle `db:push` pattern; no manual SQL |
| Design system mismatch | Reference monorepo packages/shared-types exactly |
| Rate limit edge cases | Separate counters, generous limits, clear headers |

---

---

## 8. Sequential Additions (v1.1)

These sections were added in order, in response to two user observations about the v1.0 implementation. Each addition is self-contained and builds on the prior state of the plan.

### 8.1 — Observation #1: Machine Navigation + Sidebar Wiring

**Observation:**
- At the `/` route, when a machine is selected, the UI should update to `/machines/[id]` (the dedicated detail page) rather than render an inline `MachineDetailPanel`.
- The dedicated `/machines/[id]` page should display the machine-context **sidebar** — Hardware, DPU, System Metrics, and Quick Actions — currently built in `components/machines/machine-sidebar.tsx` but not yet receiving live `currentKillSwitchState` / `onKillSwitchStateChange` from the layout.

**Current State (verified 2026-06-02):**

| Component | Path | Status |
|-----------|------|--------|
| `app-sidebar.tsx` (machine context panel block) | `components/layout/app-sidebar.tsx` | ✅ Code complete (lines 130–194) |
| `app/(dashboard)/layout.tsx` (props passed to AppSidebar) | `app/(dashboard)/layout.tsx` | ⚠️ Only passes `selectedMachine` + `onMachineDeselect`; **missing** `currentKillSwitchState` + `onKillSwitchStateChange` |
| `app/(dashboard)/page.tsx` (handleSelectMachine) | `app/(dashboard)/page.tsx` | ❌ Sets `selectedCluster` and calls `selectMachine()` — does NOT navigate to `/machines/[id]` |
| `app/(dashboard)/machines/[id]/page.tsx` | `app/(dashboard)/machines/[id]/page.tsx` | ✅ Renders `MachineDetailPanel` (full layout) — should be the canonical destination |

**Exact Changes Required:**

#### Step 8.1a — Wire layout to WebSocket kill-switch state
**File:** `apps/web-regulator/app/(dashboard)/layout.tsx`

Add `useKillSwitchWebSocket()` inside `DashboardLayoutInner` and pass its `status?.state` + a `handleStateChange` callback down to `<AppSidebar>`. The callback calls `apiPost('/api/kill-switch/chaos', { state, reason: 'Sidebar machine override' })` and surfaces success/error toasts (mirroring the pattern in `app/(dashboard)/machines/[id]/page.tsx` lines 53–72).

```tsx
// app/(dashboard)/layout.tsx — DashboardLayoutInner
const { status } = useKillSwitchWebSocket();

const handleKillSwitchStateChange = useCallback(
  async (newState: KillSwitchState) => {
    try {
      await apiPost("/api/kill-switch/chaos", {
        state: newState,
        reason: `Sidebar machine override: ${newState}`,
      });
      toast.success(`State changed to ${newState}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change state");
    }
  },
  [],
);

// pass to AppSidebar
<AppSidebar
  selectedMachine={selectedMachine}
  onMachineDeselect={deselectMachine}
  currentKillSwitchState={status?.state ?? "ARMED"}
  onKillSwitchStateChange={handleKillSwitchStateChange}
/>
```

**Why:** Without these two props, the sidebar's "Quick Actions" branch (`{currentKillSwitchState && onKillSwitchStateChange && …}`) is dead code. The component already supports it — pure wiring fix.

#### Step 8.1b — Navigate to `/machines/[id]` on machine click
**File:** `apps/web-regulator/app/(dashboard)/page.tsx`

Replace the inline `MachineDetailPanel` rendering with a `router.push(\`/machines/\${machine.id}\`)` call. Keep the table on the left, the `SystemHealthPanel` on the right (no inline detail panel). Remove the `selectedCluster` state, the `setSelectedCluster` calls, the `handleClosePanel` callback, the `getMachineForCluster` helper, and the `MachineDetailPanel` import.

```tsx
// app/page.tsx — handleSelectMachine
const handleSelectMachine = useCallback(
  (cluster: Cluster) => {
    const dc = cluster as unknown as DashboardCluster;
    const machine = machines.find((m: Machine) => m.id === dc.id);
    if (machine) {
      router.push(`/machines/${machine.id}`);
    } else {
      // fallback: navigate with cluster id even if machine not in WS list
      router.push(`/machines/${dc.id}`);
    }
  },
  [machines, router],
);
```

Add `useRouter` to the `next/navigation` import.

**Why:** the dedicated detail page is richer (full DPU banner, real audit-log table, dedicated MachineLogs component) and aligns with the URL the sidebar "View Details" link already points to. Single source of truth, no inline-mode divergence.

#### Step 8.1c — Verify machine-context sidebar shows on `/machines/[id]`
**File:** `apps/web-regulator/app/(dashboard)/layout.tsx`

The `MachineSelectionProvider` already wraps the entire `(dashboard)` route group, so selecting a machine on `/machines` (by clicking a row) and navigating to `/machines/[id]` will keep `selectedMachine` populated. The `app-sidebar.tsx` machine-context panel (lines 130–194) will render automatically.

**Test:** log in → click a machine on `/` → land on `/machines/[id]` → sidebar shows the machine name, status badge, system metrics, and Quick Actions (EMERGENCY STOP / ARM & RELEASE / RUN).

**Agent Assignment:** Chanshuk (dev-lead) — touches only `apps/web-regulator/` and 2 files. ETA: 25 min.

---

### 8.2 — Observation #2: Per-Machine Emergency Action + Per-Machine Flags

**Observation:**
- The `/machines` route currently shows Registered Machines + a right-side Machine Details panel with a "No DPU Detected" banner and resource bars. **It is missing per-machine emergency actions** and **per-machine flag overrides**.
- Per the ADR-133 principle ("global + per-machine flags; machine overrides global"), flags should be configurable **within each machine** in addition to the global `Flag Management` page.

**Current State (verified 2026-06-02):**

| Item | Path | Status |
|------|------|--------|
| `machine_flag` table | `apps/server-kill-switch/src/db/schema.ts` (lines 202–214) | ✅ Schema present (ADR-133) |
| `GET /v1/flags` (global) | `apps/server-kill-switch/src/routes/flags.ts` (line 65) | ✅ Returns all flags, **not machine-scoped** |
| `GET /v1/flags?machineId=<id>` (per-machine merged view) | — | ❌ **Not implemented** |
| `PUT /v1/machines/:id/flags/:key` (set override) | — | ❌ **Not implemented** |
| `DELETE /v1/machines/:id/flags/:key` (clear override) | — | ❌ **Not implemented** |
| `MachineQuickActions` component | `components/machines/machine-quick-actions.tsx` | ✅ Code complete (POSTs to `/api/kill-switch/chaos`) |
| Per-machine quick actions in `/machines` table | `app/(dashboard)/machines/page.tsx` | ❌ Table rows have no per-row action buttons |
| Per-machine flag editor | — | ❌ **Not implemented** |

**Exact Changes Required:**

#### Step 8.2a — Backend: per-machine flag endpoints
**File:** `apps/server-kill-switch/src/routes/flags.ts` (extend, do not replace)

Add three new handlers inside `handleFlagsRoutes`:

```ts
// GET /v1/flags?machineId=<id>  — merged view (global + override)
if (method === 'GET' && url === '/v1/flags' && machineIdParam) {
  const overrides = await db
    .select()
    .from(machineFlags)
    .where(eq(machineFlags.machineId, machineIdParam))
    .all();
  const globals = await db.select().from(featureFlags).all();
  const merged = globals.map(g => {
    const ov = overrides.find(o => o.flagKey === g.key);
    return { ...g, value: ov?.value ?? g.value, overridden: !!ov };
  });
  json(res, 200, { flags: merged, machineId: machineIdParam, overrides });
  return true;
}

// PUT    /v1/machines/:id/flags/:key   — set or update override
// DELETE /v1/machines/:id/flags/:key   — clear override (fallback to global)
```

Wire `handleFlagsRoutes` to accept a `machineId` query param and call the new branches. Log every mutation to `flagAuditLog` (existing pattern at lines 36–49).

**Drizzle workflow reminder (per MEMORY):** schema is already in place — no manual migration. After this code lands, run `bun run db:push` once to confirm Drizzle's snapshot matches the running DB (which already has the table from the May 12 migration).

**Why:** the schema has been waiting for the API surface since ADR-133; filling it unblocks the UI work and lets the per-machine override semantics be tested end-to-end.

#### Step 8.2b — Frontend: per-machine flag editor
**New file:** `apps/web-regulator/components/machines/machine-flag-editor.tsx`

A dialog component that fetches `/api/flags?machineId=<id>` on open, shows the 5 predefined flags (mirror the list in `app/(dashboard)/flags/page.tsx` lines 27–55), and marks rows that have a machine override with a small "overriding global" badge. Edits POST/PUT/DELETE to the new backend endpoints.

#### Step 8.2c — Wire per-machine quick actions into `/machines` table
**File:** `apps/web-regulator/app/(dashboard)/machines/page.tsx`

Extend the `Registered Machines` table (lines 297–378) with a new `Actions` column showing two buttons:

- **Emergency Stop** — opens a `MachineQuickActions` (reuse existing component, lines 14–17 of `machine-quick-actions.tsx`) bound to that machine.
- **Manage Flags** — opens the new `MachineFlagEditor` dialog (Step 8.2b).

The right-side `Machine Details` panel already exists and should be augmented with a "Flags" section that shows the resolved values for the selected machine (calls `/api/flags?machineId=<id>` and renders 5 rows).

**Why:** keeps `/machines` and `/machines/[id]` aligned — same per-machine controls in both places, with the detail page getting the full `MachineDetailPanel` treatment (audit log, full stats grid) and the table page giving quick inline access.

#### Step 8.2d — Reflect in nav copy + docs
**File:** `apps/web-regulator/components/layout/app-sidebar.tsx` (NAV_ITEMS, line 35)

Update the `Flag Management` description from "Feature flags & rollout control" to "Global flags & per-machine overrides" so the scope is honest.

**File:** `apps/web-regulator/app/(dashboard)/docs/page.tsx`

Add a subsection: "Per-Machine Flag Overrides (ADR-133)" with the resolution order: **machine override > global > default**. Cite the 3 new endpoints added in 8.2a.

**Agent Assignment:** Split — Keridz (BE) for 8.2a (~45 min), Gimglich (FE) for 8.2b–d (~1.5 hours). Chanshuk coordinates since this touches both. Nikaya reviews.

---

## 9. Updated Success Criteria (v1.1)

| Criterion (v1.0) | v1.1 Addendum |
|------------------|----------------|
| Machines API: full CRUD, real data from SQLite | + `GET /v1/flags?machineId=<id>` returns merged view with override markers |
| Real-time updates within 1 second | + Sidebar kill-switch state updates live via WebSocket (no stale "ARMED" after override) |
| Review score ≥ 95/100 | + Two new test cases: (a) clicking a machine on `/` lands on `/machines/[id]`, (b) per-machine flag override is reflected in `/api/flags?machineId=<id>` and clearable |
| — | **NEW:** Zero regression on existing `/kill-switch` global stop path; machine-level and global state must agree (single source of truth = `bcp:kill-switch:chaos` Redis channel) |

---

## 10. v1.1 Risk Additions

| Risk | Mitigation |
|------|------------|
| Inline-vs-route split leaves orphaned `MachineDetailPanel` import on `/` | Step 8.1b explicitly removes the import + state + helper |
| Per-machine flag override drifts from global when a flag is deleted globally | Add `ON DELETE CASCADE` on `machine_flag.flag_key → feature_flags.key` (or delete all overrides when the global flag is deleted in the existing `DELETE /v1/flags/:id` handler) |
| Sidebar Quick Actions fire `kill-switch/chaos` while the user is mid-action on `/kill-switch` | Both paths use the same WebSocket channel; final state converges. Add a 250ms debounce on the sidebar action to avoid double-fires. |

---

## 11. v1.1 Status Log

### 2026-06-03 — Stage 1 (Dev-Lead) Review by Wobblus

**Reviewer:** Wobblus (fallback for Chanshuk, per Option B — `agentToAgent` policy blocked direct dev-lead handoff).
**Verdict:** ✅ **PASS** — v1.1 ready for Stage 2 (Nikaya).
**Full report:** `docs/reviews/REVIEW-V1.1-STAGE1-WOBBLUS.md`

Key findings:
- All § 8.1 (3 sub-tasks) and § 8.2 (4 sub-tasks) implemented per spec
- API contract (`docs/api-contracts/per-machine-flags-v1.md`) honored exactly — no silent divergence
- § 10 risk mitigations applied: 250ms debounce on sidebar Quick Actions, cascade-delete `machine_flag` when global flag deleted
- DrizzleORM workflow correct (untracked migration, no manual SQL)
- **0 new type errors introduced** — 16 pre-existing errors (Phase 0/1 debt) are NOT regressions from this work, verified via stash test

Next: spawn Nikaya for Stage 2 (full review with live stack, a11y, E2E, score target ≥95/100).

---

*Plan v1.1 — Sequential additions applied (Observations #1 and #2) + Stage 1 passed.*
