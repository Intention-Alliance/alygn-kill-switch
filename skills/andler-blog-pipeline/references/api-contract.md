# API Contract — andler-blog-pipeline

Blog-pipeline-specific payload schemas. References ADR-012 for the base contract, adds blog-specific fields.

## Request Payload (`blog-pipeline.request`)

The POST body sent by Vercel to `openclaw-webhook`, which routes it to this handler.

```json
{
  "slug": "my-blog-post",
  "title": "My Blog Post Title",
  "excerpt": "A short description of the article",
  "category": "Engineering",
  "palette": "#1a1a2e",
  "assets": [
    {
      "type": "cover",
      "prompt": "Generate a cover image for a blog post about TypeScript patterns. Style: modern, minimalist, dark background with accent color #1a1a2e.",
      "width": 1200,
      "height": 630,
      "alt_text": "Cover image for My Blog Post Title",
      "target_path": "public/images/blog/my-blog-post/cover.webp"
    },
    {
      "type": "thumbnail",
      "prompt": "Generate a thumbnail image for a blog post about TypeScript patterns.",
      "width": 600,
      "height": 315,
      "alt_text": "Thumbnail for My Blog Post Title",
      "target_path": "public/images/blog/my-blog-post/thumbnail.webp"
    },
    {
      "type": "og_image",
      "prompt": "Generate an Open Graph image for social sharing.",
      "width": 1200,
      "height": 630,
      "alt_text": "OG image for My Blog Post Title",
      "target_path": "public/images/blog/my-blog-post/og_image.webp"
    }
  ]
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | yes | Blog post slug (matches `^[a-z0-9-]+$`) |
| `title` | string | yes | Article title (used for image prompt context) |
| `excerpt` | string | no | Article excerpt (optional context for image prompt) |
| `category` | string | yes | Article category (determines image style) |
| `palette` | string | no | Color palette hint (hex color, e.g. `#1a1a2e`) |
| `assets` | Asset[] | yes | Array of asset requests (1-7 per article) |

### Asset Types

| Type | Dimensions | MIME | Description |
|------|-----------|------|-------------|
| `cover` | 1200x630 | image/webp | Featured cover image |
| `thumbnail` | 600x315 | image/webp | Card thumbnail |
| `og_image` | 1200x630 | image/webp | Open Graph social sharing image |
| `portrait` | 1200x630 | image/webp | Article portrait/hero |
| `diagram` | variable | image/webp | Architecture diagram |
| `infographic` | variable | image/webp | Data visualization |
| `gif` | variable | image/gif | Animated GIF (URL reference, NOT base64) |

## Response Payload (`blog-pipeline.status`)

The status response returned by `openclaw-webhook` when Vercel polls. Blog-specific fields are in the `assets` array.

```json
{
  "event_id": "my-blog-post",
  "event_type": "blog-pipeline.request",
  "status": "ready",
  "assets": [
    {
      "type": "cover",
      "path": "public/images/blog/my-blog-post/cover.webp",
      "base64": "<base64-encoded WebP bytes>",
      "sha256": "abc123def456...",
      "mime": "image/webp",
      "size_bytes": 245678
    },
    {
      "type": "gif",
      "path": "public/images/blog/my-blog-post/animation.gif",
      "base64": "",
      "sha256": "def456abc789...",
      "mime": "image/gif",
      "size_bytes": 1024000,
      "url": "https://andlersrv.tail62d797.ts.net/blog-assets/my-blog-post/animation.gif"
    }
  ],
  "updated_at": "2026-06-29T17:00:00Z",
  "request_created_at": "2026-06-29T16:30:00Z",
  "error": null
}
```

### GIF Assets

GIF assets are tracked differently from WebP assets:
- `base64` is empty string `""` (GIFs are NOT base64-embedded)
- `url` field contains the URL reference to the GIF file
- Vercel writes the GIF to Vercel Blob Storage by fetching from the URL

### WebP Quality Preservation

WebP assets are encoded with:
- `effort: 6` (maximum CPU effort for best compression)
- `preset: 'photo'` (optimized for photographic content)
- Quality reduction is applied ONLY if effort-6 encoding still exceeds the asset size cap (default 4MB)

## Manifest Lifecycle

| Status | Meaning | Who sets it |
|--------|---------|-------------|
| `pending` | Request received, not yet processed | `openclaw-webhook` on POST |
| `processing` | Handler is generating images | `andler-blog-pipeline` handler |
| `ready` | All assets generated, base64 encoded | `andler-blog-pipeline` handler |
| `failed` | One or more assets failed | `andler-blog-pipeline` handler |
| `partial` | Some assets ready, some failed | `andler-blog-pipeline` handler |