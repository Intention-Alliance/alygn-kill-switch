# Kill Switch API Server

Safety-critical control plane for the ALYGN compliance infrastructure. Provides real-time state management, per-machine agent coordination, feature flag control, and audit logging for LLM request interception.

**ADR-133** | **v2.0.0**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Kill Switch Architecture                     │
│                                                                   │
│  ┌──────────────┐     WS/HTTP      ┌───────────────────────────┐ │
│  │  Dashboard    │◄───────────────►│   Kill Switch API Server  │ │
│  │  (Next.js)    │                 │   (Node.js + SQLite)      │ │
│  └──────────────┘                 │                           │ │
│                                    │  ┌─────────────────────┐  │ │
│  ┌──────────────┐                  │  │  KillSwitchService  │  │ │
│  │  API Clients  │───── HTTP ─────►│  │  • State Machine     │  │ │
│  └──────────────┘                 │  │  • Audit Logging     │  │ │
│                                    │  │  • Health Checks     │  │ │
│  ┌──────────────┐    heartbeat     │  └─────────┬───────────┘  │ │
│  │  Per-Machine  │───── POST ─────►│            │              │ │
│  │  Agents       │    /30s         │  ┌─────────▼───────────┐  │ │
│  └──────────────┘                 │  │  WebSocket Manager   │  │ │
│                                    │  │  • Auth via token    │  │ │
│                                    │  │  • Redis pubsub      │  │ │
│                                    │  │  • Heartbeat/pong    │  │ │
│                                    │  └─────────┬───────────┘  │ │
│                                    │            │              │ │
│                                    │  ┌─────────▼───────────┐  │ │
│                                    │  │  Redis PubSub       │  │ │
│                                    │  │  • chaos channel    │  │ │
│                                    │  │  • flags channel    │  │ │
│                                    │  │  • agents channel   │  │ │
│                                    │  │  • machines channel │  │ │
│                                    │  └─────────────────────┘  │ │
│                                    │                           │ │
│                                    │  ┌─────────────────────┐  │ │
│                                    │  │  SQLite (WAL mode)  │  │ │
│                                    │  │  • user, session    │  │ │
│                                    │  │  • audit_log        │  │ │
│                                    │  │  • machine, agent   │  │ │
│                                    │  │  • feature_flags    │  │ │
│                                    │  │  • settings         │  │ │
│                                    │  └─────────────────────┘  │ │
│                                    └───────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

State Machine:
  ARMED ──→ RUNNING (start interception)
  RUNNING ──→ STOPPING (graceful shutdown)
  ARM/RUNNING ──→ STOPPED (emergency stop)
  STOPPING ──→ STOPPED (drain complete)
  STOPPED ──→ LOCKED (lockdown)
  STOPPED ──→ ARMED (re-arm)
  LOCKED ──→ ARMED (unlock + re-arm, admin only)
```

## Quick Start

```bash
# 1. Copy environment
cp .env.example .env

# 2. Install dependencies
pnpm install

# 3. Ensure Redis is running
redis-server

# 4. Start in development
pnpm dev

# The server starts on port 3000 (configurable)
# An admin user (admin@alygn.com) is seeded automatically
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment: development, staging, production |
| `PORT` | No | `3000` | HTTP/WS server port |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection URL (supports multiple comma-separated) |
| `REDIS_PASSWORD` | No | `""` | Redis AUTH password |
| `KILL_SWITCH_AUTH_TOKEN` | No | — | Legacy auth token (prefer Better-Auth sessions) |
| `KILL_SWITCH_API_KEY` | No | — | API key for service-to-service auth |
| `IP_ALLOWLIST` | No | — | Comma-separated CIDR list for IP allowlist |
| `DATABASE_PATH` | No | `./data/kill-switch.db` | SQLite database file path |
| `ADMIN_EMAIL` | No | `admin@alygn.com` | Default admin email for seed |
| `ADMIN_PASSWORD` | No | `admin123` | Default admin password for seed |

## API Endpoints

### Kill Switch Control

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/kill-switch/status` | Session | Current system state and metadata |
| `GET` | `/v1/kill-switch/activations` | Session | Activation history (paginated, `?limit=50`) |
| `POST` | `/v1/kill-switch/chaos` | Admin | Trigger state transition |
| `GET` | `/v1/kill-switch/health` | None | Health check endpoint |

### Feature Flags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/flags` | Session | List all feature flags |
| `POST` | `/v1/flags` | Admin | Create new flag |
| `PUT` | `/v1/flags/:id` | Admin | Update flag |
| `DELETE` | `/v1/flags/:id` | Admin | Delete flag |
| `GET` | `/v1/flags/:id/audit` | Session | Flag audit log |

### Machine Inventory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/machines` | Session | List all machines (filterable: `?status=active&sortBy=lastSeen`) |
| `POST` | `/v1/machines/register` | Admin | Register new machine |
| `GET` | `/v1/machines/:id` | Session | Get machine by ID |
| `PATCH` | `/v1/machines/:id` | Admin | Update machine metadata |
| `DELETE` | `/v1/machines/:id` | Admin | Remove machine |
| `POST` | `/v1/machines/:id/heartbeat` | Agent | Machine health heartbeat (every 30s, not rate-limited) |
| `GET` | `/v1/machines/:id/status` | Session | Machine status + DPU info + active flags |

### Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/settings` | Session | Get all system settings |
| `POST` | `/v1/settings` | Admin | Batch update settings |
| `GET` | `/v1/settings/:key` | Session | Get single setting |
| `PUT` | `/v1/settings/:key` | Admin | Update single setting |

### Authentication (Better-Auth v2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/auth/sign-in/email` | None | Email/password sign-in |
| `POST` | `/v1/auth/sign-up/email` | None | Email/password sign-up |
| `GET` | `/v1/auth/get-session` | Cookie | Current session check |
| `POST` | `/v1/auth/sign-out` | Cookie | Sign out (invalidates session) |
| `GET` | `/v1/auth/ip` | None | Client IP detection (utility) |

### Admin Operations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/cost` | Session | Cost tracking report |
| `GET` | `/admin/resources` | Session | Resource monitoring stats + alerts |
| `GET` | `/admin/incidents` | Session | Active and recent security incidents |
| `GET` | `/admin/runbooks` | Session | Runbooks with current status |
| `POST` | `/admin/incidents/check` | Session | Trigger manual incident detection |

### Health & Ops

| Path | Auth | Description |
|------|------|-------------|
| `/health` | None | Basic health (load balancer probe) |
| `/ready` | None | Readiness check (DB + Redis up) |
| `/metrics` | None | Prometheus-compatible metrics |
| `/ws?token=...` | Token | WebSocket real-time event stream |

## WebSocket Protocol

Connect via WebSocket with a Better-Auth session token:

```
ws://localhost:3000/ws?token=YOUR_SESSION_TOKEN
```

### Message Types

All messages are JSON text frames with the following structure:

```typescript
interface WsMessage {
  type: string;
  payload: object;
}
```

#### `state-change`

Emitted when the Kill Switch transitions to a new state.

```json
{
  "type": "state-change",
  "payload": {
    "state": "STOPPED",
    "previousState": "RUNNING",
    "user": "admin@alygn.com",
    "reason": "Emergency stop — harmful content detected",
    "traceId": "trace-abc123",
    "timestamp": 1715587200000
  }
}
```

#### `flag-update`

Emitted when a feature flag is created, updated, or deleted.

```json
{
  "type": "flag-update",
  "payload": {
    "flagId": "uuid-123",
    "key": "auto_stop_threshold",
    "value": 0.5,
    "machineId": null,
    "action": "updated",
    "updatedBy": "admin@alygn.com",
    "timestamp": 1715587200000
  }
}
```

#### `agent-event`

Emitted when a per-machine agent performs a scoring action.

```json
{
  "type": "agent-event",
  "payload": {
    "agentId": "agent-uuid-456",
    "machineId": "machine-gw01",
    "event": "request_blocked",
    "score": 0.85,
    "timestamp": 1715587200000
  }
}
```

#### `machine-event`

Emitted for machine lifecycle events (registered, updated, heartbeat, removed).

```json
{
  "type": "machine-registered",
  "payload": {
    "id": "machine-gw01-abc",
    "name": "api-gateway-01",
    "hostname": "gw01.internal.alygn.net",
    "status": "active"
  }
}
```

### Heartbeat Protocol

The server sends a ping frame every 30 seconds. Clients must respond with a pong frame within 10 seconds or the connection will be terminated with code 4005.

### Connection Limits

- Maximum 5 concurrent WebSocket connections per IP address
- Maximum message size: 64KB
- Unauthenticated connections are rejected with code 4001

### Fallback

If the WebSocket connection fails after 5 retry attempts, the dashboard client falls back to HTTP polling at 5-second intervals. The fallback is automatic — no manual intervention needed.

## Rate Limits

Split rate limits prevent critical operations from competing with polling:

| Operation Type | Limit | Window |
|---------------|-------|--------|
| Reads (GET) | 60/min | 60s |
| Writes (POST/PUT/PATCH/DELETE) | 10/min | 60s |
| Auth endpoints | 5/min | 60s |
| Heartbeat | Unlimited | — |
| WebSocket | Not rate-limited | — |

## Database

SQLite with WAL mode provides crash-safe persistence without operational complexity:

### Tables

| Table | Purpose |
|-------|---------|
| `user` | Better-Auth user accounts |
| `session` | Better-Auth session tokens |
| `kill_switch_audit_log` | State transition history (with trace IDs) |
| `feature_flags` | Global feature flag definitions |
| `flag_audit_log` | Per-flag mutation history |
| `machine` | Machine inventory (name, hostname, specs, DPU) |
| `machine_flags` | Per-machine flag overrides |
| `agent` | Per-machine agent registry |
| `setting` | Key-value settings persistence |

### Schema Migrations

Run `pnpm db:push` to apply schema changes in development. For production, use `pnpm db:generate` + `pnpm db:migrate`.

## Development

```bash
# Start with hot reload
pnpm dev

# Run type checking
pnpm typecheck

# Run tests
pnpm test

# Lint
pnpm lint

# Apply schema changes
pnpm db:push

# Generate migrations
pnpm db:generate

# Seed defaults (flags, settings, admin user)
pnpm db:seed
```

## Project Structure

```
apps/server-kill-switch/
├── src/
│   ├── index.ts              # Server entry point + HTTP handler
│   ├── types.ts              # Local type extensions
│   ├── infra-loader.ts       # Redis pool loader
│   ├── config/               # Environment-specific configuration
│   │   ├── index.ts          # Config loader
│   │   ├── schema.ts         # Zod validation schemas
│   │   ├── validate-env.ts   # Startup environment validation
│   │   └── environments/     # development | staging | production
│   ├── db/                   # SQLite database layer
│   │   ├── index.ts          # Drizzle instance
│   │   ├── schema.ts         # Table definitions
│   │   └── seed.ts           # Default data seeding
│   ├── lib/
│   │   └── auth.ts           # Better-Auth v2 configuration
│   ├── middleware/            # Request processing
│   │   ├── auth.ts           # Session validation
│   │   ├── auth-rate-limit.ts # Login brute-force protection
│   │   ├── rate-limit.ts     # Split read/write rate limiter
│   │   ├── lb-health.ts      # Load balancer health routes
│   │   └── resource-check.ts # Resource monitoring middleware
│   ├── routes/               # Route handlers
│   │   ├── auth.ts           # Better-Auth delegation
│   │   ├── kill-switch.ts    # Status / chaos / health endpoints
│   │   ├── flags.ts          # Feature flag CRUD + audit
│   │   ├── machines.ts       # Machine inventory CRUD + heartbeat
│   │   ├── settings.ts       # Settings persistence API
│   │   └── admin.ts          # Admin dashboards + runbooks
│   ├── services/             # Core business logic
│   │   ├── kill-switch.ts    # State machine with audit logging
│   │   ├── websocket-manager.ts # WS upgrade + pubsub fanout
│   │   ├── rate-limiter.ts   # Token bucket implementation
│   │   ├── cost-tracker.ts   # LLM cost estimation
│   │   ├── resource-monitor.ts # System resource metrics
│   │   ├── incident-response.ts # Attack detection + circuit breaker
│   │   ├── ip-allowlist.ts   # CIDR-based IP filtering
│   │   └── metrics.ts        # Prometheus metrics
│   └── utils/
│       ├── body-parser.ts    # Request body parsing
│       ├── cookies.ts        # Cookie parsing
│       └── secure-compare.ts # Timing-safe string comparison
├── package.json
└── tsconfig.json
```

## Related Documentation

- [ADR-133: Kill Switch Protocol](../../docs/architecture/ADR-133-kill-switch-protocol.md)
- [In-App Documentation](../../apps/web-regulator/app/(dashboard)/docs/page.tsx) — Accessible at `/docs` in the dashboard
- [Shared Types](../../packages/shared-types/src/kill-switch.ts)
