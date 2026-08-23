# Stage 1 Code-Quality Review — Kill-Switch Inference Verification Layer + Live Registry (Cycle 2)

> **Reviewer:** Chanshuk (Dev Lead)
> **Date:** 2026-08-23
> **Branch:** `review/kill-switch-inference-layer`
> **Scope:** Keridz (registry + verification service + middleware + routes + tests) + Rokthar (config schema + env overrides + validation + config tests)
> **Spec:** `docs/specs/KILL-SWITCH-INFERENCE-VERIFICATION-SPEC.md`
> **ADR:** `docs/adr/ADR-2026-08-23-kill-switch-inference-verification.md`
> **Cycle:** 2 (re-review after P1+P2 fixes from Cycle 1, which scored 62/100 FAIL)

---

## Overall Verdict: **PASS**

**Score: 88/100**

The blocking P1 defect from Cycle 1 (config field-name mismatch that made the
entire verification feature dead code at runtime) is **fixed**. All P2 findings
are also resolved. The feature is now correctly wired end-to-end: config schema
field names match what `index.ts` reads, the feature flag is consulted, the
verifier config is validated at startup, the agent FK risk is handled, the
missing tests are created, and the safe `verifyEnabled: false` default is
applied across all environments.

The implementation is structurally sound, TypeScript-clean (no `any` abuse in
the new code), has strong error handling (fail-open for pass-through, fail-closed
for safety), and comprehensive test coverage. The test baseline is confirmed:
**533 pass / 1 fail** (pre-existing `ProviderRegistry`), zero regressions.

Remaining findings are all **P3 hygiene** items (dead empty branch, shared
`_running` guard, base URL default inconsistency, missing rate limit on the
internal endpoint, verifier env fallback, ADR documentation gap). None block
production.

---

## Cycle 1 Fixes Verification

| Finding | Status | Evidence |
|---------|--------|----------|
| **P1-1** Config field-name mismatch in `index.ts` (`enabled`/`model`/`baseUrl`/`timeoutMs`/`mode` vs schema `verifyEnabled`/`verifierModel`/`verifierBaseUrl`/`verifierTimeoutMs`/`verifyMode`) | ✅ **FIXED** | `index.ts` now reads `verificationConfig?.verifyEnabled`, `verifierModel`, `verifierBaseUrl`, `verifierTimeoutMs`, `verifyMode`. The `(getConfig() as any)` cast is replaced with typed `getConfig().verification`. `autoKillOnUnsafe` is intentionally not read from config (spec mandates UNSAFE always auto-kills; service defaults it to `true`). |
| **P2-1** `validateVerifierConfig`/`validateVerifierReachability` never called | ✅ **FIXED** | Both are now called in `index.ts` at startup when `verificationEnabled` is true. Config problems and unreachable verifier are logged as degraded warnings (fail-fast intent preserved without crashing boot). |
| **P2-2** `killSwitchVerificationEnabled` feature flag never consulted | ✅ **FIXED** | `index.ts` now ANDs `isFeatureEnabled('killSwitchVerificationEnabled')` with `verificationConfig?.verifyEnabled`. Both must be true for the feature to activate. |
| **P2-3** Agent FK risk in `heartbeat-collector.ts` | ✅ **FIXED** | `upsertAgent` now queries the `machines` inventory table first; if no `machines` row exists (discovered-but-not-admitted), it skips the agent upsert with a debug log instead of throwing an FK violation. `lastSeen` still updates via the orchestrator. |
| **P2-4** Missing tests (`heartbeat-collector.test.ts`, `internal-kill-switch.test.ts`) | ✅ **FIXED** | Both created. `heartbeat-collector.test.ts` covers delegation, ADMITTED upsert, non-admitted skip, update-not-reinsert, no-agentId. `internal-kill-switch.test.ts` covers 401/403/200 auth, STOPPED transition, 409 idempotency, disallowed state 400, non-POST 405, non-path passthrough. |
| **P2-5** Dev/staging `verifyEnabled: true` contradicts spec | ✅ **FIXED** | `verifyEnabled: false` in development, staging, AND production. `verifier-config.test.ts` asserts dev/staging/production all disable verification by default. |

---

## New Findings (Cycle 2)

### P3 — Hygiene (non-blocking)

- **P3-1 (carried). Dead empty branch in `verifyAndAct`.** `verification-service.ts:104-106` still contains the empty `if (result.verdict === 'REVIEW' || result.degraded) { /* ... */ }` block. Harmless but dead code — remove it.

- **P3-3 (carried). Shared `_running` guard between sweep and probe intervals.** `registry-scheduler.ts:175-195` — both `setInterval` callbacks use the same module-level `_running` flag. A long-running sweep tick would skip a probe tick (and vice versa). Given 60s/120s intervals and fast ticks this is unlikely to matter, but separate guards would be cleaner.

- **P3-4 (carried, mitigated). Verifier reads env directly.** `verifier.ts:130-132` still falls back to `process.env.KILL_SWITCH_VERIFIER_*`. **Mitigated:** `index.ts` now injects the validated config values via `InferenceVerifier({ model, baseUrl, timeoutMs })`, so the env fallback is only a defensive default when opts are absent. A non-numeric `KILL_SWITCH_VERIFIER_TIMEOUT_MS` would still yield `NaN` → `AbortSignal.timeout(NaN)` throws, but this path is not hit in normal operation. Low risk.

- **P3-5 (carried). Base URL default inconsistency.** `schema.ts:109` defaults `verifierBaseUrl` to `http://localhost:11434`; `verifier.ts:43` defaults to `http://127.0.0.1:11434`. Functionally equivalent but inconsistent — align to one canonical default.

- **P3-6 (carried). Internal transition endpoint lacks rate limiting.** `internal-kill-switch.ts` is key-gated (timing-safe `secureCompare`) but has no rate limit, unlike the existing `/v1/internal/api-keys/*` routes (10 req/min). A leaked/compromised key could hammer transitions. Add the same sliding-window limiter.

- **P3-7 (new). ADR does not flag the ADR-136 extension as a consequence.** Spec §d.1 requires the internal transition endpoint to be "flagged in the ADR as a consequence." The spec and `internal-kill-switch.ts` code comments document it thoroughly as a deliberate ADR-136 extension, but the ADR's Consequences section does not explicitly note that it extends ADR-136's human-assertion requirement. Add a consequence note.

- **P3-8 (new, minor). Dev/staging `killSwitchVerificationEnabled: true` feature flag.** The feature flag defaults to `true` in dev/staging env files (only `false` in the schema default and production). Since `index.ts` ANDs it with `verifyEnabled` (which is `false` everywhere), the feature is functionally off — safe. But it deviates from the strict "default false" wording in spec §c.2. Acceptable as a demo-toggle convenience; note it.

---

## Spec Adherence Checklist

| Section | Status | Notes |
|---------|--------|-------|
| **(a) Live Registry Service** | ✅ **Compliant** | `registry-scheduler.ts` (startup seed sweep, periodic sweep, provider probe for ADMITTED only, online/offline reconciliation, `_running` guard, per-tick try/catch, provider-status-change events), `heartbeat-collector.ts` (agent upsert + liveness + FK-safe), `routes/registry.ts` (`GET /v1/registry/overview` with online/offline computed on read from `lastSeen`). Matches spec §a.2–a.5. |
| **(b) Inference Verification Service** | ✅ **Compliant** | `verifier.ts` (verdict extraction, REVIEW+degraded fallback, timeout/unreachable handling, health check), `verification-service.ts` (async/sync modes, UNSAFE→STOPPED, STOPPED→STOPPED guard, event persistence), `inference-verification.ts` middleware (after gate + auth, before dispatcher). **Now active at runtime** (P1-1 fixed). |
| **(c) Default Verifier Model** | ✅ **Compliant** | Model `qwen2.5:0.5b`, system prompt with inline fallback, `VerificationConfigSchema` + env overrides, `validateVerifierConfig`/`validateVerifierReachability` wired into startup (P2-1 fixed), `verifyEnabled: false` everywhere (P2-5 fixed). |
| **(d) Integration Points** | ✅ **Compliant** | Middleware placed after gate + auth, before dispatcher (`index.ts`). Scheduler starts at boot. Internal transition endpoint wired before `checkAuth`, mirrors `/v1/internal/*` key pattern. UNSAFE → `transitionTo('STOPPED')` in-process. Feature flag ANDed with `verifyEnabled` (P2-2 fixed). |
| **(e) File Plan** | ✅ **Compliant** | All new files + modified files present per spec §e.1/e.2. `verification_event` table matches spec §e.3 exactly (hashes, indexes, boolean modes). |
| **(f) Testing Plan** | ✅ **Compliant** | `verifier.test.ts`, `verification-service.test.ts`, `registry-scheduler.test.ts`, `verifier-config.test.ts`, `heartbeat-collector.test.ts`, `internal-kill-switch.test.ts` all present and comprehensive (P2-4 fixed). Baseline confirmed: 533 pass / 1 fail (pre-existing ProviderRegistry). |

---

## Code Quality Review

- **TypeScript strict:** New files use typed config access (`getConfig().verification`), no `any` casts in the new verification/registry code. The only type-check errors are the pre-existing `@align/shared-types` workspace module-resolution issue (affects existing files equally, not a regression) and pre-existing `onboarding.ts`/`websocket-manager.ts` errors.
- **Named exports:** All new modules use named exports (`InferenceVerifier`, `VerificationService`, `HeartbeatCollector`, `startRegistryScheduler`, `checkInferenceVerification`, etc.). Consistent with project conventions.
- **Error handling:** Verifier fails open for pass-through + fails closed for safety (REVIEW + degraded, never auto-kills on outage). Async verification runs detached and cannot throw into the response path. STOPPED→STOPPED double-transition guarded. Errors logged server-side, generic responses to callers.
- **Security:** Internal transition endpoint key-gated via timing-safe `secureCompare`, accepts only STOPPING/STOPPED (never ARM/RESUME — preserves ADR-136's defense against autonomous self-deactivation), audits with `initiatedBy: 'system:*'`. Hash-only storage of prompt/output in `verification_event`.
- **DB Schema:** `verification_event` uses Drizzle patterns, stores sha256 hashes (not raw content), sensible indexes on requestId/verdict/createdAt.

---

## Regression Risk Assessment

- **`index.ts`:** Existing routes preserved. New internal-kill-switch and registry routes are additive. Verification middleware is now gated on `verificationEnabled` (feature flag AND `verifyEnabled`), which defaults off — no behavior change in default config. **No regression.**
- **`discovery.ts`:** Heartbeat response contract preserved; `agentRegistered` field is additive. **Non-breaking.**
- **`schema.ts`:** `verification_event` table is additive (new table, no alteration of existing tables). **Non-breaking.**
- **Test baseline:** 533 pass / 1 fail (pre-existing `ProviderRegistry`) — confirmed, zero regressions.

---

## Recommended Next Steps

1. **Address P3 hygiene** in a follow-up: remove the dead branch (P3-1), add rate limiting to the internal endpoint (P3-6), align base URL defaults (P3-5), add the ADR-136 consequence note to the ADR (P3-7).
2. **Confirm deployment enforces loopback-only** for `/v1/internal/*` (relies on Docker port mapping `127.0.0.1:3000:3000`, consistent with existing internal routes).
3. **Verify the verifier model is pulled and reachable** at the production Ollama endpoint before enabling `KILL_SWITCH_VERIFY_ENABLED=true` (the safe default keeps it off until then).

**Ready for Stage 2 review (Nikaya).**
