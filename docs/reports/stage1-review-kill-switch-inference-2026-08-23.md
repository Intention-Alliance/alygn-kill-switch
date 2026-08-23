# Stage 1 Code-Quality Review — Kill-Switch Inference Verification Layer + Live Registry

> **Reviewer:** Chanshuk (Dev Lead)
> **Date:** 2026-08-23
> **Branch:** `review/kill-switch-inference-layer`
> **Scope:** Keridz (registry + verification service + middleware + routes + tests) + Rokthar (config schema + env overrides + validation + config tests)
> **Spec:** `docs/specs/KILL-SWITCH-INFERENCE-VERIFICATION-SPEC.md`
> **ADR:** `docs/adr/ADR-2026-08-23-kill-switch-inference-verification.md`

---

## Overall Verdict: **FAIL**

**Score: 62/100**

The implementation is structurally sound — the verifier, verification service,
registry scheduler, heartbeat collector, internal transition endpoint, and
Drizzle schema all match the spec's architecture and are well-written with
strong error handling and good test coverage for the core modules.

However, there is a **blocking P1 defect** in the startup wiring (`index.ts`)
that makes the entire inference verification feature **dead code at runtime**:
the config field names read in `index.ts` do not match the `VerificationConfigSchema`
field names, so `verificationEnabled` is always `false` and the `VerificationService`
is never instantiated. The feature cannot be turned on, even when
`KILL_SWITCH_VERIFY_ENABLED=true` or the dev/staging defaults enable it.

This must be fixed and re-verified before the change is production-ready.

---

## P1 — Blocking Findings

### P1-1. Config field-name mismatch disables verification at runtime (dead feature)

**File:** `apps/server-kill-switch/src/index.ts:290-300`

```ts
const verificationConfig = (getConfig() as any).verification ?? {};
const verificationEnabled = verificationConfig.enabled ?? false;   // ← BUG
const verificationService = verificationEnabled
  ? new VerificationService({
      verifier: new InferenceVerifier({
        model: verificationConfig.model,        // ← wrong field
        baseUrl: verificationConfig.baseUrl,    // ← wrong field
        timeoutMs: verificationConfig.timeoutMs,// ← wrong field
      }),
      mode: verificationConfig.mode ?? 'async', // ← wrong field
      autoKillOnUnsafe: verificationConfig.autoKillOnUnsafe ?? true, // ← not in schema
      ...
```

`VerificationConfigSchema` (`src/config/schema.ts`) defines the fields as
`verifierModel`, `verifierBaseUrl`, `verifierTimeoutMs`, `verifyEnabled`,
`verifyMode`, `verifierSystemPromptPath`. There is **no `enabled`, `model`,
`baseUrl`, `timeoutMs`, `mode`, or `autoKillOnUnsafe` field**.

Consequences:
- `verificationConfig.enabled` is always `undefined` → `verificationEnabled` is
  always `false` → `verificationService` is always `undefined` → the
  `checkInferenceVerification` middleware block in `createHandler` is always
  skipped. **The inference verification feature cannot be activated at all.**
- Even if `enabled` were corrected to `verifyEnabled`, the verifier would be
  constructed with `model: undefined`, `baseUrl: undefined`, `timeoutMs:
  undefined` (falling back to `InferenceVerifier` defaults, which read env vars
  directly — so this part would still mostly work), but `autoKillOnUnsafe` is
  not a config field at all.

**Fix:** Read the correct schema fields:
```ts
const vc = getConfig().verification;
const verificationService = vc.verifyEnabled
  ? new VerificationService({
      verifier: new InferenceVerifier({
        model: vc.verifierModel,
        baseUrl: vc.verifierBaseUrl,
        timeoutMs: vc.verifierTimeoutMs,
      }),
      mode: vc.verifyMode,
      autoKillOnUnsafe: true, // add to schema if it must be configurable
      killSwitch: service,
      publish: ...,
    })
  : undefined;
```
Also replace the `(getConfig() as any)` cast with the typed `AppConfig` access.

---

## P2 — Fix Before Production

### P2-1. Verifier config validation is never wired into startup

**Files:** `src/config/validate-env.ts:193,234` · `src/index.ts:231`

`validateVerifierConfig()` and `validateVerifierReachability()` are implemented
and tested, but **neither is called** from `validateEnvironment()` or
`startServer()`. The spec §c.2 requires the system to "fails fast at startup"
when verification is enabled with a broken verifier config. Currently a
misconfigured `KILL_SWITCH_VERIFIER_BASE_URL` or empty model would boot silently
and degrade every request to REVIEW.

**Fix:** Call `validateVerifierConfig(getConfig().verification)` inside
`validateEnvironment()` (or `startServer()`), and invoke
`validateVerifierReachability()` when `verifyEnabled` is true, logging a
degraded-verification warning if unreachable.

### P2-2. `killSwitchVerificationEnabled` feature flag is never consulted

**File:** `src/config/schema.ts` (FeatureFlagsSchema) · `src/index.ts`

The spec §c.2 says: *"Add a `killSwitchVerificationEnabled` feature flag to
`FeatureFlagsSchema` (default `false`) so the demo can toggle it."* The flag is
defined but **never read** anywhere. The demo cannot toggle verification via the
feature flag, and there is no runtime gate tying the flag to the verification
service.

**Fix:** Gate the verification service instantiation (or the middleware block)
on `isFeatureEnabled('killSwitchVerificationEnabled')` in addition to
`verifyEnabled`.

### P2-3. Agent upsert can violate the `agents.machineId` foreign key

**File:** `src/services/discovery/heartbeat-collector.ts:63-90`

`agents.machineId` has a FK to `machines.id` (the **inventory** table, created
only during onboarding — `onboarding.ts:310`). The collector sets
`machineId: hb.machineId` from the **discovered** machine id. For a machine that
has not been admitted/onboarded (i.e. still `NEW_MACHINE`), there is no
`machines` row, so `db.insert(agents)` throws an FK constraint error. The
collector does not catch it, so it propagates to the heartbeat route's
try/catch and returns a 500 — breaking agent registration for the common
pre-admission case.

**Fix:** Either (a) catch the FK error in `upsertAgent` and skip agent
registration (log a warning) when the machine isn't in the inventory table, or
(b) relax the FK / map to the correct machine record. Confirm the intended
relationship: agent rows should reference the inventory `machines` row that
exists after onboarding, not the discovery row.

### P2-4. Missing required tests: heartbeat-collector and internal-kill-switch

**Spec §f.1** lists `heartbeat-collector.test.ts` and
`internal-kill-switch.test.ts` as required. **Neither exists.** The internal
transition endpoint (`POST /v1/internal/kill-switch/transition`) is the
automated STOPPED trigger — safety-critical — and has zero test coverage. The
heartbeat collector's agent upsert + FK behavior is likewise untested.

**Fix:** Add tests covering: agent upsert on heartbeat with `agentId`; no agent
row when `agentId` absent; `lastSeen` touched; drift detection; FK-violation
handling. For the internal endpoint: accepts STOPPING/STOPPED with valid key;
rejects ARM/RESUME; rejects bad key; audits with `initiatedBy: 'system:*'`.

### P2-5. Dev/staging default `verifyEnabled: true` contradicts the spec's safe default

**Files:** `src/config/environments/development.ts` · `staging.ts`

The spec §c.2 and ADR state the master switch defaults **off** ("default off
until the verifier model is confirmed reachable"). Production is correctly
`false`, but **development and staging both default `verifyEnabled: true`** (and
`killSwitchVerificationEnabled: true`). If a dev/staging instance boots without
a reachable Ollama model, every inference request degrades to REVIEW (fails
open, so no kill — but it silently activates a dependency that may not exist and
spams REVIEW events). This is a deviation from the documented safe default.

**Fix:** Default `verifyEnabled: false` in dev/staging too, requiring explicit
opt-in via `KILL_SWITCH_VERIFY_ENABLED=true`. Keep the dev comment that it's for
local testing but make it opt-in.

---

## P3 — Hygiene

### P3-1. Dead empty branch in `verifyAndAct`

**File:** `src/services/verification/verification-service.ts:104-106`

```ts
// REVIEW or degraded → publish event, no kill.
if (result.verdict === 'REVIEW' || result.degraded) {
  // (already handled above for UNSAFE; this branch covers REVIEW/degraded)
}
```
Empty `if` block — remove it (the event persistence below already handles
REVIEW/degraded correctly).

### P3-2. `(getConfig() as any)` cast in `index.ts`

**File:** `src/index.ts:290` — the `as any` cast defeats type safety. Use the
typed `AppConfig['verification']` access (see P1-1 fix).

### P3-3. Shared `_running` guard between sweep and probe intervals

**File:** `src/services/discovery/registry-scheduler.ts:157-180` — both the
sweep and probe `setInterval` callbacks use the same module-level `_running`
flag. A long-running sweep tick would cause a probe tick to be skipped (and vice
versa). Given the 60s/120s intervals and fast ticks this is unlikely to matter,
but separate guards would be cleaner and match the "one guard per loop" intent.

### P3-4. Verifier reads env directly instead of validated config

**File:** `src/services/verification/verifier.ts:96-99` — `InferenceVerifier`
reads `process.env.KILL_SWITCH_VERIFIER_TIMEOUT_MS` directly and `Number()`s it.
A non-numeric value yields `NaN`, and `AbortSignal.timeout(NaN)` throws. The
validated config is the safer source; prefer injecting config values.

### P3-5. Base URL default inconsistency

`VerificationConfigSchema` defaults `verifierBaseUrl` to `http://localhost:11434`,
but `verifier.ts` defaults to `http://127.0.0.1:11434`. Functionally equivalent
but inconsistent; align to one canonical default.

### P3-6. Internal transition endpoint lacks rate limiting

**File:** `src/routes/internal-kill-switch.ts` — the existing
`/v1/internal/api-keys/*` routes apply a 10 req/min in-memory rate limit
(`api-keys.ts`). The new internal transition endpoint is key-gated but has no
rate limit, so a compromised/leaked key could hammer transitions. Add the same
sliding-window limiter.

---

## Spec Adherence Checklist

| Section | Status | Notes |
|---------|--------|-------|
| **(a) Live Registry Service** | ✅ **Compliant** | `registry-scheduler.ts` (startup seed sweep, periodic sweep, provider probe for ADMITTED only, online/offline reconciliation, `_running` guard, per-tick try/catch), `heartbeat-collector.ts` (agent upsert + liveness), `routes/registry.ts` (`GET /v1/registry/overview`), online/offline computed on read from `lastSeen`. Matches spec §a.2–a.5. |
| **(b) Inference Verification Service** | ⚠️ **Deviates (runtime)** | Code matches spec §b.2–b.5 (verifier, service, async/sync modes, REVIEW+degraded fallback, STOPPED→STOPPED guard). **But the feature is dead at runtime** due to P1-1 (config field mismatch in `index.ts`). |
| **(c) Default Verifier Model** | ⚠️ **Deviates** | Model `qwen2.5:0.5b`, system prompt, fallback behavior all correct. Config schema + env overrides present. **But** `validateVerifierConfig`/`validateVerifierReachability` are not wired into startup (P2-1), and dev/staging default `verifyEnabled: true` (P2-5). |
| **(d) Integration Points** | ✅ **Compliant** | Middleware placed after gate + auth, before dispatcher (`index.ts:157-182`). Scheduler starts at boot (`index.ts:309-315`). Internal transition endpoint wired before `checkAuth`, mirrors `/v1/internal/*` key pattern (`index.ts:100-106`). UNSAFE → `transitionTo('STOPPED')` in-process (spec allows direct in-process call). |
| **(e) File Plan** | ✅ **Compliant** | All 11 new files + 5 modified files present per spec §e.1/e.2. `verification_event` table matches spec §e.3 exactly (hashes, indexes, boolean modes). |
| **(f) Testing Plan** | ⚠️ **Partial** | `verifier.test.ts` (SAFE/UNSAFE/REVIEW, case-insensitive, whitespace, non-verdict→REVIEW+degraded, timeout, unreachable, latency, health) ✅. `verification-service.test.ts` (UNSAFE→STOPPED, SAFE/REVIEW no-kill, autoKillOnUnsafe=false, async non-blocking, sync awaits, degraded→REVIEW, STOPPED→STOPPED guard, event persistence) ✅. `registry-scheduler.test.ts` (startup sweep, interval sweep, ADMITTED-only probe, discovery event, reconciliation, failing-tick resilience, idempotent stop) ✅. `verifier-config.test.ts` (schema defaults, env overrides, validation) ✅. **Missing:** `heartbeat-collector.test.ts` and `internal-kill-switch.test.ts` (P2-4). |

---

## Regression Risk Assessment

- **`index.ts`:** Existing routes preserved. New internal-kill-switch route is
  additive and placed before `checkAuth` (consistent with existing `/v1/internal/*`
  handling). New registry route is additive. Verification middleware is gated on
  `verification` (currently always `undefined` due to P1-1, so no behavior change
  today — but this is precisely why the feature is dead). **No regression to
  existing routes.**
- **`discovery.ts`:** Heartbeat response contract preserved; `agentRegistered`
  field is additive. **Non-breaking.**
- **`schema.ts`:** `verification_event` table is additive (new table, no
  alteration of existing tables). `real` import added. **Non-breaking** for
  existing DB operations.

---

## Security Review

- **Internal transition endpoint** (`internal-kill-switch.ts`): Key-gated via
  `KILL_SWITCH_INTERNAL_KEY` using `secureCompare` (timing-safe), accepts only
  `STOPPING`/`STOPPED` (never ARM/RESUME — preserves ADR-136's defense against
  autonomous self-deactivation), audits with `initiatedBy: 'system:*'`. Matches
  the existing `/v1/internal/api-keys/*` pattern. **Good.** Two notes: (1) no
  explicit loopback IP check in code — relies on the deployment's Docker port
  mapping (`127.0.0.1:3000:3000`), consistent with existing internal routes but
  worth confirming the deployment enforces it; (2) no rate limit (P3-6).
- **Error handling:** Verifier fails open for pass-through + fails closed for
  safety (REVIEW + degraded, never auto-kills on outage). Errors logged
  server-side, generic responses to callers. **Good.**
- **Hash-only storage:** `verification_event` stores `prompt_hash`/`output_hash`
  (sha256), not raw content. **Good.**

---

## Recommended Next Steps

1. **Fix P1-1** (config field names in `index.ts`) — this is the gate for the
   entire feature.
2. Wire `validateVerifierConfig`/`validateVerifierReachability` into startup (P2-1).
3. Add the missing `heartbeat-collector.test.ts` and `internal-kill-switch.test.ts` (P2-4).
4. Address the agent FK risk (P2-3) and dev/staging default (P2-5).
5. Re-run the verification-path tests after the P1 fix to confirm the feature
   activates end-to-end.

**Re-review required after P1-1 is fixed.**
