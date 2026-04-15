# ADR-001: Kill Switch Admin UI Monorepo Restructure

**Status:** Proposed  
**Date:** 2026-04-15  
**Author:** Hugrukal 📐  
**Deciders:** Andler, Wobblus  
**Consulted:** Gimglich (Implementation), Keridz (Implementation)  

---

## Executive Summary

**Recommendation:** Migrate to **Next.js 15 App Router** within a **Bun workspace monorepo** structure aligned with the ALYGN infrastructure reference architecture.

**Rationale:** The Admin UI requires SSR for security (server-side auth validation, CSRF token management), performance (initial page load optimization), and webhook handling. Vite SPA architecture cannot meet these requirements without significant workarounds that would introduce technical debt.

**Migration Strategy:** Three-phase approach:
- **Phase A (P0):** Fix routing/API base URLs in current Vite setup (1-2 days)
- **Phase B (P1):** Monorepo restructure + Next.js migration + shadcn/ui adoption (1-2 weeks)
- **Phase C (P2):** SWR integration + architecture improvements (1 week)

---

## 1. Context

### Current State

The Kill Switch Admin UI system at `/home/andlersrv/.openclaw/workspace/phase0/` has the following structure:

```
phase0/
├── admin-ui/           # React 19 + Vite frontend
│   ├── src/
│   │   ├── api/client.ts          # Uses /admin/api base (INCORRECT)
│   │   ├── auth/                  # Cookie-based auth, session monitor
│   │   ├── features/
│   │   │   ├── kill-switch/       # Manual polling (5s interval)
│   │   │   └── flags/
│   │   └── App.tsx                # React Router 7 routes
│   └── nginx-root-path.conf       # Has merge conflict on /v1/auth/
├── kill-switch/       # Elysia/Bun backend API (port 3000)
├── redis/             # Redis cluster (3 nodes)
├── tracing/           # OpenTelemetry collector
└── docker-compose.yml
```

### Problems Identified

| Issue | Current State | Target State |
|-------|--------------|--------------|
| **API Base URL** | `/admin/api` in client.ts, `/v1/` in features | Unified `/v1/` or `/api/` proxied to `/v1/` |
| **Auth Redirect** | `/admin/login` | `/login` |
| **Routing Base** | Commit changed to `/kill-switch` (wrong) | `/` (root) |
| **State Management** | Manual polling (5s interval) | SWR with cache invalidation |
| **Monorepo** | Flat structure, no workspaces | Bun workspaces (apps/*, packages/*) |
| **UI Components** | Custom Tailwind | shadcn/ui (Radix primitives) |
| **SSR Support** | None (SPA only) | Next.js 15 App Router |

### Reference Architecture: ALYGN Infrastructure

```
infrastructure/
├── apps/
│   ├── web-regulator/          # Next.js 15 + shadcn/ui + Supabase
│   └── ...
├── packages/
│   ├── db-schema/              # Supabase migrations
│   └── shared-types/           # Shared TypeScript types
├── tests/
└── package.json                # Bun workspaces
```

---

## 2. Decision: Monorepo Structure

### Proposed Structure

```
phase0/
├── apps/
│   ├── admin-ui/               # Next.js 15 App Router (port 8443 via nginx)
│   │   ├── app/                # App Router pages
│   │   │   ├── (auth)/
│   │   │   │   └── login/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── kill-switch/
│   │   │   │   ├── flags/
│   │   │   │   └── audit/
│   │   │   ├── api/            # Webhook handlers (optional)
│   │   │   └── layout.tsx
│   │   ├── components/         # shadcn/ui components
│   │   ├── lib/
│   │   │   ├── auth.ts         # Server-side auth utilities
│   │   │   └── api-client.ts   # Shared API client
│   │   └── package.json
│   └── kill-switch-api/        # Elysia/Bun backend (port 3000)
│       ├── src/
│       ├── Dockerfile
│       └── package.json
├── packages/
│   ├── shared-types/           # Shared TypeScript interfaces
│   │   ├── src/
│   │   │   ├── kill-switch.ts  # KillSwitchStatus, ActivationRecord
│   │   │   ├── flags.ts        # Flag, AuditLog types
│   │   │   └── auth.ts         # User, Session types
│   │   └── package.json
│   ├── api-client/             # Shared API client (SWR + fetch)
│   │   ├── src/
│   │   │   ├── client.ts       # Base fetch with auth/CSRF
│   │   │   ├── hooks/          # SWR hooks
│   │   │   └── index.ts
│   │   └── package.json
│   └── ui/                     # Shared UI components (optional)
│       ├── src/
│       │   └── components/     # Reusable shadcn components
│       └── package.json
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   └── integration/            # API integration tests
├── docker-compose.yml
├── package.json                # Bun workspaces root
└── tsconfig.json               # Base TypeScript config
```

### Bun Workspace Configuration

**Root `package.json`:**
```json
{
  "name": "kill-switch-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "bun --filter '*' dev",
    "build": "bun --filter '*' build",
    "lint": "bun --filter '*' lint",
    "test": "bun --filter '*' test",
    "type-check": "bun --filter '*' type-check"
  },
  "packageManager": "bun@1.3.3"
}
```

### Package Separation Rationale

| Package | Purpose | Dependencies |
|---------|---------|--------------|
| `apps/admin-ui` | Frontend application | Next.js, React, SWR, shadcn/ui |
| `apps/kill-switch-api` | Backend API service | Elysia, Bun, Redis |
| `packages/shared-types` | Type definitions | None (pure TypeScript) |
| `packages/api-client` | API communication | SWR (peer), fetch API |
| `packages/ui` | Shared components | shadcn/ui, Radix (optional) |

### Alignment with ALYGN Infrastructure

| Aspect | ALYGN Reference | Kill Switch Adaptation |
|--------|-----------------|------------------------|
| **Monorepo tool** | Bun workspaces | Bun workspaces ✅ |
| **Apps structure** | `apps/*` | `apps/admin-ui`, `apps/kill-switch-api` ✅ |
| **Packages structure** | `packages/*` | `packages/shared-types`, `packages/api-client` ✅ |
| **Frontend framework** | Next.js 15 App Router | Next.js 15 App Router ✅ |
| **UI library** | shadcn/ui + Radix | shadcn/ui + Radix ✅ |
| **TypeScript** | Shared tsconfig | Base tsconfig + extends ✅ |
| **Testing** | `tests/` directory | `tests/e2e`, `tests/integration` ✅ |

---

## 3. Decision: Framework (Vite vs Next.js)

### Evaluation Criteria

| Criterion | Weight | Vite (SPA) | Next.js 15 (SSR) |
|-----------|--------|------------|------------------|
| **SSR Support** | High | ❌ Not available | ✅ Native |
| **Security (auth)** | High | ⚠️ Client-side only | ✅ Server-side validation |
| **Webhook Handling** | Medium | ❌ Requires separate server | ✅ API Routes |
| **Initial Load Performance** | High | ⚠️ Full bundle download | ✅ Streaming + partial hydration |
| **SEO** | Low | ❌ Not required | ✅ Available (not needed) |
| **DX (Dev Experience)** | Medium | ✅ Fast HMR | ✅ Fast HMR (Turbopack) |
| **Complexity** | Medium | ✅ Simple | ⚠️ More conventions |
| **Bundle Size** | Medium | ⚠️ Larger initial | ✅ Code splitting by route |
| **Team Familiarity** | Medium | ✅ Current stack | ✅ ALYGN reference uses it |

### Recommendation: Next.js 15 App Router

**Rationale:**

1. **Security Requirements:** Admin UI handles sensitive kill switch operations. Server-side auth validation prevents token tampering and provides better CSRF protection through server-managed cookies.

2. **SSR Benefits:**
   - Initial page load renders authenticated state on server
   - No flash of unauthenticated content
   - Better performance on slow networks (critical for emergency scenarios)

3. **Webhook Readiness:** Next.js API Routes can handle webhook callbacks (e.g., audit log exports, alert integrations) without requiring a separate service.

4. **Alignment with ALYGN:** Using the same stack as `web-regulator` enables:
   - Shared component library
   - Consistent auth patterns (Supabase SSR vs cookie-based)
   - Easier team member rotation between projects

### Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| **SSR** | Better security, performance | More complex deployment (Node server) |
| **API Routes** | Unified codebase | Need to separate concerns carefully |
| **App Router** | Modern patterns, layouts | Learning curve for team |
| **Server Components** | Reduced bundle size | Cannot use client-only libs directly |

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         NGINX (port 8443)                    │
│  - SSL termination                                           │
│  - Static assets: /_next/static/* → Next.js build output    │
│  - SSR requests: /* → http://localhost:3001 (Next.js)       │
│  - API proxy: /api/* → http://localhost:3000/v1/*           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────▼─────────┐         ┌──────────▼──────────┐
    │   Next.js Server  │         │  Elysia/Bun API     │
    │   (port 3001)     │         │  (port 3000)        │
    │   - SSR rendering │         │  - Kill switch ops  │
    │   - API routes    │         │  - Auth endpoints   │
    │   - Auth cookies  │         │  - Redis cache      │
    └───────────────────┘         └─────────────────────┘
```

**Note:** Backend API (Elysia/Bun on port 3000) remains unchanged. Next.js runs as separate process on port 3001, proxied by nginx.

---

## 4. API Routing Fix

### Current State Analysis

```typescript
// admin-ui/src/api/client.ts
const API_BASE = '/admin/api';  // ❌ WRONG

// admin-ui/src/features/kill-switch/api.ts
const BASE_URL = '/v1/kill-switch';  // ✅ Correct pattern

// admin-ui/src/auth/AuthProvider.tsx
fetch('/v1/auth/me')  // ✅ Correct pattern
fetch('/v1/auth/login')  // ✅ Correct pattern
```

**Inconsistency:** `client.ts` uses `/admin/api`, but feature modules and auth use `/v1/` directly.

### Target Architecture

```
Client (Browser)
       │
       ▼
┌──────────────────────────────────────┐
│  NGINX (port 8443)                   │
│  location /api/ {                    │
│    proxy_pass http://localhost:3000/v1/  │
│  }                                   │
└──────────────────────────────────────┘
       │
       ▼ (proxied)
┌──────────────────────────────────────┐
│  Elysia/Bun API (port 3000)          │
│  Routes: /v1/kill-switch, /v1/auth   │
└──────────────────────────────────────┘
```

### Unified API Client Pattern

**Location:** `packages/api-client/src/client.ts`

```typescript
// Shared API client for monorepo
const API_BASE = '/api';  // Proxied to /v1/ by nginx

interface ApiClientConfig {
  baseUrl?: string;
  csrfEnabled?: boolean;
}

function getAuthHeaders(csrfEnabled: boolean = true): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (csrfEnabled) {
    const csrfCookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='));

    if (csrfCookie) {
      const tokenValue = csrfCookie.split('=')[1];
      if (tokenValue) {
        headers['X-CSRF-Token'] = tokenValue;
      }
    }
  }

  return headers;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  config: ApiClientConfig = {}
): Promise<T> {
  const { baseUrl = API_BASE, csrfEnabled = true } = config;
  const url = `${baseUrl}${endpoint}`;
  
  const headers = {
    ...getAuthHeaders(csrfEnabled),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const traceId = response.headers.get('X-Trace-ID') ?? undefined;

    if (response.status === 401 || response.status === 403) {
      // Auth failure - redirect to login
      window.location.href = '/login';
      throw new ApiClientError({
        status: response.status,
        message: 'Authentication required',
        traceId,
      });
    }

    // Handle other errors...
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const apiClient = {
  get<T>(endpoint: string, params?: Record<string, string>) {
    const searchParams = params
      ? `?${new URLSearchParams(params).toString()}`
      : '';
    return request<T>(`${endpoint}${searchParams}`);
  },
  post<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  // ... put, delete
};
```

### Auth Redirect Fix

**Current:**
```typescript
window.location.href = '/admin/login';  // ❌
```

**Target:**
```typescript
window.location.href = '/login';  // ✅
```

### Nginx Configuration (Resolved)

Remove merge conflict, use clean proxy structure:

```nginx
# API Proxy - Kill Switch Backend
location /api/ {
    proxy_pass http://kill_switch_api/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Auth endpoints (no auth required for login)
location /api/auth/ {
    proxy_pass http://kill_switch_api/v1/auth/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

---

## 5. SWR Integration

### Current State: Manual Polling

```typescript
// useKillSwitchPolling.ts
export function useKillSwitchPolling(
  pollInterval: number = 5000,  // 5 seconds
  onStateChange?: (...) => void
) {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null);
  
  useEffect(() => {
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval]);
}
```

**Problems:**
- Fixed 5s polling regardless of user activity
- No cache sharing between components
- Manual error handling and retry logic
- No background revalidation
- Wastes resources when tab is not visible

### Target State: SWR + React Context

**Installation:**
```bash
bun add swr
```

**SWR Hook Pattern:**

```typescript
// packages/api-client/src/hooks/useKillSwitch.ts
import useSWR from 'swr';
import { apiClient } from '../client';
import type { KillSwitchStatus } from '@kill-switch/shared-types';

const SWR_KEY_STATUS = '/api/kill-switch/status';

export function useKillSwitchStatus() {
  const { data, error, isLoading, mutate } = useSWR<KillSwitchStatus>(
    SWR_KEY_STATUS,
    () => apiClient.get<KillSwitchStatus>('/kill-switch/status'),
    {
      refreshInterval: 5000,  // 5s polling
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      errorRetryInterval: 10000,
      errorRetryCount: 3,
      dedupingInterval: 2000,  // Don't refetch within 2s
    }
  );

  return {
    status: data,
    loading: isLoading,
    error,
    refetch: mutate,
  };
}

// Cache invalidation after mutation
export function useKillSwitchMutation() {
  const { mutate } = useSWRConfig();

  const activateChaos = async (reason: string) => {
    const result = await apiClient.post<KillSwitchStatus>(
      '/kill-switch/chaos',
      { reason }
    );
    
    // Invalidate cache to trigger refetch
    await mutate(SWR_KEY_STATUS);
    return result;
  };

  return { activateChaos };
}
```

### Auth State with SWR + Context

```typescript
// apps/admin-ui/lib/auth-context.tsx
import useSWR from 'swr';
import { createContext, useContext } from 'react';
import { apiClient } from '@kill-switch/api-client';
import type { User } from '@kill-switch/shared-types';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }) {
  const { data: user, error, isLoading } = useSWR<User>(
    '/api/auth/me',
    () => apiClient.get<User>('/auth/me'),
    {
      revalidateOnFocus: false,  // Don't revalidate auth on focus
      revalidateOnReconnect: true,
      onError: () => {
        // Auto-redirect on 401
        window.location.href = '/login';
      },
    }
  );

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    // ... login, logout methods
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

### Real-time Considerations

| Approach | Latency | Complexity | Resource Usage | Recommendation |
|----------|---------|------------|----------------|----------------|
| **Polling (current)** | 5s delay | Low | High (constant requests) | ❌ Keep as fallback |
| **SWR Polling** | 5s delay | Low | Medium (smart caching) | ✅ Phase C default |
| **SSE (Server-Sent Events)** | <1s | Medium | Low (single connection) | ✅ Phase C enhancement |
| **WebSocket** | <100ms | High | Medium (connection management) | ⚠️ Overkill for this use case |

**Recommendation:** Start with SWR polling (Phase C). If sub-second updates become critical, add SSE as optional enhancement:

```typescript
// Future SSE implementation
export function useKillSwitchSSE() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const eventSource = new EventSource('/api/kill-switch/stream');
    
    eventSource.onmessage = (event) => {
      const status = JSON.parse(event.data);
      mutate(SWR_KEY_STATUS, status, false);  // Update without refetch
    };

    return () => eventSource.close();
  }, [mutate]);
}
```

---

## 6. shadcn/ui Adoption

### Component Migration Plan

**Current State:** Custom Tailwind components in `admin-ui/src/components/`

**Target State:** shadcn/ui components (copy-paste, not npm package)

### Components to Adopt

Based on Admin UI requirements:

| Component | shadcn Equivalent | Priority |
|-----------|-------------------|----------|
| Buttons (EmergencyStop) | `button` (variants: destructive) | P0 |
| Status badges | `badge` | P0 |
| Forms (login, flag editor) | `input`, `label`, `form` | P0 |
| Dialogs (confirmations) | `dialog` | P1 |
| Dropdowns (user menu) | `dropdown-menu` | P1 |
| Cards (dashboard widgets) | `card` | P1 |
| Toasts (notifications) | `sonner` or `toast` | P1 |
| Tables (audit log) | `table` | P2 |
| Skeletons (loading) | `skeleton` | P2 |

### Installation (Next.js)

```bash
# Initialize shadcn/ui
cd apps/admin-ui
bunx shadcn@latest init

# Add components
bunx shadcn@latest add button badge input label dialog dropdown-menu card table skeleton
bun add sonner  # For toast notifications
```

### Theme Handling (Dark/Light Mode)

**Next.js + next-themes:**

```bash
bun add next-themes
```

```typescript
// apps/admin-ui/providers/theme-provider.tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children, ...props }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

// apps/admin-ui/app/layout.tsx
import { ThemeProvider } from '@/providers/theme-provider';

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**If staying with Vite (not recommended):**

```typescript
// Custom theme context
const ThemeContext = createContext<{ theme: string; toggle: () => void }>();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### Migration Path

1. **Install shadcn/ui** in new Next.js app
2. **Add components incrementally** (start with Button, Badge, Input)
3. **Replace custom components** one at a time
4. **Update imports** from `@/components/ui/*`
5. **Test visual consistency** (Tailwind classes should carry over)

---

## 7. Migration Phases

### Phase A: Fix & Deploy (P0 — 1-2 days)

**Goal:** Get current system working correctly before restructuring.

#### Tasks

| Task | Files | Changes | Verification |
|------|-------|---------|--------------|
| **A1: Fix API base URL** | `src/api/client.ts` | Change `API_BASE = '/admin/api'` → `API_BASE = '/api'` | API calls succeed, no 404s |
| **A2: Fix auth redirect** | `src/api/client.ts`, `src/auth/*` | Change `/admin/login` → `/login` | 401 redirects to correct path |
| **A3: Fix nginx config** | `nginx-root-path.conf` | Resolve merge conflict, remove `/kill-switch` base | Nginx reloads without errors |
| **A4: Update vite config** | `vite.config.ts` | Ensure `base: '/'`, remove `/admin/api` proxy rewrite | Dev server works |
| **A5: Deploy and test** | — | Build, deploy, smoke test | Login → Dashboard → Kill switch ops work |

#### Verification Checklist

- [ ] Login page loads at `/login`
- [ ] Dashboard loads at `/` (redirects to `/kill-switch`)
- [ ] Kill switch status polls correctly
- [ ] Emergency stop button works
- [ ] Flag management works
- [ ] Audit log loads
- [ ] Logout redirects to login

---

### Phase B: Monorepo Restructure + UI Upgrade (P1 — 1-2 weeks)

**Goal:** Migrate to Bun monorepo + Next.js 15 + shadcn/ui.

#### Tasks

| Task | Files | Changes | Verification |
|------|-------|---------|--------------|
| **B1: Create monorepo structure** | Root | Create `apps/`, `packages/`, root `package.json` with workspaces | `bun install` works at root |
| **B2: Extract shared types** | `packages/shared-types/` | Move types from `src/features/*/types.ts` | Types import correctly |
| **B3: Create API client package** | `packages/api-client/` | Extract `client.ts` + SWR hooks | Client imports in admin-ui work |
| **B4: Migrate to Next.js 15** | `apps/admin-ui/` | Create Next.js app, migrate pages to App Router | `bun dev` starts Next.js |
| **B5: Install shadcn/ui** | `apps/admin-ui/` | Run `shadcn init`, add components | Components render correctly |
| **B6: Migrate auth to SSR** | `apps/admin-ui/lib/auth.ts` | Server-side session validation | Auth works after SSR |
| **B7: Update nginx for SSR** | `nginx.conf` | Add Next.js SSR proxy (port 3001) | SSR pages load correctly |
| **B8: Update docker-compose** | `docker-compose.yml` | Add Next.js service | Full stack deploys |

#### New File Structure (after B1-B3)

```bash
# Create directories
mkdir -p apps/admin-ui apps/kill-switch-api
mkdir -p packages/shared-types/src packages/api-client/src

# Move types
mv src/features/*/types.ts packages/shared-types/src/
mv src/types.ts packages/shared-types/src/index.ts

# Create api-client package
mv src/api/client.ts packages/api-client/src/
mv src/features/*/api.ts packages/api-client/src/hooks/
```

#### Next.js App Router Migration

| Vite Route | Next.js App Router | Notes |
|------------|-------------------|-------|
| `/login` | `app/(auth)/login/page.tsx` | Auth layout (no sidebar) |
| `/` | `app/(dashboard)/page.tsx` | Redirect to `/kill-switch` |
| `/kill-switch` | `app/(dashboard)/kill-switch/page.tsx` | Dashboard layout |
| `/flags` | `app/(dashboard)/flags/page.tsx` | Flag list |
| `/flags/new` | `app/(dashboard)/flags/new/page.tsx` | New flag form |
| `/audit` | `app/(dashboard)/audit/page.tsx` | Audit log table |

#### Verification Checklist

- [ ] Monorepo builds with `bun run build`
- [ ] Next.js SSR renders login page
- [ ] Auth cookie set correctly on login
- [ ] Dashboard loads with SSR data
- [ ] shadcn/ui components render (Button, Badge, Card)
- [ ] API calls go through `/api/` proxy
- [ ] Docker Compose starts all services
- [ ] Nginx proxies SSR + static correctly

---

### Phase C: Architecture Improvements (P2 — 1 week)

**Goal:** Implement SWR, optimize caching, add observability.

#### Tasks

| Task | Files | Changes | Verification |
|------|-------|---------|--------------|
| **C1: Integrate SWR** | `packages/api-client/` | Add SWR hooks, remove manual polling | No `useEffect` polling |
| **C2: Add cache invalidation** | `apps/admin-ui/` | `mutate()` calls after mutations | UI updates after kill switch activation |
| **C3: Implement theme toggle** | `apps/admin-ui/` | Add next-themes, dark/light switch | Theme persists across reloads |
| **C4: Add toast notifications** | `apps/admin-ui/` | Install sonner, add toasts for actions | Toasts appear on success/error |
| **C5: Optimize bundle** | `apps/admin-ui/` | Code splitting, dynamic imports | Lighthouse score >90 |
| **C6: Add E2E tests** | `tests/e2e/` | Playwright tests for critical paths | Tests pass in CI |

#### SWR Migration Example

**Before (manual polling):**
```typescript
const { status, loading, refetch } = useKillSwitchPolling(5000);
```

**After (SWR):**
```typescript
const { data: status, isLoading, mutate: refetch } = useKillSwitchStatus();
```

#### Verification Checklist

- [ ] No manual `setInterval` polling in codebase
- [ ] SWR cache invalidates after mutations
- [ ] Theme toggle works (dark/light)
- [ ] Toast notifications show on actions
- [ ] Bundle size <500KB (gzipped)
- [ ] E2E tests pass (login, kill switch, flags)

---

## 8. Consequences

### Positive Outcomes

| Outcome | Impact |
|---------|--------|
| **SSR Security** | Server-side auth validation prevents client tampering |
| **Performance** | Faster initial page load, better perceived performance |
| **Maintainability** | Monorepo structure enables shared code, consistent patterns |
| **Team Alignment** | Same stack as ALYGN infrastructure (web-regulator) |
| **Modern DX** | Next.js 15 App Router + shadcn/ui = excellent developer experience |
| **Type Safety** | Shared types package ensures consistency across apps |

### Trade-offs and Risks

| Risk | Mitigation |
|------|------------|
| **Migration complexity** | Three-phase approach, Phase A stabilizes current system first |
| **Learning curve (App Router)** | Reference ALYGN web-regulator implementation |
| **SSR deployment complexity** | Docker Compose handles orchestration, nginx config documented |
| **Bundle size increase** | Code splitting by route, tree shaking with Next.js |
| **Breaking changes during migration** | Phase A ensures current system works before restructuring |

### Technical Debt Addressed

- ❌ → ✅ Inconsistent API base URLs
- ❌ → ✅ Manual polling replaced with SWR
- ❌ → ✅ Flat structure replaced with monorepo
- ❌ → ✅ Custom Tailwind replaced with shadcn/ui
- ❌ → ✅ SPA-only replaced with SSR capability

### Future Considerations

1. **WebSocket for real-time updates:** If sub-second kill switch state updates become critical, add SSE or WebSocket alongside SWR.

2. **Shared UI package:** If multiple admin UIs are created, extract shadcn/ui components to `packages/ui` for true sharing.

3. **API versioning:** Add `/v2/` namespace when breaking changes are needed; keep `/v1/` for backward compatibility.

4. **Micro-frontend readiness:** Monorepo structure enables splitting admin-ui into separate deployable units if needed.

---

## 9. References

- **ALYGN Infrastructure:** `/home/andlersrv/.openclaw/workspace/repos/alygn/infrastructure/`
- **Next.js 15 App Router:** https://nextjs.org/docs/app
- **SWR Documentation:** https://swr.vercel.app/
- **shadcn/ui:** https://ui.shadcn.com/
- **Bun Workspaces:** https://bun.sh/docs/runtime/workspaces
- **Current Phase0 Codebase:** `/home/andlersrv/.openclaw/workspace/phase0/`

---

## Appendix A: File Change Summary

### Files to Create (Phase B)

```
phase0/
├── apps/
│   ├── admin-ui/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   └── login/
│   │   │   │       └── page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── kill-switch/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── flags/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── new/
│   │   │   │   │       └── page.tsx
│   │   │   │   └── audit/
│   │   │   │       └── page.tsx
│   │   ├── components/ui/          # shadcn/ui components
│   │   ├── lib/
│   │   │   ├── auth.ts
│   │   │   └── api-client.ts
│   │   ├── providers/
│   │   │   ├── auth-provider.tsx
│   │   │   └── theme-provider.tsx
│   │   └── package.json
│   └── kill-switch-api/
│       ├── src/
│       │   └── index.ts            # Move from kill-switch-service.mjs
│       ├── Dockerfile
│       └── package.json
├── packages/
│   ├── shared-types/
│   │   ├── src/
│   │   │   ├── kill-switch.ts
│   │   │   ├── flags.ts
│   │   │   ├── auth.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── api-client/
│       ├── src/
│       │   ├── client.ts
│       │   ├── hooks/
│       │   │   ├── useKillSwitch.ts
│       │   │   ├── useFlags.ts
│       │   │   └── useAuth.ts
│       │   └── index.ts
│       └── package.json
├── tests/
│   ├── e2e/
│   │   └── login.spec.ts
│   └── integration/
│       └── api.spec.ts
├── package.json                    # Root with workspaces
└── tsconfig.json                   # Base config
```

### Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `nginx-root-path.conf` | A | Fix merge conflict, update proxy paths |
| `docker-compose.yml` | B | Add Next.js service, update volumes |
| `.env` | B | Add NEXT.js environment variables |

### Files to Delete

| File | Phase | Reason |
|------|-------|--------|
| `admin-ui/src/api/client.ts` | B | Moved to `packages/api-client/` |
| `admin-ui/src/features/*/types.ts` | B | Moved to `packages/shared-types/` |
| `admin-ui/src/features/*/api.ts` | B | Moved to `packages/api-client/hooks/` |
| `kill-switch/kill-switch-service.mjs` | B | Moved to `apps/kill-switch-api/src/` |

---

**End of ADR-001**
