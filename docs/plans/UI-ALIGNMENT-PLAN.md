# UI Alignment Plan — Root Dashboard
<!-- ADR-005: Root Dashboard vs Reference Design -->

**Author:** Hugrukal 📐  
**Date:** 2026-05-19  
**Status:** Proposed

---

## Table of Contents
1. [Strategy Decision](#1-strategy-decision)
2. [Visual Specification](#2-visual-specification)
3. [Component Changes](#3-component-changes)
4. [Data Mapping](#4-data-mapping)
5. [Detailed Task Breakdown](#5-detailed-task-breakdown)
6. [Verification Checklist](#6-verification-checklist)

---

## 1. Strategy Decision

### Current State

| Aspect | Reference (read-only) | Our Built (infrastructure) |
|---|---|---|
| Root page `/` | Full dashboard (stats + table + panel) | Redirect to `/kill-switch` or `/login` |
| Layout | `min-h-screen p-8 space-y-8` (full-width) | Sidebar layout `flex h-screen` with `max-w-6xl p-4` |
| Header | In-page gradient "ALYGN Ledger" + user actions | Sidebar nav + mobile hamburger |
| Auth | Supabase `createClient().auth.getUser()` | Better-Auth via `AuthProvider` context |
| Data | `dpu_clusters` + `compliance_audit_log` | Kill Switch API + WebSocket |
| Right panel | System Health + Network Load + Security Events | Not present on root page |

### Recommendation: **Option A — Full-width dashboard, sidebar retained**

**Rationale:**

1. The sidebar provides structured navigation and already exists. Removing it would be a regression.
2. The dashboard page (`/`) should match the reference design exactly in layout and visual presentation — but live *inside* the sidebar's main content area.
3. The reference's inline header (gradient title, user info, action buttons) will be rendered in the main content pane, not as a global layout header.
4. The sidebar remains for secondary navigation (Kill Switch, Flags, Machines, etc.).

**Architecture principle:** The sidebar is the application shell. The dashboard is one view within it. The reference design maps onto that view, not the shell.

### Layout Architecture

```
┌─────────────────────────────────────────────────────┐
│ RootLayout (app/layout.tsx)                         │
│  ┌──────────┬──────────────────────────────────────┐│
│  │ Sidebar  │ Main Content Area                     ││
│  │ (fixed)  │  ┌──────────────────────────────────┐ ││
│  │          │  │ Dashboard Page (full-width)       │ ││
│  │ Kill Sw  │  │  ┌ Header ──────────────────────┐ │ ││
│  │ Flags    │  │  │ ALYGN Ledger | user | actions │ │ ││
│  │ Machines │  │  └──────────────────────────────┘ │ ││
│  │ Settings │  │  ┌ Stat Cards (4-col grid) ──────┐ │ ││
│  │ Docs     │  │  │ card1 | card2 | card3 | card4 │ │ ││
│  │          │  │  └──────────────────────────────┘ │ ││
│  │ ──────── │  │  ┌ Main Content (xl:grid) ───────┐ │ ││
│  │ User     │  │  │ ┌ Cluster Table ┐ ┌ Panel ┐   │ │ ││
│  │          │  │  │ │ (3 cols)      │ │(1 col)│   │ │ ││
│  │          │  │  │ │               │ │ Health │   │ │ ││
│  │          │  │  │ │               │ │ Load   │   │ │ ││
│  │          │  │  │ │               │ │ Events │   │ │ ││
│  │          │  │  │ └───────────────┘ └────────┘   │ │ ││
│  │          │  │  └────────────────────────────────┘ │ ││
│  │          │  └──────────────────────────────────┘ ││
│  └──────────┴──────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Key constraint:** The main content area must NOT have `max-w-6xl` on the dashboard page. The current `(dashboard)/layout.tsx` wraps all pages in `max-w-6xl`. We need a mechanism to allow the dashboard to break out.

---

## 2. Visual Specification

### 2.1 Header Section

Copy **character-by-character** from reference `page.tsx` lines 120-176:

```html
<header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
  <div>
    <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
      ALYGN Ledger
    </h1>
    <p className="text-muted-foreground mt-1 text-lg">
      Sovereign Compliance Monitoring Dashboard
    </p>
  </div>
  <div className="flex items-center gap-3">
    <!-- User info: email + "Authenticated Regulator" label -->
    <div className="hidden md:flex flex-col items-end mr-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Authenticated Regulator
      </p>
      <p className="text-xs font-medium">{user.email}</p>
    </div>
    <!-- Add Cluster button (Link to /clusters/add or /machines) -->
    <Button asChild variant="outline" className="border-primary/20 hover:bg-primary/5">
      <Link href="/machines">
        <Plus className="size-4 mr-2" />
        Register Machine
      </Link>
    </Button>
    <!-- Sign Out button -->
    <Button variant="ghost" size="icon" onClick={logout}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Sign Out">
      <LogOut className="size-5" />
    </Button>
    <!-- Export Report button -->
    <Button onClick={exportReport} variant="ghost" size="icon"
            className="text-muted-foreground hover:text-foreground"
            title="Export Report">
      <Download className="size-5" />
    </Button>
  </div>
</header>
```

**CSS tokens required:**
- `from-primary` / `to-primary/60` — must exist in tailwind theme (verify `primary` color in `tailwind.config`)
- `text-muted-foreground` — standard shadcn token
- `border-primary/20` — border with primary at 20% opacity

### 2.2 Stat Cards Grid

Copy **character-by-character** from reference `page.tsx` lines 180-209:

```html
<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
  <StatCard icon={<Activity className="size-5" />}
            label="Total Enforcement Events" value={stats.totalEvents.toLocaleString()}
            trend="+12%" trendUp />
  <StatCard icon={<AlertTriangle className="size-5" />}
            label="Active Violations" value={stats.violations.toString()}
            trend={stats.violations > 0 ? "Critical Action" : "No active breaches"}
            trendUp={false} alert={stats.violations > 0} />
  <StatCard icon={<Clock className="size-5" />}
            label="Avg Cross-Cluster Latency" value={`${stats.avgLatency.toFixed(2)}ms`}
            trend="Target < 5ms" trendUp={stats.avgLatency < 5} />
  <StatCard icon={<Shield className="size-5" />}
            label="Global Network Uptime" value={`${stats.uptime}%`}
            trend="Tier-1 reliability" trendUp />
</div>
```

**StatCard component signature (already exists, identical to reference):**

```tsx
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  alert?: boolean;
  className?: string;
}
```

**Visual spec:**
- Card wrapper: `border-border/50 bg-card/50 backdrop-blur-sm`
- Label: `text-sm font-medium text-muted-foreground`
- Value: `text-2xl font-bold tracking-tight`
- Trend text: green-500 if `trendUp`, yellow-500 if `!trendUp`, destructive if `alert`
- Icon: 16px × 16px, positioned top-right

### 2.3 Cluster Registry Section

Copy from reference `page.tsx` lines 212-228:

```html
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Server className="w-6 h-6 text-primary" />
      <h2 className="text-2xl font-bold tracking-tight">Active Cluster Registry</h2>
    </div>
    <Badge variant="outline" className="font-mono text-xs py-1">
      {clusters.length} NODES DISCOVERED
    </Badge>
  </div>

  <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
    <!-- Table: xl:col-span-3 -->
    <div className="xl:col-span-3">
      <ClusterTable clusters={clusters} isLoading={isLoading} />
    </div>

    <!-- Side Panel: xl:col-span-1 -->
    <!-- SEE SECTION 2.4 BELOW -->
  </div>
</div>
```

**ClusterTable (already exists, identical to reference except latency threshold):**

Reference uses `< 5ms` for green, our built uses `< 4ms`. Standardize to `< 5ms` per reference.

Column spec:
| Column | Format | Color logic |
|---|---|---|
| Name | `font-medium` | — |
| Location | `text-muted-foreground` | — |
| GPUs | Number (from `cluster_gpus.length` or `gpus` field) | — |
| Latency | `X.Xms` | green-500 if < 5ms, else yellow-500 |
| Uptime | `XX.XX%` | — |
| Status | Badge | `default` for operational, `destructive` for degraded, `outline` for offline |

Empty state: `"No clusters found in the registry."` centered in a full-width cell.
Loading state: spinning border circle + `"Scanning clusters..."`

### 2.4 Right-Hand Side Panel

Copy from reference `page.tsx` lines 234-281:

```html
<div className="xl:col-span-1 border border-border/50 bg-card/30 rounded-xl p-6 backdrop-blur-md space-y-6">
  <!-- System Health -->
  <div className="space-y-2">
    <h3 className="font-semibold text-lg">System Health</h3>
    <p className="text-sm text-muted-foreground leading-relaxed">
      All ALYGN nodes are currently reporting within nominal parameters.
      Average kill-switch latency is performing at 140% above target threshold.
    </p>
  </div>

  <!-- Network Load Bar -->
  <div className="space-y-4">
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground font-medium">Network Load</span>
      <span className="font-bold text-primary">Normal</span>
    </div>
    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-primary w-[45%]" />
    </div>
  </div>

  <div className="h-px w-full bg-border/50" />

  <!-- Recent Security Events -->
  <div className="space-y-4">
    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
      Recent Security Events
    </h4>
    <div className="space-y-3">
      {events.slice(0, 3).map((event) => (
        <div key={event.id}
             className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/30">
          <div className={cn("mt-1.5 size-2 rounded-full",
            event.violation ? "bg-destructive animate-pulse" : "bg-green-500")} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">
              {event.violation || "Standard Inference Verification"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(event.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
</div>
```

**Network Load computation:** Use Kill Switch state mapping:
- `RUNNING` → 65-75% (high load)
- `ARMED` → 30-45% (normal)
- `STOPPING` / `STOPPED` → 10-25% (low)
- `LOCKED` → 80-95% (critical)

This replaces the static 45% in the reference.

---

## 3. Component Changes

### Summary Table

| # | File | Action | LOC Δ | Description |
|---|---|---|---|---|
| 1 | `app/page.tsx` | **REWRITE** | +190 | Full dashboard (replace redirect) |
| 2 | `app/(dashboard)/layout.tsx` | **MODIFY** | +15 | Remove `max-w-6xl` on dashboard route |
| 3 | `components/dashboard/system-health-panel.tsx` | **CREATE** | +80 | Right panel component (extracted) |
| 4 | `components/dashboard/stat-card.tsx` | **VERIFY** | 0 | Already matches reference |
| 5 | `components/dashboard/cluster-table.tsx` | **TWEAK** | +3 | Fix latency threshold 4→5ms |
| 6 | `lib/dashboard-utils.ts` | **CREATE** | +30 | Stats computation helpers |
| 7 | `types/supabase.types.ts` | **MODIFY** | +15 | Add DashboardStats interface |
| 8 | `app/layout.tsx` | **VERIFY** | 0 | Already has AuthProvider, no change |
| 9 | `types/shared.ts` | **MODIFY** | +10 | Add SecurityEvent type |

### Detailed Specifications

#### 3.1 `app/page.tsx` — Complete Rewrite

**Before:** Auth check → redirect to `/kill-switch` or `/login`  
**After:** Full dashboard matching reference design exactly

```tsx
// app/page.tsx — New File Content
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import { ClusterTable } from "@/components/dashboard/cluster-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemHealthPanel } from "@/components/dashboard/system-health-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { computeDashboardStats, computeNetworkLoad } from "@/lib/dashboard-utils";
import {
  Activity, AlertTriangle, Clock, Download, LogOut, Plus, Server, Shield
} from "lucide-react";
import Link from "next/link";
import type { Cluster, Machine, ActivationRecord, KillSwitchState } from "@/types/shared";

// ─── Types ──────────────────────────────────────────────────────

interface DashboardStats {
  totalEvents: number;
  violations: number;
  avgLatency: number;
  uptime: number;
}

// ─── Component ──────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, logout, isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    status, machines, auditLog, flags,
    isConnected, reconnectAttempt,
  } = useKillSwitchWebSocket();

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalEvents: 0, violations: 0, avgLatency: 0, uptime: 99.97,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Adapt machines → clusters when data arrives
  useEffect(() => {
    if (machines.length === 0 && auditLog.length === 0) return;

    const adaptedClusters: Cluster[] = machines.map((m) => ({
      id: m.id,
      name: m.name,
      location: m.hostname,           // hostname as location proxy
      gpus: m.specs?.gpu ? 1 : 0,     // count GPUs from specs
      avg_latency: m.cpuUsage ?? 0,   // proxy: CPU usage in ms range
      uptime: m.status === "active" ? 99.9 : m.status === "inactive" ? 0 : 50,
      status: m.status === "active" ? "operational" :
              m.status === "inactive" ? "offline" : "degraded",
      cluster_gpus: [],
      slug: m.id,
      total_requests: 0,
      policy_violations: 0,
    }));

    setClusters(adaptedClusters);

    const computed = computeDashboardStats(adaptedClusters, auditLog, status?.state ?? null);
    setStats(computed);
    setIsLoading(false);
  }, [machines, auditLog, status]);

  // ─── Export Report ──────────────────────────────────────────

  const exportReport = useCallback(() => {
    const report = {
      generated_at: new Date().toISOString(),
      system_status: stats.violations > 0 ? "NON-COMPLIANT" : "COMPLIANT",
      clusters,
      statistics: stats,
      recent_events: auditLog.slice(0, 100),
      kill_switch_state: status?.state ?? "UNKNOWN",
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [clusters, stats, auditLog, status]);

  // ─── Loading State ──────────────────────────────────────────

  if (authLoading || (isLoading && isConnected === false)) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // ─── Not Authenticated ──────────────────────────────────────

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Button asChild variant="default" className="shadow-lg shadow-primary/20">
          <Link href="/login">Sign In to Access Dashboard</Link>
        </Button>
      </div>
    );
  }

  const networkLoadPercent = computeNetworkLoad(status?.state ?? null);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-8">
      {/* ===== HEADER (exact copy from reference lines 120-176) ===== */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            ALYGN Ledger
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Sovereign Compliance Monitoring Dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end mr-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Authenticated Regulator
            </p>
            <p className="text-xs font-medium">{user.email}</p>
          </div>
          <Button asChild variant="outline" className="border-primary/20 hover:bg-primary/5">
            <Link href="/machines">
              <Plus className="size-4 mr-2" />
              Register Machine
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={logout}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Sign Out">
            <LogOut className="size-5" />
          </Button>
          <Button onClick={exportReport} variant="ghost" size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  title="Export Report">
            <Download className="size-5" />
          </Button>
        </div>
      </header>

      {/* ===== STATS GRID (exact copy from reference lines 180-209) ===== */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard icon={<Activity className="size-5" />}
                  label="Total Enforcement Events"
                  value={stats.totalEvents.toLocaleString()}
                  trend="+12%" trendUp />
        <StatCard icon={<AlertTriangle className="size-5" />}
                  label="Active Violations"
                  value={stats.violations.toString()}
                  trend={stats.violations > 0 ? "Critical Action" : "No active breaches"}
                  trendUp={false} alert={stats.violations > 0} />
        <StatCard icon={<Clock className="size-5" />}
                  label="Avg Cross-Cluster Latency"
                  value={`${stats.avgLatency.toFixed(2)}ms`}
                  trend="Target < 5ms" trendUp={stats.avgLatency < 5} />
        <StatCard icon={<Shield className="size-5" />}
                  label="Global Network Uptime"
                  value={`${stats.uptime}%`}
                  trend="Tier-1 reliability" trendUp />
      </div>

      {/* ===== MAIN CONTENT (exact copy from reference lines 212-228) ===== */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">Active Cluster Registry</h2>
          </div>
          <Badge variant="outline" className="font-mono text-xs py-1">
            {clusters.length} NODES DISCOVERED
          </Badge>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3">
            <ClusterTable clusters={clusters} isLoading={isLoading} />
          </div>

          {/* ===== RIGHT PANEL (extracted to SystemHealthPanel) ===== */}
          <div className="xl:col-span-1">
            <SystemHealthPanel
              auditLog={auditLog}
              networkLoadPercent={networkLoadPercent}
              killSwitchState={status?.state ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Key changes from current `page.tsx`:**

1. Remove `useRouter` + redirect logic entirely
2. Import `useKillSwitchWebSocket` for real-time data
3. Adapt `Machine[]` → `Cluster[]` for the table component
4. Compute dashboard stats from machines + audit log + kill switch state
5. Render the full reference layout inside the sidebar's main area

**~LOC: 190** (full rewrite, replacing current 40-line redirect)

#### 3.2 `app/(dashboard)/layout.tsx` — Modify

**Before:**
```tsx
<main className="flex-1 overflow-y-auto bg-background">
  <div className="mx-auto max-w-6xl p-4 pt-14 md:pt-4 lg:p-8">
    <ErrorBoundary>
      <Suspense fallback={...}>
        {children}
      </Suspense>
    </ErrorBoundary>
  </div>
</main>
```

**After:**
```tsx
<main className="flex-1 overflow-y-auto bg-background">
  <ErrorBoundary>
    <Suspense fallback={...}>
      {children}
    </Suspense>
  </ErrorBoundary>
</main>
```

**Rationale:** Remove the `max-w-6xl p-4` wrapper so the dashboard page can use full width with `p-8`. The padding is now handled by each page individually. The dashboard uses `p-8`, other pages (kill-switch, flags, machines, settings, docs) should add their own padding wrapper.

**Actually — better approach:** Move the padding into individual pages, not the layout:

```tsx
// (dashboard)/layout.tsx — simplified
<main className="flex-1 overflow-y-auto bg-background">
  <ErrorBoundary>
    <Suspense fallback={...}>
      {children}
    </Suspense>
  </ErrorBoundary>
</main>
```

Then each page wraps itself:
- `page.tsx` (dashboard): `<div className="p-8 space-y-8">`
- `kill-switch/page.tsx`: add `<div className="mx-auto max-w-6xl p-4 pt-14 md:pt-4 lg:p-8">`
- `flags/page.tsx`: same wrapper
- etc.

**~LOC: +10** (remove wrapper, add to each page — separate task)

#### 3.3 `components/dashboard/system-health-panel.tsx` — Create

New file, extracted from reference's inline right-panel JSX:

```tsx
// components/dashboard/system-health-panel.tsx
"use client";

import { cn } from "@/lib/utils";
import type { ActivationRecord, KillSwitchState } from "@/types/shared";

interface SystemHealthPanelProps {
  auditLog: ActivationRecord[];
  networkLoadPercent: number;
  killSwitchState: KillSwitchState | null;
}

export function SystemHealthPanel({
  auditLog,
  networkLoadPercent,
  killSwitchState,
}: SystemHealthPanelProps) {
  const loadLabel =
    !killSwitchState ? "Unknown" :
    killSwitchState === "RUNNING" ? "Elevated" :
    killSwitchState === "ARMED" ? "Normal" :
    killSwitchState === "STOPPING" || killSwitchState === "STOPPED" ? "Low" :
    "Critical";

  return (
    <div className="border border-border/50 bg-card/30 rounded-xl p-6 backdrop-blur-md space-y-6">
      {/* System Health */}
      <div className="space-y-2">
        <h3 className="font-semibold text-lg">System Health</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          All ALYGN nodes are currently reporting within nominal parameters.
          Average kill-switch latency is performing at 140% above target threshold.
        </p>
      </div>

      {/* Network Load Bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-medium">Network Load</span>
          <span className="font-bold text-primary">{loadLabel}</span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${networkLoadPercent}%` }}
          />
        </div>
      </div>

      <div className="h-px w-full bg-border/50" />

      {/* Recent Security Events */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Recent Security Events
        </h4>
        <div className="space-y-3">
          {auditLog.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No recent events</p>
          ) : (
            auditLog.slice(0, 3).map((log) => (
              <div key={log.id}
                   className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/30">
                <div className={cn(
                  "mt-1.5 size-2 rounded-full",
                  log.newState === "STOPPED" || log.newState === "LOCKED"
                    ? "bg-destructive animate-pulse"
                    : "bg-green-500",
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    {log.reason || "Standard Inference Verification"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

**~LOC: +80**

#### 3.4 `components/dashboard/cluster-table.tsx` — Tweak

**Change:** Latency threshold from `< 4` → `< 5` to match reference.

Line ~86:
```tsx
// Before:
(cluster.avg_latency || 0.0) < 4

// After:
(cluster.avg_latency || 0.0) < 5
```

**~LOC: Δ 1** (one character)

#### 3.5 `components/dashboard/stat-card.tsx` — Verify

**Status: ✅ NO CHANGES NEEDED.** The built version is character-by-character identical to the reference.

#### 3.6 `lib/dashboard-utils.ts` — Create

Pure utility functions for computing dashboard statistics:

```tsx
// lib/dashboard-utils.ts

import type { Cluster, ActivationRecord, KillSwitchState } from "@/types/shared";

export interface DashboardStats {
  totalEvents: number;
  violations: number;
  avgLatency: number;
  uptime: number;
}

/**
 * Compute dashboard stats from adapted clusters, audit log, and kill switch state.
 */
export function computeDashboardStats(
  clusters: Cluster[],
  auditLog: ActivationRecord[],
  killSwitchState: KillSwitchState | null,
): DashboardStats {
  const activeCount = clusters.filter(c => c.status === "operational").length;

  return {
    totalEvents: auditLog.length,
    violations: auditLog.filter(log =>
      log.newState === "STOPPED" || log.newState === "LOCKED"
    ).length,
    avgLatency: clusters.length > 0
      ? clusters.reduce((sum, c) => sum + (c.avg_latency ?? 0), 0) / clusters.length
      : 0,
    uptime: activeCount > 0 && clusters.length > 0
      ? 99.97  // placeholder; real computation needs uptime history
      : 0,
  };
}

/**
 * Map kill-switch state to a network load percentage for the visual bar.
 */
export function computeNetworkLoad(state: KillSwitchState | null): number {
  switch (state) {
    case "RUNNING":  return 72;
    case "ARMED":    return 42;
    case "STOPPING": return 18;
    case "STOPPED":  return 10;
    case "LOCKED":   return 88;
    default:         return 45;
  }
}

/**
 * Adapt a Machine from the Kill Switch API to a Cluster for the table.
 *
 * Machines don't have all cluster fields (avg_latency, uptime, cluster_gpus).
 * We map what we can and use sensible defaults for the rest.
 */
export function adaptMachineToCluster(
  m: import("@/types/shared").Machine,
): Cluster {
  return {
    id: m.id,
    name: m.name,
    location: m.hostname,
    gpus: m.specs?.gpu ? 1 : 0,
    avg_latency: m.cpuUsage ?? 0,
    uptime: m.status === "active" ? 99.9 : m.status === "inactive" ? 0 : 50,
    status: m.status === "active" ? "operational" :
            m.status === "inactive" ? "offline" : "degraded",
    cluster_gpus: [],
    slug: m.id,
    total_requests: 0,
    policy_violations: 0,
  };
}
```

**~LOC: +30**

#### 3.7 `types/supabase.types.ts` — Add DashboardStats

Add after existing exports:

```tsx
export interface DashboardStats {
  totalEvents: number;
  violations: number;
  avgLatency: number;
  uptime: number;
}
```

**~LOC: +6**

#### 3.8 `types/shared.ts` — Add SecurityEvent type

Add after existing ActivationRecord type:

```tsx
export interface SecurityEvent {
  id: string;
  timestamp: string;
  violation: string | null;
  newState: KillSwitchState;
  reason: string;
}
```

**~LOC: +7**

---

## 4. Data Mapping

### 4.1 Reference → Our API Mapping

| Reference Source | Reference Field | Our Source | Our Field / Computation |
|---|---|---|---|
| `supabase.from("dpu_clusters")` | `id` | `GET /api/machines` | `Machine.id` |
| `dpu_clusters` | `name` | `/api/machines` | `Machine.name` |
| `dpu_clusters` | `location` | `/api/machines` | `Machine.hostname` (proxy) |
| `dpu_clusters` | `gpus` | `/api/machines` | `Machine.specs.gpu ? 1 : 0` |
| `dpu_clusters` | `avg_latency` | `/api/machines` | `Machine.cpuUsage ?? 0` (proxy) |
| `dpu_clusters` | `uptime` | `/api/machines` | Status mapping: active→99.9, inactive→0 |
| `dpu_clusters` | `status` | `/api/machines` | Status mapping: active→operational, inactive→offline, offline→degraded |
| `dpu_clusters` | `total_requests` | — | `0` (not tracked by machines API) |
| `dpu_clusters` | `policy_violations` | — | `0` (not tracked by machines API) |
| `dpu_clusters` | `cluster_gpus` | — | `[]` (not tracked) |
| `supabase.from("compliance_audit_log")` | `id, timestamp, redline_violated, …` | `GET /api/kill-switch/activations` | `ActivationRecord.id, .timestamp, .reason, .newState` |
| `compliance_audit_log` | `redline_violated` | `ActivationRecord` | `log.newState === "STOPPED" ? reason : null` |
| Stats: `totalEvents` | `SUM(total_requests)` | Computed | `auditLog.length` |
| Stats: `violations` | `SUM(policy_violations)` | Computed | `auditLog.filter(log => STOPPED\|LOCKED).length` |
| Stats: `avgLatency` | `AVG(avg_latency)` | Computed | `avg(clusters.map(c => c.avg_latency))` |
| Stats: `uptime` | 99.98 (placeholder) | Computed | 99.97 (placeholder) |
| Side panel: `Network Load` | Static 45% | Computed | Mapped from `KillSwitchState` |
| Side panel: `Security Events` | `auditLog.slice(0,3)` | Same | `auditLog.slice(0,3)` |
| User info | `supabase.auth.getUser()` | `useAuth()` context | `user.email` |
| Sign out | `supabase.auth.signOut()` | `useAuth()` context | `logout()` |
| Realtime | Supabase channels | WebSocket | Already built via `useKillSwitchWebSocket` |

### 4.2 Gap Analysis

**Missing data that would improve accuracy:**

1. **`total_requests` per machine** — Not available in the current Machines API. The reference computes this from `dpu_clusters.total_requests`. Without this, `Total Enforcement Events` uses `auditLog.length` as a proxy — different from the reference's aggregation.

2. **`policy_violations` per machine** — Not available. Using `auditLog.filter(STOPPED|LOCKED).length` as proxy.

3. **`avg_latency` per machine** — Not available. Using `cpuUsage` as a crude proxy. A better solution would need the backend to expose per-machine latency metrics.

4. **GPU details** (`cluster_gpus.model`, `memory_gb`, `cores`) — Not available in Machine type. Reference joins `cluster_gpus(*)`.

**Recommendation:** Accept these proxies for Phase 1. File follow-up tickets to add these fields to the Machines API response.

### 4.3 Realtime Updates

| Reference | Our Built |
|---|---|
| Supabase `postgres_changes` on `compliance_audit_log` | WebSocket `audit-entry` / `state-change` messages |
| Supabase `postgres_changes` on `dpu_clusters` | WebSocket `machine-updated` / `machine-heartbeat` messages |

Our WebSocket integration is **already built and handles all these events** in `useKillSwitchWebSocket`. The hook provides `status`, `machines`, `auditLog` that update in realtime. ✅

---

## 5. Detailed Task Breakdown

### Phase 1: Utilities & Types (0.5h)

| Task | File | Action | Est. LOC |
|---|---|---|---|
| T1.1 | `types/supabase.types.ts` | Add `DashboardStats` interface | +6 |
| T1.2 | `types/shared.ts` | Add `SecurityEvent` interface | +7 |
| T1.3 | `lib/dashboard-utils.ts` | Create with `computeDashboardStats()`, `computeNetworkLoad()`, `adaptMachineToCluster()` | +30 |
| T1.4 | `components/dashboard/cluster-table.tsx` | Fix latency threshold `4` → `5` | Δ1 |

### Phase 2: SystemHealthPanel Component (0.5h)

| Task | File | Action | Est. LOC |
|---|---|---|---|
| T2.1 | `components/dashboard/system-health-panel.tsx` | Create new component (copy from reference + adapt) | +80 |

### Phase 3: Dashboard Page Rewrite (1.5h)

| Task | File | Action | Est. LOC |
|---|---|---|---|
| T3.1 | `app/page.tsx` | Replace redirect with full dashboard | -40 / +190 |
| T3.2 | `app/(dashboard)/layout.tsx` | Remove `max-w-6xl` wrapper, move padding to pages | -8 / +0 |
| T3.3 | `app/(dashboard)/flags/page.tsx` | Add `mx-auto max-w-6xl p-4 pt-14 md:pt-4 lg:p-8` wrapper | +4 |
| T3.4 | `app/(dashboard)/machines/page.tsx` | Add same padding wrapper | +4 |
| T3.5 | `app/(dashboard)/settings/page.tsx` | Add same padding wrapper | +4 |
| T3.6 | `app/(dashboard)/docs/page.tsx` | Add same padding wrapper | +4 |

### Phase 4: Sidebar Link Update (0.25h)

| Task | File | Action | Est. LOC |
|---|---|---|---|
| T4.1 | `components/layout/app-sidebar.tsx` | Change brand link from `/kill-switch` to `/` (home now has dashboard) | Δ1 |

### Phase 5: Verification & Polish (0.5h)

| Task | Action |
|---|---|
| T5.1 | Verify gradient "ALYGN Ledger" renders correctly (check tailwind `primary` color config) |
| T5.2 | Verify stat cards match reference pixel-for-pixel |
| T5.3 | Verify cluster table renders with adapted Machine data |
| T5.4 | Verify side panel events list renders correctly |
| T5.5 | Verify Export Report downloads JSON |
| T5.6 | Verify Sign Out triggers Better-Auth logout |
| T5.7 | Verify "Register Machine" links to `/machines` |
| T5.8 | Verify loading skeletons appear during initial data fetch |
| T5.9 | Verify realtime updates flow through WebSocket |

### Total Estimates

| Phase | Hours | LOC Net |
|---|---|---|
| Phase 1: Utils & Types | 0.5h | +43 |
| Phase 2: HealthPanel | 0.5h | +80 |
| Phase 3: Dashboard Rewrite | 1.5h | +174 |
| Phase 4: Sidebar Link | 0.25h | Δ1 |
| Phase 5: Verification | 0.5h | 0 |
| **Total** | **3.25h** | **+297 / -48 (net +249)** |

---

## 6. Verification Checklist

After implementation, verify each item:

- [ ] **Homepage renders dashboard** — navigating to `/` shows full dashboard, not redirect
- [ ] **Gradient title** — "ALYGN Ledger" has `bg-gradient-to-r from-primary to-primary/60` effect
- [ ] **User header** — email shown with "Authenticated Regulator" label on md+ screens
- [ ] **4 stat cards** — Total Enforcement Events, Active Violations, Avg Latency, Uptime
- [ ] **Stat card styling** — `border-border/50 bg-card/50 backdrop-blur-sm`, 24px value font
- [ ] **Cluster table** — Name, Location, GPUs, Latency, Uptime, Status columns
- [ ] **Latency coloring** — <5ms = green, ≥5ms = yellow
- [ ] **Status badges** — operational=default, degraded=destructive, offline=outline
- [ ] **Nodes count badge** — `{N} NODES DISCOVERED` with mono font
- [ ] **Right panel** — System Health text, Network Load bar, Recent Security Events
- [ ] **Network Load bar** — Width changes based on Kill Switch state
- [ ] **Security events** — Shows last 3 events with green/red dots
- [ ] **Export Report** — Clicking download icon creates JSON blob and triggers download
- [ ] **Sign Out** — Clicking log-out icon triggers Better-Auth `logout()`
- [ ] **Register Machine** — Button links to `/machines`
- [ ] **Loading state** — Skeleton cards shown while data loads
- [ ] **Auth guard** — Unauthenticated users see "Sign In to Access Dashboard"
- [ ] **Sidebar still works** — Navigation to Kill Switch, Flags, etc. intact
- [ ] **Mobile responsive** — Header stacks vertically, cards go to 1-col, table scrolls
- [ ] **Realtime updates** — WebSocket state changes reflected in cards and events list
- [ ] **No regressions** — Kill Switch page, Flags page, Machines page all still work
- [ ] **Dark mode** — All colors work in dark theme (backdrop-blur, card backgrounds)

---

## Appendix A: Reference File Locations

| Reference File | Our File | Status |
|---|---|---|
| `read-only/…/app/page.tsx` | `infra/…/app/page.tsx` | **REWRITE** |
| `read-only/…/app/layout.tsx` | `infra/…/app/layout.tsx` | ✅ Same (Figtree, ThemeProvider, suspense) |
| `read-only/…/components/dashboard/stat-card.tsx` | `infra/…/components/dashboard/stat-card.tsx` | ✅ Identical |
| `read-only/…/components/dashboard/cluster-table.tsx` | `infra/…/components/dashboard/cluster-table.tsx` | ⚠️ Latency threshold off by 1 |
| `read-only/…/components/dashboard/cluster-sidebar.tsx` | `infra/…/components/dashboard/cluster-sidebar.tsx` | ✅ Exists (used elsewhere) |
| — (inline in page.tsx) | `infra/…/components/dashboard/system-health-panel.tsx` | **CREATE** (extracted) |

## Appendix B: Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Machine data doesn't map cleanly to Cluster fields | Medium | Medium | Use `adaptMachineToCluster()` with clear defaults; file follow-up to enrich Machine type |
| Sidebar + full-width dashboard feels cluttered on small screens | Low | Low | Dashboard already collapses to 1-col grid on mobile via responsive classes |
| WebSocket disconnect during dashboard view | Medium | Low | `useKillSwitchWebSocket` already has polling fallback; stats persist in state |
| Breaking change to other (dashboard) pages by removing layout padding | Low | Medium | Each page gets its own max-width wrapper (see T3.3-T3.6) |
| `bg-gradient-to-r from-primary to-primary/60` doesn't render | Low | High | Verify tailwind config has `primary` color defined; fallback to solid color |
