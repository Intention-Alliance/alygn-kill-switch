# Kill Switch Dashboard — Complete Implementation Plan v1.0

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

*Plan v1.0 — Ready for delegation*
