# Kill Switch API - Phase 0

## API Contract (for Gimglich / Frontend)

### Endpoints

| Method | Path                     | Auth           | Description                               |
| ------ | ------------------------ | -------------- | ----------------------------------------- |
| GET    | `/v1/kill-switch/status` | Bearer/API Key | Current state + recent transitions        |
| POST   | `/v1/kill-switch/chaos`  | Bearer/API Key | Transition to new state                   |
| GET    | `/v1/kill-switch/health` | None           | Health check (IP allowlist still applies) |

### States

| State      | Description                               | Valid Transitions  |
| ---------- | ----------------------------------------- | ------------------ |
| `ARMED`    | Ready, no experiments running             | → RUNNING, LOCKED  |
| `RUNNING`  | Active chaos experiments                  | → STOPPING, LOCKED |
| `STOPPING` | Kill switch triggered, agents terminating | → STOPPED, LOCKED  |
| `STOPPED`  | All chaos halted, manual reset required   | → ARMED, LOCKED    |
| `LOCKED`   | Chaos disabled for maintenance/incident   | → STOPPED          |

### Authentication

```
Authorization: Bearer <token>
X-API-Key: <key>
```

### Request/Response Examples

**Get Status:**

```json
// GET /v1/kill-switch/status
// Response 200
{
  "state": "ARMED",
  "recentTransitions": [
    {
      "id": "uuid",
      "previousState": "RUNNING",
      "newState": "STOPPING",
      "timestamp": "2026-04-13T14:00:00.000Z",
      "traceId": "abc123...",
      "initiatedBy": "api",
      "reason": "error_rate_exceeded"
    }
  ]
}
```

**Transition State:**

```json
// POST /v1/kill-switch/chaos
// Body:
{
  "state": "RUNNING",
  "reason": "scheduled_experiment",
  "userId": "andler"
}
// Response 200
{
  "id": "uuid",
  "previousState": "ARMED",
  "newState": "RUNNING",
  "timestamp": "2026-04-13T14:00:00.000Z",
  "traceId": "abc123...",
  "initiatedBy": "andler",
  "reason": "scheduled_experiment"
}
```

**Error Responses:**

```json
// 409 - Invalid transition
{
  "error": "Invalid transition: ARMED → STOPPED",
  "current": "ARMED",
  "allowed": ["RUNNING", "LOCKED"]
}

// 429 - Rate limited
{
  "error": "Rate limit exceeded",
  "limit": 10
}
```

### WebSocket Endpoint (for real-time status)

Connect to: `ws://andlersrv.tail62d797.ts.net:11435/v1/kill-switch/ws`

Messages pushed on state changes:

```json
{
  "type": "state_change",
  "previousState": "ARMED",
  "newState": "RUNNING",
  "timestamp": "2026-04-13T14:00:00.000Z",
  "traceId": "abc123..."
}
```

### Security

- **IP Allowlist:** 100.66.199.80, 192.168.1.11, 127.0.0.1
- **Rate Limit:** 10 requests/min per IP
- **Auth:** Bearer token or API key (except health endpoint)
- **Nginx:** SSL termination on port 11435

### Nginx Integration

```nginx
server {
    listen 11435 ssl;
    server_name andlersrv.tail62d797.ts.net;

    ssl_certificate /etc/ssl/private/andlersrv.tail62d797.ts.net.crt;
    ssl_certificate_key /etc/ssl/private/andlersrv.tail62d797.ts.net.key;

    # IP allowlist
    allow 100.66.199.80;
    allow 192.168.1.11;
    allow 127.0.0.1;
    deny all;

    location /v1/kill-switch/ {
        proxy_pass http://127.0.0.1:11435;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/kill-switch/ws {
        proxy_pass http://127.0.0.1:11435;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Quick Start

```bash
# Set auth tokens
export KILL_SWITCH_AUTH_TOKEN="your-secure-token"
export KILL_SWITCH_API_KEY="your-api-key"

# Start standalone
cd /home/andlersrv/.openclaw/workspace/phase0/kill-switch
bun run kill-switch-service.mjs
```

## Audit Trail

All state transitions are:

1. Logged in-memory (last 1000 entries)
2. Published via Redis PubSub (`bcp:kill-switch:chaos`)
3. Recorded as OTel spans with trace ID correlation
4. Traceable via Jaeger UI
