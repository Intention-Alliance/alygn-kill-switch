# API Contract — openclaw-webhook

Full request/response schemas for the JWT-authed endpoints. Based on ADR-012 § API Contract.

## Authentication

All requests must include a JWT in the `Authorization: Bearer <jwt>` header. The JWT is signed by the caller's private key (RS256 or EdDSA). The server verifies the signature using the corresponding public key from `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR`.

### JWT Claims (required)

```json
{
  "iss": "vercel",
  "aud": "openclaw-webhook",
  "sub": "my-blog-post-slug",
  "event_type": "blog-pipeline.request",
  "iat": 1719705600,
  "exp": 1719705900,
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "payload_sha256": "abc123def456..."
}
```

| Claim | Type | Required | Description |
|-------|------|----------|-------------|
| `iss` | string | yes | Issuer — caller identity (e.g., `vercel`) |
| `aud` | string | yes | Audience — must be `openclaw-webhook` |
| `sub` | string | yes | Subject — slug or event ID this event is about |
| `event_type` | string | yes | Routing key (e.g., `blog-pipeline.request`) |
| `iat` | number | yes | Issued-at (Unix timestamp) |
| `exp` | number | yes | Expiry (iat + 300s max) |
| `jti` | string | yes | Unique event ID (UUID v4, for deduplication) |
| `payload_sha256` | string | yes | SHA-256 hash of the request body |

### JWT Verification Flow

1. Parse `Authorization: Bearer <jwt>` header
2. Extract `iss` claim → look up corresponding public key in `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/<iss>.pem`
3. Verify signature with `jose.jwtVerify()` using the public key
4. Validate `aud === "openclaw-webhook"`
5. Check `exp` is in the future (5-minute max window)
6. Check `jti` against in-memory dedup set (prevent replay)
7. Verify `payload_sha256` matches SHA-256 of the actual request body

### Response Signing

The server signs status responses with its own private key (`OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH`). The caller verifies with `openclaw-webhook`'s public key (stored in caller's env). This is bidirectional authentication.

## Endpoints

### POST /webhook/request

Accepts a signed JWT, validates the signature, routes by `event_type` to the registered handler.

**Request:**

```
POST /webhook/request HTTP/1.1
Host: andlersrv.tail62d797.ts.net:18765
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "slug": "my-blog-post",
  "title": "My Blog Post Title",
  "excerpt": "A short description",
  "category": "Engineering",
  "palette": "#1a1a2e",
  "assets": [
    {
      "type": "cover",
      "prompt": "Generate a cover image for a blog post about TypeScript",
      "width": 1200,
      "height": 630,
      "alt_text": "Cover image for My Blog Post Title",
      "target_path": "public/images/blog/my-blog-post/cover.webp"
    }
  ]
}
```

**Response (202 Accepted):**

```json
{
  "event_id": "my-blog-post",
  "event_type": "blog-pipeline.request",
  "status": "pending",
  "accepted": true,
  "signed_response": "<jwt-signed-by-openclaw-webhook>",
  "manifest_path": "~/.openclaw/workspace/.staging/webhook-manifests/my-blog-post.json"
}
```

**Response (400 Bad Request):**

```json
{
  "error": {
    "code": "INVALID_JWT",
    "message": "JWT signature verification failed"
  }
}
```

**Response (401 Unauthorized):**

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid Authorization header"
  }
}
```

**Response (404 Not Found):**

```json
{
  "error": {
    "code": "NO_HANDLER",
    "message": "No handler registered for event_type: unknown.type"
  }
}
```

**Response (429 Too Many Requests):**

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests from this IP"
  }
}
```

### GET /webhook/status

Returns the status of a specific event, including generated assets if available.

**Request:**

```
GET /webhook/status?event_type=blog-pipeline&event_id=my-blog-post HTTP/1.1
Host: andlersrv.tail62d797.ts.net:18765
Authorization: Bearer <jwt>
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `event_type` | string | yes | Event type prefix (e.g., `blog-pipeline`) |
| `event_id` | string | yes | Event ID (typically the slug) |

**Response (200 OK — status: ready):**

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
      "type": "thumbnail",
      "path": "public/images/blog/my-blog-post/thumbnail.webp",
      "base64": "<base64-encoded WebP bytes>",
      "sha256": "def456abc789...",
      "mime": "image/webp",
      "size_bytes": 98234
    }
  ],
  "updated_at": "2026-06-29T17:00:00Z",
  "request_created_at": "2026-06-29T16:30:00Z",
  "error": null,
  "signed_response": "<jwt-signed-by-openclaw-webhook>"
}
```

**Status values:**

| Status | Meaning |
|--------|---------|
| `pending` | Request received, not yet processed |
| `processing` | Image generation in progress |
| `ready` | All assets generated, base64 encoded, ready for pickup |
| `failed` | One or more assets failed after max retries |
| `partial` | Some assets ready, some failed |

**Response (200 OK — status: failed):**

```json
{
  "event_id": "my-blog-post",
  "event_type": "blog-pipeline.request",
  "status": "failed",
  "assets": [],
  "updated_at": "2026-06-29T17:00:00Z",
  "error": {
    "code": "GENERATION_FAILED",
    "message": "2/3 assets failed after max retries",
    "failed_assets": [
      { "type": "cover", "reason": "Gemini API quota exceeded" }
    ]
  },
  "signed_response": "<jwt-signed-by-openclaw-webhook>"
}
```

**Response (200 OK — status: pending):**

```json
{
  "event_id": "my-blog-post",
  "event_type": "blog-pipeline.request",
  "status": "pending",
  "assets": [],
  "updated_at": "2026-06-29T16:31:00Z",
  "request_created_at": "2026-06-29T16:30:00Z",
  "error": null,
  "signed_response": "<jwt-signed-by-openclaw-webhook>"
}
```

**Response (404 Not Found):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No manifest found for event_id: unknown-slug"
  }
}
```

## Rate Limiting

- 10 req/min per IP (in-memory token bucket)
- Same pattern as the existing `blog-ingest` route
- Status endpoint is read-only and idempotent — multiple polls return the same response until a new request is written

## Idempotency

- The status endpoint is read-only. Multiple polls return the same response until a new request is written.
- POST requests with a `jti` that has already been seen are rejected with `409 Conflict` (replay protection).
- Asset generation is idempotent — the handler skips assets that already exist with matching SHA-256.