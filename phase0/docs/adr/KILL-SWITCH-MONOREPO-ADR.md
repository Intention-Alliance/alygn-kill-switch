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

## 2. Framework Decision: Next.js 15 App Router

**Migrate to Next.js 15.** The original rationale for Vite (no SSR need, simpler deployment) was correct for a pure SPA. However, the security requirement to **proxy all backend requests through a server layer** changes the calculus.

### Why Next.js Over Vite

| Factor | Vite (SPA) | Next.js 15 |
|--------|-----------|------------|
| **Request masking** | ❌ Browser calls backend directly (port 3000 exposed) | ✅ Server Actions / API routes proxy all calls |
| **Ollama proxy** | ❌ Browser would call Ollama directly or need separate proxy | ✅ Next.js server proxies Ollama requests |
| **Auth security** | ⚠️ Cookie set by backend, read by browser (cross-origin) | ✅ HttpOnly cookies set/read only by server |
| **API key exposure** | ❌ Any API keys in browser can be extracted | ✅ Keys stay server-side only |
| **SSR** | ❌ Not available | ✅ Server Components for initial render |
| **Deployment** | ✅ Static files behind nginx | ⚠️ Needs Node.js runtime (Docker container) |
| **DX / HMR** | ✅ Very fast | ⚠️ Slower but acceptable |

**The key insight:** With Vite, the browser must know about the backend API (port 3000) and potentially the Ollama endpoint. With Next.js, the browser only talks to the Next.js server — all backend/Ollama communication happens server-side. This is the **BFF (Backend-for-Frontend) pattern** and it's the right architecture for an admin tool that needs to control access to multiple backend services.

### Architecture: Next.js as Secure Proxy Layer

```
Browser → Next.js Server (port 3001) ──→ kill-switch-api (port 3000)
                                  ──→ Ollama (port 11434)
                                  ──→ Supabase (audit logs)
```

**Browser never sees:**
- kill-switch-api port or URL
- Ollama endpoint
- Supabase credentials
- Any API keys

**Browser only sees:**
- Next.js server routes (`/api/*`, Server Actions)
- Static assets (JS, CSS, images)

### Migration Path

Phase B3 will migrate the Vite SPA to Next.js 15 App Router:
1. Initialize Next.js app in `apps/admin-ui/`
2. Port React Router routes → App Router file-based routes
3. Port API calls → Server Actions + Route Handlers
4. Port cookie auth → Next.js middleware + server-side session
5. Add Ollama proxy Route Handler
6. Add shadcn/ui (native Next.js support)
7. Dockerize Next.js server (separate container)

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

### Architecture: Next.js BFF + Ollama Proxy + Audit Logger

```
Browser → Next.js (port 3001, BFF) ──→ kill-switch-api (port 3000, internal)
                                 ──→ Ollama (port 11434, internal)
                                 ──→ Supabase (audit logs)
                                 ──→ Redis (kill switch state)
```

**How it works:**

1. **Browser** only communicates with Next.js server (port 3001)
2. **Next.js server** proxies all requests:
   - `/api/kill-switch/*` → kill-switch-api (port 3000)
   - `/api/ollama/*` → Ollama (port 11434) + audit logging
   - `/api/audit/*` → Supabase (audit log queries)
3. **ollama-proxy Route Handler** intercepts each Ollama request:
   - Logs request metadata (model, prompt length, IP, timestamp)
   - Forwards to Ollama
   - Logs response metadata (tokens, latency, success/fail)
   - Writes structured audit entry to Supabase
4. **Kill switch integration:** If kill switch is STOPPED/LOCKED, the proxy returns 503
5. **Admin UI** shows the audit log in the "Audit" feature page

**Security guarantees:**
- Browser never sees kill-switch-api URL or port
- Browser never sees Ollama endpoint
- Browser never sees Supabase credentials
- All API keys remain server-side only
- HttpOnly cookies managed by Next.js server
- CSRF protection via Next.js built-in mechanisms

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

### Phase B: Monorepo + Next.js Migration + Ollama Observability (P1) — IN PROGRESS

**Step B1: Monorepo Restructure** (Chanshuk — IN PROGRESS)
1. Create root `package.json` with Bun workspaces
2. Move `admin-ui/` → `apps/admin-ui/`
3. Move `kill-switch/` → `apps/kill-switch-api/` + refactor to TypeScript
4. Create `packages/shared-types/` with unified type definitions
5. Create `packages/api-client/` with unified fetch wrapper
6. Move `redis/` and `tracing/` → `infra/`
7. Update `docker-compose.yml` + `Dockerfile` paths
8. Verify `bun install` + `bun run build`

**Step B2: Backend Refactor + Next.js BFF** (Keridz)
1. Split `kill-switch-service.mjs` into TypeScript modules (routes/services/middleware)
2. Initialize Next.js 15 in `apps/admin-ui/` (replace Vite)
3. Port React Router → App Router file-based routes
4. Port API calls → Server Actions + Route Handlers
5. Add Ollama proxy Route Handler (`/api/ollama/*`)
6. Add audit log Route Handler (`/api/audit/*`)
7. Add Supabase client + migration for `ollama_audit_log` table
8. Fix `/v1/kill-switch/status` response to match frontend types
9. Dockerize Next.js server (separate container in docker-compose)

**Step B3: Frontend Upgrade** (Gimglich)
1. Add shadcn/ui (Button, Card, Badge, Input, Label, Table)
2. Refactor LoginPage, KillSwitchDashboard, FlagList with shadcn
3. Add `features/audit/` — OllamaAuditTable, OllamaStatsCards
4. Add SWR hooks: `useKillSwitchStatus`, `useFlags`, `useOllamaAudit`
5. Replace `useKillSwitchPolling` with SWR hook
6. Add audit page to sidebar navigation
7. Port cookie auth → Next.js middleware + server-side session

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
| Framework | **Next.js 15 App Router** | BFF pattern — proxy all backend requests, mask URLs, server-side auth |
| State Management | **SWR** | Lightweight, cache control, React Context integration |
| UI Library | **shadcn/ui** | Copy-paste ownership, Tailwind-native |
| Monorepo | **Bun workspaces** | Matches ALYGN infrastructure, shared types |
| Ollama Observability | **Next.js BFF Proxy + Supabase** | Server-side proxy intercepts, logs, persists; browser never sees Ollama URL |
| Audit Storage | **Supabase + Redis** | Supabase for persistence, Redis for recent/fast reads |
| Kill Switch + Ollama | **Integrated** | Kill switch can block Ollama when STOPPED/LOCKED |

---

*ADR by Wobblus 🔧 — Updated with Ollama observability requirements per Andler's directive.*