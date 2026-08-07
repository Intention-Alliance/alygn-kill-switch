---
name: live-chat-bridge
description: >
  Event handler for live-chat.message events from the andler-chatbot-spike.
  Validates inbound JWT-signed payloads (EdDSA), deduplicates by event_id,
  rate-limits per IP, and routes to the lobster pipeline (escalate) or
  synchronous slot lookup (list_slots). Sibling skill to openclaw-webhook.
  Transport: Tailscale mesh. Auth: JWT-asymmetric (EdDSA). Runs on andlersrv only.
---

# live-chat-bridge

Event handler skill for `live-chat.message` events routed by `openclaw-webhook`. This skill is the **bridge** between the spike app's verdict/handoff (Block 3) and the deterministic lobster pipeline (Block 5). It validates inbound payloads, deduplicates by event_id, and routes to the appropriate downstream.

## When to Activate

Activate when:
- A `live-chat.message` event arrives at the openclaw-webhook server
- Registering the `live-chat.message` handler in openclaw-webhook's boot sequence
- Debugging payload validation or deduplication for live-chat events
- Reviewing the event contract for prospect intake escalation

Triggers: "live-chat", "prospect escalation", "live-chat.message", "verdict posting", "calendar slots"

## Core Concepts

- **Bridge, not fabric.** This skill handles `live-chat.message` events routed by `openclaw-webhook`. It does NOT implement the HTTP server, JWT verification, or manifest lifecycle — that's `openclaw-webhook`'s job. This skill receives already-JWT-verified payloads and returns a `HandlerResult`.
- **Two actions: escalate + list_slots.** The `escalate` action invokes the lobster pipeline (`live-chat-bridge.lobster`) for verdict posting, Notion row creation, Discord thread creation, and Andler approval. The `list_slots` action calls `prospect-intake-list-slots.mjs` synchronously for calendar slot lookup.
- **EdDSA JWT auth.** The spike signs JWTs with its Ed25519 private key. The `openclaw-webhook` server verifies with the spike's public key from `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR`. Same key material as Block 3's signer.
- **Idempotency: in-memory LRU dedupe.** Deduplicates by `event_id` (the JWT `jti` claim) using an in-memory LRU cache (size 1000, 24h TTL). Sufficient for the spike — no Redis dependency. Documented choice: production hardening (Block 9) may upgrade to Redis.
- **Rate limit: 100 events/min/IP.** Per ADR-136 § rate-limit. In-memory token bucket counter. The openclaw-webhook server enforces its own 10 req/min limit; this skill enforces 100 events/min as a secondary safety net for burst scenarios.
- **Error contract.** `{ ok: false, reason, retry_after }` per ADR-138 § script-shape. Exit codes: 0=ok / 1=validation / 2=auth / 3=upstream / 4=timeout.
- **Bun runtime.** `bun install`, `bun tsc --noEmit`, `bun test`. No npm/npx.

## Architecture

```
[Spike app — escalate_to_andler / get_calendar_slots tool]
      ↓ JWT-signed POST to openclaw-webhook
[openclaw-webhook server — verifies JWT, creates manifest, routes by event_type]
      ↓ calls handleLiveChatMessage(payload, manifest)
[live-chat-bridge handler — validates payload, dedupes, rate-limits]
      ↓ action: "escalate"                    ↓ action: "list_slots"
[lobster pipeline — 8 steps]           [prospect-intake-list-slots.mjs — sync]
      ↓                                        ↓
[HandlerResult: processing]            [HandlerResult: ready + slots]
      ↓
[Spike polls /webhook/status for final result]
```

## Payload Schemas

Refer to [`references/event-contract.md`](./references/event-contract.md) for the full request/response schemas, JWT claims, and error codes. The contract references `openclaw-webhook/references/event-types.md` for base JWT auth — it does NOT duplicate the base contract.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/boot.ts` | Registers handler in openclaw-webhook's handler registry on module import |
| `scripts/handler.ts` | Main handler function — validates, dedupes, rate-limits, routes to lobster or sync slot lookup |
| `scripts/validate-payload.ts` | Zod schemas for `EscalatePayload` and `SlotsPayload` (discriminated union on `action`) |

## I/O Contract

### Input (from openclaw-webhook server)

```typescript
// handler.ts signature
export async function handleLiveChatMessage(
  payload: unknown,
  manifest: EventManifest
): Promise<HandlerResult>
```

The `payload` is the validated request body (already JWT-verified by openclaw-webhook). The `manifest` is the event manifest created by openclaw-webhook.

### Output (HandlerResult)

```typescript
// For escalate (async pipeline):
{ status: "processing" }

// For list_slots (sync result):
{ status: "ready", assets: [{ type: "calendar_slots", ... }] }

// For errors:
{ status: "failed", error: { code: "INVALID_PAYLOAD" | "PIPELINE_ERROR" | "TIMEOUT" | "HANDLER_ERROR", message: string } }
```

## Cross-Skill Coordination

- **`openclaw-webhook`** — parent skill. Routes `live-chat.message` events to this handler. Handles JWT verification, manifest lifecycle, rate limiting at the fabric level.
- **`andler-dev-prospect-intake`** — defines the CSR role protocol, diagnostic loop, ghost-stall semantics. This skill bridges the spike's tool calls to the lobster pipeline that orchestrates the intake scripts.
- **Lobster pipeline** (`live-chat-bridge.lobster`) — 8-step deterministic orchestration: validate → load-context → diagnose → flag → await-approval → hand-off-notion → post-discord → release-reply.

## Integration

- **Transport:** Tailscale mesh (andlersrv accessible via Tailscale hostname)
- **Auth:** JWT-asymmetric (EdDSA) via `jose` library — verified by openclaw-webhook server
- **Runtime:** Bun + TypeScript (no Node ESM, no npm/npx)
- **Dedup:** In-memory LRU cache (size 1000, 24h TTL) by event_id
- **Rate limit:** 100 events/min/IP (in-memory token bucket)
- **Pipeline:** Lobster (`live-chat-bridge.lobster`) for escalate action
- **Scripts:** `prospect-intake-list-slots.mjs` for list_slots action (Block 7, Keridz ⚙️)

## Registration

Add to `openclaw-webhook/scripts/boot.ts`:

```typescript
await import('../../live-chat-bridge/scripts/boot.ts')
```

Event type registration in `openclaw-webhook/references/event-types.md`:

| Event Type | Handler | Status |
|------------|---------|--------|
| `live-chat.message` | `live-chat-bridge` | Active |

## References

- [Event Contract](./references/event-contract.md) — payload schemas, error codes, JWT claims for live-chat.message
- [openclaw-webhook API Contract](../openclaw-webhook/references/api-contract.md) — base JWT auth, endpoints, status polling
- [openclaw-webhook Event Types](../openclaw-webhook/references/event-types.md) — event type registration table
- [Architecture Spec § 3](../../repos/local/andler-chatbot-spike/docs/ARCHITECTURE-SPEC.md) — Component 2 (this skill) full spec
- [andler-dev-prospect-intake SKILL.md](../andler-dev-prospect-intake/SKILL.md) — CSR role protocol, diagnostic loop

## Skill Metadata

**Created**: 2026-07-04
**Author**: Keridz ⚙️ (Backend Coder)
**Version**: 0.1.0
**ADR Reference**: ADR-136 (Safe Messaging Agent + Webhook Contract), ADR-138 (Script Shape)
**Block**: 4 (live-chat-bridge skill)