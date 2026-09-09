# F1 — Audit Chain Rebuild (hash chain + HMAC) — Independent Verification

**Claim:** ADR-140 immutable audit log hash chain is live in production: every
`kill_switch_audit_log` row carries `prev_hash`/`self_hash`/`server_hmac`, the
chain re-walks clean, and the genesis entry is a real chained row (not a
placeholder).

**Status:** ✅ VERIFIED LIVE (independent re-verification by Nikaya, QA)
**Verifier:** Nikaya (QA) — 2026-09-09 02:10 CST
**Card:** F1-CRÍTICO "Rebuild imagen Docker — cablear hash-chain del audit log + F2/F4" (alygn-activation, 78621c1e-670e-488c-b8d7-d091e2262e15)
**Repo HEAD:** `ec975c30` (main) + this card's follow-up commit

---

## 1. Hash chain live — 3 rows, link/self/hmac OK, genesis real

### 1.1 Live database

The kill-switch runs **bare-metal as a host process** (see §4), with
`DATA_DIR=./data` relative to the repo root. The live DB is
`data/kill-switch.sqlite` (WAL mode). The running process (PID 7497,
`bun run apps/server-kill-switch/src/index.ts`) has `AUDIT_HMAC_KEY` set in its
environment, and the DB file matches the process cwd.

### 1.2 Chain contents (append order = rowid)

| rowid | id (prefix) | timestamp | reason | prev_hash | self_hash (prefix) |
|-------|-------------|-----------|--------|-----------|--------------------|
| 1 | `8ee13d95` | 1788906767 | System initialized — kill switch running | `GENESIS` | `f774ad4002a0…` |
| 2 | `55886ba3` | 1788914715 | F1 verification: hash chain with HMAC | `f774ad4002a0…` (row 1 self) | `f8e796b1202b…` |
| 3 | `974c42c8` | 1788914808 | Restore after F1 verification | `f8e796b1202b…` (row 2 self) | `77729885b462…` |

### 1.3 Cryptographic re-verification (independent, off-DB copy)

Recomputed from a private copy of the live DB (outside the state dir) using the
canonical JSON field order from `audit-chain.ts` (`canonicalEntryJson`),
second-based timestamps, and the `AUDIT_HMAC_KEY` from the repo `.env`:

- **self_hash** = `sha256(canonical_json(entry) + prev_hash)` — recomputed for
  all 3 rows → **match** ✅
- **chain link** — each row's `prev_hash` equals the previous row's `self_hash`
  (row 1 links to `GENESIS`) → **match** ✅
- **server_hmac** = `HMAC-SHA256(key, canonical_json(entry) + self_hash)` —
  recomputed for all 3 rows → **match** ✅

**Result: chain intact, 3/3 rows, `brokenAt=null`.** The genesis row is a real
chained entry (`System initialized — kill switch running`, `prev_hash='GENESIS'`,
valid self_hash + HMAC), not a legacy placeholder.

> Note: the canonical JSON must be serialized with non-ASCII characters
> unescaped (JS `JSON.stringify` behavior) — the `—` em-dash in the genesis
> reason is stored raw. Any verifier must use `ensure_ascii=False`-equivalent
> serialization or the recomputed hash will not match.

### 1.4 Append-only enforcement

`db/index.ts` installs INSERT-only triggers on `kill_switch_audit_log`
(UPDATE/DELETE → `RAISE(ABORT)`, ADR-140). `appendAuditEntry()` wraps
head-read + insert in `BEGIN IMMEDIATE` to prevent TOCTOU chain collisions.

---

## 2. Declared limitation: 11 legacy rows not migrated (acceptable per ADR-140)

The previous containerized deployment (`infrastructure_kill-switch-data` docker
volume) holds **11 audit rows written before the hash-chain columns existed**:

| # | reason |
|---|--------|
| 1–4 | System initialized / Test: audit log pipeline (Aug 2026) |
| 5–6 | onboarding.deny / onboarding.approve |
| 7–8 | inference-unsafe / Test: Ollama discovery |
| 9–11 | V1 verification: transition / re-arm / restore (Wobblus WS3) |

All 11 rows have `prev_hash='GENESIS'`, `self_hash=''`, `server_hmac=''` — they
were written by the pre-ADR-140 raw insert path. **They were NOT migrated into
the live chain** (no backfill of self_hash/HMAC, no re-link). This is an
accepted, declared deviation:

- The live chain starts fresh at the bare-metal migration (row 1 = real genesis).
- The legacy volume is retained as-is (append-only triggers prevent rewriting
  it in place; backfilling would require disabling the triggers and would
  fabricate HMACs for events that predate the key).
- `POST /v1/audit/verify` on the **live** DB returns `ok:true` (3 rows).
  The legacy volume is not mounted by the current runtime, so it does not
  affect verification.

**Per ADR-140, this is acceptable and hereby declared.** If full historical
tamper-evidence is ever required, a one-time migration card (re-sign legacy rows
with a documented `legacy-migration` marker + anchor) is the follow-up.

---

## 3. F4 fix — flag key contract unified

**Issue (Nikaya):** `seed.ts:88` seeded the interception master flag as
`interception_enabled`, but the runtime contract (`flags.ts:103/404`,
dashboard `flags/page.tsx:44`, `flag-editor.tsx:33`, onboarding tests) uses
`llm_interception_enabled`. The seeded key was invisible to the dashboard and
to per-machine overrides.

**Fix (this card):** unified the contract on `llm_interception_enabled`:

- `apps/server-kill-switch/src/db/seed.ts` — seed key `interception_enabled` →
  `llm_interception_enabled`; also `sampling_rate` → `request_sampling_rate`
  (same mismatch against `KNOWN_FLAG_TYPES`/`orderedKeys`).
- `apps/server-kill-switch/src/routes/__tests__/flags-quorum-gate.test.ts` and
  `kill-authorization.test.ts` — mock/assertion keys updated to the canonical
  names.

**Tests:** `kill-authorization.test.ts` 12/12 pass, `flags-quorum-gate.test.ts`
4/4 pass, `onboarding.test.ts` 17/17 pass (each file run in isolation; the
global drizzle mocks in some test files break co-run — pre-existing, unrelated
to this change). `flags.test.ts` fails on a pre-existing `drizzle-orm` export
issue (`Export named 'and' not found`) — confirmed identical on clean
`ec975c30` before this card's changes.

> ⚠️ Live DB note: the running bare-metal DB still contains the old
> `interception_enabled` + `sampling_rate` rows (seeded pre-fix). The seed is
> idempotent (insert-if-missing), so the corrected keys will be created on next
> seed run; the stale rows are harmless orphans. A cleanup DELETE of the two
> stale rows is optional and safe (flag_audit_log preserves history).

---

## 4. F2 fix — healthcheck path

**Issue (Nikaya):** `docker-compose.yml:120` healthchecked
`http://127.0.0.1:3000/health` (LB liveness, always 200 if process alive) for
the kill-switch service, instead of the real service health endpoint.

**Fix (this card):** `docker-compose.yml` kill-switch healthcheck now targets
`http://127.0.0.1:3000/v1/kill-switch/health` — the endpoint that runs
`service.healthCheck()` (Redis + kill-switch state) and returns 503 when
unhealthy. This makes `depends_on: service_healthy` (redis nodes) and the
compose health state reflect actual service readiness, not mere process
liveness.

---

## 5. Runtime decision: bare-metal host process (documented)

**Decision:** the kill-switch runs as a **bare-metal host process**, not a
container, in the current production deployment.

**Evidence:**
- Live process: `bun run apps/server-kill-switch/src/index.ts` (PID 7497),
  cwd = repo root, `DATA_DIR=./data` → `data/kill-switch.sqlite`.
- The repo's `docker-compose.yml` still defines a `kill-switch` service (used
  for the redis-node cluster + containerized deployments), but the live
  deployment does not use it — the old container volume
  (`infrastructure_kill-switch-data`) holds the pre-chain legacy DB.
- Systemd unit templates (`alygn-web-regulator*.service`) run the web regulator
  as a host service pointing at `KILL_SWITCH_BACKEND_URL=http://localhost:3000`.

**Rationale:** the kill switch is a safety-critical control plane; running it
as a host process avoids container restart policy gaps, keeps the SQLite WAL
file on the host filesystem, and keeps `AUDIT_HMAC_KEY` in the host process
environment (never in a container image or compose file). The compose service
remains as the documented containerized alternative (e.g., for staging or
disaster recovery), now with the corrected healthcheck.

---

## Verdict

| Check | Result |
|-------|--------|
| Hash chain live (3 rows, link/self/hmac OK) | ✅ verified independently |
| Genesis row real (chained, signed) | ✅ |
| 11 legacy GENESIS rows not migrated | ⚠️ declared, acceptable per ADR-140 |
| F4: flag key contract unified (`llm_interception_enabled`) | ✅ fixed + tests pass |
| F2: healthcheck → `/v1/kill-switch/health` | ✅ fixed |
| Runtime bare-metal decision | ✅ documented |

**F1: VERIFIED — claim stands; F2/F4 fixes applied.**
