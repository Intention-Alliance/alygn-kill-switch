# Phase 1 Task Breakdown — Kill Switch Dashboard Rebuild

**Date:** 2026-05-13  
**Base Architecture:** ADR-133, WebSocket Protocol, Schema Additions, Machines API, Settings API  
**Target Score:** 95/100 (from current ~85/100 broken state)  

---

## Task Inventory

| # | Task Name | Agent | Files to Create/Modify | ETA | Dependencies | Success Criteria |
|---|-----------|-------|------------------------|-----|-------------|------------------|
| **T1** | Update Shared Types | **Talanara** | `packages/shared-types/src/kill-switch.ts`, `packages/shared-types/src/flags.ts`, `apps/web-regulator/types/shared.ts` | 20 min | None | `Machine`, `MachineSpecs`, `MachineStatus`, `DpuInfo`, `StateChangeMessage`, `AgentEventMessage`, `FlagUpdateMessage`, `AppSettings`, `RawSettings`, `parseSettings()` compile cleanly |
| **T2** | Extend DB Schema | **Keridz** | `apps/server-kill-switch/src/db/schema.ts` | 25 min | T1 | `killSwitchAuditLog` replaced with new columns, `machines` replaced, `settings`, `machineFlags`, `agents` tables added; `primaryKey` import added; drizzle-kit check passes |
| **T3** | Update DB Init & Migration SQL | **Keridz** | `apps/server-kill-switch/src/db/index.ts` | 20 min | T2 | `DROP/CREATE` statements for old tables; `CREATE TABLE` for all 5 tables; 6 new indexes created; `initDatabase()` runs without errors |
| **T4** | Create DB Seed Module | **Keridz** | `apps/server-kill-switch/src/db/seed.ts` | 20 min | T3 | `seedDefaults()` creates "andlersrv" machine; `seedSettings()` populates 6 default settings; idempotent (safe to re-run); called from `index.ts` |
| **T5** | Implement Split Rate Limiter | **Keridz** | `apps/server-kill-switch/src/middleware/rate-limit.ts` | 25 min | None | `ReadRateLimiter` (60/min) and `WriteRateLimiter` (10/min) exported; heartbeat endpoints bypass rate limiter; route prefix detection (GET vs POST/PATCH/DELETE) for machines/settings/flags |
| **T6** | Create WebSocket Manager | **Keridz** | `apps/server-kill-switch/src/services/websocket-manager.ts` | 45 min | T5 | `WebSocketManager` class with: `handleUpgrade(req, socket, head)`, `broadcastStateChange()`, `broadcastFlagUpdate()`, `broadcastAgentEvent()`, `validateWsToken()`; per-user socket tracking via `Map<string, Set<WebSocket>>`; Redis pubsub subscriber for 4 channels; sends `heartbeat` every 30s; closes after 10s no pong; max 5 conns per IP |
| **T7** | Integrate WebSocket into Server | **Keridz** | `apps/server-kill-switch/src/index.ts` | 20 min | T6, T4 | `server.on('upgrade')` routes to `wsManager.handleUpgrade()`; `wsManager` passed to `KillSwitchService`; `onStateChange` listener wired to `wsManager.broadcastStateChange()`; WebSocket upgrade requests skip HTTP rate limiter |
| **T8** | Create Machines Routes | **Keridz** | `apps/server-kill-switch/src/routes/machines.ts` | 40 min | T3, T5 | All 7 endpoints implemented (list, register, get, update, delete, heartbeat, status); validation on register (name, hostname, role); heartbeat updates `lastSeen` and `status`; status endpoint merges DPU info + agents + active flags; publish to `bcp:machines:events` on register/update/delete |
| **T9** | Create Settings Routes | **Keridz** | `apps/server-kill-switch/src/routes/settings.ts` | 30 min | T3, T5 | All 4 endpoints (get all, update multiple, get single, update single); type validation via `SETTING_VALIDATORS`; admin role check on writes; upsert on batch update; publish to `bcp:settings:updates` on change |
| **T10** | Wire Routes into Dispatch Chain | **Keridz** | `apps/server-kill-switch/src/index.ts` | 10 min | T8, T9 | `handleMachinesRoutes()` and `handleSettingsRoutes()` added to route dispatch in `createKillSwitchHandler()`; machine routes before settings; returns 404 after all handlers |
| **T11** | Build WebSocket React Hook | **Gimglich** | `apps/web-regulator/hooks/use-kill-switch-websocket.ts` | 45 min | T1 | `useKillSwitchWebSocket()` hook returns `{ status, flags, machines, agentEvents, auditLog, isConnected, reconnectAttempt }`; exponential backoff (1s, 2s, 4s, 8s, 16s, max 5 retries); fallback polling every 5s after max retries; auto-reconnect on session token change; handler for all 5 message types; cleanup on unmount |
| **T12** | Update Kill Switch Page | **Gimglich** | `apps/web-regulator/app/(dashboard)/kill-switch/page.tsx` | 25 min | T11 | Remove `fetchStatus` + `setInterval(5000)`; replace with `useKillSwitchWebSocket()`; `auditLog` from WebSocket replaces direct API fetch in `ActivationHistory`; loading state shows WebSocket connecting indicator; error state shows WS disconnected + polling fallback notice |
| **T13** | Update Flags Page | **Gimglich** | `apps/web-regulator/app/(dashboard)/flags/page.tsx` | 20 min | T11 | Remove `fetchFlags` + `setInterval(10000)`; replace with `useKillSwitchWebSocket()`; `flag-update` messages update flag state in-place (no full refetch); `flag-update(action: deleted)` removes from list; audit log still uses `AuditLog` component (separate API call) |
| **T14** | Rebuild Machines Page | **Gimglich** | `apps/web-regulator/app/(dashboard)/machines/page.tsx` | 30 min | T11, T1 | Remove `INITIAL_MACHINES` hardcoded array; `fetchMachines()` calls `GET /v1/machines`; "Add Machine" button enabled (opens `MachineEditor` dialog calling `POST /v1/machines/register`); machine detail panel uses `GET /v1/machines/:id/status`; real-time updates from `machine-registered`/`machine-updated`/`machine-removed` WS events; DPU banner shows actual `hasDpu` value |
| **T15** | Rebuild Settings Page | **Gimglich** | `apps/web-regulator/app/(dashboard)/settings/page.tsx` | 25 min | T11, T1 | Replace all `defaultChecked`/`defaultValue` with controlled `checked`/`value` bound to `settings` state; fetch settings on mount via `GET /v1/settings`; each toggle/input auto-saves via `PUT /v1/settings/:key`; "Save Settings" button does batch `POST /v1/settings`; loading skeleton while fetching; error toast on save failure |
| **T16** | End-to-End Testing | **Gimglich/Talanara** | N/A (manual test plan) | 30 min | T10, T15 | All test scenarios in §16.1 pass; no 429 errors on Emergency Stop; state changes appear in <100ms; activation history persists across server restart; machine registration creates real DB row; settings survive page reload |

**Total ETA:** ~7 hours parallel (Keridz backend: 3.5h, Gimglich frontend: 2.5h + Talanara types: 20 min)

---

## 16.1 End-to-End Test Scenarios

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Emergency Stop no 429 | Click "Emergency Stop" while status polling was active | State changes to STOPPING without 429 error |
| 2 | Real-time state change | Open 2 browser tabs, trigger state change in one | Both tabs update within 1 second |
| 3 | Audit log survives restart | Activate kill switch, restart server, check /activations | Previous activation still in list |
| 4 | Register new machine | POST /v1/machines/register with valid body | 201, machine appears in DB and dashboard |
| 5 | Machine heartbeat | POST /v1/machines/:id/heartbeat | lastSeen updates, status stays "active" |
| 6 | Per-machine flag override | Set `auto_stop_threshold` to 0.5 for machine X | GET /v1/machines/:id/status shows override with `source: "machine"` |
| 7 | Settings persistence | Change `auto_poll_interval` to 3000, reload page | Setting shows 3000 after reload |
| 8 | WebSocket disconnect | Kill the WS connection (block port) | Client retries 5 times, then falls back to HTTP polling |
| 9 | Admin-only settings write | Non-admin user tries PUT /v1/settings/:key | 403 Forbidden |
| 10 | Invalid setting value | PUT /v1/settings/auto_poll_interval with value "0" | 400 with validation error message |
| 11 | Duplicate machine hostname | Register machine with same hostname twice | 409 Conflict |
| 12 | Expired WS token | Connect WebSocket with expired session token | Close code 4001 |

---

## Dependency Graph

```
T1 (Types)
├── T2 (Schema) ──→ T3 (DB Init) ──→ T4 (Seed)
│                                      ↓
│       T5 (Rate Limit) ──→ T6 (WS Manager) ──→ T7 (WS Integration)
│                                ↓                     ↓
│       T8 (Machines Routes) ──→ T9 (Settings Routes) ──→ T10 (Dispatch)
│
├── T11 (WS Hook) ──→ T12 (KS Page)
│                  ├──→ T13 (Flags Page)
│                  ├──→ T14 (Machines Page)
│                  └──→ T15 (Settings Page)
│
└──→ T16 (E2E Testing)
```

**Parallelization:** Keridz (T2-T10 backend) and Gimglich (T11-T15 frontend) can work simultaneously after Talanara finishes T1. Talanara can then assist with T16 testing.

---

## File Manifest

### New Files (7)

| File | Phase |
|------|-------|
| `apps/server-kill-switch/src/db/seed.ts` | Phase 1 |
| `apps/server-kill-switch/src/services/websocket-manager.ts` | Phase 1 |
| `apps/server-kill-switch/src/routes/machines.ts` | Phase 1 |
| `apps/server-kill-switch/src/routes/settings.ts` | Phase 1 |
| `apps/web-regulator/hooks/use-kill-switch-websocket.ts` | Phase 1 |
| `apps/web-regulator/components/machines/machine-editor.tsx` | Phase 1 |
| `docs/architecture/*` (6 docs) | Phase 0 (done) |

### Modified Files (9)

| File | Changes |
|------|---------|
| `packages/shared-types/src/kill-switch.ts` | Add `Machine`, `MachineSpecs`, `MachineStatus`, `DpuInfo`, `AgentInfo`, `ActiveFlagInfo`, `StateChangeMessage`, `AgentEventMessage`, `AppSettings`, `RawSettings`, `parseSettings()` |
| `packages/shared-types/src/flags.ts` | Add `FlagUpdateMessage` type |
| `apps/web-regulator/types/shared.ts` | Mirror new types (Machine, etc.) |
| `apps/server-kill-switch/src/db/schema.ts` | Replace `killSwitchAuditLog`, replace `machines`, add `settings`, `machineFlags`, `agents` |
| `apps/server-kill-switch/src/db/index.ts` | Add `CREATE TABLE`+`INDEX` for new/modified tables; drop old machine table |
| `apps/server-kill-switch/src/middleware/rate-limit.ts` | Split into `ReadRateLimiter` + `WriteRateLimiter`; heartbeat bypass |
| `apps/server-kill-switch/src/index.ts` | Add WebSocket upgrade, WS manager, seed calls, route dispatch updates |
| `apps/web-regulator/app/(dashboard)/kill-switch/page.tsx` | Use `useKillSwitchWebSocket()` hook |
| `apps/web-regulator/app/(dashboard)/flags/page.tsx` | Use `useKillSwitchWebSocket()` hook |
| `apps/web-regulator/app/(dashboard)/machines/page.tsx` | Fetch from API, remove hardcoded data, real-time updates |
| `apps/web-regulator/app/(dashboard)/settings/page.tsx` | Controlled inputs, API persistence |

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WebSocket upgrade conflicts with rate limiter | Medium | High | T7 explicitly skips rate limit for upgrade requests |
| Schema migration breaks existing DB | Low | Medium | T3 uses DROP+CREATE (ok for dev); add migration script for prod |
| WS hook memory leak on unmount | Medium | Medium | T11 includes cleanup in useEffect return; clear all listeners |
| Split rate limiter introduces race conditions | Low | Low | Each limiter is independent; no shared state between read/write |
| shadcn/ui version incompatibility with new components | Low | Low | All new components use existing imports from `components/ui/` |
| CORS issues with WS on different port | Low | Medium | WS endpoint is on same port as HTTP API; no cross-origin for WS |

---

## Acceptance Criteria

Phase 1 is **complete** when:

- [ ] All 16 tasks marked done with passing test scenarios
- [ ] `kill-switch/page.tsx` updates in real-time (<1s) on state change
- [ ] `flags/page.tsx` reflects flag updates without full page refresh
- [ ] `machines/page.tsx` shows live machine inventory from API
- [ ] `settings/page.tsx` settings persist across page reloads
- [ ] Zero 429 errors during Emergency Stop flow
- [ ] Activation history survives `docker compose restart`
- [ ] WebSocket falls back to HTTP polling gracefully
- [ ] All 6 default settings pre-populated on fresh DB
- [ ] "andlersrv" machine auto-registered on fresh DB
- [ ] All new/changed files pass TypeScript compilation (`tsc --noEmit`)
- [ ] ADR-133 accepted and filed in `docs/architecture/`
