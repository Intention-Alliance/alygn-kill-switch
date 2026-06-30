# Runbook — andler-blog-pipeline

Operations guide for the blog image generation pipeline.

## Manual Run

### Process a single manifest

```bash
bun run ~/.openclaw/workspace/skills/andler-blog-pipeline/scripts/cli.ts --event-id=my-blog-post
```

### Process all pending manifests

```bash
bun run ~/.openclaw/workspace/skills/andler-blog-pipeline/scripts/cli.ts --all
```

### Process a specific manifest with debug logging

```bash
BLOG_PIPELINE_LOG_LEVEL=debug bun run ~/.openclaw/workspace/skills/andler-blog-pipeline/scripts/cli.ts --event-id=my-blog-post
```

## Cron Setup

OpenClaw cron entry:

```
*/15 * * * * bun run ~/.openclaw/workspace/skills/andler-blog-pipeline/scripts/processor.ts
```

The processor scans `OPENCLAW_MANIFEST_DIR` for manifests with `status: pending` and processes them.

## Debugging

### Manifest stuck in `pending`

1. Check the manifest file: `cat $BLOG_PIPELINE_MANIFEST_DIR/<event_id>.json | jq .`
2. Check if the processor is running: `pgrep -f "andler-blog-pipeline/scripts/processor.ts"`
3. Run manually: `bun run scripts/cli.ts --event-id=<event_id>`
4. Check for errors in the output

### Manifest stuck in `processing`

1. The handler may have crashed mid-processing. Check server logs.
2. Reset to `pending`: `jq '.status = "pending"' $BLOG_PIPELINE_MANIFEST_DIR/<event_id>.json > /tmp/fix.json && mv /tmp/fix.json $BLOG_PIPELINE_MANIFEST_DIR/<event_id>.json`
3. Re-run: `bun run scripts/cli.ts --event-id=<event_id>`
4. The processor is idempotent — it skips assets that already exist with matching SHA-256

### Asset generation failed

1. Check the manifest `error` field for the failure reason
2. Check Gemini API quota: `BLOG_PIPELINE_GEMINI_API_KEY` must be valid
3. Check `nano-banana-pro` is accessible: `ls $BLOG_PIPELINE_NANO_BANANA_PATH`
4. Re-run the specific asset by resetting the manifest to `pending`

### WebP encoding failed

1. Check if `sharp` is installed: `bun pm ls sharp`
2. Check the input image is valid: `file <path-to-generated-png>`
3. Check the output directory exists: `ls $BLOG_PIPELINE_OUTPUT_DIR`

## Recovery

### Partial generation recovery

If a manifest has `status: partial` (some assets ready, some failed):

1. Check which assets failed: `jq '.error.failed_assets' $BLOG_PIPELINE_MANIFEST_DIR/<event_id>.json`
2. Reset manifest to `pending`: `jq '.status = "pending"' ... > /tmp/fix.json && mv /tmp/fix.json ...`
3. Re-run: `bun run scripts/cli.ts --event-id=<event_id>`
4. The processor skips assets that already exist with matching SHA-256 (idempotent)

### Full regeneration

To force full regeneration (ignore existing assets):

```bash
# Delete the manifest
rm $BLOG_PIPELINE_MANIFEST_DIR/<event_id>.json

# Delete the generated assets
rm -rf $BLOG_PIPELINE_OUTPUT_DIR/<slug>/

# Re-submit the request (from Vercel or manually)
# The next Vercel cron will POST a new request
```

### Corrupted manifest

```bash
# Check if the manifest is valid JSON
cat $BLOG_PIPELINE_MANIFEST_DIR/<event_id>.json | jq .

# If corrupted, delete it — the next request will create a fresh one
rm $BLOG_PIPELINE_MANIFEST_DIR/<event_id>.json
```