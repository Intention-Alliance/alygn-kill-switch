# Environment Variables — andler-blog-pipeline

All env vars are server-only. Never expose to client bundles.

## Required

| Variable | Default | Description |
|----------|---------|-------------|
| `BLOG_PIPELINE_OUTPUT_DIR` | `~/.openclaw/workspace/.staging/blog-pipeline-assets/` | Directory for generated image assets (pre-encoding). |
| `BLOG_PIPELINE_GEMINI_API_KEY` | — | Gemini API key for nano-banana-pro image generation. Falls back to `GEMINI_API_KEY` if not set. |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `BLOG_PIPELINE_MAX_ASSET_BYTES` | `4194304` (4MB) | Max size per encoded WebP asset. If effort-6 encoding exceeds this, quality reduction is applied. |
| `BLOG_PIPELINE_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error`. |
| `BLOG_PIPELINE_NANO_BANANA_PATH` | `~/.openclaw/workspace/skills/nano-banana-pro/scripts/generate_image.py` | Path to nano-banana-pro's generate_image.py. |
| `BLOG_PIPELINE_MANIFEST_DIR` | `~/.openclaw/workspace/.staging/webhook-manifests/` | Directory for event manifests (shared with openclaw-webhook). |

## Setup

```bash
# Create the output directory
mkdir -p ~/.openclaw/workspace/.staging/blog-pipeline-assets/

# Set env vars
export BLOG_PIPELINE_OUTPUT_DIR=~/.openclaw/workspace/.staging/blog-pipeline-assets/
export BLOG_PIPELINE_GEMINI_API_KEY=your-gemini-api-key
export BLOG_PIPELINE_LOG_LEVEL=info
```