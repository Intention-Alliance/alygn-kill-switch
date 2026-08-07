---
name: meet-notes-bridge
description: >
  Inbound event handler for Google Meet → Wobblus task flow. Phase 4
  stub: accepts meet-notes.request events routed by openclaw-webhook
  and persists a pending manifest. Real transcript extraction /
  Notion sync lands in Phase 5 (card f50b8e1f).
---

# meet-notes-bridge

Thin inbound handler for `event_type: "meet-notes.request"`. Registered in the `openclaw-webhook` handler registry.

## When to Activate

Phase 4 only. The actual Google Meet transcript → Notion / action-item pipeline is Phase 5 and depends on a paired Chrome node for the Google Meet MCP. Until then, this handler accepts the event and records it.

## Current Scope (Phase 4)

- Accept `meet-notes.request` events
- Validate payload shape (object)
- Persist pending record to `~/.openclaw/workspace/.staging/meet-notes/events.jsonl`
- Return `status: 'processing'` so the manifest stays open for the Phase 5 consumer

## Future Scope (Phase 5)

- Fetch transcript from Google Meet (via paired Chrome node + gog)
- Run transcript through a small local LLM for summary + action items
- Push results to Notion via `notion-sync`

## Cross-Skill Coordination

- **`openclaw-webhook`** — owner. Provides the HTTP server, JWT auth, manifest lifecycle.
- **`gog`** (planned) — Google Meet transcript source.

## Integration

- **Auth:** JWT-asymmetric (EdDSA) — caller presents a JWT signed with `meet-notes-ed25519-private.pem` (not stored server-side). Server verifies with `meet-notes.pem` in `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR`.
- **Transport:** Tailscale mesh. Server bound to 127.0.0.1:18765.
- **Manifest path:** `~/.openclaw/workspace/.staging/webhook-manifests/<event_id>.json`
- **Event log:** `~/.openclaw/workspace/.staging/meet-notes/events.jsonl`

## References

- [openclaw-webhook SKILL.md](../openclaw-webhook/SKILL.md)
- [openclaw-webhook API contract](../openclaw-webhook/references/api-contract.md)

## Skill Metadata

**Created:** 2026-08-06
**Author:** Rokthar 🚀 (devops)
**Version:** 0.1.0 (Phase 4 stub)
**Card:** 43046320 (Phase 4 — Webhooks plugin)
