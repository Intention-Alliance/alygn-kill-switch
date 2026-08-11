# Migration from Push-Webhook — What Changed and Why

## What Changed

The blog pipeline previously used a **push-webhook architecture** (ADR-001 §5 Option 3):

1. Vercel cron fires → Vercel webhook route (`/api/webhooks/openclaw-image-gen`) forwards via HMAC-signed POST to andlersrv
2. andlersrv HTTP listener (`openclaw-image-webhook.mjs`) receives the request, verifies HMAC with shared secret
3. Image processor (`image-request-processor.mjs`) generates images, writes to `public/images/blog/`

### Problems Identified (Post-Mortem 2026-06-29)

- **Repository coupling**: Server-only scripts (`openclaw-image-webhook.mjs`, `image-request-processor.mjs`, `openclaw-webhook-setup.md`) lived in the app repo with hardcoded `/home/andlersrv/` paths, systemd units, and nginx configs.
- **Secret coupling**: `OPENCLAW_WEBHOOK_SECRET` was shared between Vercel and andlersrv. The actual secret leaked into `.env`. Changing it required coordinated updates on both sides.
- **Runtime coupling**: Server scripts were `.mjs` (Node ESM), out of step with the Bun + TypeScript agent stack.

## What Replaced It (ADR-012)

A **pull-based architecture** with reusable event-routing infrastructure:

1. **`openclaw-webhook`** (this skill): Generic event-routing fabric. JWT-asymmetric auth (no shared secret). Routes by `event_type` to registered handlers.
2. **`andler-blog-pipeline`** (first consumer): Orchestrates `nano-banana-pro` for image generation. Encodes WebP with quality preservation. Registers as handler for `blog-pipeline.request`.
3. **Vercel poll consumer** (`/api/cron/blog-poll-status/`): Vercel cron polls the status endpoint, fetches base64 assets, writes to Vercel Blob Storage.

### Key Differences

| Aspect | Old (Push-Webhook) | New (Pull-Based + JWT) |
|--------|--------------------|-----------------------|
| Auth | Shared HMAC secret | JWT-asymmetric (RS256/EdDSA) |
| Direction | Vercel pushes to andlersrv | Vercel polls andlersrv status endpoint |
| Secret management | Coordinated rotation on both sides | Independent key rotation per side |
| Server scripts location | App repo (`scripts/blog-pipeline/`) | Skills dir (`~/.openclaw/workspace/skills/`) |
| Runtime | Node ESM (`.mjs`) | Bun + TypeScript (`.ts`) |
| Asset delivery | Write to `public/images/blog/` (triggers rebuild) | base64 in JSON → Vercel Blob Storage (no rebuild) |
| Reusability | Single-purpose (blog only) | Generic event fabric (blog-pipeline, future live-chat, etc.) |

## References

- **Post-mortem**: `~/.openclaw/workspace/docs/reports/blog-pipeline-post-mortem-2026-06-29.md`
- **ADR-012**: `docs/architecture/ADRs/ADR-012-pull-based-webhook-architecture.md` (in andler-landing repo)
- **Legacy files** (to be deleted in cutover):
  - `scripts/blog-pipeline/openclaw-image-webhook.mjs`
  - `scripts/blog-pipeline/image-request-processor.mjs`
  - `scripts/blog-pipeline/openclaw-webhook-setup.md`
  - `src/app/api/webhooks/openclaw-image-gen/route.ts`

## Why Hard Switch (No Backwards-Compat)

The old webhook architecture was never deployed to production. There are no live consumers to break. A hard switch means: delete the old files, deploy the new architecture, done.