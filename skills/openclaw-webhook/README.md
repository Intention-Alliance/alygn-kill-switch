# openclaw-webhook

Generic event-routing fabric for cross-deployment-target calls between Vercel and andlersrv.

## What This Skill Does

Receives signed JWT requests, validates signatures with public keys, routes by `event_type` to registered handlers, and exposes a status endpoint for polling. This is the **reusable infrastructure** — business logic lives in consumer skills like `andler-blog-pipeline`.

## When to Use

- Starting the event router on andlersrv
- Registering a new event handler
- Debugging JWT verification or event routing
- Rotating JWT signing keys

## Who Calls It

- **Vercel cron** (`/api/cron/blog-poll-status/`) — polls the status endpoint with JWT-signed GET requests
- **Vercel cron** (`/api/cron/blog-ingest/`) — writes requests with JWT-signed POST
- **`andler-blog-pipeline`** — registers as the handler for `blog-pipeline.request`

## Quick Start

```bash
# Set env vars
export OPENCLAW_WEBHOOK_PORT=18765
export OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH=~/.openclaw/workspace/.staging/webhook-keys/openclaw-private.pem
export OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR=~/.openclaw/workspace/.staging/webhook-keys/trusted/
export OPENCLAW_MANIFEST_DIR=~/.openclaw/workspace/.staging/webhook-manifests/

# Generate keys
bun run ~/.openclaw/workspace/skills/openclaw-webhook/scripts/rotate-keys.ts

# Start the server
bun run ~/.openclaw/workspace/skills/openclaw-webhook/scripts/server.ts
```

## References

- [SKILL.md](./SKILL.md) — full skill documentation
- [API Contract](./references/api-contract.md) — endpoint schemas
- [Env Vars](./references/env-vars.md) — configuration
- [Runbook](./references/runbook.md) — operations guide
- [Migration](./references/migration-from-webhook.md) — what changed from the old architecture
- ADR-012 — the canonical contract