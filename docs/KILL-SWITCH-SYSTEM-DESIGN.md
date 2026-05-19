# Kill Switch System Design — ALYGN Sovereign Compliance Infrastructure

**Version:** 2.0.0  
**Date:** 2026-05-14  
**Classification:** Internal / Institutional Architecture  
**Architect:** Hugrukal 📐  
**Repository:** `repos/alygn/infrastructure`  
**ADR-133 Status:** Accepted and Implemented

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Inventory](#3-component-inventory)
4. [Database Schema](#4-database-schema)
5. [API Contract](#5-api-contract)
6. [Design Decisions (ADRs)](#6-design-decisions-adrs)
7. [Dependency Injection Patterns](#7-dependency-injection-patterns)
8. [Next Steps / Roadmap](#8-next-steps--roadmap)
9. [Protocols, Skills & Tools](#9-protocols-skills--tools)
10. [File Structure Reference](#10-file-structure-reference)

---

## 1. Executive Summary

### What Kill Switch Is

The Kill Switch is ALYGN's sovereign compliance infrastructure — a safety-critical system for hardware-enforced AI governance. It provides a single point of control for halting AI inference pipelines when safety conditions are violated, with full audit logging, real-time monitoring, and cryptoeconomic enforcement planned for future phases.

### Governance Scope

| Domain | Scope |
|--------|-------|
| **Immediate (Phase 1)** | Per-machine LLM request interception, scoring, and blocking |
| **Operational** | Kill switch state machine, feature flags, machine registry, settings |
| **Observability** | Real-time WebSocket dashboards, audit logs, metrics export (Prometheus) |
| **Future (Phases 2-5)** | DPU clusters, TEE attestation, Bitcoin-anchored slashing, ZKP compliance |

### Relationship to ALYGN's Institutional Mission

The Kill Switch is the first operational component of ALYGN's layered safety infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│                    GOVERNANCE LAYER                        │  ← Phase 5: Decentralized governance
│    Decentralized oversight and accountability mechanisms   │
├─────────────────────────────────────────────────────────────┤
│                   COMPLIANCE MONITORING                    │  ← Phase 4: ZKP compliance proofs
│         Real-time verification of safety conditions          │
├─────────────────────────────────────────────────────────────┤
│                CRYPTOECONOMIC INCENTIVES                 │  ← Phase 3: Slashing + Bitcoin anchor
│      Bitcoin-based incentive structures for compliance     │
├─────────────────────────────────────────────────────────────┤
│                 HARDWARE SECURITY LAYER                    │  ← Phase 2: TEE attestation, DPU clusters
│        Secure enclaves for tamper-resistant execution       │
├─────────────────────────────────────────────────────────────┤
│              SOFTWARE CONTROL LAYER (CURRENT)              │  ← Phase 1: Kill Switch v2.0
│    State machine, feature flags, audit logging, WebSocket   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Overview

### 2.1 Full Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT BROWSER                                   │
│                                                                          │
│  All fetch calls use NEXT.JS INTERNAL PATHS only:                        │
│  • /api/kill-switch/status   (NOT /v1/kill-switch/status)                │
│  • /api/flags                (NOT /v1/flags)                             │
│  • /api/auth/sign-in/email   (NOT /v1/auth/sign-in/email)               │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Login Page  │  │ Kill Switch │  │ Flags       │  │ Machines    │       │
│  │ (shadcn)    │  │ Dashboard   │  │ Management  │  │ Dashboard   │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                              │ FETCH /api/* (masks backend)              │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │ HTTPS (nginx + Tailscale SSL)
                               │
┌──────────────────────────────┼───────────────────────────────────────────┐
│                         NGINX (andlersrv)                                │
│  All traffic -> Next.js (port 3001). Nginx NEVER forwards /v1 directly.  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  location / { proxy_pass http://localhost:3001; }                    │ │
│  │  # NO location /v1/ block -- backend hidden behind Next.js proxy     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
                               │ INTERNAL ONLY
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     web-regulator (Next.js 16)                           │
│                     Port: 3001 (ONLY port exposed)                       │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  next.config.ts -- REWRITES (Proxy Masking)                        │  │
│  │                                                                   │  │
│  │  /api/kill-switch/:path*  ->  http://localhost:3000/v1/kill-switch/:path* │  │
│  │  /api/flags/:path*        ->  http://localhost:3000/v1/flags/:path*       │  │
│  │  /api/auth/:path*         ->  http://localhost:3000/v1/auth/:path*        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │  Server Components   │  │  API Route Handlers   │                     │
│  │  (SSR dashboards)    │  │  (server-side proxy)  │                     │
│  │                      │  │                       │                     │
│  │  • kill-switch/page  │  │  • Reads cookies      │                     │
│  │  • flags/page        │  │  • Validates session   │                     │
│  │  • machines/page     │  │  • Forwards to backend │                     │
│  │  • audit/page        │  │  • Returns response    │                     │
│  └──────────────────────┘  └───────────┬───────────┘                     │
│                                        │                                │
│  Client Components:                    │ Server-side proxy call          │
│  • EmergencyStopButton                 │ (browser never sees this)       │
│  • StatusIndicator                     │                                │
│  • ActivationHistory                   ▼                                │
│  • FlagList / FlagEditor   ┌─────────────────────────┐                  │
└────────────────────────────┼─────────────────────────┼──────────────────┘
                             │                         │
                             │  INTERNAL DOCKER NETWORK (alygn-network)    │
                             │  NOT exposed to browser / nginx / internet  │
                             │                         │
                    ┌────────┴──────────┐    ┌─────────┴─────────┐
                    │ server-kill-switch│    │      Redis        │
                    │ (Bun + Elysia)    │    │   (state store)   │
                    │ Port: 3000        │    │   Port: 6379      │
                    │ (INTERNAL ONLY)   │    │   (INTERNAL ONLY) │
                    └────────┬──────────┘    └───────────────────┘
                             │
                    ┌────────┴──────────┐
                    │     SQLite        │
                    │  (auth + flags)   │
                    │  /data/*.db       │
                    └───────────────────┘
```

### 2.2 Proxy Masking Architecture (Next.js Rewrites)

**Security Principle:** The browser NEVER communicates directly with `server-kill-switch`. All API calls go through Next.js proxy rewrites. Backend `/v1/` endpoints are never exposed to the client.

From `apps/web-regulator/next.config.ts` (lines 55-94):

```typescript
async rewrites() {
  const backendUrl = process.env.KILL_SWITCH_BACKEND_URL || "http://localhost:3000";
  return [
    { source: "/api/auth/:path*",      destination: `${backendUrl}/v1/auth/:path*` },
    { source: "/api/kill-switch/:path*", destination: `${backendUrl}/v1/kill-switch/:path*` },
    { source: "/api/flags/:path*",     destination: `${backendUrl}/v1/flags/:path*` },
    { source: "/api/admin/:path*",      destination: `${backendUrl}/admin/:path*` },
    { source: "/api/machines/:path*",  destination: `${backendUrl}/v1/machines/:path*` },
    { source: "/api/settings/:path*",   destination: `${backendUrl}/v1/settings/:path*` },
    { source: "/api/health",           destination: `${backendUrl}/v1/kill-switch/health` },
    { source: "/api/metrics",          destination: `${backendUrl}/metrics` },
  ];
}
```

**Result:** The client sees `/api/kill-switch/status` but the server forwards to `http://kill-switch:3000/v1/kill-switch/status`. The internal URL is never visible to the browser.

### 2.3 WebSocket Real-Time Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Browser        │     │  server-kill-    │     │  Redis PubSub    │
│  (useKillSwitch │     │  switch          │     │  Cluster         │
│  WebSocket)     │     │  (WebSocketManager)│    │                  │
│                 │     │                  │     │                  │
│  ws://host/ws   │     │  ┌────────────┐  │     │  Channels:       │
│  ?token=...     │───> │  │ handleUpgrade│ │     │  bcp:kill-switch:│
│                 │     │  └─────┬──────┘  │     │    chaos         │
│  <- JSON msg    │<─── │        │         │     │  bcp:flags:      │
│    {type,       │     │  ┌─────▼──────┐  │     │    updates       │
│     payload}    │     │  │ onRedisMsg │  │     │  bcp:agents:     │
│                 │     │  └─────┬──────┘  │     │    events        │
│                 │     │        │         │     │  bcp:machines:   │
│                 │     │  ┌─────▼──────┐  │     │    events        │
│                 │     │  │  broadcast  │  │     │  bcp:settings:   │
│                 │     │  │  (all conns)│  │     │    updates       │
│                 │     │  └────────────┘  │     │                  │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

**WebSocket Protocol:** RFC 6455 (text frames, JSON payloads). Auth via `?token=` query parameter (Better-Auth session token validated against SQLite `session` table).

**Heartbeat:** Server pings every 30s; client must respond within 10s or connection is dropped. Max 5 connections per IP.

**Fallback:** If WebSocket unavailable, frontend falls back to HTTP polling every 5s (`useKillSwitchWebSocket.ts`, lines 78-142).

### 2.4 State Machine Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │                                                     │
                    ▼                                                     │
              ┌─────────┐                                           ┌─────┘
     ┌------->│  ARMED  │<------------------------------------------┘
     │        │ (ready) │         EMERGENCY LOCK (any state)
     │        └────┬────┘                    │
     │             │ ACTIVATE                ▼
     │             │                    ┌─────────┐
     │             ▼                    │ LOCKED  │
     │        ┌─────────┐             │ (frozen)│
     │        │ RUNNING │             └───┬─────┘
     │        │(active) │                 │
     │        └────┬────┘                 │ UNLOCK
     │             │ INITIATE STOP         ▼
     │             │                  ┌─────────┐
     │             ▼                  │ STOPPED │<--┐
     │        ┌─────────┐             │ (halted)│   │
     │        │STOPPING │             └────┬────┘   │
     │        │(windown)│                  │       │
     │        └────┬────┘                  │ REARM │
     │             │ COMPLETE              │       │
     │             ▼                       │       │
     │        ┌─────────┐                  │       │
     └--------│ STOPPED │------------------┘       │
              │ (halted)│                          │
              └─────────┘                          │
                                                  │
                                                  │
```

**Valid Transitions (from `services/kill-switch.ts`, lines 35-41):**

| From State | Allowed To |
|------------|-----------|
| ARMED | RUNNING, LOCKED |
| RUNNING | STOPPING, LOCKED |
| STOPPING | STOPPED, LOCKED |
| STOPPED | ARMED, LOCKED |
| LOCKED | STOPPED |

**Invalid transitions return HTTP 409 with `current` and `allowed` fields.**

---

## 3. Component Inventory

### 3.1 Core Services

#### `KillSwitchService`
- **Path:** `apps/server-kill-switch/src/services/kill-switch.ts`
- **Purpose:** Central state machine managing kill switch lifecycle transitions, audit logging, Redis pub/sub, and authentication. Validates all state changes against `VALID_TRANSITIONS` graph.
- **Dependencies:**
  - `RedisPool` (constructor injection)
  - `secureCompare` from `../utils/secure-compare` (for token comparison)
  - `loadTracing` from `../infra-loader` (OpenTelemetry spans)
  - `@align/shared-types` (KillSwitchState type)
- **Exports:**
  - `class KillSwitchService`
  - `const STATES` (state constant map)
  - `const VALID_TRANSITIONS` (transition graph)
  - `interface AuditEntry`
  - `interface TransitionMetadata`
- **ADR References:**
  - ADR-117 (Chaos Engineering): State machine + kill switch states
  - ADR-133 (Dashboard rebuild): `onStateChange` callback wiring to WebSocket

#### `WebSocketManager`
- **Path:** `apps/server-kill-switch/src/services/websocket-manager.ts`
- **Purpose:** Handles HTTP-to-WebSocket upgrades, authenticates via Better-Auth token, subscribes to 5 Redis pubsub channels, fans out messages to all connected admin clients.
- **Dependencies:**
  - `node:crypto` (randomBytes, createHash for RFC 6455 handshake)
  - `node:http` (IncomingMessage type)
  - `node:net` (Socket type)
  - `../db/index` (sqlite for session validation)
- **Exports:**
  - `class WebSocketManager`
  - Methods: `setRedisSubscribe()`, `validateWsToken()`, `handleUpgrade()`, `broadcastStateChange()`, `broadcastFlagUpdate()`, `broadcastAgentEvent()`, `broadcastMachineEvent()`, `totalClients()`, `destroy()`
- **ADR References:**
  - ADR-133 (Dashboard rebuild): Real-time events via WebSocket + Redis pubsub

#### `AuthProvider` (web-regulator)
- **Path:** `apps/web-regulator/lib/auth-context.tsx`
- **Purpose:** React Context provider for Better-Auth session state. Handles login/logout, session restoration on mount, and background session refresh every 5 minutes.
- **Dependencies:**
  - `react` (createContext, useContext, useState, useEffect, useCallback, useMemo)
  - `../lib/auth-client` (Better-Auth client)
- **Exports:**
  - `interface AuthUser` (id, email, name, role)
  - `interface AuthContextValue` (user, isAuthenticated, isLoading, login, logout)
  - `function AuthProvider({ children })`
  - `function useAuth()` (throws if used outside provider)
- **ADR References:**
  - ADR-121 (SQLite auth): Session persistence via Better-Auth + SQLite

#### `useKillSwitchWebSocket`
- **Path:** `apps/web-regulator/hooks/use-kill-switch-websocket.ts`
- **Purpose:** Frontend WebSocket client hook with automatic reconnection (exponential backoff), heartbeat monitoring, and HTTP polling fallback. Manages real-time state updates for kill switch status, flags, machines, agent events, and audit log.
- **Dependencies:**
  - `react` (useState, useEffect, useRef, useCallback)
  - `../lib/auth-client` (getSession for token)
  - `../lib/api-client` (apiGet for polling fallback)
  - `sonner` (toast notifications for critical events)
- **Exports:**
  - `interface UseKillSwitchWebSocketReturn` (status, flags, machines, agentEvents, auditLog, isConnected, reconnectAttempt)
  - `function useKillSwitchWebSocket()`
- **ADR References:**
  - ADR-133 (Dashboard rebuild): Real-time WebSocket + polling fallback

#### `RedisPool`
- **Path:** `apps/server-kill-switch/src/types/redis-pool.ts` (interface) + `apps/server-kill-switch/src/infra-loader.ts` (dynamic import)
- **Purpose:** Connection pooling for Redis cluster. Provides typed interface for all Redis operations (get, set, publish, subscribe, healthCheck).
- **Dependencies:** Runtime dynamic import of `../../../infra/redis/redis-cluster-pool.mjs`
- **Exports:**
  - `interface RedisPool` (acquire, release, withClient, get, set, del, publish, subscribe, healthCheck, chaosKillSwitchKey, connect)
- **ADR References:**
  - ADR-111 (BCP): Redis as shared state store for kill switch state

---

### 3.2 Route Handlers

#### `handleAuthRoutes`
- **Path:** `apps/server-kill-switch/src/routes/auth.ts`
- **Purpose:** Delegates all `/v1/auth/*` requests to Better-Auth's handler. Preserves legacy path redirects (`/v1/auth/login` -> `/v1/auth/sign-in/email`).
- **Dependencies:** `../services/kill-switch`, `../middleware/auth-rate-limit`, `../lib/auth`
- **Exports:** `function handleAuthRoutes(method, url, req, res, service, authRateLimiter)`
- **ADR References:** ADR-121 (SQLite + Better-Auth v2)

#### `handleKillSwitchRoutes`
- **Path:** `apps/server-kill-switch/src/routes/kill-switch.ts`
- **Purpose:** Status, health, activation, and audit log endpoints.
- **Endpoints:** GET /v1/kill-switch/status, GET /v1/kill-switch/health, GET /v1/kill-switch/activations, POST /v1/kill-switch/chaos
- **Dependencies:** `../services/kill-switch`, `../utils/body-parser`
- **Exports:** `function handleKillSwitchRoutes(method, url, req, res, service, ip)`
- **ADR References:** ADR-117 (Chaos Engineering), ADR-133 (Dashboard rebuild)

#### `handleFlagsRoutes`
- **Path:** `apps/server-kill-switch/src/routes/flags.ts`
- **Purpose:** Full CRUD for feature flags with audit logging. Admin role required for writes.
- **Endpoints:** GET /v1/flags, POST /v1/flags, PUT /v1/flags/:id, DELETE /v1/flags/:id, GET /v1/flags/:id/audit
- **Dependencies:** `drizzle-orm/eq`, `../db/index`, `../db/schema`
- **Exports:** `function handleFlagsRoutes(method, url, req, res, userId, userRole, publishEvent)`
- **ADR References:** ADR-133 (Dashboard rebuild), ADR-131 (SQLite-backed flags)

#### `handleMachinesRoutes`
- **Path:** `apps/server-kill-switch/src/routes/machines.ts`
- **Purpose:** Machine registry CRUD + heartbeat + status + DPU info.
- **Endpoints:** GET /v1/machines, POST /v1/machines/register, GET /v1/machines/:id, PATCH /v1/machines/:id, DELETE /v1/machines/:id, POST /v1/machines/:id/heartbeat, GET /v1/machines/:id/status
- **Dependencies:** `drizzle-orm`, `../db/index`, `../db/schema`, `@align/shared-types`
- **Exports:** `function handleMachinesRoutes(method, url, req, res, publishEvent?)`
- **ADR References:** ADR-133 (Dashboard rebuild)

#### `handleSettingsRoutes`
- **Path:** `apps/server-kill-switch/src/routes/settings.ts`
- **Purpose:** Key-value settings persistence with validation. Admin role required for writes.
- **Endpoints:** GET /v1/settings, POST /v1/settings (batch upsert), GET /v1/settings/:key, PUT /v1/settings/:key
- **Dependencies:** `drizzle-orm/eq`, `../db/index`, `../db/schema`
- **Exports:** `function handleSettingsRoutes(method, url, req, res, publishEvent?)`
- **ADR References:** ADR-133 (Dashboard rebuild)

---

### 3.3 Middleware

#### `checkAuth`
- **Path:** `apps/server-kill-switch/src/middleware/auth.ts`
- **Purpose:** Session-based authentication via Better-Auth v2 cookie. Falls back to Bearer token / API key.
- **Dependencies:** `../services/kill-switch`, `../lib/auth`
- **Exports:** `function checkAuth(service, req)`
- **ADR References:** ADR-121 (SQLite sessions survive restarts)

#### `checkRateLimit` (Split Read/Write)
- **Path:** `apps/server-kill-switch/src/middleware/rate-limit.ts`
- **Purpose:** Two independent limiters: ReadRateLimiter (60 req/min for GET/HEAD/OPTIONS) and WriteRateLimiter (10 req/min for POST/PUT/PATCH/DELETE). Heartbeat endpoints bypass entirely.
- **Dependencies:** None (pure in-memory)
- **Exports:** `ReadRateLimiter`, `WriteRateLimiter`, `checkRateLimit()`, `isReadRequest()`, `isHeartbeatRequest()`, `RATE_LIMIT_MAX`
- **ADR References:** ADR-133 (Split rate limits)

#### `AuthRateLimiter`
- **Path:** `apps/server-kill-switch/src/middleware/auth-rate-limit.ts`
- **Purpose:** Stricter limits for auth endpoints: 5 attempts per 15 minutes per IP.
- **Dependencies:** None (pure in-memory)
- **Exports:** `class AuthRateLimiter`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`
- **ADR References:** ADR-111 (BCP security)

#### `handleLbHealthRoutes`
- **Path:** `apps/server-kill-switch/src/middleware/lb-health.ts`
- **Purpose:** Load balancer integration: /health (liveness), /ready (readiness), /metrics (Prometheus format).
- **Dependencies:** `../services/kill-switch`, `../services/metrics`
- **Exports:** `function handleLbHealthRoutes()`, `function withMetrics()`, `function formatPrometheus()`
- **ADR References:** ADR-111 (BCP operational requirements)

#### `resourceCheckMiddleware`
- **Path:** `apps/server-kill-switch/src/middleware/resource-check.ts`
- **Purpose:** Rejects requests with HTTP 503 if memory exceeds critical threshold (90%). Adds warning headers if memory > 80%.
- **Dependencies:** `../services/resource-monitor`
- **Exports:** `function resourceCheckMiddleware(req, res, next?)`
- **ADR References:** ADR-111 (BCP resilience)

---

### 3.4 Supporting Services

#### `cost-tracker`
- **Path:** `apps/server-kill-switch/src/services/cost-tracker.ts`
- **Purpose:** Tracks Redis ops, API requests, compute time. Provides cost estimates and projections. Expensive endpoints (kill-switch chaos, auth login) get cost-aware throttling.
- **Exports:** `getCostReport()`, `recordRedisRead()`, `recordRedisWrite()`, `recordApiRequest()`, `shouldThrottleEndpoint()`

#### `incident-response`
- **Path:** `apps/server-kill-switch/src/services/incident-response.ts`
- **Purpose:** Automated incident detection: Redis failure, high error rate, auth attacks, memory pressure, high load. Activates circuit breaker on Redis failure. IP blocking for auth attacks.
- **Exports:** `getIncidentResponseService()`, `isIpBlockedByIncident()`, `isCircuitBreakerOpen()`

#### `ip-allowlist`
- **Path:** `apps/server-kill-switch/src/services/ip-allowlist.ts`
- **Purpose:** Configurable IP allowlist with CIDR support. Defaults include Tailscale IPs, localhost, and Docker networks.
- **Exports:** `isIpAllowed()`, `ALLOWED_IPS`, `CIDR_RANGES`

#### `metrics`
- **Path:** `apps/server-kill-switch/src/services/metrics.ts`
- **Purpose:** Centralized request/response tracking. Collects response times (p50/p90/p99), error rates, connection counts. Prometheus-compatible export.
- **Exports:** `getMetrics()`, `recordRequest()`, `incrementActiveConnections()`, `decrementActiveConnections()`, `resetMetrics()`

#### `rate-limiter` (Legacy)
- **Path:** `apps/server-kill-switch/src/services/rate-limiter.ts`
- **Purpose:** Original single-rate limiter (10 req/min). Superseded by split read/write limiter in middleware/rate-limit.ts. Retained for backward compatibility.
- **Exports:** `class RateLimiter`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`

#### `resource-monitor`
- **Path:** `apps/server-kill-switch/src/services/resource-monitor.ts`
- **Purpose:** CPU, memory, and disk tracking with configurable alert thresholds. Provides real-time resource stats for middleware and admin endpoints.
- **Exports:** `getResourceStats()`, `checkResourceAlerts()`, `isMemoryCritical()`, `isMemoryWarning()`

---

### 3.5 Database Schema Module

#### `db/schema.ts`
- **Path:** `apps/server-kill-switch/src/db/schema.ts`
- **Purpose:** Complete Drizzle ORM schema definition for all tables: Better-Auth v2 tables (user, session, account, verification), kill switch tables (state, audit log), feature flags (flags, audit log), machine registry, settings, machine flag overrides, agent registry.
- **Dependencies:** `drizzle-orm/sqlite-core`
- **Exports:** All 12 table definitions as const exports
- **ADR References:** ADR-121 (SQLite), ADR-122 (Drizzle ORM), ADR-133 (Extended schema)

---

### 3.6 Shared Types Package

#### `packages/shared-types/src/index.ts`
- **Path:** `packages/shared-types/src/index.ts`
- **Purpose:** Central re-export of all type definitions used across the monorepo.
- **Submodules:** `auth.ts`, `kill-switch.ts`, `flags.ts`, `cluster.ts`, `compliance.ts`, `slashing.ts`, `telemetry.ts`
- **Key Exports from `kill-switch.ts`:** `KillSwitchState`, `KillSwitchStatus`, `ActivationRecord`, `Machine`, `MachineStatus`, `AgentInfo`, `WebSocketMessage` (all variants), `AppSettings`
- **Key Exports from `auth.ts`:** `UserRole`, `User`, `AuthState`, `SessionConfig`
- **Key Exports from `flags.ts`:** `Flag`, `FlagValue`, `Operator`, `FlagStatus`, `Rule`, `Segment`, `AuditEntry`

---

## 4. Database Schema

### 4.1 All Drizzle SQLite Tables

#### Better-Auth v2 Tables (4)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| **`user`** | Identity + role | id PK, email UNIQUE, name, image, role (default 'admin'), created_at, updated_at |
| **`session`** | Auth sessions | id PK, user_id FK -> user.id CASCADE, token UNIQUE, expires_at, ip_address, user_agent |
| **`account`** | OAuth accounts | id PK, user_id FK -> user.id CASCADE, account_id, provider_id, access_token, refresh_token |
| **`verification`** | Email verification | id PK, identifier, value, expires_at |

#### Application Tables (8)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| **`kill_switch_state`** | Current kill switch state singleton | id PK, state (ARMED/RUNNING/STOPPING/STOPPED/LOCKED), updated_by, reason, ip_address, trace_id |
| **`kill_switch_audit_log`** | Persistent audit trail | id PK, timestamp, user_id, reason, previous_state, new_state, trace_id, machine_id, severity (default 'info'), metadata (JSON) |
| **`feature_flag`** | Global feature flags | id PK, key UNIQUE, value (boolean), description, enabled (default true), created_by |
| **`flag_audit_log`** | Flag mutation history | id PK, flag_id FK -> feature_flag.id CASCADE, action (created/updated/deleted), old_value, new_value, user_id, timestamp |
| **`machine`** | Machine registry | id PK, name, hostname UNIQUE, status (active/inactive/offline), role, has_dpu, specs (JSON), last_seen |
| **`setting`** | Global key-value settings | key PK, value, updated_at |
| **`machine_flag`** | Per-machine flag overrides | (machine_id, flag_key) PK, machine_id FK -> machine.id CASCADE, value, updated_at |
| **`agent`** | Per-machine agent registry | id PK, machine_id FK -> machine.id CASCADE, name, version, capabilities (JSON), last_heartbeat |

### 4.2 Relationships (Foreign Keys)

```
user (1) ───< session (N) [ON DELETE CASCADE]
user (1) ───< account (N) [ON DELETE CASCADE]

feature_flag (1) ───< flag_audit_log (N) [ON DELETE CASCADE]

machine (1) ───< machine_flag (N) [ON DELETE CASCADE]
machine (1) ───< agent (N) [ON DELETE CASCADE]
```

### 4.3 Indexes and Their Purpose

| Index Name | Table | Columns | Purpose |
|-----------|-------|---------|---------|
| `user_email_idx` | user | email | Fast login lookups |
| `session_user_id_idx` | session | user_id | Session cleanup per user |
| `session_token_idx` | session | token | WebSocket auth validation |
| `account_user_id_idx` | account | user_id | Account listing per user |
| `verification_identifier_idx` | verification | identifier | Verification lookup |
| `ks_audit_severity_time_idx` | kill_switch_audit_log | severity, timestamp | Filter audit by severity |
| `ks_audit_machine_time_idx` | kill_switch_audit_log | machine_id, timestamp | Per-machine audit queries |
| `ks_audit_state_time_idx` | kill_switch_audit_log | new_state, timestamp | State transition history |
| `feature_flag_key_idx` | feature_flag | key | Fast flag lookups |
| `flag_audit_flag_id_idx` | flag_audit_log | flag_id | Per-flag audit trail |
| `flag_audit_action_time_idx` | flag_audit_log | action, timestamp | Filter by action type |
| `machine_hostname_idx` | machine | hostname | Duplicate prevention |
| `machine_status_idx` | machine | status | Filter by operational status |
| `machine_flag_key_idx` | machine_flag | flag_key | Resolve flag overrides |
| `agent_machine_idx` | agent | machine_id | Agents per machine |
| `agent_heartbeat_idx` | agent | last_heartbeat | Stale agent detection |

### 4.4 Migration Strategy

**Philosophy:** Drizzle `db:push` for development, `db:generate` + `db:migrate` for production.

**Current approach (`db/index.ts`, lines 32-178):**
- Raw `CREATE TABLE IF NOT EXISTS` on startup for reliability
- WAL mode enabled (`PRAGMA journal_mode=WAL`)
- Foreign keys enforced (`PRAGMA foreign_keys=ON`)
- Conditional migration: drops old legacy tables only if `setting` table doesn't exist (canary check)
- All indexes created with `CREATE INDEX IF NOT EXISTS`

**Workflow:**
```
Development:  bun run db:push    (schema changes applied immediately)
Production:   bun run db:generate (create migration SQL files)
              bun run db:migrate  (apply pending migrations)
```

---

## 5. API Contract

### 5.1 REST Endpoints

#### Auth Routes (`/v1/auth/*`)

| Method | Path | Auth Required | Request | Response |
|--------|------|---------------|---------|----------|
| POST | `/v1/auth/sign-in/email` | No | `{ email, password }` | `{ user, session }` + Set-Cookie |
| POST | `/v1/auth/sign-up/email` | No | `{ email, password, name }` | `{ user, session }` |
| GET | `/v1/auth/get-session` | Cookie | -- | `{ user, session }` |
| POST | `/v1/auth/sign-out` | Cookie | -- | `{ success }` + Clear-Cookie |
| GET | `/v1/auth/ip` | No | -- | `{ ip }` |

**Legacy redirects:** `/v1/auth/login` -> `/v1/auth/sign-in/email`, `/v1/auth/me` -> `/v1/auth/get-session`, `/v1/auth/logout` -> `/v1/auth/sign-out`

#### Kill Switch Routes (`/v1/kill-switch/*`)

| Method | Path | Auth Required | Request | Response |
|--------|------|---------------|---------|----------|
| GET | `/v1/kill-switch/status` | Yes | -- | `KillSwitchStatus` |
| GET | `/v1/kill-switch/health` | No | -- | `{ status, killSwitchState, redis, auditLogSize, timestamp }` |
| GET | `/v1/kill-switch/activations` | Yes | `?limit=50` | `{ data: AuditEntry[], total, page, limit }` |
| POST | `/v1/kill-switch/chaos` | Yes | `{ state: KillSwitchState, userId?, reason? }` | `AuditEntry` or `409` |

#### Flags Routes (`/v1/flags/*`)

| Method | Path | Auth Required | Request | Response |
|--------|------|---------------|---------|----------|
| GET | `/v1/flags` | Yes | -- | `{ flags: FeatureFlag[] }` |
| POST | `/v1/flags` | Admin | `{ key, value, description?, enabled? }` | `{ flag }` |
| GET | `/v1/flags/:id` | Yes | -- | `{ flag }` |
| PUT | `/v1/flags/:id` | Admin | `{ key?, value?, description?, enabled? }` | `{ flag }` |
| DELETE | `/v1/flags/:id` | Admin | -- | `{ success, deleted }` |
| GET | `/v1/flags/:id/audit` | Yes | -- | `{ logs: FlagAuditEntry[] }` |

#### Machines Routes (`/v1/machines/*`)

| Method | Path | Auth Required | Request | Response |
|--------|------|---------------|---------|----------|
| GET | `/v1/machines` | Yes | `?status=&sortBy=&order=&limit=&offset=` | `{ data: Machine[], total, limit, offset }` |
| POST | `/v1/machines/register` | Yes | `{ name, hostname, role, hasDpu?, specs? }` | `Machine` |
| GET | `/v1/machines/:id` | Yes | -- | `Machine` |
| PATCH | `/v1/machines/:id` | Yes | `{ name?, hostname?, status?, role?, hasDpu?, specs? }` | `Machine` |
| DELETE | `/v1/machines/:id` | Yes | -- | `{ success, deleted }` |
| POST | `/v1/machines/:id/heartbeat` | Yes | `{ cpuUsage?, memoryUsage?, agentName?, agentVersion?, agentCapabilities? }` | `{ acknowledged, machineId, timestamp }` |
| GET | `/v1/machines/:id/status` | Yes | -- | `{ machine, agents, activeFlags, dpu }` |

#### Settings Routes (`/v1/settings/*`)

| Method | Path | Auth Required | Request | Response |
|--------|------|---------------|---------|----------|
| GET | `/v1/settings` | Yes | -- | `{ settings: Record<string,string>, updatedAt }` |
| POST | `/v1/settings` | Admin | `{ settings: Record<string,string> }` | `{ updated, errors?, timestamp }` |
| GET | `/v1/settings/:key` | Yes | -- | `{ key, value, updatedAt }` |
| PUT | `/v1/settings/:key` | Admin | `{ value }` | `{ key, value, updatedAt }` |

#### Admin Routes (`/admin/*`)

| Method | Path | Auth Required | Response |
|--------|------|---------------|----------|
| GET | `/admin/cost` | Yes | `CostReport` |
| GET | `/admin/resources` | Yes | `{ stats, alerts }` |
| GET | `/admin/incidents` | Yes | `{ activeIncidents, recentIncidents, blockedIps, circuitBreakerOpen }` |
| GET | `/admin/runbooks` | Yes | `{ runbooks, currentStatus }` |
| POST | `/admin/incidents/check` | Yes | `{ checked, newIncidents, totalActive }` |

#### Health/LB Routes (No auth)

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | `{ status: 'alive', timestamp }` |
| GET | `/ready` | `{ status: 'ready'|'not_ready', checks }` |
| GET | `/metrics` | Prometheus exposition format |

### 5.2 WebSocket Message Protocol

Connection: `wss://host/ws?token=<session_token>`

| Message Type | Direction | Payload Shape | Trigger |
|-------------|-----------|--------------|---------|
| **`state-change`** | Server -> Client | `{ id, state, previousState, timestamp, user, reason, traceId, severity, machineId }` | Kill switch state transition |
| **`flag-update`** | Server -> Client | `{ flagId, key, value, machineId?, action, updatedBy, timestamp }` | Flag created/updated/deleted |
| **`agent-event`** | Server -> Client | `{ agentId, machineId, event, score?, timestamp, metadata }` | Agent registration, scoring, blocking |
| **`machine-event`** | Server -> Client | `{ type, payload }` where type is `machine-registered/updated/removed/heartbeat` | Machine registry changes |
| **`audit-entry`** | Server -> Client | `ActivationRecord` | New audit log entry |
| **`heartbeat`** | Server -> Client | `{ type: 'heartbeat', payload: { timestamp } }` | 30s server ping |
| **`pong`** | Client -> Server | `{ type: 'pong' }` | Client response to heartbeat |
| **`unknown`** | Server -> Client | `{ type: 'unknown', payload }` | Unrecognized Redis channel message |

### 5.3 Rate Limits

| Category | Path Pattern | Limit | Window |
|----------|-------------|-------|--------|
| **Read** | GET / HEAD / OPTIONS | 60 req/min | 60s per IP |
| **Write** | POST / PUT / PATCH / DELETE | 10 req/min | 60s per IP |
| **Auth** | /v1/auth/* | 5 attempts | 15 min per IP |
| **Heartbeat** | */heartbeat | Unlimited | -- |
| **Health/LB** | /health, /ready, /metrics | Unlimited | -- |

**Response headers on rate limit:** `Retry-After: <seconds>`

---

## 6. Design Decisions (ADRs)

### ADR-111: Business Continuity Protocol (BCP)

**Problem:** ALYGN needs a reliable mechanism to halt AI inference in safety-critical scenarios. The system must be resilient to infrastructure failures and provide clear operational runbooks.

**Decision:** Implement a layered resilience architecture:
- Redis-backed state store with health monitoring
- Incident response service with automated detection (Redis failure, high error rate, auth attacks)
- Resource check middleware that rejects requests under memory pressure (>90%)
- Load balancer health endpoints (/health, /ready, /metrics)
- Cost tracking for expensive operations

**Rationale:**
- Separation of concerns: state management, health monitoring, and incident response are distinct concerns
- Fail-safe defaults: circuit breaker opens on Redis failure, preventing cascading errors
- Observability: Prometheus-compatible metrics export for external monitoring

**Consequences:**
- (+) System degrades gracefully rather than failing catastrophically
- (+) Prometheus metrics enable external alerting (Grafana, PagerDuty)
- (-) In-memory incident tracking is lost on restart (acceptable for Phase 1)
- (-) Cost tracker uses singleton pattern (not DI) -- see Section 7

**Code References:**
- `services/incident-response.ts` (circuit breaker, auth attack detection)
- `middleware/resource-check.ts` (memory pressure rejection)
- `middleware/lb-health.ts` (health/readiness/metrics)
- `services/metrics.ts` (Prometheus-format export)

### ADR-117: Chaos Engineering — State Machine + Kill Switch States

**Problem:** Without a formal state machine, kill switch operations are ad-hoc and error-prone. Invalid transitions (e.g., STOPPED -> RUNNING without rearming) could leave the system in an inconsistent state.

**Decision:** Define a finite state machine with 5 states and explicit valid transitions:
```
ARMED -> {RUNNING, LOCKED}
RUNNING -> {STOPPING, LOCKED}
STOPPING -> {STOPPED, LOCKED}
STOPPED -> {ARMED, LOCKED}
LOCKED -> {STOPPED}
```

**Rationale:**
- Formal state machines prevent invalid operations at the API level
- Each transition generates an audit entry with trace ID for forensics
- LOCKED state provides emergency freeze capability

**Consequences:**
- (+) Invalid transitions return HTTP 409 with helpful error context
- (+) Full audit trail for compliance and debugging
- (-) 5 states may be too few for future multi-machine coordination (Phase 4)

**Code References:**
- `services/kill-switch.ts` lines 27-41 (`STATES`, `VALID_TRANSITIONS`)
- `services/kill-switch.ts` lines 85-94 (transition validation)
- `routes/kill-switch.ts` lines 62-79 (409 error response)

### ADR-121: SQLite over File Adapter

**Problem:** The original system used a custom file adapter for Better-Auth v1. Sessions were stored in-memory and lost on container restart. In Docker, this caused `TypeError: undefined is not an object (evaluating 'db[model]')`.

**Decision:** Migrate to SQLite with Drizzle ORM as the canonical database layer. Better-Auth v2 uses `drizzleAdapter` with `provider: 'sqlite'`. Sessions survive container restarts. WAL mode enabled for concurrent reads during writes.

**Rationale:**
- ACID transactions vs. no transactions (file adapter)
- Full SQL query capability vs. manual filtering
- Schema enforcement via Drizzle Zod vs. none
- Official Better-Auth v2 adapter vs. custom v1-only adapter

**Consequences:**
- (+) Sessions survive container restarts
- (+) Full SQLite query capability for audit logs and reporting
- (+) WAL mode allows concurrent reads during writes
- (-) Single-node SQLite limits horizontal scaling (mitigated by Redis for runtime state)
- (-) Need backup strategy for SQLite file in production

**Code References:**
- `db/index.ts` lines 32-178 (database initialization with WAL mode)
- `lib/auth.ts` lines 50-80 (drizzleAdapter configuration)
- `db/schema.ts` lines 14-67 (Better-Auth v2 table definitions)

### ADR-122: Drizzle ORM for Type-Safe Queries

**Problem:** Raw SQL queries are error-prone and lack compile-time type checking. Schema changes can break queries without detection.

**Decision:** Use Drizzle ORM with `drizzle-orm/bun-sqlite` driver. Schema defined in `db/schema.ts` with full TypeScript types. Queries use Drizzle's query builder with automatic type inference.

**Rationale:**
- Type-safe queries catch errors at compile time
- Schema changes propagate to all queries automatically
- Zod schema validation for runtime safety
- Drizzle Kit for migrations (`db:push`, `db:generate`)

**Consequences:**
- (+) Full type safety from schema to query results
- (+) Schema changes are version-controlled and reviewable
- (-) Drizzle ORM has a learning curve for developers familiar with raw SQL
- (-) Some complex queries may require raw SQL fallback

**Code References:**
- `db/schema.ts` (all table definitions with Drizzle ORM)
- `routes/flags.ts` lines 96-102 (type-safe insert/update/delete)
- `routes/machines.ts` lines 44-52 (type-safe select with Drizzle query builder)

### ADR-133: Kill Switch Dashboard Rebuild

**Problem:** The original dashboard was incomplete: no real-time updates (required page reload), no persistent audit logs (in-memory only), no machine registry, no settings persistence, and a single 10 req/min rate limiter caused 429 errors during normal usage.

**Decision:** Rebuild the dashboard with:
1. **WebSocket real-time updates** via Redis pubsub (`bcp:kill-switch:chaos` channel)
2. **Split rate limits**: Read 60/min, Write 10/min (ADR-133 section 2.4)
3. **SQLite persistence** for audit logs, machine registry, settings, and per-machine flag overrides
4. **Machine inventory** with DPU tracking (auto-seeds `andlersrv` on first startup)
5. **Settings persistence** with validation (6 known keys)
6. **WebSocket fallback** to HTTP polling every 5s

**Rationale:**
- Real-time updates are essential for safety-critical monitoring
- Split rate limits eliminate 429 errors during normal dashboard usage
- SQLite persistence ensures data survives restarts
- Machine registry enables future DPU cluster expansion

**Consequences:**
- (+) No 429 errors on normal dashboard usage
- (+) State changes visible within 1 second via WebSocket
- (+) Full audit persistence across container restarts
- (+) Machine registry ready for Phase 2 DPU clusters
- (-) WebSocket adds complexity (heartbeat, reconnection, fallback)
- (-) Redis dependency for real-time features (acceptable given existing infrastructure)

**Code References:**
- `services/websocket-manager.ts` (WebSocket server with 5 Redis channels)
- `hooks/use-kill-switch-websocket.ts` (frontend hook with fallback)
- `middleware/rate-limit.ts` (ReadRateLimiter + WriteRateLimiter)
- `db/schema.ts` lines 112-178 (machine, setting, machine_flag, agent tables)
- `db/seed.ts` (default machine + settings seeding)
- `routes/settings.ts` (settings CRUD with validation)
- `routes/machines.ts` (machine CRUD + heartbeat + DPU info)

---

## 7. Dependency Injection Patterns

### 7.1 Constructor Injection

**`KillSwitchService`** (`services/kill-switch.ts`, line 63):
```typescript
constructor(opts: { redis: RedisPool; authToken?: string; apiKey?: string }) {
  this.redis = opts.redis;
  this.authToken = opts.authToken || process.env.KILL_SWITCH_AUTH_TOKEN || '';
  this.apiKey = opts.apiKey || process.env.KILL_SWITCH_API_KEY || '';
}
```
- **Pattern:** Constructor injection with options object
- **DI Principle:** Dependencies are injected, not imported directly
- **Exception:** Falls back to `process.env` if not provided (should be fully injected)

### 7.2 Factory Function Injection

**`createKillSwitchHandler`** (`index.ts`, line 43):
```typescript
export function createKillSwitchHandler(service: KillSwitchService, wsManager: WebSocketManager) {
  const authRateLimiter = new AuthRateLimiter();
  // ... returns async handler closure
}
```
- **Pattern:** Factory function receives service instances, returns request handler
- **DI Principle:** Handler composition via injected dependencies
- **Exception:** `AuthRateLimiter` instantiated inside factory (acceptable -- no external dependencies)

### 7.3 Redis Pubsub Channel Wiring

**`WebSocketManager.setRedisSubscribe`** (`services/websocket-manager.ts`, line 124):
```typescript
setRedisSubscribe(fn: (channel: string, handler: (msg: string) => void) => void): void {
  this.redisSubscribeFn = fn;
  for (const channel of REDIS_CHANNELS) {
    fn(channel, (message: string) => { this.onRedisMessage(channel, message); });
  }
}
```
- **Pattern:** Callback injection for Redis subscription
- **DI Principle:** WebSocketManager doesn't import Redis directly; receives subscribe function

### 7.4 React Context DI

**`AuthProvider`** (`lib/auth-context.tsx`):
```typescript
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }) { /* ... */ }
export function useAuth() { return useContext(AuthContext); }
```
- **Pattern:** React Context for dependency injection tree
- **DI Principle:** `authClient` is imported but `useAuth` consumers don't depend on it directly

### 7.5 Route Handler Callback Injection

**`handleFlagsRoutes`** (`routes/flags.ts`, line 60):
```typescript
export async function handleFlagsRoutes(
  method, url, req, res, userId, userRole,
  publishEvent?: (channel: string, data: string) => void
): Promise<boolean>
```
- **Pattern:** Optional callback injection for Redis publish
- **DI Principle:** Route handler doesn't import Redis; receives `publishEvent` callback

### 7.6 DI Adherence Assessment

| Component | Pattern | DI Score | Notes |
|-----------|---------|----------|-------|
| `KillSwitchService` | Constructor injection | 8/10 | Falls back to env vars |
| `WebSocketManager` | Callback injection | 9/10 | Clean separation from Redis |
| `AuthProvider` | React Context | 7/10 | `authClient` hardcoded import |
| `createKillSwitchHandler` | Factory + closure | 8/10 | `AuthRateLimiter` created inside |
| Route handlers | Callback injection | 9/10 | `publishEvent` callback is clean |
| `metrics.ts` | Singleton | 3/10 | Hardcoded singleton, no DI |
| `cost-tracker.ts` | Singleton | 3/10 | Hardcoded singleton, no DI |
| `incident-response.ts` | Singleton | 3/10 | Hardcoded singleton, no DI |
| `resource-monitor.ts` | Module-level state | 4/10 | `lastCpuUsage` at module scope |
| `ip-allowlist.ts` | Module-level config | 5/10 | Env vars at module scope |

**Recommendations for DI improvement:**
1. `metrics.ts`, `cost-tracker.ts`, `incident-response.ts` should accept config objects instead of reading `process.env` directly
2. `resource-monitor.ts` should encapsulate state in a class with constructor injection
3. `KillSwitchService` should not fall back to `process.env` -- caller should always provide credentials

---

## 8. Next Steps / Roadmap

### Phase 1 (Current — DONE)
- SQLite auth with Better-Auth v2
- Kill Switch dashboard with real-time WebSocket
- Machine registry with DPU tracking
- Feature flags with audit logging
- Settings persistence
- Split rate limits (read/write)
- Proxy masking architecture

### Phase 2 (Planned — Q3 2026)
- **DPU cluster support**: Multi-node GPU cluster registration and monitoring
- **Hardware telemetry**: GPU/CPU/DPU monitoring via `nvidia-smi`, `lm-sensors`, DPU SDKs
- **Agent scoring engine**: Full semantic + keyword analysis for LLM request interception
- **Improved resource monitoring**: Integration with `procfs` for kernel-level metrics

### Phase 3 (Planned — Q4 2026)
- **Slashing engine**: Economic penalties for safety violations
- **Cryptoeconomic incentives**: Bitcoin-compatible staking and reward distribution
- **Bitcoin anchor**: Anchoring compliance proofs to Bitcoin blockchain for immutability
- **Smart contract integration**: Solidity contracts for stake management

### Phase 4 (Planned — Q1 2027)
- **Multi-machine coordination**: Distributed kill switch across DPU clusters
- **TEE attestation**: Intel SGX / AMD SEV remote attestation for tamper-resistant execution
- **ZKP compliance proofs**: Zero-knowledge proofs for privacy-preserving compliance verification
- **Formal verification**: Mathematical proofs of state machine correctness

### Phase 5 (Future — 2027+)
- **Decentralized governance**: Multi-stakeholder voting for protocol parameters
- **Formal verification**: End-to-end proof of safety properties
- **Cross-institutional integration**: Standard interfaces for other AI governance bodies
- **Autonomous response**: ML-based anomaly detection with automated kill switch activation

---

## 9. Protocols, Skills & Tools

### 9.1 Required Development Skills

| Skill | Purpose | Key Files |
|-------|---------|-----------|
| **Bun** | Runtime and package manager | `package.json` scripts, `bun:test` |
| **Drizzle ORM** | Type-safe SQLite queries | `db/schema.ts`, `db/index.ts` |
| **Better-Auth v2** | Session-based authentication | `lib/auth.ts`, `routes/auth.ts` |
| **Elysia** | Web framework (backend API) | `index.ts` (HTTP handler) |
| **Next.js 16** | Frontend SSR + API proxy | `web-regulator/` app router |
| **Tailwind v4** | Utility-first CSS | `globals.css`, component classes |
| **shadcn/ui** | UI primitives | `components/ui/*.tsx` |

### 9.2 Required Infrastructure Tools

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **Docker** | Containerization | `Dockerfile`, `docker-compose.yml` |
| **Redis Cluster** | State store + pubsub | `infra/redis/redis-cluster-pool.mjs` |
| **SQLite** | Persistent database | `./data/kill-switch.sqlite` (WAL mode) |
| **nginx** | Reverse proxy + SSL | Port 8443 -> Next.js 3001 |
| **Tailscale** | Secure network mesh | `andlersrv.tail62d797.ts.net` |

### 9.3 Development Protocols

**Database workflow:**
```bash
# Development (auto-migrate)
bun run db:push

# Production (generate + apply migrations)
bun run db:generate
bun run db:migrate
```

**Commit conventions:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`)

**Review pipeline:**
1. Code review by Nikaya (reviewer agent)
2. Integration testing: full E2E login -> kill switch -> flags -> machines -> settings
3. Rate limit verification: confirm no 429 errors on normal usage
4. WebSocket testing: verify real-time updates within 1 second

### 9.4 Hardware Monitoring Tools (Phase 2+)

| Tool | Metrics | Integration Point |
|------|---------|-------------------|
| `nvidia-smi` | GPU utilization, temperature, memory | Machine heartbeat endpoint |
| `lm-sensors` | CPU temperature, fan speed | Resource monitor service |
| DPU SDKs (NVIDIA DOCA) | DPU utilization, network throughput | Machine status endpoint |
| `procfs` | Kernel-level process stats | Extended resource monitoring |
| `intel-sgx-psw` | TEE attestation quotes | Phase 4 attestation service |

---

## 10. File Structure Reference

### 10.1 server-kill-switch (38 source files)

```
apps/server-kill-switch/src/
├── index.ts                          # Main entry: HTTP handler factory + server startup
├── config/
│   ├── index.ts                      # Config loader with Zod validation
│   ├── schema.ts                     # Zod schemas for all config values
│   ├── validate-env.ts               # Environment variable validation
│   └── environments/
│       ├── development.ts            # Dev defaults
│       ├── production.ts             # Prod defaults
│       └── staging.ts                # Staging defaults
├── db/
│   ├── index.ts                      # SQLite connection + auto-migration (WAL mode)
│   ├── schema.ts                     # Drizzle ORM schema (12 tables)
│   └── seed.ts                       # Default machine + settings seeding
├── lib/
│   └── auth.ts                       # Better-Auth v2 config + admin seeding
├── middleware/
│   ├── auth.ts                       # Session validation middleware
│   ├── auth-rate-limit.ts            # Auth endpoint rate limiter (5/15min)
│   ├── lb-health.ts                  # Load balancer health/readiness/metrics
│   ├── rate-limit.ts                 # Split read/write rate limiters
│   └── resource-check.ts           # Memory pressure rejection
├── routes/
│   ├── auth.ts                       # Better-Auth catch-all handler
│   ├── flags.ts                      # Feature flag CRUD + audit
│   ├── kill-switch.ts                # State machine endpoints
│   ├── machines.ts                   # Machine registry + heartbeat
│   ├── settings.ts                   # Settings persistence
│   └── admin.ts                      # Admin: cost, incidents, runbooks
├── services/
│   ├── kill-switch.ts                # Core state machine
│   ├── websocket-manager.ts          # WebSocket server + Redis pubsub
│   ├── cost-tracker.ts              # Cloud cost estimation
│   ├── incident-response.ts          # Automated incident detection
│   ├── ip-allowlist.ts              # IP allowlist + CIDR matching
│   ├── metrics.ts                    # Prometheus metrics collector
│   ├── rate-limiter.ts              # Legacy single rate limiter
│   └── resource-monitor.ts          # CPU/memory/disk tracking
├── types/
│   ├── redis-pool.ts                 # RedisPool interface
│   └── tsconfig.json                 # TypeScript config
├── utils/
│   ├── body-parser.ts                # Request body parsing
│   ├── cookies.ts                    # Cookie helpers
│   └── secure-compare.ts            # Timing-safe string comparison
├── infra-loader.ts                   # Dynamic imports for cross-rootDir modules
└── infra.d.ts                        # Type declarations for infra modules
```

### 10.2 web-regulator (70+ source files)

```
apps/web-regulator/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx            # Better-Auth login form
│   │   └── logout/page.tsx           # Server-side logout
│   ├── (dashboard)/
│   │   ├── docs/page.tsx             # In-app documentation
│   │   ├── flags/page.tsx            # Feature flag management
│   │   ├── kill-switch/page.tsx      # Kill Switch Dashboard
│   │   ├── machines/page.tsx         # Machine inventory
│   │   ├── settings/page.tsx         # Settings management
│   │   └── layout.tsx                # Dashboard shell with sidebar
│   ├── auth/
│   │   ├── confirm/route.ts          # Email confirmation
│   │   ├── error/page.tsx            # Auth error page
│   │   ├── forgot-password/page.tsx  # Password reset request
│   │   ├── login/page.tsx            # Legacy login redirect
│   │   ├── sign-up/page.tsx          # Registration
│   │   ├── sign-up-success/page.tsx  # Post-registration
│   │   └── update-password/page.tsx  # Password update
│   ├── clusters/
│   │   ├── add/page.tsx              # Add cluster (legacy)
│   │   └── [slug]/page.tsx           # Cluster detail (legacy)
│   ├── layout.tsx                    # Root layout with providers
│   └── page.tsx                      # Landing page
├── components/
│   ├── ui/                           # shadcn/ui primitives (20+ files)
│   │   ├── alert-dialog.tsx
│   │   ├── alert.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── skeleton.tsx
│   │   ├── slider.tsx
│   │   ├── sonner.tsx
│   │   ├── switch.tsx
│   │   ├── table.tsx
│   │   └── tooltip.tsx
│   ├── kill-switch/
│   │   ├── activation-history.tsx    # Audit log display
│   │   ├── emergency-stop-button.tsx # Stop/ARMED toggle
│   │   └── status-indicator.tsx      # State badge with color
│   ├── flags/
│   │   ├── audit-log.tsx             # Flag mutation history
│   │   ├── flag-editor.tsx           # Create/edit flag form
│   │   └── flag-status-badge.tsx     # Status visual indicator
│   ├── machines/
│   │   ├── dpu-security-banner.tsx   # DPU availability notice
│   │   └── machine-editor.tsx        # Machine registration form
│   ├── dashboard/
│   │   ├── cluster-sidebar.tsx       # Legacy cluster sidebar
│   │   ├── cluster-table.tsx         # Legacy cluster table
│   │   └── stat-card.tsx             # Metric display card
│   ├── layout/
│   │   ├── app-sidebar.tsx           # Main navigation sidebar
│   │   └── mobile-sidebar.tsx        # Mobile drawer
│   ├── auth-button.tsx               # Login/logout button
│   ├── error-boundary.tsx            # React error boundary
│   ├── hero.tsx                      # Landing hero section
│   ├── login-form.tsx                # Login form component
│   ├── logout-button.tsx             # Logout action button
│   ├── sign-up-form.tsx              # Registration form
│   ├── theme-switcher.tsx            # Dark/light mode toggle
│   └── tutorial/                     # Onboarding tutorial (5 files)
├── hooks/
│   ├── use-kill-switch-websocket.ts  # WebSocket client + fallback
│   └── use-settings-sync.ts          # Settings synchronization
├── lib/
│   ├── api-client.ts                 # HTTP helpers (apiGet, apiPost, etc.)
│   ├── auth-client.ts                # Better-Auth React client
│   ├── auth-context.tsx              # AuthProvider React Context
│   ├── otel.ts                       # OpenTelemetry configuration
│   ├── utils.ts                      # Tailwind class merging
│   └── supabase/                     # Legacy Supabase client (3 files)
├── types/
│   ├── shared.ts                     # Local mirror of @align/shared-types
│   └── supabase.types.ts             # Legacy Supabase types
├── next.config.ts                    # Rewrites, headers, standalone output
└── proxy.ts                          # Proxy configuration helper
```

### 10.3 Shared Packages

```
packages/
├── shared-types/
│   └── src/
│       ├── index.ts                  # Re-export all modules
│       ├── auth.ts                   # User, AuthState, SessionConfig
│       ├── cluster.ts                # GPUCluster, DPUInfo, IntentManifest
│       ├── compliance.ts             # ZKP types, attestation types
│       ├── flags.ts                  # Flag, Rule, Segment, AuditEntry
│       ├── kill-switch.ts          # KillSwitchState, Machine, AgentInfo, WebSocketMessage
│       ├── slashing.ts              # Stake, SlashCondition, Reward
│       └── telemetry.ts             # Telemetry event types
└── db-schema/                        # (Reserved for future extraction)
```

---

## Document Metrics

- **Word Count:** ~5,800 words
- **Section Count:** 10 major sections
- **Tables:** 25+
- **ASCII Diagrams:** 5
- **Code References:** 40+ exact file/line citations
- **Components Documented:** 18
- **API Endpoints Documented:** 28
- **Database Tables Documented:** 12
- **ADR Records:** 5

---

*End of Kill Switch System Design Document v2.0.0*

*For updates or corrections, contact the Architecture team or open a PR against this file.*
