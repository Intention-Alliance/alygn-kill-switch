# ADR-133: Kill Switch Protocol with Per-Machine Agents

## Status

**Accepted** — 2026-05-13

## Context

The ALYGN sovereign compliance infrastructure requires a kill switch mechanism that can stop harmful LLM-generated content at the request level. The kill switch must be:

1. **Safety-critical** — Failures can result in harmful content reaching users
2. **Real-time** — Operators need sub-second visibility into state changes
3. **Auditable** — Every state transition must be recorded with trace IDs and user attribution
4. **Survivable** — Activation history must survive server restarts and container recycles
5. **Granular** — Ability to block at per-machine or per-agent level, not just global
6. **Reliable** — No false positives (429 errors during critical operations)

The current implementation has significant gaps:

| Issue | Current State | Impact |
|-------|--------------|--------|
| Rate limiter | 10 req/min for all endpoints | 429 errors block Retry/Emergency Stop + polling |
| Real-time updates | HTTP polling every 5s | Up to 5s delay for safety-critical state changes |
| Audit persistence | In-memory array | Activation history lost on restart |
| Machine inventory | Hardcoded `INITIAL_MACHINES` | Cannot register new machines |
| Settings | Local React state only | Nothing persists across page reloads |

## Decision

### 1. Per-Machine Agent Architecture

Each machine in the ALYGN network runs a scoring agent that:

1. Intercepts LLM requests before they reach the model
2. Scores requests using a **combined rubric**: semantic analysis + keyword detection + pattern matching
3. Compares score against the configured `auto_stop_threshold` flag
4. Blocks requests above threshold OR forwards them to the LLM

**Agent lifecycle:**

```
Machine registers → Agent registers → Heartbeat every 30s → Events streamed via Redis pubsub → Dashboard real-time
```

**Per-machine flag overrides** (`machine_flags` table): Machine-level flags take precedence over global flags. A machine can have a stricter `auto_stop_threshold` (0.5) than the global default (0.7), or disable `llm_interception_enabled` entirely for specific machines.

### 2. Scoring-Based Blocking (Q3 Combined)

Three scoring dimensions, weighted and combined:

| Dimension | Weight | Method |
|-----------|--------|--------|
| Semantic analysis | 50% | NLP model classifies request intent/output against harm categories |
| Keyword detection | 30% | Predefined blocklist + regex patterns for known harmful terms |
| Pattern matching | 20% | Heuristic rules (e.g., request length anomaly, repeated patterns) |

**Threshold logic:**

```
combined_score >= auto_stop_threshold → BLOCK request
combined_score < auto_stop_threshold  → FORWARD to LLM
```

### 3. WebSocket Real-Time Protocol (Q7)

Replace HTTP polling with WebSocket connections for all dashboard clients:

```
Client ←→ WebSocket ←→ Redis PubSub ←→ Kill Switch Service
```

**Channels:**

| Redis Channel | Purpose | Producer | Consumers |
|--------------|---------|----------|-----------|
| `bcp:kill-switch:chaos` | State transitions | Kill Switch Service | WebSocket Manager → All clients |
| `bcp:flags:updates` | Flag CRUD | Flags Routes | WebSocket Manager → All clients |
| `bcp:agents:events` | Agent interceptions/heartbeats | Agent Routes | WebSocket Manager → All clients |
| `bcp:machines:events` | Machine register/update/offline | Machine Routes | WebSocket Manager → All clients |

**Fallback:** If WebSocket fails after 5 retry attempts, the client falls back to HTTP polling at 5s intervals. This ensures the dashboard is never completely dead.

### 4. Split Rate Limits (Q8)

Separate rate limits for read vs. write operations:

| Operation Type | Limit | Window | Rationale |
|---------------|-------|--------|-----------|
| Reads (GET) | 60/min | 60s | Polling, status checks — high volume acceptable |
| Writes (POST/PUT/DELETE) | 10/min | 60s | State changes, config updates — deliberate actions |
| Auth endpoints | 5/min | 60s | Login attempts — abuse prevention |
| Heartbeat | Unlimited | — | Machine health checks — bypass rate limiter |
| WebSocket | Not rate-limited | — | Persistent connection, message-level throttling separate |

This eliminates the current 429 errors during critical operations (Emergency Stop was blocked because it shared the same 10 req/min pool as polling requests).

### 5. SQLite Persistence for All State

All application state that currently lives in memory is migrated to SQLite:

| Data | Before | After |
|------|--------|-------|
| Activation history | `auditLog: AuditEntry[]` (in-memory, max 1000) | `kill_switch_audit_log` table |
| Machine inventory | `INITIAL_MACHINES: Machine[]` (hardcoded) | `machine` table |
| Settings | Local React state | `setting` table |
| Flag overrides | N/A (didn't exist) | `machine_flag` table |
| Agent registry | N/A (didn't exist) | `agent` table |

### 6. Design System Compliance (Q9)

All new frontend components use the monorepo design system:

- **Font:** Figtree Variable (already configured in `app/layout.tsx`)
- **Colors:** OKLCH-based via Tailwind v4 `oklch()` functions
- **Components:** shadcn/ui (already installed, verified in `components/ui/`)
- **Border radius:** 0.45rem (matched to existing shadcn/ui defaults)

## Consequences

### Positive

1. **Real-time safety** — State changes propagate to all dashboards in <100ms via WebSocket
2. **Granular control** — Per-machine flags allow different safety profiles for different nodes
3. **Audit durability** — All state transitions survive restarts, with trace IDs linking to distributed traces
4. **No false 429s** — Split rate limits ensure critical operations never compete with polling
5. **Extensible** — Agent registry + machine inventory enable future scaling to many machines

### Negative

1. **Increased complexity** — WebSocket adds connection management, reconnection logic, and two code paths (WS + HTTP fallback)
2. **Schema migration risk** — Replacing `kill_switch_audit_log` and `machine` tables requires dropping existing data (acceptable at this development stage, but needs migration strategy for production)
3. **Token exposure** — Better-Auth session tokens in WebSocket query strings require log redaction
4. **Connection overhead** — Each dashboard client maintains a persistent WebSocket + Redis subscription

### Neutral

1. **WS → HTTP fallback** ensures the dashboard never fully breaks, but adds dual code paths to test
2. **SQLite for audit log** is performant enough for current scale (<1000 entries), but may need sharding/tiered storage for production scale
3. **Per-machine agents** require agent software deployment on each machine — this is future scope (Phase 2+)

## Future: DPU Layer

The current architecture handles scoring and blocking at the **software layer** (agent → scoring engine → block/pass). For defense-in-depth, a **hardware-level DPU (Data Processing Unit)** would:

1. Intercept LLM requests at the NIC/PCIe level — before they reach CPU memory
2. Apply the same scoring logic in hardware (DPU-accelerated inference)
3. Block harmful traffic at wire speed — no software bypass possible

**When a machine has a DPU** (indicated by `machine.hasDpu = true` and `specs.dpu` populated), the system architecture becomes:

```
Agent (software) → DPU (hardware) → Scoring Engine → Block/Pass
                         ↑
                    Bypass impossible
```

The DPU layer is **future scope** due to current hardware limitations (no BlueField/Octeon cards available). The software-only architecture is designed to accommodate a DPU layer later with zero API changes — the `hasDpu` flag and `dpu` field in `MachineStatus` already support the transition.

## Alternatives Considered

### Rejected: Centralized Kill Switch (no per-machine agents)

**Why rejected:** A single global kill switch can't distinguish between machines. A false trigger on one machine should not affect others. Per-machine agents + flags provide granularity.

### Rejected: Pure HTTP Polling (no WebSocket)

**Why rejected:** 5s polling delay is unacceptable for a safety-critical system. State changes must propagate in <100ms. WebSocket with HTTP fallback is the standard pattern for real-time safety dashboards.

### Rejected: PostgreSQL instead of SQLite

**Why rejected:** SQLite with WAL mode is sufficient for single-server deployment. It eliminates the operational complexity of running a PostgreSQL instance. If the system scales to multi-server, migration to PostgreSQL is straightforward (Drizzle ORM abstracts the dialect).

## References

- [WebSocket Protocol Specification](./websocket-protocol.md)
- [SQLite Schema Additions](./schema-additions.md)
- [Machines API Schema](./machines-api.md)
- [Settings Persistence Schema](./settings-api.md)
- [Task Breakdown](./task-breakdown.md)
- `apps/server-kill-switch/src/services/kill-switch.ts` — Current state machine implementation
- `packages/shared-types/src/kill-switch.ts` — Canonical type definitions
