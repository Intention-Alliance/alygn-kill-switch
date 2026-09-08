# WebSocket Protocol Specification — Kill Switch Dashboard

**Version:** 1.0.0  
**Date:** 2026-05-13  
**ADR Reference:** ADR-133  

---

## 1. Connection

| Parameter | Value |
|-----------|-------|
| **Production endpoint** | `wss://andlersrv.tail62d797.ts.net:8443/ws` |
| **Development endpoint** | `ws://localhost:3000/ws` |
| **Auth method** | Bearer token via query parameter `?token=...` |
| **Token source** | Better-Auth v2 session token (from `session.token` column in SQLite) |
| **Heartbeat interval** | 30 seconds (server → client ping) |
| **Heartbeat timeout** | 10 seconds (if no pong, client reconnects) |

### 1.1 Establishing a Connection

```typescript
// Frontend: apps/web-regulator/hooks/use-kill-switch-websocket.ts
const token = getSessionToken(); // from Better-Auth session cookie
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const host = process.env.NEXT_PUBLIC_WS_HOST || 'andlersrv.tail62d797.ts.net:8443';
const ws = new WebSocket(`${proto}://${host}/ws?token=${token}`);
```

### 1.2 Auth Validation (Server-Side)

The server validates the `token` query parameter against Better-Auth's session table:

```
File: apps/server-kill-switch/src/services/websocket-manager.ts
Function: validateWsToken(token: string): Promise<{ valid: boolean; userId?: string }>
```

1. Look up `session` row in SQLite where `session.token = token` AND `session.expires_at > now()`
2. If found → connection accepted, `userId` attached to socket context
3. If not found → close with code `4001` (Unauthorized)

---

## 2. Message Types

All messages are JSON with a top-level `type` field and a `payload` object.

### 2.1 State Change

Sent when the kill switch state machine transitions.

**Direction:** Server → All Connected Clients  
**Channel:** Redis `bcp:kill-switch:chaos` → WebSocket broadcast  

```json
{
  "type": "state-change",
  "payload": {
    "id": "nanoid_abc123",
    "state": "STOPPING",
    "previousState": "RUNNING",
    "timestamp": 1747106400000,
    "user": "admin@alygn.com",
    "reason": "Critical damage score detected",
    "traceId": "0x3fa9b2c...",
    "severity": "critical",
    "machineId": null
  }
}
```

**TypeScript type** (add to `packages/shared-types/src/kill-switch.ts`):

```typescript
export interface StateChangeMessage {
  type: "state-change";
  payload: {
    id: string;
    state: KillSwitchState;
    previousState: KillSwitchState;
    timestamp: number;
    user: string;
    reason: string;
    traceId: string;
    severity: "critical" | "warning" | "info" | "debug";
    machineId: string | null;
  };
}
```

**Frontend handler** (in `apps/web-regulator/hooks/use-kill-switch-websocket.ts`):

```typescript
case "state-change": {
  setStatus(prev => prev ? { ...prev, state: msg.payload.state } : prev);
  addAuditEntry(msg.payload); // prepend to activation history
  if (msg.payload.severity === "critical") {
    toast.error(`Kill Switch: ${msg.payload.state} — ${msg.payload.reason}`);
  }
  break;
}
```

### 2.2 Flag Update

Sent when a feature flag is created, updated, or deleted.

**Direction:** Server → All Connected Clients  
**Channel:** Redis `bcp:flags:updates` → WebSocket broadcast  

```json
{
  "type": "flag-update",
  "payload": {
    "flagId": "flag-uuid-123",
    "key": "llm_interception_enabled",
    "value": true,
    "machineId": null,
    "action": "updated",
    "updatedBy": "admin@alygn.com",
    "timestamp": 1747106400000
  }
}
```

**TypeScript type** (add to `packages/shared-types/src/flags.ts`):

```typescript
export interface FlagUpdateMessage {
  type: "flag-update";
  payload: {
    flagId: string;
    key: string;
    value: FlagValue;
    machineId: string | null;
    action: "created" | "updated" | "deleted";
    updatedBy: string;
    timestamp: number;
  };
}
```

**Frontend handler**:

```typescript
case "flag-update": {
  if (msg.payload.action === "deleted") {
    setFlags(prev => prev.filter(f => f.id !== msg.payload.flagId));
  } else if (msg.payload.action === "updated") {
    setFlags(prev => prev.map(f =>
      f.id === msg.payload.flagId ? { ...f, value: msg.payload.value, enabled: !!msg.payload.value } : f
    ));
  } else {
    refetchFlags(); // created — full refetch to get complete Flag shape
  }
  break;
}
```

### 2.3 Agent Event

Sent when a per-machine agent reports an interception, scoring result, or heartbeat.

**Direction:** Server → All Connected Clients  
**Channel:** Redis `bcp:agents:events` → WebSocket broadcast  

```json
{
  "type": "agent-event",
  "payload": {
    "agentId": "agent-uuid-001",
    "machineId": "machine-andlersrv-001",
    "event": "request_intercepted",
    "score": 0.82,
    "timestamp": 1747106400000,
    "metadata": {
      "requestId": "req-uuid-xyz",
      "modelProvider": "openai",
      "modelName": "gpt-4"
    }
  }
}
```

**TypeScript type** (add to `packages/shared-types/src/kill-switch.ts`):

```typescript
export interface AgentEventMessage {
  type: "agent-event";
  payload: {
    agentId: string;
    machineId: string;
    event: "request_intercepted" | "request_blocked" | "request_passed" | "heartbeat" | "error";
    score: number | null;
    timestamp: number;
    metadata: Record<string, unknown> | null;
  };
}
```

**Frontend handler**:

```typescript
case "agent-event": {
  setAgentEvents(prev => [msg.payload, ...prev].slice(0, 100));
  if (msg.payload.event === "request_blocked") {
    toast.warning(`Agent ${msg.payload.agentId}: Request blocked (score: ${msg.payload.score})`);
  }
  break;
}
```

### 2.4 Audit Entry

Sent when any auditable action occurs (flag change, state transition, machine registration).

**Direction:** Server → All Connected Clients  
**Channel:** Redis `bcp:audit:global` → WebSocket broadcast  

```json
{
  "type": "audit-entry",
  "payload": {
    "id": "audit-uuid-001",
    "entityType": "flag",
    "entityId": "flag-uuid-123",
    "action": "updated",
    "userId": "admin@alygn.com",
    "timestamp": 1747106400000,
    "details": {
      "oldValue": "false",
      "newValue": "true"
    }
  }
}
```

### 2.5 Heartbeat

**Direction:** Server → Client (every 30s)  

```json
{
  "type": "heartbeat",
  "timestamp": 1747106400000
}
```

Client MUST respond with `{ "type": "pong" }` within 10 seconds or the server closes the connection.

---

## 3. Server-Side Implementation

### 3.1 WebSocket Manager

**File:** `apps/server-kill-switch/src/services/websocket-manager.ts`

```typescript
// Concrete implementation outline — to be created by Keridz in Phase 1

export class WebSocketManager {
  private clients: Map<string, Set<ServerWebSocket>> = new Map(); // userId → sockets
  private redis: RedisPool;

  constructor(redis: RedisPool) {
    this.redis = redis;
  }

  // Called by kill-switch service on state transition
  async broadcastStateChange(entry: AuditEntry): Promise<void> { /* ... */ }

  // Called by flags routes on CRUD
  async broadcastFlagUpdate(update: FlagUpdateMessage['payload']): Promise<void> { /* ... */ }

  // Called by agent registration events
  async broadcastAgentEvent(event: AgentEventMessage['payload']): Promise<void> { /* ... */ }

  // Upgrades HTTP → WebSocket and handles the lifecycle
  async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> { /* ... */ }

  // Send raw JSON to all connected clients
  private broadcast(message: Record<string, unknown>): void { /* ... */ }

  // Send to a specific userId
  private sendToUser(userId: string, message: Record<string, unknown>): void { /* ... */ }
}
```

### 3.2 Integration Point in `index.ts`

Add to `apps/server-kill-switch/src/index.ts`:

```typescript
// After redis.connect():
const wsManager = new WebSocketManager(redis);

// On HTTP upgrade requests:
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) {
    wsManager.handleUpgrade(req, socket, head);
    return;
  }
  socket.destroy();
});

// Wire kill-switch service to broadcast state changes:
service.onStateChange((entry) => {
  wsManager.broadcastStateChange(entry);
});
```

### 3.3 Redis PubSub Wiring

The existing `bcp:kill-switch:chaos` channel already broadcasts state changes.  
Add two new channels:

| Channel | Event | Added to |
|---------|-------|----------|
| `bcp:kill-switch:chaos` | State transitions | Already exists in `services/kill-switch.ts` |
| `bcp:flags:updates` | Flag CRUD | Add to `routes/flags.ts` in `logFlagAction()` |
| `bcp:agents:events` | Agent interceptions/heartbeats | New — `routes/agents.ts` (Phase 1) |
| `bcp:machines:events` | Machine register/heartbeat/offline | New — `routes/machines.ts` (Phase 1) |

---

## 4. Client-Side Implementation

### 4.1 WebSocket Hook

**File:** `apps/web-regulator/hooks/use-kill-switch-websocket.ts`

```typescript
// Exports: useKillSwitchWebSocket()
// Returns: { status, auditLog, agentEvents, isConnected, reconnectAttempt }

// Internal state machine:
//   CONNECTING → CONNECTED → DISCONNECTED → RECONNECTING → CONNECTED
```

### 4.2 Reconnect Logic

```typescript
// Exponential backoff: 1s, 2s, 4s, 8s, 16s → max 5 retries → fallback to polling
const BACKOFF_SCHEDULE = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = 5;

function scheduleReconnect(attempt: number) {
  if (attempt > MAX_RETRIES) {
    console.warn('[ws] Max retries exceeded, falling back to HTTP polling');
    enableHttpPolling(); // Poll every 5s via GET /v1/kill-switch/status
    return;
  }
  const delay = BACKOFF_SCHEDULE[attempt - 1];
  setTimeout(() => connect(), delay);
}
```

### 4.3 Fallback Polling

When WebSocket fails after max retries:

```typescript
// apps/web-regulator/hooks/use-kill-switch-websocket.ts
function enableHttpPolling() {
  const interval = setInterval(async () => {
    const data = await apiGet<KillSwitchStatus>("/api/kill-switch/status");
    setStatus(data);
    // Also poll flags separately:
    const flags = await apiGet<{ flags: BackendFlag[] }>("/api/flags");
    setFlags(adaptFlags(flags));
  }, 5000);
  // Return cleanup function
  return () => clearInterval(interval);
}
```

### 4.4 Integration into Dashboard Pages

Each page component uses the shared hook:

**kill-switch/page.tsx:**
```typescript
// Replace: const [status, setStatus] = useState(...)
// Replace: fetchStatus + setInterval(5000)
// With:
const { status, auditLog, isConnected } = useKillSwitchWebSocket();
```

**flags/page.tsx:**
```typescript
// Replace: fetchFlags + setInterval(10000)
// With:
const { flags, isConnected } = useKillSwitchWebSocket();
```

---

## 5. Rate Limiting for WebSocket

WebSocket connections are **not subject to HTTP rate limits**.  
However, the WebSocket upgrade request still goes through the HTTP handler:

```typescript
// In index.ts, before the rate limiter:
if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
  return; // skip rate limit, WebSocket manager handles it
}
```

WebSocket has its own limits:

| Limit | Value |
|-------|-------|
| Max connections per IP | 5 |
| Max message size | 64KB |
| Message rate (per connection) | 20/sec |
| Idle timeout | 60s |

---

## 6. Security Considerations

1. **Token in query string:** Better-Auth session tokens are 64-char random strings. They appear in server logs — configure log redaction for the `?token=` parameter.
2. **TLS:** Production uses `wss://` (Tailscale HTTPS cert on port 8443). Local dev uses `ws://` (no TLS needed).
3. **CSRF:** Not applicable — WebSocket doesn't use cookies for auth. The token is explicitly passed.
4. **Token rotation:** When a Better-Auth session expires or is refreshed, the client must re-establish the WebSocket with the new token. The `useKillSwitchWebSocket` hook listens for `session-change` events from `auth-client.ts` and auto-reconnects.

---

## 7. Testing Checklist

| Test | Pass Criteria |
|------|---------------|
| Connect with valid token | 101 Switching Protocols, messages flow |
| Connect with invalid token | Close code 4001 |
| Connect with expired token | Close code 4001 |
| State transition → broadcast | All clients receive `state-change` within 100ms |
| Flag update → broadcast | All clients receive `flag-update` within 100ms |
| Client disconnects → server cleanup | Removed from `clients` map, no leak |
| Server restart → clients reconnect | Exponential backoff, max 5 retries |
| Fallback polling after max retries | HTTP requests resume at 5s interval |
| 6th connection from same IP | Rejected (max 5) |
| Message > 64KB | Connection closed code 4002 |

---

## 8. Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `apps/web-regulator/hooks/use-kill-switch-websocket.ts` | **Create** | Phase 1 |
| `apps/server-kill-switch/src/services/websocket-manager.ts` | **Create** | Phase 1 |
| `apps/server-kill-switch/src/index.ts` | **Modify** — add upgrade handler + wsManager | Phase 1 |
| `apps/server-kill-switch/src/services/kill-switch.ts` | **Modify** — call wsManager on state change | Phase 1 |
| `apps/server-kill-switch/src/routes/flags.ts` | **Modify** — publish to `bcp:flags:updates` | Phase 1 |
| `apps/web-regulator/app/(dashboard)/kill-switch/page.tsx` | **Modify** — use WebSocket hook | Phase 1 |
| `apps/web-regulator/app/(dashboard)/flags/page.tsx` | **Modify** — use WebSocket hook | Phase 1 |
| `packages/shared-types/src/kill-switch.ts` | **Modify** — add message types | Phase 0 |
| `packages/shared-types/src/flags.ts` | **Modify** — add FlagUpdateMessage type | Phase 0 |
