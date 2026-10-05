# GATE Review Report — Third-Party Proof Harness (Stage 2)

**Reviewer:** Nikaya 🔍 (Stage 2)
**Date:** 2026-10-04
**Branch:** `feat/proof-harness`
**Artifacts:** `tests/proof-harness/run.ts`, `tests/proof-harness/lib.ts`, `PROOF.md`, root `package.json` (`proof` script), `proof/latest.json`
**Score:** **92/100**
**Status:** **PASS** (threshold ≥92)

> The harness's `exit 1` / check 1 FAIL is the **correct expected outcome** — it
> detects a real product defect. It is **not** a harness defect and was not
> treated as one.

---

## Independent reproduction

Ran `bun tests/proof-harness/run.ts` from the worktree:

```
[preflight] redis reachable: PONG
[migrate] applied 106 statements from 10 files
[redis] reset chaos state: {"ok":true,"output":"1"}
[boot] server healthy
[FAIL] check1_append — self_hash mismatch on kill-authorization audit row … writeAudit() inserts without prevHash/selfHash/serverHmac/plainExplanation (stored='', recomputed='02e22cfd…')
[PASS] check2_mutation — all 6 route attempts rejected/ineffective; direct SQL blocked by triggers; second read hash unchanged
[PASS] check3_stop_echoed — status left RUNNING → STOPPED; real EnforcementConsumer polled, transitioned, and isPaused() fail-closed
[audit/verify] status=409 body={"ok":false,"total":6,"brokenAt":"0b760ae0…","reason":"self_hash_mismatch"}
[proof] wrote proof/latest.json (exit 1)
===EXIT CODE: 1===
```

Confirmed: **exit 1, check 1 FAIL, checks 2/3 PASS, `POST /v1/audit/verify` → 409 `self_hash_mismatch`.** Matches the reported result exactly.

---

## Score breakdown

| Category | Score | Notes |
|----------|-------|-------|
| Security & isolation | 19/20 | Throwaway `HOME` + generated secrets + temp `DATA_DIR`; no real `~/.openclaw/secrets.json` touched; no secret values in `proof/latest.json`; no injection/path issues. −1: server inherits parent `process.env`. |
| Genuine proof / independence | 24/25 | Independent re-implementation of `canonicalEntryJson`/`computeSelfHash` (not an import); real server; real `EnforcementConsumer`; passing control isolates the bug; `audit/verify` cross-check. −1: `adversary_sentence` is a static string; some check-2 route attempts 404 (weak evidence). |
| Spec conformance | 23/25 | One command ✓; pass\|fail\|skip ✓; `proof/latest.json` fields ✓; exit 0 only if 1–3 pass ✓; PROOF.md disclaimers ✓; SKIPs named ✓; no product-behavior changes ✓. −2: Redis prerequisite not documented as a runnable command; fixed port has no collision handling. |
| PROOF.md honesty | 14/15 | REDIS_URL caveat ✓; headless-WebAuthn limitation ✓; SKIP list accurate ✓; disclaimers ✓. −1: doesn't document the docker prerequisite command or the final Redis state. |
| Robustness / flakiness | 12/15 | Preflight skip, timeouts, 429 retries, `finally` cleanup, temp dirs. −3: shared Redis left `STOPPED`; fixed port collision → fatal; hardcoded container name. |
| **Total** | **92/100** | **PASS** |

---

## Verified strengths

1. **No secret leakage.** `proof/latest.json` contains only public hashes, empty `server_hmac`, and redacted `authorization: '***'`. No secret values, no `tsauth_`, no tokens. The server is given a throwaway `HOME` (`lib.ts:setupHome`) so the real `~/.openclaw/secrets.json` is never read or written.
2. **Genuine independence.** `lib.ts` re-implements the hash algorithm rather than importing `services/audit-chain.ts`. The passing control (transition path via `appendAuditEntry`) proves the recompute distinguishes correct from broken rows — so check 1's FAIL is not a recompute artifact.
3. **Real, not mocked.** Check 3 instantiates the actual `apps/agent-plane/src/enforcement.ts` `EnforcementConsumer` against the live server (no `fetch` mock) and asserts `isPaused()` fail-closed on unknown state.
4. **No softened passes.** Check 1 fails hard on mismatch; no try/catch swallows it; `exit_code` is derived from all checks passing.
5. **The "different broken row" note is accurate.** I booted the server and dumped all rows: the first broken row (`d8965b01…`, "Kill authorized by human WebAuthn signature") is a *different* `writeAudit()` row than check 1's route row (`65c679b2…`), both with `prev=GENESIS, self=''`. The `audit_verify.note` correctly warns about this.
6. **SKIP claims are accurate.** Verified: `anchorChainHead()` external publish is a TODO stub; no DPU/hardware path; no Dignity Test scorer; `AgentStateStore` has only `kill_switch_state`/`heartbeat`/`fingerprint`.
7. **No product code modified.** `git status` shows only `package.json` (+1 line) and the new untracked harness files.

---

## Required fixes (MEDIUM — recommended, non-blocking)

1. **[MEDIUM] Restore shared Redis state.** `run.ts:285-289` (`finally`) stops the server and removes the temp dir but never restores `chaos:kill-switch`. After a run the shared key is left `STOPPED` (verified: `GET chaos:kill-switch` → `STOPPED`, TTL −1), which can silently pause any other local consumer. Capture the pre-run value and restore it (or `DEL`) in `finally`.
2. **[MEDIUM] Document / parameterize the Redis prerequisite.** `lib.ts:129` and `run.ts:99,725` hardcode container `align-redis-node-1` and port `6380`. `PROOF.md` names the dependency but gives no runnable setup command (e.g. `docker compose up -d redis-node-1`). A stranger's clone without that exact container gets `skip` (exit 2) with no path to pass/fail. Document the command and/or make the container/port env-configurable.
3. **[MEDIUM] Handle port 3999 collision.** `lib.ts:22` fixes `PORT = 3999`; if occupied, boot fails and the harness exits 1 (fatal) rather than a legible skip. Probe for a free port or emit a named skip.

## Low / nits

4. **[LOW]** `proof/latest.json` is not gitignored (`.gitignore` has no `proof` entry) — a machine-local artifact with trace ids would be committed. Add `proof/` or document it as intentional.
5. **[LOW]** `lib.ts:109` records non-idempotent migration errors but never fails; consider surfacing `errors.length > 0` as a check.
6. **[NIT]** `run.ts:176` `adversary_sentence` is a static string; consider deriving it from the observed result.
7. **[NIT]** Stale `/tmp/proof-harness-*` dirs exist from earlier runs (historical; current `finally` cleanup works — my run left none).

---

## Verdict

**PASS — 92/100. Approved for merge as a proof artifact.**

No HIGH findings (no build break, runtime error, security vuln, or memory leak). The harness genuinely proves what it claims, is honestly documented, and correctly reports a real product bug via `exit 1`. The MEDIUM items above are recommended hardening for a tool a stranger will run; none invalidate the proof.

**Do not "fix" the FAIL:** `apps/server-kill-switch/src/routes/kill-authorization.ts` `writeAudit()` inserts `kill_switch_audit_log` rows without `prevHash`/`selfHash`/`serverHmac`/`plainExplanation`, so schema defaults (`self_hash=''`, `prev_hash='GENESIS'`) break the ADR-140 chain. The transition path (`services/kill-switch.ts` → `appendAuditEntry`) is correct.
