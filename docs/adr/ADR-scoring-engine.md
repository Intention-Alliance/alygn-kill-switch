# ADR: Scoring Engine for the Kill-Switch Dashboard

## Status

**Proposed** — 2026-08-26

## Context

Andler reported: *"Scoring engine not implemented. Be sure this is implemented
with the training framework."*

The kill-switch dashboard (`apps/web-regulator`) currently shows raw machine
inventory, kill-switch state, and per-machine telemetry, but it has **no notion
of a machine's safety/compliance score**. The inference verification layer
(ADR-2026-08-23) already classifies every inference output as
`SAFE | UNSAFE | REVIEW` and persists each verdict to the `verification_event`
table, but nothing aggregates those verdicts into a per-machine or system-level
score. The dashboard cannot answer the operator's core question: *"Is this
machine safe to keep running?"*

In parallel, the Dignity Verifier Training Framework
(ADR-dignity-verifier-training-framework) is fine-tuning a 0.5B student model
(`dignity-verifier-preview-v1`) to replace the stock `qwen2.5:0.5b` verifier.
That fine-tuned model is the **scorer** — it is the same model that classifies
inference output, and its verdict stream is the raw material for every score.

We need a **Scoring Engine** that:

1. Defines what a "score" means across four dimensions (machine compliance,
   inference safety, dignity-test pass rate, overall system health).
2. Aggregates the verifier's verdict stream per machine and system-wide.
3. Exposes the scores to the dashboard as gauges/charts.
4. Drives alerts and emergency-stop eligibility when scores drop below
   thresholds.

This ADR is a **design** — it specifies the scoring model, the aggregation
pipeline, the API contract, and the integration points. It does not implement
code.

## Decision

We add a **Scoring Engine** inside the existing kill-switch server
(`apps/server-kill-switch`). No new service is introduced. The engine reads the
already-persisted `verification_event` rows (plus machine inventory and
kill-switch state), computes four scores, caches them, and exposes them via new
`/v1/scores/*` routes that the dashboard proxies through its existing `/api/*`
rewrite pattern.

The fine-tuned `dignity-verifier-preview-v1` model is the **scorer**: it is the
model that produces the verdict stream the engine aggregates. The scoring
engine is the **aggregator**; the verifier is the **classifier**. They are two
layers of the same pipeline.

### What is a "score"?

A score is a **0–100 integer** (higher = safer/more compliant) computed over a
**rolling window** of evidence. Every score is derived from real, persisted
data — never fabricated. The engine defines four scores:

| Score | Range | Meaning | Primary source |
|-------|-------|---------|----------------|
| **Machine Compliance** | 0–100 | Is the machine running the right software, right configs, right state? | `machine` inventory + `discovered_provider`/`discovered_model` + `integrity_event` + `kill_switch_audit_log` |
| **Inference Safety** | 0–100 | Of the inferences verified, what share were SAFE vs UNSAFE vs REVIEW? | `verification_event.verdict` |
| **Dignity Test Pass Rate** | 0–100 | What % of inferences pass the dignity verifier (SAFE)? | `verification_event.verdict` (SAFE share) |
| **Overall System Health** | 0–100 | Composite of all dimensions + kill-switch state | weighted blend of the above + `kill_switch_state` |

#### 1. Machine Compliance Score

Measures whether a machine is running the right software, right configs, and in
the right state. It is **not** derived from inference verdicts — it is derived
from the machine's inventory, discovery, integrity, and audit records.

Inputs (all already in the Drizzle schema):

- **Machine state** (`machine.status`): `active` contributes fully; `inactive`
  reduces; `offline` reduces further.
- **Monitoring-only flag** (`machine.monitoringOnly`, ADR-138): a machine that
  is monitoring-only is not yet fully onboarded — it cannot receive active
  responses. This caps the compliance score (a monitoring-only machine cannot
  score 100).
- **Zone assignment** (`machine.zone`): `unassigned` reduces the score (ADR-137).
- **Provider/model health** (`discovered_provider.status`,
  `discovered_model.served`): unhealthy providers or unserved models reduce the
  score.
- **Integrity events** (`integrity_event`): any `tamper`/`swap` event with
  `severity = high` heavily penalizes the score; `medium`/`low` penalize less.
- **Recent kill-switch audit** (`kill_switch_audit_log`): a machine that
  triggered an automated `inference-unsafe` stop carries a compliance penalty
  until it is re-verified.

The compliance score is computed as a **weighted sum of sub-checks**, each
normalized to 0–100, with a configurable weight table (see §Thresholds &
Configuration).

#### 2. Inference Safety Score

Measures the **distribution of verdicts** over the rolling window. It is the
share of verified inferences that were classified SAFE, with UNSAFE and REVIEW
weighted as failures.

```
inferenceSafety = 100 × (safe + review × reviewWeight) / total
```

where `reviewWeight` is configurable (default 0.5 — a REVIEW is not a hard
failure but is not a pass either). Degraded verifications (`degraded = true`)
are counted as REVIEW (they already surface as REVIEW in the verifier).

#### 3. Dignity Test Pass Rate

The **strict** SAFE share — the % of inferences that pass the dignity verifier
outright. This is the headline metric the training framework targets (≥85%
accuracy). It is the same numerator as Inference Safety but treats REVIEW as a
**fail** (not a partial pass):

```
dignityPassRate = 100 × safe / total
```

This is the metric that maps directly to the training framework's eval target
and to the dashboard's green/yellow/red bands.

#### 4. Overall System Health Score

A **weighted composite** of the three dimensions plus the live kill-switch
state:

```
overall = w1×compliance + w2×inferenceSafety + w3×dignityPassRate + w4×stateBias
```

where `stateBias` reflects the kill-switch state (RUNNING/ARMED = neutral,
STOPPING/STOPPED = reduced, LOCKED = heavily reduced). The weights default to
`w1=0.3, w2=0.3, w3=0.3, w4=0.1` and are configurable. The overall score is what
the dashboard's headline gauge displays and what drives emergency-stop
eligibility.

### How it integrates with the training framework

The fine-tuned `dignity-verifier-preview-v1` model is the **scorer**. The
integration is a **single pipeline with two layers**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Inference request → verifier (dignity-verifier-preview-v1)         │
│  ── classifies output → SAFE | UNSAFE | REVIEW (+ confidence)       │
│  ── persists verification_event row + publishes bcp:verification   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ verdict stream
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Scoring Engine (aggregator, in kill-switch server)                 │
│  ── reads verification_event + machine + discovery + audit        │
│  ── computes 4 scores per machine + system-wide                     │
│  ── caches scores, publishes score updates to bcp:scores:events     │
│  ── threshold check → alert + emergency-stop eligibility            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ scores
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Dashboard (web-regulator) — gauges/charts via /api/scores/*        │
│  ── GET /api/scores/machines, /machines/:id, /system                │
│  ── WebSocket score updates (polling fallback)                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Real-time scoring:** every inference output is scored by the verifier
(`dignity-verifier-preview-v1`) in real time. The scoring engine aggregates
those verdicts per machine on a rolling window. The dashboard displays the
scores as gauges/charts. When a score drops below the red threshold, the engine
raises an alert and marks the machine (or the fleet) as **emergency-stop
eligible**.

**Training-framework coupling:** the scoring engine consumes the *output* of the
training framework (the deployed `dignity-verifier-preview-v1` model). It does
not run training. The training framework's eval target (≥85% accuracy) is the
same threshold the dashboard's green band uses for the Dignity Test Pass Rate.
When the training framework deploys a new model version, the scoring engine
picks it up automatically via the verifier's `DEFAULT_MODEL` config (no scoring
code change).

### API design

New routes in `apps/server-kill-switch/src/routes/scores.ts`, exposed as
`/v1/scores/*` and proxied by the dashboard's `/api/*` rewrite to
`/api/scores/*`. All routes require admin auth (same as existing routes).

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /v1/scores/machines` | GET | All machine scores (list) |
| `GET /v1/scores/machines/:id` | GET | Single machine score breakdown |
| `GET /v1/scores/system` | GET | Overall system health |
| `POST /v1/scores/recalculate` | POST | Trigger a synchronous recalculation |

#### `GET /v1/scores/machines`

Returns a list of per-machine scores plus the system aggregate.

```jsonc
{
  "data": [
    {
      "machineId": "m_01",
      "machineName": "arch2-1",
      "hostname": "arch2-1",
      "status": "active",
      "scores": {
        "compliance": 92,
        "inferenceSafety": 88,
        "dignityPassRate": 85,
        "overall": 87
      },
      "band": "green",                 // green | yellow | red (from overall)
      "window": { "from": "2026-08-26T00:00:00Z", "to": "2026-08-26T14:00:00Z" },
      "verdictCounts": { "safe": 120, "unsafe": 8, "review": 12, "degraded": 2 },
      "emergencyStopEligible": false,
      "lastScoredAt": "2026-08-26T14:00:00Z"
    }
  ],
  "system": {
    "overall": 87,
    "band": "green",
    "machineCount": 3,
    "greenCount": 2,
    "yellowCount": 1,
    "redCount": 0
  },
  "computedAt": "2026-08-26T14:00:00Z"
}
```

#### `GET /v1/scores/machines/:id`

Returns the full breakdown for one machine, including the per-dimension
sub-scores and the evidence that produced them (for reviewability — Dignity
Test #6).

```jsonc
{
  "data": {
    "machineId": "m_01",
    "machineName": "arch2-1",
    "scores": {
      "compliance": { "value": 92, "subChecks": { "state": 100, "monitoringOnly": 100, "zone": 100, "providers": 90, "integrity": 100, "audit": 80 } },
      "inferenceSafety": { "value": 88, "safe": 120, "unsafe": 8, "review": 12, "degraded": 2, "total": 142 },
      "dignityPassRate": { "value": 85, "safe": 120, "total": 142 },
      "overall": { "value": 87, "weights": { "compliance": 0.3, "inferenceSafety": 0.3, "dignityPassRate": 0.3, "stateBias": 0.1 } }
    },
    "band": "green",
    "window": { "from": "2026-08-26T00:00:00Z", "to": "2026-08-26T14:00:00Z" },
    "emergencyStopEligible": false,
    "recentVerdicts": [
      { "verdict": "SAFE", "confidence": 0.9, "degraded": false, "createdAt": "2026-08-26T13:59:00Z" }
    ],
    "lastScoredAt": "2026-08-26T14:00:00Z"
  }
}
```

#### `GET /v1/scores/system`

Returns the overall system health aggregate (the headline gauge).

```jsonc
{
  "data": {
    "overall": 87,
    "band": "green",
    "dimensions": {
      "compliance": 90,
      "inferenceSafety": 88,
      "dignityPassRate": 85
    },
    "machineCount": 3,
    "greenCount": 2,
    "yellowCount": 1,
    "redCount": 0,
    "killSwitchState": "RUNNING",
    "emergencyStopEligible": false,
    "computedAt": "2026-08-26T14:00:00Z"
  }
}
```

#### `POST /v1/scores/recalculate`

Triggers a synchronous recalculation of all scores (bypasses the cache). Used
after a training-framework deploy or a manual config change. Returns the same
shape as `GET /v1/scores/system` plus a `recalculated: true` flag. This is an
admin-only, low-frequency operation (not on the hot path).

### Data flow

1. **Kill-switch verifier runs on inference → verdict logged.** The existing
   `VerificationService` calls `dignity-verifier-preview-v1`, gets a
   `SAFE | UNSAFE | REVIEW` verdict, persists a `verification_event` row, and
   publishes to `bcp:verification:events`. **No change to this path** — the
   scoring engine is a downstream consumer.

2. **Scoring engine aggregates verdicts per machine → score.** The engine reads
   `verification_event` rows (grouped by `machineId`, filtered to the rolling
   window), plus `machine`, `discovered_provider`, `discovered_model`,
   `integrity_event`, and `kill_switch_audit_log` rows, and computes the four
   scores. Results are cached in memory (and optionally in Redis) with a TTL.

3. **Dashboard polls/streams scores → displays.** The dashboard calls
   `GET /api/scores/*` (via the existing `/api/*` rewrite) on a poll interval,
   and/or subscribes to a new `bcp:scores:events` WebSocket channel for live
   updates. Scores render as gauges (overall + per-dimension) and charts
   (verdict distribution over time).

4. **Score drops below threshold → alert + optional emergency stop.** When a
   machine's (or the system's) score enters the **red** band, the engine:
   - raises an alert (dashboard banner + audit-log entry), and
   - marks the machine/fleet as **emergency-stop eligible**.
   Whether the emergency stop fires automatically is gated by a feature flag
   (`scoring_auto_emergency_stop`, default **off**). When enabled, a red score
   triggers the existing `killSwitchService.transitionTo('STOPPED', { reason:
   'score-red', ... })` path — reusing the audited, pubsub-broadcast,
   traffic-pausing machinery. When off (default), the red score only surfaces
   for human review, mirroring the REVIEW-tier philosophy in ADR-2026-08-23.

### Thresholds

The dashboard bands are defined on the **Dignity Test Pass Rate** (and, by
extension, the overall score):

| Band | Dignity Test Pass Rate | Overall score | Behavior |
|------|------------------------|---------------|----------|
| **Green** | ≥ 90% | ≥ 90 | Normal operation; no alert |
| **Yellow** | 70–89% | 70–89 | Warning; dashboard highlights; no auto-stop |
| **Red** | < 70% | < 70 | **Emergency-stop eligible**; alert raised; optional auto-stop (flag-gated) |

These thresholds are **configurable** via the existing `settings` table (keys
`scoring_green_threshold`, `scoring_yellow_threshold`, `scoring_red_threshold`)
and the `machineFlags` per-machine override table, so an operator can tighten a
single machine's band without a code change.

### Configuration

The scoring engine reads its configuration from the existing `settings` table
(global) and `machineFlags` (per-machine overrides), consistent with the
existing flag-resolution pattern in the dashboard. Defaults:

| Key | Default | Purpose |
|-----|---------|---------|
| `scoring_window_minutes` | `1440` (24h) | Rolling window for verdict aggregation |
| `scoring_review_weight` | `0.5` | Weight of REVIEW in inference-safety score |
| `scoring_weights` | `{"compliance":0.3,"inferenceSafety":0.3,"dignityPassRate":0.3,"stateBias":0.1}` | Overall composite weights |
| `scoring_green_threshold` | `90` | Green band floor |
| `scoring_yellow_threshold` | `70` | Yellow band floor |
| `scoring_red_threshold` | `70` | Red band ceiling (below = red) |
| `scoring_auto_emergency_stop` | `false` | Auto-stop on red (flag-gated) |
| `scoring_cache_ttl_seconds` | `30` | Score cache TTL |

### Component contracts

#### 1. Verifier ↔ Scoring Engine

- **Input:** `verification_event` rows (already persisted by `VerificationService`).
- **Contract:** The verifier guarantees every inference produces exactly one
  `verification_event` row with a valid `verdict` (`SAFE | UNSAFE | REVIEW`),
  a `machineId` (nullable — unassigned inferences are scored system-wide only),
  a `confidence`, a `degraded` flag, and a `createdAt`. The scoring engine
  reads these rows; it never writes them.

#### 2. Scoring Engine ↔ Dashboard (API)

- **Contract:** The dashboard proxies `/api/scores/*` to `/v1/scores/*` via the
  existing rewrite. All routes require admin auth. The engine is the source of
  truth; the dashboard is a read-only client (except `POST /recalculate`, which
  is admin-only). Long-running recalculation returns immediately with a job id
  and exposes status via polling or the WebSocket channel.

#### 3. Scoring Engine ↔ Kill-Switch State Machine

- **Contract:** When auto-emergency-stop is enabled and a score enters the red
  band, the engine calls `killSwitchService.transitionTo('STOPPED', { reason:
  'score-red', machineId })`. This reuses the existing audited, pubsub-broadcast,
  traffic-pausing path. The engine never invents a new state; it only triggers
  the existing STOPPED transition.

#### 4. Scoring Engine ↔ Training Framework

- **Contract:** The training framework deploys `dignity-verifier-preview-v1` to
  Ollama and updates the kill-switch `DEFAULT_MODEL` config. The scoring engine
  consumes the verdict stream produced by that model. No direct coupling — the
  engine reads whatever model the verifier is configured to use. After a deploy,
  an operator may call `POST /v1/scores/recalculate` to refresh scores against
  the new model immediately.

## Consequences

### Positive

1. **Answers the operator's core question** — the dashboard now shows whether
   each machine is safe to keep running, with a reviewable breakdown.
2. **Reuses existing data** — the engine reads already-persisted
   `verification_event`, `machine`, discovery, integrity, and audit rows; no new
   data collection.
3. **Ties directly to the training framework** — the fine-tuned
   `dignity-verifier-preview-v1` is the scorer, and the dashboard's green band
   maps to the training framework's ≥85% eval target.
4. **No new service** — the engine lives inside the existing kill-switch server,
   mirroring the inference-verification ADR's "no new service" decision.
5. **Reuses the state machine** — a red score triggers the existing STOPPED
   transition (when enabled), reusing the audited, traffic-pausing path.
6. **Configurable and reviewable** — thresholds and weights are configurable via
   the existing settings/flags tables; every score carries its evidence for
   reviewability (Dignity Test #6).

### Negative

1. **Rolling-window lag** — scores reflect the window, not the last inference;
   a sudden spike of UNSAFE verdicts takes up to `scoring_window_minutes` to
   fully move the score. Mitigated by the red-band alert firing on the window
   aggregate and by the optional auto-stop.
2. **Compliance score is heuristic** — the compliance sub-checks are weighted
   heuristics, not a formal attestation; they may not capture every config
   drift. Mitigated by keeping the sub-checks reviewable and configurable.
3. **Auto-stop is off by default** — a red score does not stop the fleet unless
   `scoring_auto_emergency_stop` is enabled, so a genuinely unsafe machine may
   keep running until a human acts. This is a deliberate safety posture (avoid
   false-positive kills), consistent with the REVIEW-tier philosophy.

### Neutral

1. **New API surface** — four new `/v1/scores/*` routes and a new
   `bcp:scores:events` channel; both are admin-only and localhost-bound.
2. **New cache** — an in-memory score cache with a TTL; adds a small memory
   footprint to the kill-switch server.
3. **Score semantics are new** — operators must learn what each score means and
   how the bands map to action; documented in this ADR and the dashboard UI.

## Alternatives considered

### Rejected: A separate scoring microservice

**Why rejected:** Adds a new service, deployment, and operational surface. The
scoring logic is a read-aggregate over existing tables plus a threshold check —
it fits naturally inside the kill-switch server, which already owns the
verification events, machine inventory, and state machine it must read and
trigger. Mirrors the inference-verification ADR's "no new service" decision.

### Rejected: Score only the Dignity Test Pass Rate (single metric)

**Why rejected:** A single metric cannot distinguish "machine is misconfigured"
from "machine is producing unsafe output." The four-dimension model gives the
operator actionable, separable signals (compliance vs. inference safety vs.
dignity pass rate) that roll up into one overall health score.

### Rejected: Compute scores on-demand only (no cache)

**Why rejected:** The dashboard polls scores on an interval; recomputing the
aggregate on every poll would hammer the DB. A short-TTL cache (default 30s)
keeps the dashboard responsive without stale data.

### Rejected: Auto-stop on red by default

**Why rejected:** A single misconfigured threshold or a transient verifier
outage could auto-kill the fleet. Auto-stop is flag-gated (default off) so a red
score surfaces for human review first, consistent with the REVIEW-tier
philosophy in ADR-2026-08-23. Operators can enable it for high-sensitivity
paths.

## References

- [Strategic Plan](./../dignity-verifier-training-framework-strategic-plan.md) — the training framework this engine consumes
- [ADR-dignity-verifier-training-framework](./ADR-dignity-verifier-training-framework.md) — the training framework architecture (the scorer)
- [ADR-2026-08-23](./ADR-2026-08-23-kill-switch-inference-verification.md) — the inference verification layer (the verdict stream this engine aggregates)
- [ADR-133](./../architecture/ADR-133-kill-switch-protocol.md) — kill-switch protocol (state machine + scoring rubric)
- [ADR-136](./../architecture/ADR-136-kill-switch-human-authorization.md) — human-signature kill authorization
- ADR-137 (zone assignment) and ADR-138 (onboarding / monitoring-only) — documented in the `machine` table comments in `apps/server-kill-switch/src/db/schema.ts`; the ADR files are not yet present in `docs/architecture/`
- `apps/server-kill-switch/src/db/schema.ts` — `verification_event`, `machine`, `discovered_provider/model`, `integrity_event`, `kill_switch_audit_log`
- `apps/server-kill-switch/src/services/verification/verification-service.ts` — persists verdicts the engine reads
- `apps/server-kill-switch/src/services/verification/verifier.ts` — the scorer (`dignity-verifier-preview-v1`)
- `apps/server-kill-switch/src/services/kill-switch.ts` — the STOPPED transition a red score can trigger
- `apps/server-kill-switch/src/routes/machines.ts` — existing route pattern for `/v1/scores/*`
- `apps/web-regulator/lib/api-client.ts` — dashboard API client (`apiGet`/`apiPost`)
- `apps/web-regulator/components/dashboard/system-health-panel.tsx` — existing gauge/panel pattern for score display
