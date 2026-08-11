# Event Contract — live-chat-bridge

Payload schemas, JWT claims, and error codes for the `live-chat.message` event type. This document extends the base contract defined in [`openclaw-webhook/references/api-contract.md`](../openclaw-webhook/references/api-contract.md) — it does NOT duplicate the base JWT auth, endpoint schemas, or manifest lifecycle.

## Event Type Registration

| Event Type | Handler | Status | Reference |
|------------|---------|--------|-----------|
| `live-chat.message` | `live-chat-bridge` | Active | This file |

## JWT Claims

Same base claims as all openclaw-webhook events (see [api-contract.md](../openclaw-webhook/references/api-contract.md) § JWT Claims), with event-type-specific values:

```json
{
  "iss": "andler-chatbot-spike",
  "aud": "openclaw-webhook",
  "sub": "<conversation_id>",
  "event_type": "live-chat.message",
  "iat": 1751588580,
  "exp": 1751588880,
  "jti": "<uuid v4>",
  "payload_sha256": "<sha256 of request body>"
}
```

| Claim | Value for this event type |
|-------|---------------------------|
| `iss` | `"andler-chatbot-spike"` (the spike app/caller) |
| `aud` | `"openclaw-webhook"` |
| `sub` | Conversation ID (UUID) |
| `event_type` | `"live-chat.message"` |
| `iat` | Current Unix timestamp |
| `exp` | `iat + 300` (5-minute max) |
| `jti` | UUID v4 (unique per request, used for dedup) |
| `payload_sha256` | SHA-256 of the request body JSON |

**Algorithm:** EdDSA (Ed25519). Matches Block 3's `jose` signer. Key material: Ed25519 PKCS8 PEM for signing (spike), SPKI PEM for verification (openclaw-webhook trusted keys dir).

## Request Payloads

### Escalate Action

Posted by the spike's `escalate_to_andler` LLM tool when the diagnostic loop reaches a verdict.

```json
{
  "action": "escalate",
  "conversation_id": "<uuid>",
  "prospect": {
    "display_name": "Jane Smith",
    "channel_handle": "jane@example.com",
    "channel": "public-inbox",
    "channel_session_id": "session-abc123"
  },
  "flag": "green",
  "summary": "One paragraph factual summary of the prospect and conversation.",
  "investigation": {
    "web_research": ["Bullet 1 with source URL", "Bullet 2"],
    "scam_detection": [],
    "technical_fit": "fit — React/Node stack matches andler.dev capabilities"
  },
  "closing_message": "Appreciate the context. Looks like a real fit. The fastest way to align on scope is a 30-min call. I'm available: [slots]. Pick one and I'll send a calendar invite.",
  "conversation_transcript": "Full conversation transcript, sanitized.",
  "conversation_started_at": "2026-07-04T20:00:00Z"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `action` | `"escalate"` | yes | literal | Routing discriminator |
| `conversation_id` | string | yes | min 1 char | Unique conversation identifier |
| `prospect.display_name` | string | yes | min 1 char | Prospect's display name |
| `prospect.channel_handle` | string | yes | min 1 char | Handle on the channel (email, username, etc.) |
| `prospect.channel` | enum | yes | `telegram-widget` \| `discord-dm` \| `public-inbox` | Channel type |
| `prospect.channel_session_id` | string | yes | min 1 char | Session ID on the channel |
| `flag` | enum | yes | `green` \| `yellow` \| `red` | Verdict flag |
| `summary` | string | yes | min 1 char | One paragraph factual summary |
| `investigation.web_research` | string[] | yes | 0-5 bullets | Web research findings with source URLs |
| `investigation.scam_detection` | string[] | yes | 0-3 bullets | Red-flag rationale |
| `investigation.technical_fit` | string | yes | min 1 char | Fit/mismatch assessment |
| `closing_message` | string | yes | min 1 char | Ghost-stalled closing message in Andler's voice |
| `conversation_transcript` | string | yes | min 1 char | Full transcript, sanitized |
| `conversation_started_at` | string | yes | ISO-8601 | Conversation start timestamp |

### List Slots Action

Posted by the spike's `get_calendar_slots` LLM tool when calendar slots are needed for a green-flag verdict.

```json
{
  "action": "list_slots",
  "conversation_id": "<uuid>",
  "lookahead_days": 5,
  "slot_count": 4
}
```

| Field | Type | Required | Default | Validation | Description |
|-------|------|----------|---------|------------|-------------|
| `action` | `"list_slots"` | yes | — | literal | Routing discriminator |
| `conversation_id` | string | yes | — | min 1 char | Unique conversation identifier |
| `lookahead_days` | number | no | `5` | int, 1-30 | How many days ahead to look |
| `slot_count` | number | no | `4` | int, 1-10 | How many slots to return |

## Response Shapes

### Escalate (202 Accepted — async pipeline)

```json
{
  "event_id": "<conversation_id>",
  "event_type": "live-chat.message",
  "status": "processing",
  "accepted": true,
  "signed_response": "<jwt signed by openclaw-webhook>",
  "manifest_path": "<path>"
}
```

The spike polls `GET /webhook/status?event_type=live-chat.message&event_id=<conversation_id>` for the final result when the pipeline completes.

### List Slots (200 OK — ready immediately)

```json
{
  "event_id": "<conversation_id>",
  "event_type": "live-chat.message",
  "status": "ready",
  "assets": [{
    "type": "calendar_slots",
    "path": "",
    "base64": "<base64 of JSON slots array>",
    "sha256": "<sha256 of slots JSON>",
    "mime": "application/json",
    "size_bytes": 120
  }],
  "signed_response": "<jwt>"
}
```

### Error Response

```json
{
  "ok": false,
  "reason": "INVALID_PAYLOAD",
  "retry_after": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `false` | Always false for errors |
| `reason` | string | Error code (see below) |
| `retry_after` | number | Seconds to wait before retrying (0 for non-retryable) |

## Error Codes

| Code | Exit | HTTP Status | Description | Retryable |
|------|------|-------------|-------------|-----------|
| `INVALID_PAYLOAD` | 1 | 400 | Zod schema validation failed | No |
| `UNAUTHORIZED` | 2 | 401 | JWT missing or invalid (handled by openclaw-webhook) | No |
| `INVALID_JWT` | 2 | 400 | JWT signature verification failed (handled by openclaw-webhook) | No |
| `RATE_LIMIT_EXCEEDED` | 1 | 429 | >100 events/min from this requester | Yes (after 60s) |
| `PIPELINE_ERROR` | 3 | 202 + manifest failed | Lobster pipeline invocation failed | Yes (after 5s) |
| `TIMEOUT` | 4 | 202 + manifest failed | Pipeline or script exceeded timeout | Yes (after 10s) |
| `HANDLER_ERROR` | 3 | 500 | Unexpected handler error | Yes (after 3s) |

**Exit codes:** 0=ok / 1=validation / 2=auth / 3=upstream / 4=timeout

## Idempotency

- **Dedup key:** `event_id` (the JWT `jti` claim, passed as `manifest.event_id`)
- **Cache:** In-memory LRU, 1000 entries, 24h TTL
- **Behavior:** Duplicate event_ids return the cached `HandlerResult` without re-invoking the pipeline or slot lookup
- **Production upgrade:** Block 9 may upgrade to Redis SET with 24h TTL for multi-process dedup

## Rate Limiting

- **Limit:** 100 events/min/IP (per ADR-136 § rate-limit)
- **Implementation:** In-memory token bucket (same pattern as openclaw-webhook's 10 req/min limiter)
- **Secondary safety net:** openclaw-webhook enforces 10 req/min at the fabric level; this skill's 100/min is a burst-protection secondary check

## Dedup Choice Rationale

In-memory LRU cache (size 1000, 24h TTL) chosen for the spike:
- No Redis dependency (keeps spike self-contained)
- 1000 entries covers ~1000 concurrent conversations (well above spike volume)
- 24h TTL matches the manifest expiry window
- Production hardening (Block 9) may upgrade to Redis for multi-process resilience

## References

- [openclaw-webhook API Contract](../openclaw-webhook/references/api-contract.md) — base JWT auth, endpoints, status polling
- [openclaw-webhook Event Types](../openclaw-webhook/references/event-types.md) — event type registration table
- [Architecture Spec § 3](../../../repos/local/andler-chatbot-spike/docs/ARCHITECTURE-SPEC.md) — Component 2 full spec
- [Architecture Spec § 6](../../../repos/local/andler-chatbot-spike/docs/ARCHITECTURE-SPEC.md) — OpenClaw-Webhook Integration