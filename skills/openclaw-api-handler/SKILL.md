---
name: openclaw-api-handler
description: >
  Event handler for openclaw-api.request events on the openclaw-webhook fabric.
  Routes payload.action to OpenClaw CLI commands (memory search, session spawn,
  session send, session history, subagent list). Read-only + spawn-only. No
  destructive operations. All calls audited to jsonl.
---

# openclaw-api-handler

Event handler registered on the `openclaw-webhook` fabric for `event_type: "openclaw-api.request"`.

## When to Activate

Activate when:
- Registering the openclaw-api request handler on the webhook
- Debugging openclaw-api.request event routing
- Reviewing the API action contract

## Payload Schema

```typescript
{
  action: "consult_memory" | "spawn_session" | "send_session" | "history_session" | "list_subagents",
  params: {
    query?: string,
    sessionKey?: string,
    message?: string,
    task?: string,
    agentId?: string,
    max_runtime_seconds?: number,
    jti_chain?: string[]
  }
}
```

## Actions

| Action | CLI Command | Description |
|--------|-------------|-------------|
| `consult_memory` | `openclaw memory search "<query>" --max-results 10 --json` | Semantic memory search |
| `list_subagents` | `openclaw sessions list --json` | List active sessions |
| `spawn_session` | `openclaw agent --agent <id> --session-key <key> --message "<task>" --json` | Spawn a new agent session |
| `send_session` | `openclaw agent --agent main --session-key <key> --message "<msg>" --deliver --json` | Send message to existing session |
| `history_session` | `openclaw sessions history --session-key <key> --limit 50 --json` | Fetch session history |

## Hard Rules

- ALL actions write to `~/.openclaw/workspace/memory/mcp-call-audit.jsonl`
- v1 is read-only + spawn-only. NO `sessions_release`, `cron_remove`, `gateway_restart`
- Rate limit: 30 req/min per origin-iss
- Origin-iss must have a `trusted/<iss>.pem` file
- Session keys allowlist: `agent:main:discord:direct:856709050824392714` and `agent:main:main` only
- No shell injection. All params via env vars or temp files

## References

- [API Contract](./references/api-contract.md) — Action schemas, audit format, error codes