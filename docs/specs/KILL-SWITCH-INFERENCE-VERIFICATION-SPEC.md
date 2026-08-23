# KILL-SWITCH INFERENCE VERIFICATION + LIVE REGISTRY — IMPLEMENTATION SPEC

> **Status:** Ready for implementation
> **Date:** 2026-08-23
> **Architecture:** [ADR-2026-08-23-kill-switch-inference-verification.md](../adr/ADR-2026-08-23-kill-switch-inference-verification.md)
> **Implementers:** Keridz/be-coder (server), Rokthar/devops (deployment/config)
> **Runtime:** Bun · **DB:** Drizzle ORM (SQLite) · **Cache/PubSub:** Redis · **Lang:** TypeScript strict

This spec is the build-from source for the coders. It covers three workstreams:

- **(a) Live Registry Service** — schedule the existing discovery orchestrator.
- **(b) Inference Verification Service** — verify inference output with a lightweight model.
- **(c) Default Verifier Model** — the model, system prompt, config, and fallback.
- **(d) Integration Points** — how it connects to existing modules.
- **(e) File Plan** — new files + modified files.
- **(f) Testing Plan** — tests and edge cases.

All code lives inside `apps/server-kill-switch/`. No new service is created.

---

## (a) Live Registry Service

### a.1 Goal

Activate the dormant discovery orchestrator so the dashboard shows real
machines, agents, providers, and models. The orchestrator, provider registry,
schema, and routes **already exist** — this work adds a **scheduler** that drives
them on a periodic schedule, plus online/offline reconciliation.

### a.2 New file: `src/services/discovery/registry-scheduler.ts`

A module that starts periodic loops (mirroring the existing
`system-metrics.ts` `startMetricGeneration` pattern — module-level interval +
`_running` guard).

```ts
export interface RegistrySchedulerOpts {
  heartbeatTimeoutMs?: number;   // default 90_000  (90s)
  sweepIntervalMs?: number;      // default 60_000  (60s)
  probeIntervalMs?: number;      // default 120_000 (120s)
  publish?: (channel: string, msg: string) => Promise<void>;
  orchestrator?: DiscoveryOrchestrator;
}

export function startRegistryScheduler(opts?: RegistrySchedulerOpts): void;
export function stopRegistryScheduler(): void;
```

**Behavior:**

1. **Startup seed sweep** — on start, run one `runNetworkSweep()` immediately so
   the registry is populated within seconds, not a minute.
2. **Periodic sweep** — every `sweepIntervalMs`, call `orchestrator.runNetworkSweep()`.
   New hosts enter `NEW_MACHINE` (never auto-admitted — ADR-135 §5). Publish a
   `bcp:discovery:events` message when new machines are found.
3. **Periodic provider probe** — every `probeIntervalMs`, for each
   `discovered_machine` in state `ADMITTED`, call
   `orchestrator.detectProvidersForMachine(machineId)`. This keeps
   `discovered_provider` / `discovered_model` fresh. Publish a
   `bcp:discovery:events` message when a provider transitions healthy↔unhealthy.
4. **Online/offline reconciliation** — every `sweepIntervalMs` (same tick), mark
   machines offline: any `discovered_machine` whose `lastSeen` is older than
   `heartbeatTimeoutMs` is flagged offline in the registry view and the
   dashboard. (See a.5 for the offline model.)
5. **Guard** — `_running` flag prevents overlapping ticks (same as
   `system-metrics.ts`). Wrap each tick in try/catch so one failing probe never
   stops the loop.

### a.3 New file: `src/services/discovery/heartbeat-collector.ts`

A thin service that wraps the existing `orchestrator.handleHeartbeat()` and adds
agent registration + online/offline bookkeeping. It is called by the **existing**
`POST /v1/discovery/heartbeat` route (which already exists in
`src/routes/discovery.ts`) — the collector just adds agent upsert + liveness.

```ts
export interface AgentHeartbeat {
  machineId: string;
  hostname: string;
  agentId?: string;       // optional — if present, upsert the agent row
  agentName?: string;
  agentVersion?: string;
  capabilities?: string[];
  fingerprint?: HardwareFingerprint;
}

export class HeartbeatCollector {
  constructor(private orchestrator: DiscoveryOrchestrator) {}

  /** Upsert machine (via orchestrator.handleHeartbeat) + optional agent, touch lastSeen. */
  async handleAgentHeartbeat(hb: AgentHeartbeat): Promise<{
    drift: IntegrityDrift | null;
    signature: IntegritySignature;
    agentRegistered: boolean;
  }>;
}
```

**Agent registration flow:**

1. A machine agent calls `POST /v1/discovery/heartbeat` with `machineId`,
   `hostname`, and optionally `agentId`/`agentName`/`agentVersion`/`capabilities`.
2. `HeartbeatCollector.handleAgentHeartbeat()`:
   - Calls `orchestrator.handleHeartbeat()` (fingerprint + integrity drift check).
   - If `agentId` is present, upserts the `agent` row (schema already exists:
     `id`, `machineId`, `name`, `version`, `capabilities` JSON, `lastHeartbeat`).
   - Touches `discovered_machine.lastSeen` (already done by the orchestrator).
3. The route returns `{ acknowledged, machineId, signature, drift, state }` —
   the existing response shape is preserved (see `src/routes/discovery.ts`).

**Note:** the existing `POST /v1/discovery/heartbeat` route currently calls
`orchestrator.handleHeartbeat()` directly. The collector wraps that call and
adds the agent upsert. **Do not break the existing route contract.**

### a.4 New file: `src/routes/registry.ts` (optional, dashboard-facing)

A small read-only surface for the dashboard so it can render the live registry
without hitting the raw discovery tables. **This is optional** — the existing
`GET /v1/discovery/machines` already lists discovered machines. Add this only if
the dashboard needs a consolidated "live registry" view (machines + agents +
providers + models + online/offline in one payload).

```ts
// GET /v1/registry/overview
// Returns: { machines: [...], agents: [...], providers: [...], models: [...], onlineCount, offlineCount }
```

Wire it into the handler chain in `src/index.ts` (see e.2).

### a.5 Online/offline model

The existing `discovered_machine` table has `lastSeen` but **no** `status`
column. To avoid a schema migration, compute liveness on read:

- **Online** = `lastSeen` within `heartbeatTimeoutMs` (default 90s).
- **Offline** = `lastSeen` older than `heartbeatTimeoutMs`.

The scheduler publishes a `bcp:discovery:events` message on any machine
transitioning online→offline (and vice versa) so the dashboard can update live.
The dashboard computes the same liveness from `lastSeen` so there is one source
of truth.

**Consistency with `machine.status`:** the existing `machine` inventory table
has a `status` column (`active | inactive | offline`). The registry liveness is
a *discovery* notion. Keep them separate: the registry tracks
`discovered_machine` liveness; the `machine` inventory `status` is updated by
the existing machines routes. Do **not** conflate the two. (Optional: when a
discovered machine is ADMITTED, the onboarding flow already creates the
`machine` row — leave that as-is.)

---

## (b) Inference Verification Service

### b.1 Goal

Sit in the request path of `POST /v1/inference/*` and verify the inference
**output** with a lightweight model. On UNSAFE output, trigger the kill-switch
STOPPED transition (which pauses subsequent traffic via the existing
`pauseInferenceTraffic()` hook).

### b.2 New file: `src/services/verification/verifier.ts`

The core verifier. Calls a lightweight model (Ollama by default) and classifies
the output.

```ts
export type Verdict = 'SAFE' | 'UNSAFE' | 'REVIEW';

export interface VerificationResult {
  verdict: Verdict;
  confidence: number;        // 0..1
  reason: string;            // short human-readable reason from the model
  latencyMs: number;
  model: string;
  degraded: boolean;         // true if the verifier model was unavailable
}

export interface VerifierOpts {
  model?: string;            // default from config (KILL_SWITCH_VERIFIER_MODEL)
  baseUrl?: string;          // Ollama base URL (default http://127.0.0.1:11434)
  timeoutMs?: number;        // default 500
  systemPrompt?: string;     // default: load docs/specs/verifier-system-prompt.md
}

export class InferenceVerifier {
  constructor(opts?: VerifierOpts);

  /** Verify a single inference output. Returns a Verdict. */
  async verify(input: { prompt: string; output: string }): Promise<VerificationResult>;

  /** Health check — is the verifier model reachable? */
  async health(): Promise<{ ok: boolean; model: string; latencyMs: number | null }>;
}
```

**Verifier call (Ollama):**

```ts
// POST {baseUrl}/api/generate
// body: { model, prompt: systemPrompt + "\n\n" + userMessage, stream: false, options: { num_predict: 16 } }
```

Parse the model's response for a verdict token. The model is instructed (see
`verifier-system-prompt.md`) to reply with exactly one of `SAFE`, `UNSAFE`, or
`REVIEW` on the first line, followed by a short reason. Robustly extract the
verdict:

- Match `/^\s*(SAFE|UNSAFE|REVIEW)\b/m` on the raw text.
- If no match → default to `REVIEW` (degraded = true, log a parse warning).

**Classification thresholds (configurable):**

- `UNSAFE` → trigger kill (STOPPED).
- `REVIEW` → surface to dashboard, **no auto-kill**.
- `SAFE` → pass.

### b.3 New file: `src/services/verification/verification-service.ts`

The orchestration layer that decides **when** to verify and **what to do** with
the verdict. This is the module the middleware/route calls.

```ts
export interface VerificationServiceOpts {
  verifier?: InferenceVerifier;
  mode?: 'async' | 'sync';          // default 'async'
  autoKillOnUnsafe?: boolean;       // default true
  killSwitch?: KillSwitchService;   // injected for the STOPPED transition
}

export class VerificationService {
  constructor(opts: VerificationServiceOpts);

  /**
   * Called by the inference middleware/route with the request context.
   * In ASYNC mode: fire-and-forget verification, return immediately.
   * In SYNC mode: await verification and return the result.
   */
  async handleInferenceRequest(ctx: {
    prompt: string;
    output: string;
    requestId: string;
    machineId?: string;
  }): Promise<{ mode: 'async' | 'sync'; result?: VerificationResult }>;

  /** Internal: run verification + act on the verdict. */
  private async verifyAndAct(ctx: {
    prompt: string;
    output: string;
    requestId: string;
    machineId?: string;
  }): Promise<VerificationResult>;
}
```

**`verifyAndAct` logic:**

1. Call `verifier.verify({ prompt, output })`.
2. If `result.verdict === 'UNSAFE'` and `autoKillOnUnsafe`:
   - `await killSwitch.transitionTo('STOPPED', { reason: 'inference-unsafe', userId: 'system:verifier', ip: 'internal' })`.
   - Publish a `bcp:verification:events` message with the unsafe payload (for the
     dashboard + audit).
3. If `result.verdict === 'REVIEW'` or `result.degraded`:
   - Publish a `bcp:verification:events` message (REVIEW / degraded) — no kill.
4. Return the result.

**Audit:** the STOPPED transition already writes to `kill_switch_audit_log`
(via `kill-switch.ts`). The verification event itself is published to
`bcp:verification:events` (WebSocket → dashboard). Optionally persist a
`verification_event` table (see e.3) for a durable review trail.

### b.4 Wiring into the request path

The existing `inference-gate.ts` middleware rejects POST `/v1/inference/*` with
503 when traffic is paused. The verification layer is a **separate, later**
stage that runs on requests that **pass** the gate.

**Recommended wiring — a new middleware `src/middleware/inference-verification.ts`:**

```ts
export function checkInferenceVerification(
  method: string,
  url: string,
  body: { prompt?: string; output?: string } | null,
  service: VerificationService,
): { verified: boolean; result?: VerificationResult; reject?: { status: number; body: unknown } };
```

Placement in `src/index.ts` handler chain: **after** `checkInferenceGate`
(paused → 503 short-circuits first) and **after** auth, but **before** the route
dispatcher. Because the current handler chain is a linear `if/return` sequence
(not a middleware array), the verification hook must be inserted explicitly in
`createHandler` (see e.2).

**How the verifier gets the output:** the inference request body is parsed by
the route handler. The verification middleware needs the `prompt` and `output`
fields. For ASYNC mode, the middleware reads the body, extracts `prompt`/`output`
(if present), fires `service.handleInferenceRequest()`, and passes the request
through **immediately** (does not await). For SYNC mode, it awaits and rejects
with 403 if the verdict is UNSAFE.

**Important:** the kill-switch server is the *control plane*, not necessarily the
inference *data plane*. If inference traffic flows through a different gateway,
the verification hook must be deployed where inference actually flows. This spec
assumes the kill-switch server terminates `POST /v1/inference/*` (which the
existing `inference-gate.ts` already assumes). If inference flows elsewhere, the
verification service is a library the data-plane gateway imports — the service
and verifier are dependency-injected and reusable.

### b.5 Async vs sync — recommendation

**Default: ASYNC.** Rationale (see ADR):

- Zero added latency to inference requests.
- The kill switch's job is to halt a *stream*; async detects an unsafe pattern
  and stops the *next* request.
- Sync is opt-in via `KILL_SWITCH_VERIFY_MODE=sync` for low-throughput,
  high-sensitivity paths where a single unsafe response is unacceptable.

**Async caveat:** a single unsafe response can reach the user before the kill
triggers. This is the accepted trade-off (documented in the ADR).

---

## (c) Default Verifier Model

### c.1 Model selection

| Property | Value |
|----------|-------|
| **Model** | `qwen2.5:0.5b` (default) |
| **Params** | 0.5B |
| **Runtime** | CPU (Ollama) |
| **Target latency** | < 500 ms per verification |
| **Cost** | ~0 (local CPU) |
| **Why** | Fast, cheap, high signal-to-noise for the narrow SAFE/UNSAFE/REVIEW classification with strong ICL priors. |

**Alternatives (configurable via `KILL_SWITCH_VERIFIER_MODEL`):** `tinyllama`
(1.1B, slightly more capable, still CPU-fast), `qwen2.5:1.5b` (1.5B, more
capable, still < 500ms on decent CPU). Any OpenAI-compatible endpoint can be
used by setting `KILL_SWITCH_VERIFIER_BASE_URL`.

### c.2 Config env vars

| Env var | Default | Purpose |
|---------|---------|---------|
| `KILL_SWITCH_VERIFIER_MODEL` | `qwen2.5:0.5b` | Verifier model id |
| `KILL_SWITCH_VERIFIER_BASE_URL` | `http://127.0.0.1:11434` | Ollama (or OpenAI-compatible) base URL |
| `KILL_SWITCH_VERIFIER_TIMEOUT_MS` | `500` | Per-verification timeout |
| `KILL_SWITCH_VERIFY_MODE` | `async` | `async` \| `sync` |
| `KILL_SWITCH_VERIFY_AUTO_KILL` | `true` | Auto-trigger STOPPED on UNSAFE |
| `KILL_SWITCH_VERIFY_ENABLED` | `false` | Master switch — default **off** until the verifier model is confirmed reachable |
| `KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH` | (bundled) | Path to the system prompt file |

**Add a `VerificationConfigSchema` to `src/config/schema.ts`** and wire the env
overrides in `src/config/index.ts` (mirror the existing WebAuthn override
pattern). Add a `killSwitchVerificationEnabled` feature flag to
`FeatureFlagsSchema` (default `false`) so the demo can toggle it.

### c.3 Fallback behavior when the model is unavailable

The verifier **fails open for pass-through but fails closed for safety**:

- If the verifier model is unreachable / times out / returns a non-verdict:
  - **ASYNC mode:** the request passes through (no latency impact). The
    verifier returns `{ verdict: 'REVIEW', degraded: true }`, logs a
    degraded-verification alert, and publishes a `bcp:verification:events`
    message so the dashboard shows "verifier degraded."
  - **SYNC mode:** the request passes through (not blocked) but is marked
    `REVIEW` + degraded. **Never** block traffic on a verifier outage.
- `degraded: true` results never auto-trigger the kill switch. They surface for
  human review.
- A `KILL_SWITCH_VERIFY_ENABLED=false` (or verifier down) means the system
  behaves exactly as today (no verification) — safe default.

**Rationale:** blocking all inference because the verifier is down (availability
failure) is worse than a short REVIEW window; silently passing unsafe content
(safety failure) is also unacceptable. REVIEW + dashboard alert is the honest
middle ground. The dashboard operator can manually kill if REVIEWs accumulate.

### c.4 System prompt

The full system prompt with ICL examples lives in
[`docs/specs/verifier-system-prompt.md`](./verifier-system-prompt.md). It is
designed for a 0.5B–1B model: short, direct instructions, a strict output
format, and 2–3 ICL examples. The verifier loads it from the bundled path (or
`KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH`).

---

## (d) Integration Points

| Existing module | How it connects |
|-----------------|-----------------|
| `src/services/kill-switch.ts` | `VerificationService` calls `killSwitch.transitionTo('STOPPED', { reason: 'inference-unsafe', userId: 'system:verifier' })` on UNSAFE. Reuses the existing audit + pubsub + traffic-pause hook. |
| `src/services/traffic-pause.ts` | No change needed. The STOPPED transition already calls `pauseInferenceTraffic()` (ADR-141). Verification just triggers STOPPED; the pause is automatic. |
| `src/middleware/inference-gate.ts` | No change. Verification runs **after** the gate (gate 503s when paused; verification only runs on passing requests). |
| `src/services/discovery/orchestrator.ts` | `registry-scheduler` drives `runNetworkSweep()` and `detectProvidersForMachine()` on intervals. `heartbeat-collector` wraps `handleHeartbeat()`. |
| `src/services/discovery/providers/registry.ts` | No change. The scheduler calls the orchestrator, which uses the registry. |
| `src/routes/discovery.ts` | `HeartbeatCollector` wraps the existing heartbeat route logic (adds agent upsert). Keep the route contract. |
| `src/services/system-metrics.ts` | **Pattern reference** for the scheduler (module-level interval + `_running` guard + publish callback). |
| `src/config/schema.ts` / `src/config/index.ts` | Add `VerificationConfigSchema` + env overrides + `killSwitchVerificationEnabled` feature flag. |
| `src/index.ts` | Start `registry-scheduler` at boot; wire `inference-verification` middleware into `createHandler`; add `GET /v1/registry/overview` route. |
| `apps/server-telemetry-handler/src/alerting/kill-switch-bridge.ts` | **Stub to fix (optional but recommended):** the bridge logs transitions but doesn't call the kill-switch HTTP endpoint. This is separate from verification, but the same "automated STOPPED trigger" pattern. If in scope, wire the bridge to call `POST /v1/kill-switch/chaos` (or better, an internal transition endpoint) with a service credential. **Note:** ADR-136 requires a human WebAuthn assertion for `/v1/kill-switch/chaos` — an automated telemetry/verification trigger must use a **separate internal transition path** that bypasses the human-assertion requirement but is still audited. See d.1. |

### d.1 Automated (non-human) STOPPED triggers

ADR-136 gates `/v1/kill-switch/chaos` behind a human WebAuthn assertion. The
verification service (and the telemetry bridge) are **automated** triggers that
must be able to STOP the system without a human in the loop — that is their
entire purpose (react to unsafe output automatically).

**Decision:** add an **internal, service-authenticated transition path** that is
structurally separate from the human path:

- New endpoint `POST /v1/internal/kill-switch/transition` (loopback-only, like
  the existing `/v1/internal/*` webhook routes) authenticated by
  `KILL_SWITCH_INTERNAL_KEY`.
- Accepts only `STOPPING` / `STOPPED` (automated systems can pause, never
  resume/arm — resume/arm stays human-only).
- Every transition is audited with `initiatedBy: 'system:verifier'` (or
  `system:telemetry`) and a `machineId`/`reason` in metadata, so the audit log
  distinguishes automated from human kills.
- The verification service and telemetry bridge call this internal endpoint
  (or the `KillSwitchService.transitionTo()` directly if in-process).

This preserves ADR-136's defense against *autonomous self-deactivation* (an
automated system can never ARM/RESUME — only STOP) while enabling automated
safety kills. **This is a deliberate, documented extension of ADR-136** — flag it
in the ADR as a consequence.

---

## (e) File Plan

### e.1 New files

| File | Purpose |
|------|---------|
| `src/services/discovery/registry-scheduler.ts` | Periodic sweep + provider probe + online/offline reconciliation (a.2). |
| `src/services/discovery/heartbeat-collector.ts` | Agent registration + heartbeat wrapper (a.3). |
| `src/routes/registry.ts` | Optional dashboard-facing `GET /v1/registry/overview` (a.4). |
| `src/services/verification/verifier.ts` | Calls the lightweight model, returns Verdict (b.2). |
| `src/services/verification/verification-service.ts` | Orchestrates verify + act on verdict (b.3). |
| `src/middleware/inference-verification.ts` | Request-path hook (b.4). |
| `src/routes/internal-kill-switch.ts` | Internal service-authenticated transition endpoint (d.1). |
| `src/services/verification/verification-event.ts` | Optional: persist `verification_event` rows + publish `bcp:verification:events` (b.3). |
| `src/services/verification/__tests__/verifier.test.ts` | Verifier unit tests (f.1). |
| `src/services/verification/__tests__/verification-service.test.ts` | Service tests (f.1). |
| `src/services/discovery/__tests__/registry-scheduler.test.ts` | Scheduler tests (f.1). |

### e.2 Modified files

| File | Change |
|------|--------|
| `src/config/schema.ts` | Add `VerificationConfigSchema` + `killSwitchVerificationEnabled` feature flag. |
| `src/config/index.ts` | Add env overrides for `KILL_SWITCH_VERIFIER_*` / `KILL_SWITCH_VERIFY_*`. |
| `src/index.ts` | Start `startRegistryScheduler()` at boot; instantiate `InferenceVerifier` + `VerificationService`; wire `checkInferenceVerification` into `createHandler` (after gate + auth, before dispatcher); register `GET /v1/registry/overview` and `POST /v1/internal/kill-switch/transition` routes. |
| `src/routes/discovery.ts` | Route the heartbeat through `HeartbeatCollector` (agent upsert) — keep the response contract. |
| `src/db/schema.ts` | Add `verification_event` table (optional but recommended for a durable review trail). |

### e.3 Optional schema addition: `verification_event`

```ts
export const verificationEvents = sqliteTable('verification_event', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  machineId: text('machine_id'),
  verdict: text('verdict').notNull(),          // SAFE | UNSAFE | REVIEW
  confidence: real('confidence'),
  reason: text('reason'),
  model: text('model').notNull(),
  degraded: integer('degraded', { mode: 'boolean' }).notNull().default(false),
  promptHash: text('prompt_hash'),             // sha256 of prompt (avoid storing raw prompt)
  outputHash: text('output_hash'),             // sha256 of output (avoid storing raw output)
  triggeredKill: integer('triggered_kill', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  requestIdx: index('verification_event_request_idx').on(table.requestId),
  verdictIdx: index('verification_event_verdict_idx').on(table.verdict),
  timeIdx: index('verification_event_time_idx').on(table.createdAt),
}));
```

Store **hashes** of prompt/output (not raw content) to keep the audit trail
tamper-evident without persisting sensitive inference content.

---

## (f) Testing Plan

### f.1 Unit tests

| File | Cases |
|------|-------|
| `verifier.test.ts` | Verdict extraction from model text (SAFE/UNSAFE/REVIEW, case-insensitive, leading whitespace). Non-verdict text → REVIEW + degraded. Timeout → REVIEW + degraded. Model unreachable → REVIEW + degraded. Latency measured. |
| `verification-service.test.ts` | UNSAFE → `transitionTo('STOPPED')` called with `reason: 'inference-unsafe'`. SAFE → no kill. REVIEW → no kill, event published. `autoKillOnUnsafe=false` → no kill. ASYNC mode returns immediately (does not await verifier). SYNC mode awaits + rejects UNSAFE with 403. `degraded` → REVIEW, no kill. |
| `registry-scheduler.test.ts` | Sweep runs on interval. Provider probe runs for ADMITTED machines only. Online/offline reconciliation marks stale machines offline. `_running` guard prevents overlap. One failing tick doesn't stop the loop. |
| `heartbeat-collector.test.ts` | Agent upsert on heartbeat with `agentId`. No agent row when `agentId` absent. `lastSeen` touched. Drift detection still works. |
| `internal-kill-switch.test.ts` | Internal endpoint accepts STOPPING/STOPPED with valid key. Rejects ARM/RESUME (human-only). Rejects bad key. Audits with `initiatedBy: 'system:*'`. |

### f.2 Integration tests

- **Gate + verification ordering:** a STOPPED kill-switch 503s inference before
  verification runs; a RUNNING kill-switch passes inference and (in sync mode)
  verifies it.
- **Unsafe → auto-kill → next request paused:** inject an UNSAFE output in sync
  mode → verifier returns UNSAFE → kill transitions to STOPPED → the *next*
  inference request is 503'd by the gate.
- **Verifier down:** point `KILL_SWITCH_VERIFIER_BASE_URL` at a dead port →
  requests pass through (async) / pass through marked REVIEW (sync), no kill,
  degraded event published.
- **Live registry:** start the scheduler → machines appear in
  `GET /v1/discovery/machines`; provider probe populates providers/models;
  heartbeat keeps a machine online; stopping heartbeats marks it offline.

### f.3 Edge cases to cover

1. **Verifier model not pulled** → Ollama returns 404 → REVIEW + degraded, no kill.
2. **Verifier timeout** (> `KILL_SWITCH_VERIFIER_TIMEOUT_MS`) → REVIEW + degraded.
3. **Model returns gibberish** (no verdict token) → REVIEW + degraded, logged.
4. **Concurrent unsafe outputs** → multiple UNSAFE results in the same tick must
   not double-transition (STOPPED → STOPPED is invalid per
   `VALID_TRANSITIONS`). Guard: only call `transitionTo('STOPPED')` if current
   state is not already STOPPED (check `getCurrentState()` first, or catch the
   409 invalid-transition error and ignore).
5. **Registry sweep overlap** → `_running` guard prevents concurrent ticks.
6. **Provider probe on a machine that was deleted mid-probe** → catch FK errors,
   skip.
7. **`KILL_SWITCH_VERIFY_ENABLED=false`** → verification is a no-op; system
   behaves exactly as today.
8. **Async verification after response sent** → ensure the verifier runs in a
   detached task that cannot throw into the response path (wrap in try/catch,
   never reject the request).
9. **Internal transition endpoint auth** → loopback-only + `KILL_SWITCH_INTERNAL_KEY`,
   mirrors the existing `/v1/internal/*` webhook pattern.

---

## Summary of the three gaps → this spec

| Gap | Addressed by |
|-----|--------------|
| **Gap 1: Live Registry** | (a) `registry-scheduler.ts` + `heartbeat-collector.ts` drive the existing orchestrator on intervals; online/offline reconciliation; dashboard surface. |
| **Gap 2: Inference Analysis** | (b) `verifier.ts` + `verification-service.ts` + `inference-verification.ts` middleware; UNSAFE → STOPPED via internal transition path. |
| **Gap 3: Default Verifier Model** | (c) `qwen2.5:0.5b` default, config env vars, `verifier-system-prompt.md`, REVIEW+degraded fallback. |
