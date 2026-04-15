# ADR: Kill Switch Admin UI — Monorepo Restructure & Architecture

**Date:** 2026-04-15  
**Status:** Approved  
**Author:** Wobblus 🔧 (Lead Orchestrator)  
**Deciders:** Andler, Wobblus  
**Consulted:** Gimglich (FE Implementation), Keridz (BE Implementation)  

---

## Executive Summary

**Recommendation: Keep Vite + React 19, restructure into Bun workspace monorepo.**

Next.js is overkill for this Admin UI. It's a single-page dashboard with cookie-based auth and no SEO requirements. Vite delivers faster HMR, simpler deployment (static files behind nginx), and lower attack surface.

**New requirement:** The Kill Switch Admin UI must provide **Ollama request observability** — logging what's inside each request, not just that a request happened (which `journalctl -f -u ollama` already provides). This requires a backend proxy/middleware that intercepts Ollama requests and logs structured data to Supabase.

---

## 1. Monorepo Structure

### Target State (Bun Workspace Monorepo)

```
phase0/
├── apps/
│   ├── admin-ui/                  # Frontend (React 19 + Vite + shadcn/ui + SWR)
│   │   ├── src/
│   │   │   ├── api/              # Unified API client (SWR-compatible)
│   │   │   ├── auth/             # Cookie auth, session monitor, IP lock
│   │   │   ├── components/       # Layout, shadcn/ui primitives
│   │   │   ├── features/
│   │   │   │   ├── kill-switch/  # Dashboard, EmergencyStop, StatusIndicator
│   │   │   │   ├── flags/        # FlagList, FlagEditor
│   │   │   │   └── audit/        # Request audit log viewer (NEW)
│   │   │   ├── hooks/            # SWR hooks for data fetching
│   │   │   ├── lib/              # Utils, constants, config
│   │   │   ├── otel/             # OpenTelemetry
│   │   │   ├── security/         # CSP, CSRF
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── nginx/
│   │   ├── scripts/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   └── kill-switch-api/          # Backend (Elysia/Bun, port 3000)
│       ├── src/
│       │   ├── routes/
│       │   │   ├── auth.ts       # Login, logout, session, IP
│       │   │   ├── kill-switch.ts # Status, activate, activations
│       │   │   ├── flags.ts      # CRUD, audit
│       │   │   └── audit.ts      # Ollama request audit log (NEW)
│       │   ├── services/
│       │   │   ├── kill-switch.ts # Kill switch state machine
│       │   │   ├── ollama-proxy.ts # Ollama request interceptor (NEW)
│       │   │   └── audit-log.ts  # Structured audit logging (NEW)
│       │   ├── middleware/
│       │   │   ├── auth.ts       # Cookie-based auth
│       │   │   ├── rate-limit.ts # Per-IP rate limiting
│       │   │   └── ip-allowlist.ts # IP allowlist
│       │   └── index.ts          # App setup, route registration
│       ├── Dockerfile
│       └── package.json
├── packages/
│   ├── shared-types/             # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── auth.ts           # UserRole, User, AuthState, SessionConfig
│   │   │   ├── kill-switch.ts    # KillSwitchState, KillSwitchStatus
│   │   │   ├── flags.ts          # Flag, AuditEntry, FlagValue
│   │   │   ├── audit.ts          # OllamaRequest, AuditLogEntry (NEW)
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── api-client/              # Unified API client (SWR-compatible)
│       ├── src/
│       │   ├── client.ts         # Base fetch wrapper
│       │   ├── auth.ts           # Login, logout, session
│       │   ├── kill-switch.ts    # Kill switch API methods
│       │   ├── flags.ts          # Feature flags API methods
│       │   ├── audit.ts          # Audit log API methods (NEW)
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── infra/
│   ├── redis/                    # Redis cluster configs
│   ├── tracing/                  # OTel collector configs
│   └── nginx/                    # Root-level nginx configs
├── docker-compose.yml
├── package.json                  # Root: Bun workspaces
├── tsconfig.json                 # Root: project references
└── .env
```

### Why This Structure

| Concern | Flat (Current) | Monorepo (Target) |
|---------|----------------|-------------------|
| **Shared types** | Duplicated in frontend + backend | `packages/shared-types` |
| **API client** | Two inconsistent clients | `packages/api-client` |
| **Backend structure** | Single 508-line `.mjs` file | Organized routes/services/middleware |
| **Ollama audit** | Not implemented | `services/ollama-proxy.ts` + `routes/audit.ts` |
| **Build orchestration** | Manual | `bun --filter '*' build` |
| **Type safety** | Drift between FE/BE contracts | Single source of truth |
| **Alignment with ALYGN** | None | Matches `infrastructure/` pattern |

---

## 2. Framework Decision: Vite (React 19)

**Keep Vite.** Full rationale in previous ADR version — no SEO need, no SSR benefit for internal admin tool, smaller attack surface, faster DX, already working.

---

## 3. API Routing Fix (✅ COMPLETE — Phase A)

All `/admin/` references removed. API base is `/v1/`. Nginx merge conflicts resolved.

---

## 4. Ollama Request Observability (NEW — Phase B Core)

### Problem

`journalctl -f -u ollama` shows that requests happen, but not **what's inside them**. We need:
- Model requested, prompt tokens, completion tokens, latency
- Which user/IP made the request
- Whether the request succeeded or failed
- Full audit trail for compliance and debugging

### Architecture: Ollama Proxy + Audit Logger

```
Client → nginx:11435 → Ollama Proxy (kill-switch-api) → Ollama
                              ↓
                    Audit Logger → Supabase
                              ↓
                    Kill Switch (can block/lock)
```

**How it works:**

1. **nginx** proxies Ollama requests through the kill-switch-api (not directly to Ollama)
2. **ollama-proxy.ts** intercepts each request:
   - Logs request metadata (model, prompt length, IP, timestamp)
   - Forwards to Ollama
   - Logs response metadata (tokens, latency, success/fail)
   - Writes structured audit entry to Supabase
3. **Kill switch integration:** If kill switch is STOPPED/LOCKED, the proxy returns 503 (Ollama unavailable)
4. **Admin UI** shows the audit log in a new "Audit" feature page

### Supabase Schema (for Ollama audit)

```sql
-- Ollama request audit log
CREATE TABLE ollama_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Request metadata
  model TEXT NOT NULL,
  method TEXT NOT NULL,           -- POST /api/generate, POST /api/chat, etc.
  endpoint TEXT NOT NULL,         -- /api/generate, /api/chat, /api/embeddings
  prompt_tokens INT,              -- Estimated from request
  completion_tokens INT,          -- From response
  
  -- Client info
  client_ip TEXT NOT NULL,
  client_id TEXT,                 -- API key or user identifier
  
  -- Response metadata
  status_code INT NOT NULL,
  latency_ms INT NOT NULL,
  error_message TEXT,
  
  -- Kill switch state at time of request
  kill_switch_state TEXT NOT NULL DEFAULT 'ARMED',
  
  -- Trace correlation
  trace_id TEXT
);

-- Index for dashboard queries
CREATE INDEX idx_audit_created_at ON ollama_audit_log(created_at DESC);
CREATE INDEX idx_audit_model ON ollama_audit_log(model);
CREATE INDEX idx_audit_client_ip ON ollama_audit_log(client_ip);
```

### Backend API Endpoints (NEW)

```
GET  /v1/audit/ollama           - List Ollama request logs (paginated, filterable)
GET  /v1/audit/ollama/stats     - Aggregate stats (requests/min, token usage, top models)
GET  /v1/audit/ollama/:id       - Single request detail
POST /v1/ollama/*               - Proxy to Ollama (with audit logging)
```

### Frontend Feature: Audit Page (NEW)

New `features/audit/` with:
- **OllamaAuditTable** — Paginated table of requests (time, model, tokens, latency, IP)
- **OllamaStatsCards** — Aggregate metrics (requests/min, avg latency, token usage)
- **OllamaRequestDetail** — Expandable row with full request/response metadata
- Filters: date range, model, client IP, status code

---

## 5. SWR Integration

### Replace Manual Polling

```tsx
// Before: useKillSwitchPolling (manual setInterval)
// After: useKillSwitchStatus (SWR with refreshInterval)

import useSWR from 'swr';

export function useKillSwitchStatus() {
  const { data, error, isLoading, mutate } = useSWR(
    '/v1/kill-switch/status',
    () => killSwitchApi.getStatus(),
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  );
  return { status: data, loading: isLoading, error, refetch: mutate };
}
```

### SWR + React Context for Auth

```tsx
// AuthProvider uses SWR for session validation
const { data: user, mutate } = useSWR('/v1/auth/me', fetcher, {
  revalidateOnFocus: true,
  shouldRetryOnError: false,
});
```

### Cache Invalidation

| Event | SWR Call |
|-------|---------|
| Emergency stop | `mutate('/v1/kill-switch/status')` |
| Flag toggle | `mutate('/v1/flags')` |
| Login/logout | `mutate('/v1/auth/me')` |
| New audit entry | `mutate('/v1/audit/ollama')` (auto via refreshInterval) |

---

## 6. shadcn/ui Adoption

### P0 Components (Phase B)

| Component | Use Case |
|-----------|----------|
| `Button` | Emergency stop, login, actions |
| `Card` | Status cards, login form, stat cards |
| `Badge` | Status indicators (ARMED/RUNNING/STOPPED) |
| `Input` | Login form, flag editor, audit filters |
| `Label` | Form labels |
| `Table` | Activation history, audit log, flags |

### P1 Components (Phase C)

| Component | Use Case |
|-----------|----------|
| `Dialog` | Confirm emergency stop |
| `DropdownMenu` | User menu, actions |
| `Select` | Model filter in audit page |

### Custom Components (Kill Switch-specific)

| Component | Description |
|-----------|-------------|
| `StatusIndicator` | Animated state circle (ARMED=green, STOPPED=red) |
| `EmergencyStopButton` | Big red button with confirmation dialog |
| `StatCard` | Metric card (adapted from ALYGN reference) |

### Theme

Dark default (admin tool). Custom ThemeProvider (no next-themes needed with Vite).

---

## 7. Backend Type Contract Fix (Phase B)

### Current Mismatch

**Backend returns:**
```json
{ "state": "ARMED", "recentTransitions": [...] }
```

**Frontend expects:**
```typescript
interface KillSwitchStatus {
  state: KillSwitchState;
  lastActivation: string | null;
  lastActivationBy: string | null;
  activeExperiments: number;
  activatedAt: string | null;
  reason: string | null;
}
```

**Fix:** Update backend `/v1/kill-switch/status` to return the full `KillSwitchStatus` object. The `shared-types` package ensures both sides use the same interface.

### Audit Log Persistence

**Current:** In-memory array (lost on restart, max 1000 entries)  
**Target:** Supabase `ollama_audit_log` table + Redis for recent entries (fast reads)

---

## 8. Migration Phases

### Phase A: Fix & Deploy (P0) — ✅ COMPLETE

- Fixed all `/admin/` → `/` routing references
- Resolved nginx merge conflicts
- Build passes, committed

### Phase B: Monorepo + Ollama Observability (P1) — IN PROGRESS

**Step B1: Monorepo Restructure**
1. Create root `package.json` with Bun workspaces
2. Move `admin-ui/` → `apps/admin-ui/`
3. Move `kill-switch/` → `apps/kill-switch-api/` + refactor to TypeScript with routes/services/middleware
4. Create `packages/shared-types/` with unified type definitions
5. Create `packages/api-client/` with unified fetch wrapper
6. Move `redis/` and `tracing/` → `infra/`
7. Update `docker-compose.yml` + `Dockerfile` paths
8. Verify `bun install` + `bun run build`

**Step B2: Backend Refactor + Ollama Proxy**
1. Split `kill-switch-service.mjs` into TypeScript modules
2. Add `ollama-proxy.ts` service (intercept + audit Ollama requests)
3. Add `audit-log.ts` service (write to Supabase)
4. Add `/v1/audit/ollama` endpoints
5. Fix `/v1/kill-switch/status` response to match frontend types
6. Add Supabase client + migration for `ollama_audit_log` table
7. Update nginx to proxy Ollama through kill-switch-api

**Step B3: Frontend Upgrade**
1. Add shadcn/ui (Button, Card, Badge, Input, Label, Table)
2. Refactor LoginPage, KillSwitchDashboard, FlagList with shadcn
3. Add `features/audit/` — OllamaAuditTable, OllamaStatsCards
4. Add SWR hooks: `useKillSwitchStatus`, `useFlags`, `useOllamaAudit`
5. Replace `useKillSwitchPolling` with SWR hook
6. Add audit page to sidebar navigation

### Phase C: Architecture Improvements (P2)

1. Error boundaries per feature
2. Loading skeletons
3. Optimistic updates for flag toggles
4. SSE for real-time kill switch state (replace polling)
5. E2E tests (Playwright)

---

## Decision Record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | **Vite (React 19)** | No SSR need, faster DX, smaller attack surface |
| State Management | **SWR** | Lightweight, cache control, React Context integration |
| UI Library | **shadcn/ui** | Copy-paste ownership, Tailwind-native |
| Monorepo | **Bun workspaces** | Matches ALYGN infrastructure, shared types |
| Ollama Observability | **Proxy + Supabase** | Intercept requests, log structured data, persist |
| Audit Storage | **Supabase + Redis** | Supabase for persistence, Redis for recent/fast reads |
| Kill Switch + Ollama | **Integrated** | Kill switch can block Ollama when STOPPED/LOCKED |

---

*ADR by Wobblus 🔧 — Updated with Ollama observability requirements per Andler's directive.*