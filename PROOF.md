# Alygn Kill-Switch — Black-Box Proof Harness

**Harness:** `tests/proof-harness/run.ts` (run with `bun run proof`)
**Artifact:** `proof/latest.json`
**Scope:** boots the REAL server (`apps/server-kill-switch/src/index.ts`) against a
throwaway `HOME` + `DATA_DIR` and the local Redis, then runs three black-box
checks over HTTP and independently recomputes the ADR-140 audit chain.

## What this proof does NOT claim

> **This proof does not certify SIL.** No safety-integrity-level assessment,
> failure-mode analysis, or certification body review is performed here.
>
> **This proof does not prove a hardware inhibit.** No DPU, relay, power, or
> other physical kill path is exercised. The only inhibit demonstrated is a
> software state transition (`RUNNING → STOPPED`) echoed to the agent plane.
>
> **This proof does not authorize deployment.** It is a local, single-host,
> development-mode harness. A passing run is evidence about specific code
> paths, not a deployment gate.

## Prerequisites

The harness needs the local Redis cluster up. From the repo root:

```bash
docker compose up -d redis-node-1 redis-node-2 redis-node-3 redis-cluster-init
```

The harness expects the container `align-redis-node-1` (host port **6380** →
container `6379`) to answer `PING`. If it is missing, the harness records a
legible SKIP in `proof/latest.json` and exits `2` (it does not fail a
confusing boot).

Both the container and the ports are overridable via environment variables
(defaults match `docker-compose.yml`):

| Env var | Default | Meaning |
|---------|---------|---------|
| `PROOF_REDIS_CONTAINER` | `align-redis-node-1` | container the harness `docker exec`s into |
| `PROOF_REDIS_PORT` | `6379` | redis-cli port **inside** the container |
| `PROOF_REDIS_HOST_PORT` | `6380` | host port the server under test connects to |
| `PROOF_PORT` | `3999` | host port the server under test binds |

If `PROOF_PORT` is already in use, the harness records a legible SKIP naming
the port in `proof/latest.json` and exits `2` (rather than a fatal boot
failure). Re-run with `PROOF_PORT=<free-port>` to use another port.

## How to run

```bash
bun run proof        # == bun tests/proof-harness/run.ts
```

The harness is **self-contained**: it generates its own secrets, writes a
throwaway `$HOME/.openclaw/secrets.json`, uses a temp `DATA_DIR`, and applies
the repo's own drizzle migrations to a temp SQLite file. **The operator does
not need to copy or supply any `.env`.** The only external dependency is the
local Redis container (see Prerequisites above), which the harness probes in a
preflight step — a missing Redis is reported as a legible skip in
`proof/latest.json`, not a fatal boot failure. For reference, the server's env
template lives at `apps/server-kill-switch/.env.example` (there is no root
`.env.example`).

The harness captures the pre-run value of the shared `chaos:kill-switch` key
and **restores it in a `finally` block** (deleting it if it was absent), so a
run does not leave other local consumers paused. The pre-run value and the
restore result are recorded in `proof/latest.json` as `redis_pre_run` and
`redis_restore`.

Exit code is `0` only when checks 1–3 all pass. **The expected, correct result
today is exit `0` with checks 1–3 all passing** (see "Check 1 finding" below).

## Environment caveats

- **REDIS_URL caveat.** `validate-env.ts` *requires* `REDIS_URL` (the server
  refuses to boot without it). The harness therefore sets
  `REDIS_URL=redis://127.0.0.1:${PROOF_REDIS_HOST_PORT}` (default `6380`)
  explicitly. Because `config/index.ts` lets `REDIS_URL` override `REDIS_URLS`,
  the server connects in **standalone mode to node-1 only**, not the 3-node
  cluster. Cluster-wide slot routing is therefore **not exercised** by this
  harness. Persisted state is reset with
  `docker exec ${PROOF_REDIS_CONTAINER} redis-cli -c -p ${PROOF_REDIS_PORT} DEL chaos:kill-switch`
  so the state starts `RUNNING`; the pre-run value is captured first and
  restored in the `finally` block.
- **Headless-WebAuthn limitation.** Assertion tokens are minted in-process by
  the harness's OWN `mintAssertionToken` in `tests/proof-harness/lib.ts` — a
  faithful re-implementation of the HMAC token format that mirrors
  `apps/server-kill-switch/src/services/webauthn.ts` (it does **not** call
  `services/webauthn.ts` `__test.mintAssertionToken`). No real WebAuthn
  ceremony (`navigator.credentials.get`, authenticator, challenge) is
  performed. This proves the token-verification path and action binding,
  **not** that a human hardware authenticator was present.
- **Migrations.** The harness applies the repo's own drizzle migrations
  (`apps/server-kill-switch/drizzle/0000..0009*.sql`) to the temp SQLite file
  before boot, splitting on `--> statement-breakpoint` and tolerating
  `already exists`. Without this the `kill_authorization_request` table is
  stale (no `action` column) and `POST /v1/kill-authorization/requests` 500s.

## Checks

| # | Check | Result |
|---|-------|--------|
| 1 | Append / audit-chain integrity (kill-authorization path) | **PASS** — fixed in this branch |
| 1c | Control: transition-path chain (`POST /v1/kill-switch/chaos`) recompute | PASS |
| 2 | Mutation rejected (routes + direct SQL) | PASS |
| 3 | Stop echoed (chaos STOPPED + real `EnforcementConsumer`, fail-closed) | PASS |
| — | `POST /v1/audit/verify` (assertion `audit:verify`) | 200 `{ok:true}` |

## Check 1 finding (the real product bug — FIXED in this branch)

**On `develop` @ `b5da409` the harness failed check 1.**
`apps/server-kill-switch/src/routes/kill-authorization.ts` `writeAudit()`
inserted `kill_switch_audit_log` rows via drizzle `.insert().values()`
**without** `prevHash`, `selfHash`, `serverHmac`, or `plainExplanation`. The
schema defaults (`self_hash=''`, `prev_hash='GENESIS'`, `server_hmac=''`,
`plain_explanation=''`) were applied, so **every kill-authorization audit row
had `self_hash=''` and `prev_hash='GENESIS'`**, breaking the ADR-140 hash chain.
Verified on `develop`: `POST /v1/audit/verify` returned
`409 {"ok":false,"reason":"self_hash_mismatch"}`.

The harness recomputes each row's `self_hash` independently (a re-implementation
of `canonicalEntryJson`/`computeSelfHash`, not a call into the code under test)
and fails on the first mismatch, naming the file above. The transition path
(`KillSwitchService.transitionTo` → `appendAuditEntry`) is recorded as a
**passing control**: its entry recomputes correctly, proving the recompute
algorithm is correct and the failure is specific to `writeAudit()`.

**Fix (this branch, `feat/proof-harness`):** `writeAudit()` now routes through
`appendAuditEntry()` from `../services/audit-chain` — the same chain-aware
function the transition path uses. `appendAuditEntry()` computes `prevHash`
(chaining to the prior `self_hash`), `selfHash`, and `serverHmac`, and inserts
under `BEGIN IMMEDIATE`; the route calls `writeAudit()` outside any transaction,
so the write lock is safe. The function's external call signature is unchanged,
so no caller changed. The now-unused `killSwitchAuditLog` import was removed
(`settings as settingsTable` retained). With the fix, the harness passes
(exit `0`, checks 1–3 all PASS) and `POST /v1/audit/verify` returns
`200 {"ok":true,"brokenAt":null}`.

## SKIPs (unimplemented claims — never faked)

- **Bitcoin / Taproot external anchor publish** — `anchorChainHead()` stores a
  signed payload locally; external publish is an explicit TODO stub
  (`apps/server-kill-switch/src/services/audit-chain.ts`).
- **`POST /v1/audit/anchor`** — not called (external publish is a stub).
- **BlueField-3 DPU hardware inhibit** — no DPU/hardware inhibit path exists.
- **3.4 ms hardware kill latency** — no hardware kill path; not measurable here.
- **Dignity Test score** — no Dignity Test scorer is implemented in this repo.
- **Agent-local trace/hash echo** — `AgentStateStore` has no trace/hash echo
  method (only `kill_switch_state` / `heartbeat` / `fingerprint`)
  (`apps/agent-plane/src/state.ts`).

## Honest status

On `develop` @ `b5da409` the harness failed check 1: it correctly detected a
real defect in the product's kill-authorization audit write (`writeAudit()`
bypassed the ADR-140 chain). This branch (`feat/proof-harness`) fixes
`writeAudit()` to route through `appendAuditEntry()`, so the harness now passes
(exit `0`, checks 1–3 all PASS, `POST /v1/audit/verify` → `200 {ok:true}`).
The fix is minimal and scoped to the audit write path; no other behavior was
changed. The three disclaimers above (no SIL, no hardware inhibit, no
deployment authorization) still hold — a passing run remains evidence about
specific code paths, not a deployment gate.
