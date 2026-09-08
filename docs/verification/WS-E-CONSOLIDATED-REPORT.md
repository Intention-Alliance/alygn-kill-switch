# WS-E — Phase Verification Consolidated Report (V1–V10)

**Date:** 2026-09-08 13:15 CST
**Verifier:** Volthiz (QA) — Stage 3 verification run
**Environment:** andlersrv — `alygn-kill-switch` (Up 5 days, healthy, 0 restarts, port 3000), `alygn-web-regulator` (3001), `alygn-ollama-proxy` (11434), 3× redis nodes
**Evidence files:** `docs/verification/V[N]-[claim].md` (10 files)

---

## Summary

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| V1 | State machine | ✅ **VERIFIED LIVE** | health + status + transition history |
| V2 | Admin dashboard (WS) | ⚠️ PENDING — needs admin creds | infra running; WS code present |
| V3 | Per-machine flags + resolution | ⚠️ PARTIAL — read path verified; write path needs admin | flags API + DB + code |
| V4 | Hardware detection | ✅ **VERIFIED LIVE** | full fingerprint + sha256 signature |
| V5 | SQLite persistence (WAL) | ✅ **VERIFIED LIVE** | WAL files, 5-day data, append-only triggers |
| V6 | WebSocket propagation | ⚠️ PENDING — needs admin creds | pub/sub + WS code present |
| V7 | AI-agnostic discovery | ⚠️ PARTIAL — Ollama live; multi-provider pending | Ollama tags + 15 verification events |
| V8 | Integrity fingerprint + tamper | ⚠️ PARTIAL — fingerprint verified; tamper event pending | stable sha256 across 2 heartbeats |
| V9 | Registration lifecycle | ✅ **VERIFIED LIVE** | approve + deny flows, audit trail |
| V10 | Rogue alerting + monitoring-only | ⚠️ PARTIAL — monitoring-only verified; rogue alert pending 3rd deny | deny flow + threshold code |

**Score: 4 VERIFIED, 4 PARTIAL, 2 PENDING.**

---

## Verified claims (evidence on disk)

- **V1** — `GET /v1/kill-switch/health` → `{"killSwitchState":"RUNNING","redis":{"redis":"OK"}}`; status endpoint replays 4 transitions (ARMED→STOPPED→ARMED→RUNNING) with traceIds. State machine table (5 states, valid transitions) code-verified.
- **V4** — `andlersrv-primary` ADMITTED with full fingerprint (CPU model/cores, RAM 15865MB, GPU PCI 8086:5912, disk 236GB, OS Alpine 3.20, MACs) + sha256 integrity signature `08e5aa02…`. Identical hash across 2 heartbeats → fingerprint stable.
- **V5** — WAL mode active (`-wal`/`-shm` present), volume-mounted data dir, 5 days of persisted data (6 audit rows, 13 discovered machines, 15 verification events, 8+8 flags), UPDATE/DELETE triggers enforce append-only (ADR-140).
- **V9** — Full lifecycle today: heartbeat → NEW_MACHINE → approve → ADMITTED (tenant created, 8 flags seeded, registration APPROVED, audit entry) and deny → DENIED (registration DENIED, audit entry). `onboarding/pending` empty — both decided.

## Partial claims

- **V3** — 8 global flags + 8 per-machine flags live; resolution order (machine override wins) code-verified. Write/precedence test needs admin session.
- **V7** — Ollama live with models enumerated (embeddinggemma, deepseek-v4-pro/flash, glm-*); 15 inference verification events prove the kill-switch↔provider loop. Other 4 provider adapters code-only until test machine (WS-B).
- **V8** — Fingerprint + signature + stability verified. Drift/tamper firing needs second machine.
- **V10** — `monitoringOnly:true` on tenant, deny flow live, 11 NEW_MACHINE devices with zero authority. Rogue alert (threshold 3) needs 2 more denials from same host.

## Pending claims (blocked on credentials)

- **V2, V6** — Need Better-Auth admin session (dashboard + WS frame capture). Infra confirmed running.

---

## 🔴 Bugs found during verification (beyond the matrix)

### BUG-1 — HIGH: `machine.createdAt` corrupted in API (ms stored as seconds)

- **Component:** `apps/server-kill-switch/src/routes/machines.ts` serializeMachine + machine-heartbeat insert
- **Repro:** `GET /v1/machines` → `"createdAt":"+058617-11-02T19:30:00.000Z"`
- **Root cause:** DB stores `1787633091000` (ms) in `machine.created_at`; schema declares `mode:'timestamp'` (seconds); read path `new Date(row.createdAt)` treats ms as seconds → year +058617. `last_seen` (seconds, `1788892923`) serializes correctly → insert path writes inconsistent units.
- **Impact:** machine inventory shows garbage creation dates; `sortBy=createdAt` ordering wrong. Any client (dashboard, agent) reading createdAt gets invalid data.
- **Fix:** normalize to seconds on write (`Math.floor(now.getTime()/1000)`) or switch column to `timestamp_ms` consistently.

### BUG-2 — HIGH: Deployed container runs stale kill-switch.ts — audit chain hashing NOT live

- **Component:** deployed image vs `feat/agent-plane` branch — `apps/server-kill-switch/src/services/kill-switch.ts`
- **Evidence:** container code uses `db.insert(killSwitchAuditLog).values({...}).run()` (raw insert); branch HEAD uses `appendAuditEntry()` (prev_hash/self_hash/server_hmac). DB confirms: all 6 audit rows have `prev_hash='GENESIS'`, empty `self_hash`/`server_hmac`.
- **Impact:** the tamper-evident hash chain (ADR-140) is **not active in production**. `POST /v1/audit/verify` would fail (recomputed self_hash ≠ stored ''). Whitepaper's tamper-evidence claim is not met by the running system.
- **Fix:** rebuild/redeploy image from current branch; verify `self_hash` populated on next transition.

### BUG-3 — MEDIUM: Per-machine flag values are all `"true"` — semantic values lost

- **Component:** `onboarding.ts` seedDefaultFlags + `db/seed.ts`
- **Evidence:** `machine_flag` rows all `value='true'`; `GET /v1/machines/andlersrv-local/status` → all 8 activeFlags `"true"`. `sampling_rate` (should be 0–1), `kill.authorization.quorum` (should be int), `timeoutMs` (should be int) all boolean-true.
- **Impact:** any consumer reading flag values gets meaningless data; per-machine config is non-functional beyond on/off.
- **Fix:** seed real default values per flag key (1.0, 2, 600000, etc.) instead of `String(flag.value)`.

### BUG-4 — MEDIUM: `settings` table empty — kill-authorization config surface blank

- **Evidence:** `GET /v1/settings` → `{"settings":{},"updatedAt":null}`. `kill.authorization.*` defaults silently fall back to hardcoded (single, 2, 600000ms).
- **Impact:** operators can't see/verify authorization policy; defaults apply invisibly. Safety-critical config should be explicit.
- **Fix:** seed defaults into `setting` table at init.

### BUG-5 — LOW: `kill_switch_state` table empty — state history only in Redis

- **Evidence:** table 0 rows; state lives solely in `chaosKillSwitchKey` (Redis, appendonly=yes). Redis flush → state silently resets to RUNNING default.
- **Impact:** no durable state history in SQLite; V5 restart-survival depends entirely on Redis persistence.
- **Fix:** persist transitions to `kill_switch_state` alongside audit log.

### BUG-6 — LOW: health `auditLogSize` undercounts (4 vs 6 in DB)

- **Evidence:** health → `auditLogSize:4`; DB has 6 rows. Onboarding entries (5,6) bypass the service hot-cache push.
- **Impact:** health metric misleading; monitoring that alerts on audit growth under-reports.
- **Fix:** derive auditLogSize from DB count or push onboarding entries through the service.

### BUG-7 — LOW: Inference verifier running degraded (all 15 events `degraded:1`)

- **Evidence:** `verification_event` — all rows `"verifier model unavailable"`, verdict REVIEW, confidence 0.0, model `qwen2.5:0.5b`.
- **Impact:** inference verification is a no-op in production (always REVIEW, never UNSAFE). Relevant to whitepaper verification capability beyond V1–V10.
- **Fix:** install verifier model or wire the Ollama proxy model (deepseek-v4-flash available).

---

## Credentials/resources needed to finish (from Andler)

1. **Better-Auth admin session** (or test admin) → unlocks V2, V3, V6
2. **Service restart access** → unlocks V5 restart-survival evidence
3. **Second machine** (andlerlnx/andler-mini) → unlocks V7 multi-provider, V8 tamper, V10 rogue alert
4. **Deploy pipeline access** → fixes BUG-2 (stale image)

## Files

- `docs/verification/V1-state-machine.md` … `V10-rogue-alerting.md` (10 evidence files)
- `docs/verification/WS-E-CONSOLIDATED-REPORT.md` (this file)

— Volthiz 🧪
