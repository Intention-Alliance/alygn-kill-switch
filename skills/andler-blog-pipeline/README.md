# andler-blog-pipeline

Server-side blog image generation pipeline for andler.dev. First consumer of `openclaw-webhook`.

## What This Skill Does

Receives blog image generation requests from Vercel (via `openclaw-webhook`), generates images using `nano-banana-pro`, encodes as WebP with quality preservation (`effort: 6` + `preset: 'photo'`), and serves them via the `openclaw-webhook` status endpoint.

## When to Use

- Processing blog image generation requests
- Running the pipeline processor (cron or manual)
- Debugging a stuck manifest or partial generation

## Quick Start

```bash
# Set env vars
export BLOG_PIPELINE_OUTPUT_DIR=~/.openclaw/workspace/.staging/blog-pipeline-assets/
export BLOG_PIPELINE_GEMINI_API_KEY=your-key

# Process all pending manifests
bun run ~/.openclaw/workspace/skills/andler-blog-pipeline/scripts/cli.ts --all

# Process a single manifest
bun run ~/.openclaw/workspace/skills/andler-blog-pipeline/scripts/cli.ts --event-id=my-blog-post

# List all manifests
bun run ~/.openclaw/workspace/skills/andler-blog-pipeline/scripts/cli.ts --list
```

## References

- [SKILL.md](./SKILL.md) — full skill documentation
- [API Contract](./references/api-contract.md) — payload schemas
- [Env Vars](./references/env-vars.md) — configuration
- [Runbook](./references/runbook.md) — operations guide
- ADR-012 — the canonical contract