---
name: andler-blog-pipeline
description: >
  Server-side blog image generation pipeline for andler.dev.
  First consumer of openclaw-webhook event-routing fabric.
  Orchestrates nano-banana-pro for image generation, encodes assets as base64
  with WebP quality preservation, tracks GIFs as URL references,
  and registers as a handler for event_type: "blog-pipeline.request".
  Runs on andlersrv only.
---

# andler-blog-pipeline

Server-side blog image generation pipeline. Picks up Ready-status articles from Notion via `openclaw-webhook`, generates images through `nano-banana-pro`, encodes assets as WebP with quality preservation (`effort: 6` + `preset: 'photo'`), and serves them via the `openclaw-webhook` status endpoint.

## When to Activate

Activate when:
- Processing blog image generation requests from Vercel
- Running the blog pipeline processor (cron or manual)
- Debugging a stuck manifest or partial asset generation
- Registering the blog-pipeline handler with `openclaw-webhook`

Triggers: "blog pipeline", "blog image generation", "blog asset status", "blog-pipeline"

## Core Concepts

- **First consumer of `openclaw-webhook`.** Registers as the handler for `event_type: "blog-pipeline.request"`. The webhook server routes incoming requests to this skill's handler.
- **Orchestrates `nano-banana-pro`** for actual image generation. Calls `generate_image.py` with prompts derived from the article metadata (title, category, palette, excerpt).
- **WebP quality preservation.** Encodes images using `sharp` with `effort: 6` (max CPU effort) and `preset: 'photo'` (photographic content optimization). File size reduction without quality loss. Falls back to quality reduction ONLY if effort-6 encoding still exceeds the asset size cap.
- **GIFs as URL references.** GIF assets are tracked as URL references in the manifest, not base64-embedded. They are stored as static files and served by URL.
- **Idempotent processing.** The processor skips assets that already exist with matching SHA-256. Re-running on the same manifest is safe.
- **Base64 delivery.** WebP assets are base64-encoded in the status response JSON. Vercel decodes and writes to Vercel Blob Storage.

## Handler Registration

The handler registers with `openclaw-webhook` at startup:

```typescript
import { registerHandler } from '../../openclaw-webhook/scripts/server.ts'

registerHandler('blog-pipeline.request', async (payload, manifest) => {
  // Process the blog image generation request
  // Generate images via nano-banana-pro
  // Encode as WebP with quality preservation
  // Return result with assets
})
```

The handler is called by `openclaw-webhook` when a JWT-signed POST with `event_type: "blog-pipeline.request"` is received. The handler processes the request asynchronously and updates the manifest when complete.

## Image Generation Pipeline

1. **Receive request** — `openclaw-webhook` routes to handler with payload (slug, title, excerpt, category, palette, assets[])
2. **Generate images** — For each asset in the request, call `nano-banana-pro`'s `generate_image.py` with a prompt derived from the article metadata
3. **Encode WebP** — Convert generated PNGs to WebP using `sharp` with `effort: 6` + `preset: 'photo'`
4. **Track GIFs** — GIF assets are stored as URL references, not base64
5. **Update manifest** — Write the result (status, assets with base64 + SHA-256) to the manifest file
6. **Status available** — Vercel polls `openclaw-webhook` status endpoint, receives base64 assets

## Cross-Skill Coordination

- **`openclaw-webhook`** — event-routing fabric. This skill registers as its first consumer for `blog-pipeline.request`.
- **`nano-banana-pro`** — image generation skill. This skill calls `generate_image.py` for each requested asset.
- **`andler-blog-feed-content`** v1.2 — shares article metadata schema (slug, title, category, palette). This skill receives requests that originate from the Notion 'Blog Content Pipeline' DB, which `andler-blog-feed-content` also reads from.
- **`andler-develops-content`** v1.2 — content-side counterpart. Delegates blog articles to this skill via the Notion DB (Status: Draft -> Ready). This skill picks up Ready-status articles.
- **`andler-devs-code-style`** v1.0 — code conventions for all new code in this skill.

## Integration

- **Runtime:** Bun + TypeScript
- **Image generation:** `nano-banana-pro` (`uv run generate_image.py`)
- **Image encoding:** `sharp` (WebP with `effort: 6` + `preset: 'photo'`)
- **Handler registration:** In-process module import from `openclaw-webhook`
- **Manifest storage:** `OPENCLAW_MANIFEST_DIR` (shared with `openclaw-webhook`)
- **Asset output:** `BLOG_PIPELINE_OUTPUT_DIR` (default `~/.openclaw/workspace/.staging/blog-pipeline-assets/`)
- **Cron:** OpenClaw `*/15` for `processor.ts` (scan for pending manifests, process them)

## References

- [API Contract](./references/api-contract.md) — blog-pipeline-specific payload schemas
- [Environment Variables](./references/env-vars.md) — required env vars
- [Runbook](./references/runbook.md) — manual run, debug, recover

## Skill Metadata

**Created**: 2026-06-29
**Author**: Keridz ⚙️ (Backend Coder)
**Version**: 1.0.0
**ADR Reference**: ADR-012