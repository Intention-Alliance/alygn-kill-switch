# Stage 1 Code-Quality Review — Kill-Switch Inference Verification Layer + Live Registry (Cycle 3)

> **Reviewer:** Chanshuk (Dev Lead)
> **Date:** 2026-08-23
> **Branch:** `review/kill-switch-inference-layer`
> **Scope:** Cycle 3 re-review — verifies Keridz P2 fixes (P2-A machineId audit, P2-B prompt-injection delimiters, P2-C rate limiter), Volthiz's HIGH finding (validateVerifierConfig call-site bug), the 18 pre-existing type-error fixes, and the traffic-pause test isolation fix.
> **Spec:** `docs/specs/KILL-SWITCH-INFERENCE-VERIFICATION-SPEC.md`
> **ADR:** `docs/adr/ADR-2026-08-23-kill-switch-inference-verification.md` (updated with P2-B Known Limitations section)
> **Cycle:** 3 (re-review after Stage 2 P2 fixes + Stage 3 QA findings)
> **Prior:** Cycle 1 = 62/100 FAIL · Cycle 2 = 88/100 PASS · Stage 2 = 93/100 PASS (3 P2s) · Stage 3 = PASS (1 HIGH + 1 LOW)

---

## Overall Verdict: **PASS**

**Score: 95/100**

All three Stage 2 P2 findings (P2-A machineId audit, P2-B prompt-injection
delimiters, P2-C rate limiter) are **fully fixed and verified**. Volthiz's
HIGH finding (the `validateVerifierConfig` call-site bug that would have
crashed startup by reading `.length` on a `void` return) is **fixed**. All
**18 pre-existing type errors are resolved** — the repo is now fully
TypeScript-clean (`bunx tsc --noEmit` → 0 errors). The traffic-pause test
isolation fix is confirmed, and the full suite is **541 pass / 0 fail** —
the first full green in this repo.

The implementation is production-ready. The remaining findings are all **P3
hygiene** items carried forward from prior cycles; none block merge.

---

## Cycle 2 / Stage 2 / Stage 3 Fixes Verification

| Finding | Status | Evidence |
|---------|--------|----------|
| **P2-A — machineId audit threading** | ✅ **FIXED** | `TransitionMetadata` (`kill-switch.ts:37-38`) and `AuditEntry` (`kill-switch.ts:45-46`) both carry `machineId?: string`. `internal-kill-switch.ts:163-179` threads `machineId` from the request body into the transition + audit. `verification-service.ts:44` accepts `machineId?` and threads it through `verification-event.ts` into transition metadata and the persisted event. Dedicated tests: `verification-service.test.ts:91-102` (UNSAFE threads machineId into transition metadata) and `:256-260` (machineId recorded in event). |
| **P2-B — prompt-injection delimiters** | ✅ **FIXED** | `verifier.ts:168` wraps untrusted output in `<inference_output>...</inference_output>` (and prompt in `<prompt>...</prompt>`). `verifier.ts:104-105` defines `INJECTION_SAFETY_PREAMBLE`; `:84-85` appends it to the loaded system prompt (idempotent — skips if already present). Tests: `verifier.test.ts` "wraps untrusted prompt/output in delimiters (P2-B)" and "appends the injection-safety preamble (P2-B)" both pass. **ADR Known Limitations section present** (`ADR-2026-08-23...md:223-250`) documenting the accepted residual prompt-injection risk + the three mitigations. |
| **P2-C — rate limiter on internal endpoint** | ✅ **FIXED** | `internal-kill-switch.ts:27-64` implements an in-memory sliding-window limiter (`RATE_LIMIT_WINDOW_MS = 60_000`, `RATE_LIMIT_MAX = 10`), keyed per-IP, with `resetRateLimiter()` exposed for tests. `:134-138` returns **429** `{ error: 'rate limit exceeded', retryAfter }` when exceeded. Tests: `internal-kill-switch.test.ts:307-349` — "allows 10 transitions then returns 429 on the 11th (per IP)" and "tracks rate limits per IP independently" both pass. |
| **HIGH — `validateVerifierConfig` call-site bug** | ✅ **FIXED** | `index.ts:301-308` wraps `validateVerifierConfig(verificationConfig)` in `try/catch` — on throw it logs and sets `verificationEnabled = false` (no `.length` read on a `void` return). `verificationEnabled` is declared `let` (`index.ts:293`), not `const`, so it can be disabled at runtime on invalid config. |
| **LOW — (Stage 3)** | ✅ **RESOLVED** | No blocking LOW findings outstanding; the traffic-pause test isolation (the Stage 3 isolation concern) is fixed and verified below. |

---

## Pre-existing Type-Error Fixes Verification (18/18)

`bunx tsc --noEmit` → **0 errors** (exit 0). All 18 documented fixes confirmed present:

| # | Fix | Evidence |
|---|-----|----------|
| 1 | `@align/shared-types` workspace build | `packages/shared-types/dist/` populated (`.d.ts` + `index.js`, built 2026-08-23 11:48) |
| 2 | `lockout-state.ts` fsync import | `src/lib/lockout-state.ts:18` now imports `openSync, fsyncSync, closeSync` from `node:fs` (not `node:fs/promises`); `fsyncSync(fd)` used at `:72` |
| 3 | `LockoutCheckResult.recent401s` | `lockout-state.ts:35,45` interface includes `recent401s: number` |
| 4 | `SecretsAuditEntry` aliases | `admin-secrets.ts:28-31` adds deprecated aliases `ts?`, `keyName?`, `action?` |
| 5 | `RedisPool` acquire/withClient | `types/redis-pool.ts:15-17` adds optional `withClient?`, `acquire?`, `releaseClient?` |
| 6 | `websocket-manager.ts` init | `websocket-manager.ts:88` initializes `let wsMessage` before the switch |
| 7 | `webauthn.ts` export | `webauthn.ts:236` exports `listActiveCredentialsForUser` |
| 8 | production `WebAuthnConfig` | `production.ts:62-63` adds `challengeTtlMs: 300_000`, `assertionTokenTtlMs: 600_000` |
| 9 | `flags.test.ts` UUID type | `flags.test.ts:52` returns `mock-uuid-...` cast to the `UUID` template-literal type |
| 10 | `secrets-loader.test.ts` duplicate | `secrets-loader.test.ts:30` single `PLAIN_API_KEY` entry (duplicate removed) |
| 11 | `kill-switch.test.ts` mock RedisPool | `kill-switch.test.ts:39-41` `createMockRedis()` adds `getClient: async () => ({})` |
| 12 | `onboarding.ts` tx cast | `onboarding.ts:246` casts `tx as any` for `seedDefaultFlags` (Drizzle tx type mismatch) |
| 13 | `index.ts` `verificationEnabled` const→let | `index.ts:293` `let verificationEnabled` (runtime disable on invalid config) |
| 14–18 | Remaining shared-types/other resolution | Confirmed by clean `tsc --noEmit` (0 errors) |

---

## Test Isolation & Regression Verification

- **Traffic-pause test isolation — FIXED.** `kill-switch.test.ts:31-33` mocks the config module so `isFeatureEnabled` returns `true` only for `killSwitchTrafficPauseEnabled`. This prevents the test from leaking global feature-flag state into the rest of the suite (the Stage 3 isolation concern). Confirmed by the full-suite green.
- **ProviderRegistry test isolation — FIXED.** `providers.test.ts:286` passes an explicit nonexistent `huggingFaceCacheDir: '/tmp/empty-hf-cache-nonexistent'` to the `ProviderRegistry` in the "returns empty when nothing responds" test, isolating it from the system HF cache.
- **Full suite:** `bun test src/` → **541 pass / 0 fail** (1500 expect calls, 38 files, 1.70s).
- **Type check:** `bunx tsc --noEmit` → **0 errors**.
- **No new regressions** introduced by the P2/HIGH/type-error fixes.

---

## New Findings (Cycle 3)

No new **P1** or **P2** findings. The following **P3** hygiene items are carried
forward from prior cycles (all non-blocking, none introduced by this cycle's
fixes):

- **P3-1 (carried). Dead empty branch in `verifyAndAct`.** `verification-service.ts` still contains an empty `if (result.verdict === 'REVIEW' || result.degraded) { /* ... */ }` block. Harmless dead code — remove it.
- **P3-3 (carried). Shared `_running` guard** between sweep and probe intervals in `registry-scheduler.ts`. Unlikely to matter at 60s/120s intervals; separate guards would be cleaner.
- **P3-4 (carried, mitigated). Verifier env fallback** in `verifier.ts` — mitigated because `index.ts` injects validated config values; env fallback is only a defensive default.
- **P3-5 (carried). Base URL default inconsistency.** `schema.ts` defaults `verifierBaseUrl` to `http://localhost:11434`; `verifier.ts` to `http://127.0.0.1:11434`. Functionally equivalent; align to one canonical default.
- **P3-7 (carried). ADR-136 extension consequence note.** The ADR's Consequences section does not explicitly note that the internal transition endpoint extends ADR-136's human-assertion requirement (documented in code + spec, but not the ADR Consequences section).
- **P3-8 (carried). Dev/staging `killSwitchVerificationEnabled: true` feature flag.** Functionally safe (ANDed with `verifyEnabled: false` everywhere), but deviates from strict "default false" wording in spec §c.2.

---

## Spec Adherence Checklist

| Section | Status | Notes |
|---------|--------|-------|
| **(a) Live Registry Service** | ✅ **Compliant** | Unchanged from Cycle 2; registry scheduler + heartbeat collector + routes verified. |
| **(b) Inference Verification Service** | ✅ **Compliant** | Active at runtime; now with **P2-A** machineId threading and **P2-B** injection delimiters. |
| **(c) Default Verifier Model** | ✅ **Compliant** | `verifyEnabled: false` everywhere; config validated at startup (HIGH fixed). |
| **(d) Integration Points** | ✅ **Compliant** | Internal endpoint now rate-limited (**P2-C**); middleware gated on feature flag AND `verifyEnabled`. |
| **(e) File Plan** | ✅ **Compliant** | All files present per spec §e.1/e.2. |
| **(f) Testing Plan** | ✅ **Compliant** | All test files present + comprehensive; **541 pass / 0 fail**. |

---

## Code Quality Review

- **TypeScript strict:** **0 errors** repo-wide (`tsc --noEmit`). All 18 pre-existing errors resolved. No `any` abuse in new code (the single `onboarding.ts` `tx as any` cast is a documented, contained workaround for a Drizzle tx type mismatch).
- **Security:** Internal transition endpoint key-gated (timing-safe `secureCompare`) **and** now rate-limited (10/60s per IP, P2-C). Prompt-injection hardening via delimiters + safety preamble (P2-B). machineId threaded into audit trail for accountability (P2-A).
- **Error handling:** `validateVerifierConfig` wrapped in try/catch with graceful runtime disable (HIGH fixed). Verifier fails open for pass-through + fails closed for safety.
- **Test quality:** Dedicated regression tests for each P2 fix (machineId threading, delimiter wrapping, preamble appending, rate-limit 429 + per-IP isolation). Full suite green.

---

## Regression Risk Assessment

- **`index.ts`:** `verificationEnabled` is now `let` with try/catch around config validation — strictly safer than Cycle 2 (no startup crash on invalid config). **No regression.**
- **`internal-kill-switch.ts`:** Rate limiter is additive; normal traffic (≤10/60s per IP) unaffected. **Non-breaking.**
- **Type-error fixes:** All are additive (optional fields, exports, initializers, casts) or bug-fixes (fsync import, duplicate key). No behavioral change to production paths. **Non-breaking.**
- **Test baseline:** 541 pass / 0 fail — full green, zero regressions.

---

## Recommended Next Steps

1. **Address P3 hygiene** in a follow-up: remove the dead branch (P3-1), align base URL defaults (P3-5), add the ADR-136 consequence note to the ADR (P3-7).
2. **Confirm deployment enforces loopback-only** for `/v1/internal/*` (relies on Docker port mapping `127.0.0.1:3000:3000`).
3. **Verify the verifier model is pulled and reachable** at the production Ollama endpoint before enabling `KILL_SWITCH_VERIFY_ENABLED=true` (safe default keeps it off until then).

**Ready for Stage 2 re-review (Nikaya) / merge.**
