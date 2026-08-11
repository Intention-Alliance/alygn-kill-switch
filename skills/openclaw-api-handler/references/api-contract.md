# API Contract — openclaw-api-handler

## Event Type

`openclaw-api.request`

## Payload

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

### consult_memory
- Required param: `query` (string)
- CLI: `openclaw memory search "<query>" --max-results 10 --json`
- Returns: JSON array of memory search results

### list_subagents
- No required params
- CLI: `openclaw sessions list --json`
- Returns: JSON array of active sessions

### spawn_session
- Required params: `sessionKey`, `task`
- Optional: `agentId` (default: "main")
- CLI: `openclaw agent --agent <id> --session-key <key> --message "<task>" --json`
- Returns: Agent response JSON

### send_session
- Required params: `sessionKey`, `message`
- CLI: `openclaw agent --agent main --session-key <key> --message "<msg>" --deliver --json`
- Returns: Agent response JSON

### history_session
- Required param: `sessionKey`
- CLI: `openclaw sessions history --session-key <key> --limit 50 --json`
- Returns: Session history JSON

## Audit Log

Every action writes a line to `~/.openclaw/workspace/memory/mcp-call-audit.jsonl`:

```json
{
  "timestamp": "2026-07-31T02:48:00Z",
  "origin_iss": "openclaw",
  "user_jti": "550e8400-e29b-41d4-a716-446655440000",
  "action": "consult_memory",
  "params_hash": "sha256:abc123...",
  "result_ok": true
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_ACTION` | 400 | Unknown action |
| `MISSING_PARAM` | 400 | Required param not provided |
| `SESSION_KEY_NOT_ALLOWED` | 403 | Session key not in allowlist |
| `CLI_ERROR` | 500 | openclaw CLI returned non-zero |
| `AUDIT_WRITE_FAILED` | 500 | Could not write audit log |

## Session Key Allowlist

Only these session keys are accepted for `spawn_session`, `send_session`, `history_session`:
- `agent:main:discord:direct:856709050824392714`
- `agent:main:main`

## Rate Limiting

30 req/min per origin-iss (enforced by the handler, extends server's token bucket).