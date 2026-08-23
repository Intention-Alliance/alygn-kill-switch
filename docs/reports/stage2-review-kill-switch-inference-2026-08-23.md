# Stage 2 Full Review — Kill-Switch Inference Verification Layer + Live Registry (Cycle 3)

> **Reviewer:** Nikaya (Reviewer, Stage 2)
> **Date:** 2026-08-23
> **Branch:** `review/kill-switch-inference-layer`
> **Scope:** Cycle 3 re-review — merge-preparedness verification of the **P2-1 fix** (machineId threading through the inference-verification middleware path), confirmation that P2-2 (durable audit persistence) is a documented accepted follow-up, and a full regression + type-check gate check.
> **Spec:** `docs/specs/KILL-SWITCH-INFERENCE-VERIFICATION-SPEC.md`
> **ADR:** `docs/adr/ADR-2026-08-23-kill-switch-inference-verification.md`
> **Stage 1 (Chanshuk):** 95/100 PASS (Cycle 3)
> **Stage 2 (Nikaya):** 93/100 PASS (Cycle 1) → 91/100 FAIL (Cycle 2, P2-1 machineId middleware gap)
> **Stage 3 (Volthiz):** PASS (HIGH validateVerifierConfig + LOW STOPPED→STOPPED)
> **Fix commit:** `434386c6` — "fix(kill-switch): thread machineId through inference-verification middleware (P2-1)"

---

## Overall Verdict: **PASS** (with required MEDIUM fix before merge)

**Score: 93/100**

The **blocking P2-1 finding from Cycle 2 is fully fixed and verified**. The
`machineId` is now extracted from the inference request body in `index.ts:175`
and threaded end-to-end through the middleware → `VerificationService` →
`triggerStop()` → `transitionTo('STOPPED', { machineId })`, so the primary
automated-kill path records the correct machine in the audit trail (spec §d.1).

P2-2 (transitions not persisted to the durable `kill_switch_audit_log` chain)
is confirmed as a **pre-existing, documented, accepted follow-up** — it is not
a merge blocker for this PR.

The full suite is **550 pass / 0 fail** (up from 541), and the production
kill-switch code is type-clean. **However**, the new test file
`inference-verification.test.ts` introduces **2 TypeScript errors** that break
the app-level `tsc --noEmit` gate (the project's `type-check` script). These
are test-file-only, do not affect runtime or CI hard-gate (the CI `type-check`
job swallows failures via `|| echo`), and are trivially fixable — but they
contradict the "0 type errors" claim in the fix commit and must be cleaned up
before merge.

---

## P2-1 Fix Verification: **FIXED** ✅

The Cycle 2 blocking finding (machineId dropped in the inference-verification
middleware path) is **fully resolved**. Verified the complete chain:

| Layer | Evidence | Status |
|-------|----------|--------|
| **Call-site extraction** | `index.ts:175` now passes `(body as any)?.machineId` as the 6th arg: `checkInferenceVerification(method, url, body, verification, requestId, (body as any)?.machineId)` | ✅ |
| **Middleware signature** | `inference-verification.ts:48` accepts `machineId?: string` as the 6th param | ✅ |
| **Service threading** | `inference-verification.ts:79` passes `machineId` into `service.handleInferenceRequest({ prompt, output, requestId, machineId })` | ✅ |
| **Service → kill trigger** | `verification-service.ts:101` → `triggerStop(ctx.machineId)` → `transitionTo('STOPPED', { ..., machineId })` (`:175`) | ✅ |
| **Audit metadata** | `TransitionMetadata`/`AuditEntry` carry `machineId?` (`kill-switch.ts:37-38,45-46`) | ✅ |
| **Test coverage** | New `inference-verification.test.ts` (9 cases) — "threads machineId from request body to verification service (P2-1 fix)" **passes** | ✅ |

The `machineId` is now threaded through **all** automated-kill paths (both the
internal transition endpoint and the inference-verification middleware), fully
satisfying spec §d.1's requirement that the audit log distinguish which machine
triggered an automated kill.

---

## P2-2 (Pre-existing, Auditability): **Documented Accepted Follow-up** ✅

Confirmed **not a merge blocker** for this PR:

- The Cycle 2 report explicitly classified P2-2 as **"pre-existing, auditability"**
  and listed it under **"Recommended Next Steps" item #2** as a **follow-up**:
  "Wire `transitionTo` (or a `bcp:kill-switch:chaos` subscriber) to persist
  transitions to `kill_switch_audit_log` via `appendAuditEntry`, including
  `machineId`."
- The Cycle 2 verdict routed back to coder **only for P2-1** (the machineId
  middleware gap), not for P2-2.
- P2-2 is a pre-existing architectural gap (not introduced by the P2 fixes) and
  is documented as an accepted follow-up. It does not block this PR's merge.

---

## No New Regressions

| Check | Result | Status |
|-------|--------|--------|
| **Full test suite** | `bun test src/` → **550 pass / 0 fail** (39 files, 1519 expects) | ✅ (up from 541) |
| **New middleware tests** | `inference-verification.test.ts` → **9 pass / 0 fail** | ✅ |
| **Production code type-check** | Kill-switch production source is type-clean | ✅ |
| **App-level `tsc --noEmit`** | **2 errors — both in the new test file** | ❌ **REGRESSION** |

### ⚠️ NEW FINDING — Type-check regression in the new test file (MEDIUM)

The app-level type-check (`bunx tsc --noEmit` in `apps/server-kill-switch`,
the project's `type-check` script) reports **2 errors, both in the new test
file** `src/middleware/__tests__/inference-verification.test.ts` introduced by
the P2-1 fix commit:

1. **`inference-verification.test.ts:27`** — `error TS2741`: the mock
   `VerificationResult` object is missing the required `model: string` property
   (the `VerificationResult` interface at `verifier.ts:28` requires `model`).
2. **`inference-verification.test.ts:75`** — `error TS2353`: `{ foo: 'bar' }`
   is passed as a body, but `checkInferenceVerification` types `body` as
   `{ prompt?: string; output?: string } | null`, so `foo` is not a known
   property.

**Severity assessment:**
- **Not a hard CI break.** The CI `type-check` job runs
  `bun run type-check || echo "..."` and the root script runs
  `bun --filter '*' type-check || echo 'no type-check'` — both **swallow** the
  non-zero exit, so CI stays green. The `test`/`build` jobs `need: [type-check]`
  but are never blocked because type-check always exits 0.
- **Test-file-only.** The production kill-switch code (including the P2-1 fix at
  `index.ts:175`) is type-clean. Runtime is unaffected (Bun runs tests without
  type-checking).
- **Trivially fixable.** Add `model: 'test-model'` to the mock result (line 27)
  and cast the `{ foo: 'bar' }` body to the expected type (line 75).

**Why this matters:** The P2-1 fix commit claims "0 type errors," and the
review scope explicitly lists "Type check clean" as a merge-readiness
criterion. The 2 errors are a genuine regression from the prior clean state and
should be fixed before merge to keep the type-check gate honest.

---

## Remaining Findings

### MEDIUM (required before merge)

- **M-1 (new). Type-check regression in `inference-verification.test.ts`.**
  Two TS errors (missing `model` at line 27; unknown `foo` property at line 75)
  break the app-level `tsc --noEmit` gate. **Fix:** add `model: 'test-model'` to
  the mock `VerificationResult` and cast the `{ foo: 'bar' }` body literal to
  `{ prompt?: string; output?: string }`. Does not affect runtime or CI hard
  gate, but must be cleaned up to restore the "0 type errors" claim.

### P3 — Hygiene (carried, non-blocking)

- **P3-1 (carried). Dead empty branch in `verifyAndAct`.** `verification-service.ts` still contains the empty `if (result.verdict === 'REVIEW' || result.degraded) { /* ... */ }` block. Remove it.
- **P3-2 (carried). Startup seed sweep not guarded by `_running`.** `registry-scheduler.ts:216-219` calls `runSweepTick()` directly at startup without setting `_running`.
- **P3-3 (carried). Shared `_running` guard** between sweep and probe intervals in `registry-scheduler.ts`.
- **P3-4 (carried, mitigated). Verifier reads env directly.** `verifier.ts` falls back to `process.env.KILL_SWITCH_VERIFIER_*`; `index.ts` injects validated config values, so this is only a defensive default.
- **P3-5 (carried). Base URL default inconsistency.** `schema.ts` defaults `verifierBaseUrl` to `http://localhost:11434`; `verifier.ts` to `http://127.0.0.1:11434`.
- **P3-6 (carried). Registry route reads env directly** for heartbeat timeout (`routes/registry.ts:52`).
- **P3-7 (carried). ADR-136 extension consequence note.** The ADR's Consequences section does not explicitly note that the internal transition endpoint extends ADR-136's human-assertion requirement.
- **P3-8 (carried). Dev/staging `killSwitchVerificationEnabled: true` feature flag.** Functionally safe (ANDed with `verifyEnabled: false` everywhere).
- **P3-10 (carried). Rate-limit 429 reveals the window.** `internal-kill-switch.ts` returns `retryAfter: 60` on 429. Minimal exposure; acceptable.

---

## Security Checklist (10 focus areas)

| # | Focus area | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | **Internal kill-switch transition endpoint security** | **PASS** | Key-gated (timing-safe `secureCompare`), rate-limited (10/60s per IP, after auth), accepts only STOPPING/STOPPED (preserves ADR-136), machineId extracted from body ✓. Loopback enforced by Docker port mapping. |
| 2 | **Verifier model injection** | **PASS** (P2-B mitigation) | Delimiters + injection-safety preamble + strict first-line parser + REVIEW default. Residual risk documented in ADR. |
| 3 | **Verification service kill trigger** | **PASS** | UNSAFE → `transitionTo('STOPPED', { ..., machineId })` correct. STOPPED→STOPPED guard via `getCurrentState()` + 409 catch. **P2-1 now fixed** — machineId threaded through the middleware path. |
| 4 | **Registry scheduler race conditions** | **PASS** (P3-2, P3-3) | `_running` guard prevents interval-tick overlap; per-tick try/catch keeps the loop alive. |
| 5 | **Heartbeat collector FK safety** | **PASS** | Skips agent upsert for non-admitted machines; Drizzle parameterization prevents SQL injection. |
| 6 | **Inference verification middleware** | **PASS** | After gate + auth, before dispatcher. Async: fire-and-forget. Sync: awaits + 403 on UNSAFE. **P2-1 fixed** — machineId extracted from body and threaded to service. Now directly unit-tested (9 cases). |
| 7 | **DB schema verification_event** | **PASS** | Hash fields correctly typed; NULL-hash bypass impossible. Matches spec §e.3. |
| 8 | **Config validation** | **PASS** | `validateVerifierConfig` wrapped in try/catch at call-site (HIGH fixed); `verificationEnabled` is `let` for runtime disable. |
| 9 | **Test coverage adequacy** | **PASS** | UNSAFE→STOPPED ✓, machineId threading (middleware + service) ✓, delimiter wrapping ✓, preamble appending ✓, rate-limit 429 + per-IP ✓, async vs sync ✓, 403-reject path ✓. **P3-9 (middleware coverage gap) now closed** by the new test file. |
| 10 | **Spec adherence** | **PASS** | Sections (a)-(f) implemented. **P2-1 deviation resolved** — machineId now in automated-kill audit metadata. **P2-2** (durable audit persistence) is a documented accepted follow-up. |

---

## Spec Adherence Verdict

**Compliant.** P2-1 (the only blocking deviation) is resolved. P2-2 is a
documented accepted follow-up.

| Section | Status | Notes |
|---------|--------|-------|
| **(a) Live Registry** | ✅ Compliant | Scheduler + heartbeat collector + routes verified. |
| **(b) Inference Verification** | ✅ Compliant | Verifier + service + middleware present; machineId threaded through all paths (P2-1 fixed). |
| **(c) Default Verifier Model** | ✅ Compliant | `qwen2.5:0.5b`, system prompt + preamble, config validation wired, `verifyEnabled: false` everywhere. |
| **(d) Integration Points** | ✅ Compliant | Middleware after gate+auth; scheduler at boot; internal transition endpoint before `checkAuth`; UNSAFE→STOPPED in-process with machineId. |
| **(e) File Plan** | ✅ Compliant | All new + modified files present; `verification_event` table matches spec §e.3. |
| **(f) Testing Plan** | ✅ Compliant | All listed test files present + comprehensive; **550 pass / 0 fail**. Middleware now directly tested (P3-9 closed). |

---

## Regression Risk Assessment

- **`index.ts`:** P2-1 fix is additive (passes an optional `machineId` arg). No behavior change to existing routes. **No regression.**
- **`inference-verification.ts`:** machineId threading is additive (optional param). Async/sync behavior unchanged. **No regression.**
- **`verification-service.ts` / `kill-switch.ts`:** machineId threading is additive (optional field). **No regression.**
- **Test baseline:** 550 pass / 0 fail — full green, up from 541. **No test regression.**
- **Type-check:** ⚠️ **2 new errors in the new test file** (M-1). Production code type-clean. Does not break CI (soft gate). **Regression to be fixed before merge.**

---

## Recommended Next Steps

1. **M-1 (required before merge):** Fix the 2 type errors in
   `inference-verification.test.ts` — add `model: 'test-model'` to the mock
   `VerificationResult` (line 27) and cast the `{ foo: 'bar' }` body literal to
   the expected type (line 75). Re-run `bunx tsc --noEmit` to confirm 0 errors.
2. **P2-2 (follow-up, not blocking):** Wire `transitionTo` (or a
   `bcp:kill-switch:chaos` subscriber) to persist transitions to
   `kill_switch_audit_log` via `appendAuditEntry`, including `machineId`, so
   the durable audit trail satisfies spec §d.1.
3. **P3 hygiene:** Remove the dead branch (P3-1), align base URL defaults
   (P3-5), add the ADR-136 consequence note (P3-7).
4. **Confirm deployment enforces loopback-only** for `/v1/internal/*` (relies
   on Docker port mapping `127.0.0.1:3000:3000`).
5. **Verify the verifier model is pulled and reachable** at the production
   Ollama endpoint before enabling `KILL_SWITCH_VERIFY_ENABLED=true` (safe
   default keeps it off until then).

---

## Merge Readiness Statement

**Conditionally approved for merge.** The blocking P2-1 finding is fully fixed
and verified, P2-2 is a documented accepted follow-up (not a blocker), and the
full suite is green (550 pass / 0 fail). The only outstanding item is **M-1**:
2 trivial TypeScript errors in the new test file that break the app-level
`tsc --noEmit` gate (soft — does not fail CI, test-file-only, does not affect
runtime). **Fix M-1 (add `model` to the mock result + cast the `{foo:'bar'}`
body), re-run `tsc --noEmit` to confirm 0 errors, then merge.** No P1 or
blocking P2 remains.
