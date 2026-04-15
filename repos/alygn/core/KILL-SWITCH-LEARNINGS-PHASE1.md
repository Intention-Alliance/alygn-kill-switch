# 📚 Architecture Learnings — ALYGN Core Infrastructure

**Date:** 2026-04-15 02:15 CST  
**Review Status:** Phase 1 In Progress (Architecture Understanding)

---

## 🏗️ Architecture Overview

### System Layers (from README.md)

```
Layer 5: Presentation (Dashboard)     ← web-regulator (Next.js)
    ↑
Layer 4: Enforcement (Slashing)       ← server-slashing-engine (Express.js)
    ↑
Layer 3: Storage (Supabase)           ← Supabase (PostgreSQL + RLS)
    ↑
Layer 2: Data Collection (Telemetry)  ← server-telemetry-handler (C++)
    ↑
Layer 1: Infrastructure (BlueField-3) ← server-rdma-monitor (C++)
    ↑
Foundation: Smart Contracts (Taproot) ← smart-contracts (Bitcoin)
```

**Key Insight:** This is a **full AI safety compliance stack** — from hardware telemetry to Bitcoin settlement. The web-regulator dashboard is just the presentation layer.

---

## 📦 Monorepo Structure

| Package/App | Type | Description |
|-------------|------|-------------|
| `apps/web-regulator` | Next.js | Real-time compliance dashboard |
| `apps/server-slashing-engine` | Express.js | Cryptoeconomic enforcement |
| `apps/server-telemetry-handler` | C++ | ZKP telemetry logging |
| `apps/server-rdma-monitor` | C++ | BlueField-3 DPU security |
| `apps/smart-contracts` | Bitcoin | ALYGN token (Taproot) |
| `packages/db-schema` | SQL | Supabase migrations |
| `packages/shared-types` | TypeScript | Shared type definitions |

**Key Learning:** Clean separation between:
- **Frontend apps** (UI/presentation)
- **Backend services** (business logic)
- **Shared packages** (types, schema)

---

## 🎨 Frontend Architecture (web-regulator)

### Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Library:** shadcn/ui (components in `/components/ui/`)
- **Icons:** lucide-react
- **Auth:** Supabase Auth
- **Theme:** next-themes (dark/light/system)
- **Font:** Figtree (Google Fonts)

### Root Layout Pattern

```tsx
// apps/web-regulator/app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${figtreeSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Key Patterns:**
- `suppressHydrationWarning` — Prevents hydration mismatch from theme provider
- `ThemeProvider` wraps everything — Theme is app-wide concern
- `Suspense` boundary — Loading states for async components
- Custom font via `next/font/google` — Optimized font loading

---

## 🔐 Authentication Flow

### Login Component Structure

```tsx
// apps/web-regulator/components/login-form.tsx
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/"); // Redirect to dashboard
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login</CardTitle>
        <CardDescription>Enter your email below</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin}>
          {/* Email + Password inputs */}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Key Patterns:**
- `"use client"` directive — Client component (useState, useRouter)
- Supabase client created inside handler — Fresh instance per call
- Error state management — Display validation errors inline
- Loading state — Disable button during auth
- Redirect on success — `router.push("/")`

**Comparison to phase0:**
- phase0 uses **cookie-based auth** (`admin_token` HttpOnly cookie)
- Reference uses **Supabase Auth** (JWT + session management)
- Both redirect to `/` on success
- phase0 redirect loop might be from missing session check on dashboard

---

## 📊 Dashboard Architecture

### Dashboard Page Pattern

```tsx
// apps/web-regulator/app/page.tsx
export default function DashboardPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<SystemStats>({...});
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    // Fetch clusters, audit logs, calculate stats
    const { data: clusterData } = await supabase
      .from("dpu_clusters")
      .select("*, cluster_gpus(*)")
      .order("name");
    
    // ... more queries
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="container mx-auto p-6">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">ALYGN Regulator Dashboard</h1>
        <AuthButton /> {/* Login/Logout based on session */}
      </header>
      
      {/* Stat Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Events" value={stats.totalEvents} icon={Activity} />
        <StatCard title="Violations" value={stats.violations} icon={AlertTriangle} />
        {/* ... more stats */}
      </div>

      {/* Cluster Table */}
      <ClusterTable clusters={clusters} isLoading={isLoading} />
      
      {/* Audit Logs */}
      {/* ... */}
    </div>
  );
}
```

**Key Patterns:**
- `useMemo` for Supabase client — Single instance across renders
- `useCallback` for data fetching — Stable function reference
- `useEffect` triggers fetch — Load data on mount
- Component composition — `StatCard`, `ClusterTable`, `AuthButton`
- Loading states — Show skeletons/spinners while fetching

---

## 🧩 Component Library (shadcn/ui)

### UI Primitives Available

**In `/components/ui/`:**
- `badge.tsx` — Status badges (success, warning, error)
- `button.tsx` — Button variants (primary, secondary, outline, ghost)
- `card.tsx` — Card containers (header, content, footer)
- `input.tsx` — Text inputs with Tailwind styling
- `label.tsx` — Form labels
- More... (dialog, dropdown, toast, etc.)

### Usage Pattern

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

<Card>
  <CardHeader>
    <CardTitle>Login</CardTitle>
  </CardHeader>
  <CardContent>
    <Button variant="primary" disabled={isLoading}>
      {isLoading ? "Loading..." : "Submit"}
    </Button>
    <Badge variant="success">Active</Badge>
  </CardContent>
</Card>
```

**Key Learning:** shadcn/ui provides **copy-paste components** — not a npm package. Each component is a file you own and customize.

---

## 🗄️ Database Schema (packages/db-schema)

### Supabase Tables (from docker-compose env vars)

**Inferred tables:**
- `dpu_clusters` — GPU cluster registry
- `cluster_gpus` — Individual GPU records
- `compliance_audit_log` — Compliance event log
- `policy_violations` — Violation records
- `telemetry_events` — Raw telemetry data

**Key Pattern:** Supabase migrations in `packages/db-schema/supabase/migrations/`

---

## 🐳 Docker Architecture

### Services Configured

```yaml
services:
  telemetry-handler:     # C++ service (always on)
  web-regulator:         # Next.js (commented out - TODO)
  postgres:              # Local dev (commented out)
```

**Note:** `web-regulator` and `postgres` are commented out — suggests deployment via Vercel/Netlify for frontend, managed Supabase for DB.

---

## 🔍 Key Differences: Reference vs. phase0

| Aspect | Reference (intention-alliance) | phase0 (Kill Switch) |
|--------|-------------------------------|----------------------|
| **Auth** | Supabase Auth (JWT, sessions) | Cookie-based (`admin_token`) |
| **Backend** | Mock services (telemetry, slashing) | Real API (Elysia/Bun) |
| **Frontend** | Next.js App Router (source available) | React 19 + Vite (source missing) |
| **UI Library** | shadcn/ui (full component set) | Custom Tailwind components |
| **State** | Supabase real-time subscriptions | Manual polling (`useKillSwitchPolling.ts`) |
| **Deployment** | Vercel + Supabase (cloud) | Docker + nginx (self-hosted) |
| **Database** | Supabase PostgreSQL | Redis cluster + Supabase (planned) |

---

## 📝 Learnings to Apply to phase0

### Architecture Patterns

1. **Monorepo structure** — Separate apps/, packages/ for shared code
2. **Component composition** — Small, reusable UI components
3. **shadcn/ui adoption** — Copy-paste components we own
4. **Auth flow clarity** — Login → Session → Redirect → Protected route check
5. **Loading states** — Suspense boundaries + skeleton loaders
6. **Error handling** — Inline error display, error boundaries

### Specific Fixes for phase0

1. **Login redirect loop** — Need to check session on dashboard load
2. **Protected routes** — Middleware or client-side auth guard
3. **Component library** — Adopt shadcn/ui for consistency
4. **State management** — Consider React Query or SWR for server state
5. **TypeScript types** — Shared types package for API contracts

---

## ✅ Next Steps in Review

**Continue sequential review:**

1. ✅ Read README.md — Done
2. ✅ Read docker-compose.yml — Done
3. ✅ Read layout.tsx — Done
4. ✅ Read login-form.tsx — Done
5. ✅ Read page.tsx (dashboard) — Done
6. ⏳ Read Supabase client config — Next
7. ⏳ Read auth button/logout button — Next
8. ⏳ Read dashboard components (stat-card, cluster-table) — Next
9. ⏳ Read shared types — Next
10. ⏳ Read db-schema migrations — Next

**After review complete:**
- Document full component inventory
- Draft migration plan for phase0
- Create GitHub issues for tracking

---

**Status:** Architecture understanding in progress. Clear pattern emerging for auth flow and component structure.

**Key Insight:** The redirect loop in phase0 is likely from missing session check on dashboard — reference uses Supabase session listener, phase0 needs similar cookie check.
