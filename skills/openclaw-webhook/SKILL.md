---
name: openclaw-webhook
description: >
  Generic event-routing fabric for cross-deployment-target calls.
  Receives signed JWT requests, validates signature with public key,
  routes by event_type to registered handlers, exposes status endpoints.
  Transport: Tailscale mesh. Auth: JWT-asymmetric (RS256/EdDSA).
  Runs on andlersrv only.
---

# openclaw-webhook

Reusable event-routing infrastructure for all cross-deployment-target event flows between Vercel (ephemeral/serverless) and andlersrv (persistent/OpenClaw). This skill is the **generic fabric** — it routes events, validates JWTs, and manages the manifest lifecycle. It does NOT handle business logic; that belongs to consumer skills like `andler-blog-pipeline`.

## When to Activate

Activate when:
- Starting or managing the webhook event router on andlersrv
- Registering a new event handler (e.g., `blog-pipeline.*`, `live-chat.message`)
- Debugging JWT verification or event routing issues
- Rotating JWT signing keys
- Reviewing the API contract for cross-deployment-target calls

Triggers: "webhook", "event routing", "cross-deployment", "openclaw-webhook", "JWT verification", "event handler registration"

## Core Concepts

- **Event-routing fabric, not single-purpose.** This skill routes events by `event_type` to registered handlers. The first consumer is `andler-blog-pipeline` (blog image generation). Future consumers include `live-chat.message` (prospect communication).
- **JWT-asymmetric auth.** Senders sign JWTs with their private key (RS256 or EdDSA). This server verifies with the corresponding public key from `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR`. No shared secret between deployment targets.
- **Tailscale transport.** All traffic flows over the Tailscale mesh. The server binds to `127.0.0.1` only (MEMORY lesson 27). Tailscale provides transport-layer encryption; JWT provides application-layer auth.
- **Manifest lifecycle.** Each event has a manifest JSON file in `OPENCLAW_MANIFEST_DIR`. The manifest tracks: event_type, event_id, requester, payload_sha256, payload (full request body), status, handler, created_at, expires_at.
- **In-process handler registry.** Handlers register themselves at startup. The registry maps `event_type` strings to handler functions. For now, this is a simple in-process module map — future versions may support dynamic loading.
- **Boot entry point.** `scripts/boot.ts` starts the server AND dynamically imports handler modules so they register via `registerHandler()`. OpenClaw cron starts `boot.ts`, not `server.ts` directly. To add a new handler, add its dynamic import to `boot.ts`.

## API Contract

Refer to [`references/api-contract.md`](./references/api-contract.md) for the full request/response schemas, JWT claims, and endpoint definitions.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/webhook/request` | Accept signed JWT, validate, route by `event_type` to registered handler |
| `GET` | `/webhook/status` | Query status for a specific event (query params: `event_type`, `event_id`) |

### JWT Claims (required)

| Claim | Description |
|-------|-------------|
| `iss` | Issuer — caller identity (e.g., `vercel`) |
| `aud` | Audience — receiver identity (e.g., `openclaw-webhook`) |
| `sub` | Subject — what this event is about (slug or event ID) |
| `event_type` | Routing key (e.g., `blog-pipeline.request`) |
| `iat` | Issued-at timestamp |
| `exp` | Expiry timestamp (iat + 300s max) |
| `jti` | Unique event ID (UUID v4, for deduplication) |
| `payload_sha256` | SHA-256 hash of the request body (integrity verification) |

## Event Types

Currently registered:

| Event Type | Handler | Description |
|------------|---------|-------------|
| `blog-pipeline.request` | `andler-blog-pipeline` | Blog image generation request |

Future event types (planned):

| Event Type | Handler | Description |
|------------|---------|-------------|
| `live-chat.message` | (TBD) | Prospect communication via andlersrv AI agents |

## Cross-Skill Coordination

- **`andler-blog-pipeline`** — first consumer. Registers as handler for `event_type: "blog-pipeline.request"`. Orchestrates `nano-banana-pro` for image generation.
- **`nano-banana-pro`** — image generation skill, called by `andler-blog-pipeline` (not directly by this skill).
- **`andler-blog-feed-content`** v1.2 — shares article metadata schema (slug, title, category, palette) with `andler-blog-pipeline`.
- **`andler-develops-content`** v1.2 — content-side counterpart; delegates blog articles to `andler-blog-pipeline` via Notion DB.

## Integration

- **Transport:** Tailscale mesh (andlersrv accessible via Tailscale hostname)
- **Auth:** JWT-asymmetric (RS256 or EdDSA) via `jose` library
- **Runtime:** Bun + TypeScript (no Node ESM, no .mjs)
- **Port:** `OPENCLAW_WEBHOOK_PORT` (default 18765), bound to `127.0.0.1` only
- **Keys:** Private key at `OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH`, trusted public keys in `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR`
- **Manifests:** JSON files in `OPENCLAW_MANIFEST_DIR` (default `~/.openclaw/workspace/.staging/webhook-manifests/`)

## References

- [API Contract](./references/api-contract.md) — JWT auth, endpoint schemas, request/response examples
- [Environment Variables](./references/env-vars.md) — required env vars
- [Runbook](./references/runbook.md) — start, stop, debug, recover, key rotation
- [Migration from Webhook](./references/migration-from-webhook.md) — what changed and why

## Skill Metadata

**Created**: 2026-06-29
**Author**: Keridz ⚙️ (Backend Coder)
**Version**: 1.0.0
**ADR Reference**: ADR-012 (`docs/architecture/ADRs/ADR-012-pull-based-webhook-architecture.md`)