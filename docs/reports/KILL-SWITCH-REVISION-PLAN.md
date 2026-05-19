# Kill Switch Dashboard — 4-Stage Revision Plan

> **Date:** 2026-05-14  
> **Author:** Hugrukal 📐 (System Architect)  
> **Repo:** `alygn/infrastructure`  
> **Scope:** `apps/web-regulator` + `apps/server-kill-switch`  
> **ADR Refs:** ADR-133 (Kill Switch rebuild), ADR-131 (Flags + audit)

---

## Overview

Four issues remain after the nginx WebSocket routing fix. This document analyzes
each issue against the actual source code and provides exact implementation
steps, agent assignments, and execution ordering.

### Issue Summary

| #  | Issue                          | Severity | Est. Time | Blocked By |
|----|--------------------------------|----------|-----------|------------|
| 2  | Docs using ASCII, not Mermaid  | Medium   | 2–3h      | None       |
| 3  | UI not matching Alygn brand    | High     | 4–6h      | None       |
| 4  | Flags implementation incomplete | High     | 3–4h      | #3 (UI)    |
| 7  | No per-machine logs area       | Medium   | 3–4h      | None       |

---

## 🔍 Source Code Findings

### What Was Analyzed

| File | Purpose |
|------|---------|
| `apps/web-regulator/app/(dashboard)/docs/page.tsx` | Full documentation page (400+ lines) |
| `apps/web-regulator/app/(dashboard)/flags/page.tsx` | Flags list + CRUD + audit panel |
| `apps/web-regulator/app/(dashboard)/machines/page.tsx` | Machine inventory + detail panel |
| `apps/web-regulator/app/(dashboard)/kill-switch/page.tsx` | Kill switch controls + status |
| `apps/web-regulator/app/(dashboard)/settings/page.tsx` | System settings page |
| `apps/web-regulator/app/(dashboard)/layout.tsx` | Dashboard shell (sidebar + main) |
| `apps/web-regulator/app/layout.tsx` | Root layout (ThemeProvider, font, auth) |
| `apps/web-regulator/styles/globals.css` | Full CSS variable definition |
| `apps/web-regulator/components/layout/app-sidebar.tsx` | Sidebar navigation |
| `apps/web-regulator/components/flags/flag-editor.tsx` | Create/edit flag dialog |
| `apps/web-regulator/components/flags/audit-log.tsx` | Audit log viewer component |
| `apps/web-regulator/components/dashboard/stat-card.tsx` | Reusable stat card component |
| `apps/web-regulator/components/machines/dpu-security-banner.tsx` | DPU hardware banner |
| `apps/web-regulator/types/shared.ts` | All shared TypeScript types |
| `apps/web-regulator/package.json` | Dependencies list |
| `apps/web-regulator/components.json` | shadcn/ui config |
| `apps/server-kill-switch/src/routes/flags.ts` | Flags CRUD backend (full audit) |
| `apps/server-kill-switch/src/routes/machines.ts` | Machines CRUD backend (heartbeat, status) |
| `apps/server-kill-switch/src/db/schema.ts` | Full Drizzle SQLite schema |
| `apps/web-regulator/app/(auth)/login/page.tsx` | Login page |

### Architecture Context

- **Frontend:** Next.js 16 + React 19 + shadcn/ui (Radix UI primitives) + Tailwind CSS v4
- **Backend:** Bun + Elysia (router proxied via Next.js `/api/*` proxy.ts)
- **Database:** SQLite via Drizzle ORM (WAL mode, file-based)
- **State Management:** React `useState` + custom `useKillSwitchWebSocket` hook
- **Auth:** Better-Auth v2 (cookie-based session, role: `admin`)
- **Real-time:** WebSocket (fallback to HTTP polling at 5s intervals)
- **Font:** Figtree (Google Fonts, `next/font/google`)
- **Icons:** lucide-react v0.562

---

## Issue #2: Documentation Not Using Mermaid

### Root Cause

The docs page (`apps/web-regulator/app/(dashboard)/docs/page.tsx`) uses an
11-line ASCII art `STATE_TRANSITIONS_ASCII` constant for the state machine
diagram. The architecture also has flow diagrams (scoring pipeline, agent
registration, flag resolution order) explained in prose-only text.

### Current State

- **State machine diagram:** Rendered via `<pre>` with ASCII art (lines 76–110)
- **Scoring pipeline:** Described in prose with a table (no diagram)
- **Agent registration flow:** Described in prose with numbered bullets
- **Flag resolution:** Described as a list in a bordered box (no diagram)
- **API request/response flow:** Explained in prose only

### Exact Changes Required

#### Step 2a: Install Mermaid as npm dependency

**File:** `apps/web-regulator/package.json`

```json
// Add to "dependencies":
"mermaid": "^11.0.0"
```

Run: `cd apps/web-regulator && bun add mermaid`

#### Step 2b: Create `<MermaidDiagram>` client component

**New file:** `apps/web-regulator/components/docs/mermaid-diagram.tsx`

A `"use client"` component that:
- Accepts `chart: string` (Mermaid syntax) and optional `className`
- Uses `useRef` + `useEffect` to call `mermaid.render()` into a container div
- Sets a unique ID per render (using `useId()`)
- Handles dark/light mode by reading the resolved theme via `next-themes`
- Graceful error boundary: displays raw Mermaid text if rendering fails

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import mermaid from "mermaid";
import { cn } from "@/lib/utils";

// Initialize mermaid once
mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "loose",
  themeVariables: {
    // Will be overridden per-render based on theme
  },
});

interface MermaidDiagramProps {
  chart: string;
  className?: string;
  caption?: string;
}

export function MermaidDiagram({ chart, className, caption }: MermaidDiagramProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderChart = async () => {
      try {
        setError(null);
        const { svg } = await mermaid.render(`mermaid-${id.replace(/:/g, "")}`, chart);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to render diagram");
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      }
    };

    renderChart();
  }, [chart, id, resolvedTheme]);

  return (
    <figure className={cn("my-4", className)}>
      <div
        ref={containerRef}
        className={cn(
          "rounded-lg border bg-muted/20 p-4 overflow-x-auto",
          error && "border-destructive/30 bg-destructive/5"
        )}
        aria-label={caption ?? "Mermaid diagram"}
      >
        {error && (
          <div className="space-y-2">
            <p className="text-xs text-destructive font-semibold">Diagram Render Error</p>
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
              {error}
            </pre>
            <pre className="text-xs font-mono text-muted-foreground/70 whitespace-pre-wrap border-t border-border pt-2 mt-2">
              {chart}
            </pre>
          </div>
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-muted-foreground text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
```

#### Step 2c: Convert ASCII diagrams to Mermaid

**File:** `apps/web-regulator/app/(dashboard)/docs/page.tsx`

**Replace the ASCII `STATE_TRANSITIONS_ASCII` constant (line ~76) with:**

```typescript
const STATE_TRANSITIONS_MERMAID = `stateDiagram-v2
    [*] --> ARMED : initialize
    ARMED --> RUNNING : activate
    RUNNING --> STOPPING : stop
    STOPPING --> STOPPED : drain complete
    ARMED --> STOPPED : emergency stop
    RUNNING --> STOPPED : emergency stop
    STOPPED --> ARMED : re-arm
    STOPPED --> LOCKED : lock
    LOCKED --> ARMED : unlock (admin only)`;
```

**Add scoring pipeline diagram constant:**

```typescript
const SCORING_PIPELINE_MERMAID = `flowchart LR
    A[LLM Request] --> B[Per-Machine Agent]
    B --> C{Semantic Analysis<br/>50% weight}
    B --> D{Keyword Detection<br/>30% weight}
    B --> E{Pattern Matching<br/>20% weight}
    C --> F[Weighted Average]
    D --> F
    E --> F
    F --> G{Score >= Threshold?}
    G -->|Yes| H[BLOCK Request]
    G -->|No| I[FORWARD to LLM]
    H --> J[Publish to Redis]
    J --> K[Alert if > 0.9]
    J --> L[WebSocket Broadcast]`;
```

**Add flag resolution diagram constant:**

```typescript
const FLAG_RESOLUTION_MERMAID = `flowchart TD
    A[Agent requests flags] --> B{Machine override exists?}
    B -->|Yes| C[Return machine-level value]
    B -->|No| D{Global flag exists?}
    D -->|Yes| E[Return global default]
    D -->|No| F[Return system default]
    C --> G[Flag in effect]
    E --> G
    F --> G`;
```

**Add agent registration sequence diagram constant:**

```typescript
const AGENT_REGISTRATION_MERMAID = `sequenceDiagram
    participant Agent
    participant API as Kill Switch API
    participant DB as SQLite
    participant Redis

    Agent->>API: POST /v1/machines/:id/heartbeat
    API->>DB: UPDATE machine lastSeen, status=active
    alt First heartbeat with agent info
        API->>DB: INSERT INTO agents (name, version, capabilities)
    else Subsequent heartbeat
        API->>DB: UPDATE agent version, lastHeartbeat
    end
    API->>Redis: PUBLISH bcp:machines:events
    Redis-->>Dashboard: WebSocket event`;
```

**In the "Protocol Overview" section (around line 196), replace:**

```tsx
// From:
<pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs font-mono leading-relaxed text-foreground/80">
  {STATE_TRANSITIONS_ASCII}
</pre>

// To:
<MermaidDiagram
  chart={STATE_TRANSITIONS_MERMAID}
  caption="Kill Switch State Machine — all valid transitions"
/>
```

**In the "Scoring System" section (around line 380), add before the table:**

```tsx
<MermaidDiagram
  chart={SCORING_PIPELINE_MERMAID}
  caption="LLM Request Scoring Pipeline"
/>
```

**In the "Flag Resolution Order" subsection (around line 260), add:**

```tsx
<MermaidDiagram
  chart={FLAG_RESOLUTION_MERMAID}
  caption="Feature Flag Resolution Hierarchy"
/>
```

**In the "Agent Registration" section (around line 330), add:**

```tsx
<MermaidDiagram
  chart={AGENT_REGISTRATION_MERMAID}
  caption="Agent Registration via Heartbeat Protocol"
/>
```

#### Step 2d: Update imports

**File:** `apps/web-regulator/app/(dashboard)/docs/page.tsx`

```tsx
// Add import:
import { MermaidDiagram } from "@/components/docs/mermaid-diagram";
```

### Time Estimate: 2–3 hours

### Agent Assignment

| Agent | Tasks |
|-------|-------|
| **Gimglich** (FE) | Install mermaid npm dep, create `MermaidDiagram` component (2h) |
| **Talanara** (Docs) | Convert 4 ASCII/prose descriptions to Mermaid syntax, wire into docs page (1h) |
| **Nikaya** (Review) | Verify all 4 diagrams render correctly in light + dark mode, confirm no hydration mismatch (30m) |

---

## Issue #3: UI Not Matching Intention-Alliance Design

### Root Cause

The web-regulator uses shadcn/ui with a neutral/purple color scheme. While it
has the right foundation (Figtree font, OKLCH colors, Radix-based components),
several elements need refinement to match the professional Alygn brand.

### Current State Analysis

**Color scheme** — `globals.css` defines:
- Primary: `oklch(0.51 0.23 277)` — purple hue 277°, medium chroma
- Card: `oklch(98.894% 0.00531 16.082)` — warm off-white
- Destructive: `oklch(0.58 0.22 27)` — red-orange
- Background: pure white `oklch(1 0 0)`
- **Verdict:** Purple primary is fine for dashboards but Alygn typically uses
  a teal/cyan primary (#0891b2 / cyan-600) or indigo for more formal tools.
  The warm card tone feels slightly off — cards should match the brand.

**Typography:**
- Figtree font loaded via `next/font/google` ✅
- `--font-sans` theme variable set correctly ✅
- **Verdict:** Font choice is correct. No changes needed.

**Layout / Component issues found:**

1.  **Dashboard cards lack visual hierarchy** — all cards have the same
    `rounded-xl border bg-card shadow` appearance. No distinction between
    critical, warning, and info states visually beyond badge colors.

2.  **Stats overview uses plain `<Card>` components** (machines page lines
    168–195) — these are the right component but lack iconography that would
    make them scannable. Compare with the `StatCard` component
    (`components/dashboard/stat-card.tsx`) which has icons but is never used
    in the machines page.

3.  **Login page** (`apps/web-regulator/app/(auth)/login/page.tsx`) — uses
    `bg-muted/30` background with a centered card. Clean but could use a
    branded gradient or subtle background pattern.

4.  **Sidebar branding** (`components/layout/app-sidebar.tsx`) — just shows
    "ALYGN" text with a Shield icon. No logo, no version badge, no status dot.

5.  **Connection banners** repeat the same `ConnectionNotice` pattern across 3
    pages (kill-switch, flags, machines) with identical JSX. This should be
    extracted into a shared component.

6.  **Clusters pages** (`app/clusters/add/page.tsx` and
    `app/clusters/[slug]/page.tsx`) are dead stubs that just `redirect("/kill-switch")`.
    These should either be removed from the sidebar or hidden.

7.  **About card** on settings page has inline text instead of structured
    data — version, stack info is just a `<p>`.

### Exact Changes Required

#### Step 3a: Refine color primaries for Alygn brand

**File:** `apps/web-regulator/styles/globals.css`

Replace the purple primary with Alygn's brand color:

```css
/* Change primary from purple (hue 277) to teal-cyan: */
--primary: oklch(0.55 0.14 200);          /* Cyan-teal base */
--primary-foreground: oklch(0.98 0.01 200);

/* Update sidebar primary to match */
--sidebar-primary: oklch(0.55 0.14 200);

/* Update chart colors to teal gradient */
--chart-1: oklch(0.72 0.10 200);
--chart-2: oklch(0.62 0.13 200);
--chart-3: oklch(0.55 0.14 200);
--chart-4: oklch(0.45 0.15 200);
--chart-5: oklch(0.38 0.12 200);

/* Dark mode: */
.dark {
  --primary: oklch(0.65 0.14 200);
  --primary-foreground: oklch(0.15 0.02 200);
  --sidebar-primary: oklch(0.65 0.14 200);
  --chart-1: oklch(0.72 0.10 200);
  --chart-2: oklch(0.62 0.13 200);
  --chart-3: oklch(0.55 0.14 200);
  --chart-4: oklch(0.45 0.15 200);
  --chart-5: oklch(0.38 0.12 200);
}
```

NOTE: Verify the exact brand hex with Andler. If Alygn uses a specific palette,
adjust the OKLCH values accordingly. For now, cyan-teal `oklch(0.55 0.14 200)`
is a safe professional default that maps to roughly `#0891b2`.

#### Step 3b: Extract shared `ConnectionNotice` component

**New file:** `apps/web-regulator/components/layout/connection-notice.tsx`

```tsx
"use client";

import { Wifi, WifiOff } from "lucide-react";

interface ConnectionNoticeProps {
  isConnected: boolean;
  reconnectAttempt?: number;
}

export function ConnectionNotice({ isConnected, reconnectAttempt }: ConnectionNoticeProps) {
  if (isConnected) {
    return (
      <div
        className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400"
        role="status"
        aria-live="polite"
      >
        <Wifi className="h-3.5 w-3.5" />
        <span>Live — WebSocket connected</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>
        WS disconnected{reconnectAttempt != null && reconnectAttempt > 0
          ? ` (retry ${reconnectAttempt}/5)`
          : ""}
        , using polling fallback
      </span>
    </div>
  );
}
```

**Remove inline `ConnectionNotice` functions from:**
- `apps/web-regulator/app/(dashboard)/kill-switch/page.tsx` (lines ~170–194)
- `apps/web-regulator/app/(dashboard)/flags/page.tsx` (lines ~255–274)
- `apps/web-regulator/app/(dashboard)/machines/page.tsx` (lines ~290–310)

Replace each with:
```tsx
import { ConnectionNotice } from "@/components/layout/connection-notice";
```

#### Step 3c: Enhance sidebar branding

**File:** `apps/web-regulator/components/layout/app-sidebar.tsx`

Changes:
- Add a version badge below the brand
- Add a subtle status indicator (green dot when connected)
- Keep existing nav items (already clean)

```tsx
// In the brand section, add version badge:
{!collapsed && (
  <div className="flex flex-col">
    <Link href="/kill-switch" className="flex items-center gap-2">
      <Shield className="h-5 w-5 text-primary" />
      <span className="font-bold tracking-tight">ALYGN</span>
    </Link>
    <span className="text-[10px] text-muted-foreground ml-7">v2.0.0 — Regulator</span>
  </div>
)}
```

#### Step 3d: Style stat cards with icons

**File:** `apps/web-regulator/app/(dashboard)/machines/page.tsx`

Current stats use plain `<Card>` components. Replace with `<StatCard>`:

```tsx
// Replace the four stat cards at lines ~168–195 with:
import { StatCard } from "@/components/dashboard/stat-card";
import { Server, CircleCheck, CircleAlert, CircleOff } from "lucide-react";

// Then in the render:
<div className="grid gap-4 sm:grid-cols-4">
  <StatCard
    icon={<Server className="h-4 w-4" />}
    label="Total Machines"
    value={String(machines.length)}
  />
  <StatCard
    icon={<CircleCheck className="h-4 w-4" />}
    label="Active"
    value={String(activeCount)}
    trendUp
  />
  <StatCard
    icon={<CircleAlert className="h-4 w-4" />}
    label="Inactive"
    value={String(inactiveCount)}
  />
  <StatCard
    icon={<CircleOff className="h-4 w-4" />}
    label="Offline"
    value={String(offlineCount)}
    alert
  />
</div>
```

**Apply the same treatment to flag management page** — add a stats row at the top
of `apps/web-regulator/app/(dashboard)/flags/page.tsx`:

```tsx
// Add stats overview before the table:
const enabledCount = filteredFlags.filter(f => f.enabled).length;
const disabledCount = filteredFlags.filter(f => !f.enabled).length;

<div className="grid gap-4 sm:grid-cols-3">
  <StatCard icon={<Flag className="h-4 w-4" />} label="Total Flags" value={String(flags.length)} />
  <StatCard icon={<CircleCheck className="h-4 w-4" />} label="Enabled" value={String(enabledCount)} trendUp />
  <StatCard icon={<CircleOff className="h-4 w-4" />} label="Disabled" value={String(disabledCount)} />
</div>
```

#### Step 3e: Add branded background to login page

**File:** `apps/web-regulator/app/(auth)/login/page.tsx`

```tsx
// Replace:
<div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">

// With:
<div className="flex min-h-screen flex-col items-center justify-center px-4 relative">
  {/* Subtle branded gradient background */}
  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
  <div className="relative z-10 flex flex-col items-center">
    {/* ... existing content ... */}
  </div>
</div>
```

#### Step 3f: Clean up dead cluster routes from sidebar

**File:** `apps/web-regulator/components/layout/app-sidebar.tsx`

Remove the cluster entry from NAV_ITEMS (or add it commented out):

```tsx
// Cluster routes are dead stubs redirecting to /kill-switch
// Remove this entry from NAV_ITEMS:
// { href: "/clusters", label: "Clusters", icon: Grid3x3, description: "..." },
```

Also clean up the dead files `apps/web-regulator/app/clusters/add/page.tsx`
and `apps/web-regulator/app/clusters/[slug]/page.tsx`.

#### Step 3g: Add brand logo/favicon

**File:** `apps/web-regulator/app/layout.tsx`

The favicon is currently `favicon.ico` from the `.next` build. Ensure the
Alygn brand icon is in `apps/web-regulator/public/favicon.ico`.

### Time Estimate: 4–6 hours

### Agent Assignment

| Agent | Tasks |
|-------|-------|
| **Gimglich** (FE) | Refine color primaries (1h), extract ConnectionNotice (30m), enhance sidebar (30m), style stat cards on machines + flags pages (1h), login page gradient (30m), clean dead routes (15m) |
| **Nikaya** (Review) | Verify brand colors with Andler, test light + dark mode across all pages, check mobile responsive (1h) |

---

## Issue #4: Flags Implementation Looks Incomplete

### Root Cause

The flags CRUD API (`apps/server-kill-switch/src/routes/flags.ts`) and frontend
(`apps/web-regulator/app/(dashboard)/flags/page.tsx`, `flag-editor.tsx`,
`audit-log.tsx`) exist and function, but several features are missing:

### Features Present ✅

- **Create, Read, Update, Delete (CRUD):** Full implementation in backend
  (`flags.ts` lines 1–170) and frontend (`flags/page.tsx`)
- **Audit logging:** Full implementation — every mutation is logged to
  `flag_audit_log` table with old/new value diffs
- **Audit log viewer:** `audit-log.tsx` component — displays timestamped
  change history with diff visualization
- **Enable/disable toggle:** Via Switch component on each row
- **WebSocket real-time sync:** Flags page subscribes to WS updates
- **Admin-only write protection:** Backend checks `userRole !== 'admin'`
- **Per-machine flag overrides:** `machine_flags` table + resolution in
  machines route
- **Flag resolution order:** Well-documented (machine → global → system default)

### Missing Features ❌

#### 4a: Only boolean flags — no string/number/JSON value support

**Current state:**
- `featureFlags.value` is typed as `integer({ mode: 'boolean' })` in the schema
- The flag editor only offers a boolean Switch toggle
- The `Flag` type in `types/shared.ts` has `value: boolean | string | number`
  but the implementation never uses non-boolean values

**Impact:** The 5 predefined flags include string and number types
(`auto_stop_threshold: 0.7`, `damage_logging_level: "standard"`,
`request_sampling_rate: 1.0`), but they cannot be created through the UI.
They exist only in documentation prose.

**Fix:**

1.  **Database migration** — add a `value_type` column and convert `value`
    from integer to text:

    ```sql
    ALTER TABLE feature_flag ADD COLUMN value_type TEXT DEFAULT 'boolean';
    -- value column stays as is for backward compat (boolean stored as "true"/"false")
    ```

    Actually, the schema change should be:

    ```typescript
    // In drizzle schema.ts:
    export const featureFlags = sqliteTable("feature_flag", {
      // ... existing columns ...
      value: text("value").notNull().default("false"), // String representation
      valueType: text("value_type").notNull().default("boolean"), // "boolean" | "string" | "number" | "json"
      // ...
    });
    ```

2.  **Backend** — update `flags.ts` to handle typed values:

    ```typescript
    // In POST/PUT handlers, parse value based on valueType:
    const valueType = body.valueType ?? "boolean";
    let value: string;
    switch (valueType) {
      case "boolean": value = String(Boolean(body.value)); break;
      case "number": value = String(Number(body.value)); break;
      case "string": value = String(body.value ?? ""); break;
      case "json": value = JSON.stringify(body.value); break;
      default: value = String(body.value);
    }
    ```

3.  **Frontend** — update `FlagEditor` to support type selection:

    ```tsx
    // Add a Select dropdown for valueType above the value control:
    <Select value={valueType} onValueChange={setValueType}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="boolean">Boolean (on/off)</SelectItem>
        <SelectItem value="number">Number</SelectItem>
        <SelectItem value="string">String</SelectItem>
        <SelectItem value="json">JSON</SelectItem>
      </SelectContent>
    </Select>

    // Replace the Switch with type-aware input:
    {valueType === "boolean" ? (
      <Switch checked={value === "true"} onCheckedChange={...} />
    ) : (
      <Input value={stringValue} onChange={...} />
    )}
    ```

#### 4b: No percentage rollout support

**Current state:**
- `Flag` type has `rolloutPercentage: number` (defaults to 100)
- Never implemented in backend CRUD or any frontend control

**Impact:** Can't do gradual rollouts (e.g., enable flag for 10% of traffic).

**Fix:**

1.  **Schema:** Add `rollout_percentage` column to `feature_flags` table:

    ```typescript
    rolloutPercentage: integer("rollout_percentage").notNull().default(100),
    ```

2.  **Backend:** Include `rolloutPercentage` in POST/PUT handler (validate 0–100).

3.  **Frontend:** Add a Slider control to `FlagEditor`:

    ```tsx
    <div className="space-y-2">
      <Label>Rollout Percentage</Label>
      <div className="flex items-center gap-3">
        <Slider
          value={[rolloutPercentage]}
          onValueChange={([v]) => setRolloutPercentage(v)}
          min={0} max={100} step={1}
        />
        <span className="text-sm font-mono w-10 text-right">{rolloutPercentage}%</span>
      </div>
    </div>
    ```

#### 4c: No segment targeting

**Current state:**
- `Flag` type has `segments: unknown[]` (empty array default)
- Never implemented anywhere

**Impact:** Can't target flags to specific machine groups, environments, or
user roles.

**Fix:**

1.  **Schema:** Store segments as JSON text in a new `segments` column.

2.  **Frontend:** Add basic segment editor — a `KeyValueEditor` component that
    lets you add `key: value` pairs. For MVP, limit to simple tags:

    ```tsx
    // Tag-based segments:
    // e.g., segments: ["production", "gateway-role"]
    <div className="space-y-2">
      <Label>Segments</Label>
      {segments.map((s, i) => (
        <Badge key={i} variant="secondary" className="gap-1">
          {String(s)}
          <X className="h-3 w-3 cursor-pointer" onClick={() => removeSegment(i)} />
        </Badge>
      ))}
      <Input placeholder="Add segment tag..." onKeyDown={handleAddSegment} />
    </div>
    ```

#### 4d: No `updatedAt` display in UI

**Current state:** The flags table shows key, description, status, value, and
actions — but no "last updated" column. The machine table has it.

**Fix:** Add an `Updated` column to the flags table showing relative time.

#### 4e: Flags table has nested div styling bug

**File:** `apps/web-regulator/app/(dashboard)/flags/page.tsx` lines ~190–210

The Actions cell uses a `<div>` with buttons outside of the JSX alignment,
causing a visual gap. Fix indent/alignment.

### Summary of Changes

| Change | Backend | Frontend | Schema |
|--------|---------|----------|--------|
| Typed flag values | `flags.ts` POST/PUT | `FlagEditor` — type selector | New `value_type` col |
| Rollout percentage | `flags.ts` validation | `FlagEditor` — Slider | New `rollout_percentage` col |
| Segment targeting | `flags.ts` serialization | `FlagEditor` — tag editor | New `segments` col (JSON) |
| UpdatedAt column | — | `flags/page.tsx` — table column | — |
| Fix Actions alignment | — | `flags/page.tsx` — fix JSX | — |

### Time Estimate: 3–4 hours

### Agent Assignment

| Agent | Tasks |
|-------|-------|
| **Keridz** (BE) | Schema migration (new columns), update flags.ts CRUD to handle typed values + rollout + segments (1.5h) |
| **Gimglich** (FE) | Update FlagEditor with type/rollout/segment controls, add UpdatedAt column, fix Actions alignment (1.5h) |
| **Nikaya** (Review) | Test create/edit/delete with all 4 value types, verify rollout slider, verify audit log captures type changes (1h) |

---

## Issue #7: No Logs Area When a Machine Is Selected

### Root Cause

The machines page (`apps/web-regulator/app/(dashboard)/machines/page.tsx`)
has a detail panel that appears when a machine row is clicked. The detail panel
shows: name, hostname, role, status, DPU banner, CPU/memory usage, created
date, and last seen time. **There is no logs/history area.**

The backend (`apps/server-kill-switch/src/routes/machines.ts`) has:
- `POST /v1/machines/:id/heartbeat` — records heartbeat, but does NOT log it
  as an auditable event beyond updating `lastSeen`
- `GET /v1/machines/:id/status` — returns machine + agents + active flags,
  but NOT heartbeat history or event logs
- The `killSwitchAuditLog` table has `machineId` field, but it's only used
  for state-change audits, not heartbeat/agent events

### What "Logs" Should Contain

A per-machine log view should show:
1. **Heartbeat history** — timestamp of each heartbeat with CPU/memory values
2. **Agent events** — agent connected/disconnected, version upgrades, capability changes
3. **Flag override changes** — when per-machine flags were modified
4. **State transitions affecting this machine** — (from kill switch audit log)
5. **Error logs** — any agent errors reported

### Exact Changes Required

#### Step 7a: Create heartbeat log table

**File:** `apps/server-kill-switch/src/db/schema.ts`

```typescript
// New table: machine_heartbeat_log
export const machineHeartbeatLog = sqliteTable(
  "machine_heartbeat_log",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id").notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    cpuUsage: integer("cpu_usage"),      // percentage 0–100
    memoryUsage: integer("memory_usage"), // percentage 0–100
    agentName: text("agent_name"),
    agentVersion: text("agent_version"),
    metadata: text("metadata"),          // JSON: any extra info
  },
  (table) => ({
    machineTimeIdx: index("hb_log_machine_time_idx").on(table.machineId, table.timestamp),
  })
);
```

#### Step 7b: Update heartbeat handler to log

**File:** `apps/server-kill-switch/src/routes/machines.ts`

In the heartbeat handler (around line ~170), after updating the machine,
insert a log entry:

```typescript
// After updating machine lastSeen and status:
await db.insert(machineHeartbeatLog).values({
  id: crypto.randomUUID(),
  machineId: id,
  timestamp: now,
  cpuUsage: body?.cpuUsage != null ? Math.round(body.cpuUsage) : null,
  memoryUsage: body?.memoryUsage != null ? Math.round(body.memoryUsage) : null,
  agentName: body?.agentName ?? null,
  agentVersion: body?.agentVersion ?? null,
  metadata: body?.metadata ? JSON.stringify(body.metadata) : null,
}).run();
```

#### Step 7c: Create backend endpoint for machine logs

**File:** `apps/server-kill-switch/src/routes/machines.ts`

Add new handler:

```typescript
// ─── GET /v1/machines/:id/logs — Machine activity logs ──────────
const logsMatch = url.match(/^\/v1\/machines\/([^/]+)\/logs$/);
if (method === 'GET' && logsMatch) {
  const id = logsMatch[1];

  const machine = await db.select().from(machines).where(eq(machines.id, id)).get();
  if (!machine) {
    json(res, 404, { error: 'Machine not found', id });
    return true;
  }

  const parsed = new URL(url, 'http://localhost');
  const limit = parseInt(parsed.searchParams.get('limit') || '50', 10);
  const offset = parseInt(parsed.searchParams.get('offset') || '0', 10);
  const type = parsed.searchParams.get('type'); // "heartbeat" | "agent" | "flag" | "state" | "all"

  // Query heartbeat logs
  let heartbeatQuery = db.select().from(machineHeartbeatLog)
    .where(eq(machineHeartbeatLog.machineId, id))
    .orderBy(desc(machineHeartbeatLog.timestamp))
    .$dynamic();

  const heartbeats = (!type || type === 'heartbeat' || type === 'all')
    ? await heartbeatQuery.limit(limit).offset(offset).all()
    : [];

  // Query agent events
  const agentEvents = (!type || type === 'agent' || type === 'all')
    ? await db.select().from(agents)
        .where(eq(agents.machineId, id))
        .orderBy(desc(agents.lastHeartbeat))
        .limit(limit)
        .all()
    : [];

  // Query flag override audit for this machine
  // (via machineFlags — track when overrides change)
  const recentFlaps = (!type || type === 'flag' || type === 'all')
    ? await db.select().from(machineFlags)
        .where(eq(machineFlags.machineId, id))
        .orderBy(desc(machineFlags.updatedAt))
        .limit(limit)
        .all()
    : [];

  // Query kill switch audit entries for this machine
  const stateChanges = (!type || type === 'state' || type === 'all')
    ? await db.select().from(killSwitchAuditLog)
        .where(eq(killSwitchAuditLog.machineId, id))
        .orderBy(desc(killSwitchAuditLog.timestamp))
        .limit(limit)
        .all()
    : [];

  // Aggregate into unified log view
  const unifiedLogs: any[] = [];

  for (const hb of heartbeats) {
    unifiedLogs.push({
      id: `hb-${hb.id}`,
      type: 'heartbeat',
      timestamp: hb.timestamp,
      data: {
        cpuUsage: hb.cpuUsage,
        memoryUsage: hb.memoryUsage,
        agentName: hb.agentName,
        agentVersion: hb.agentVersion,
      },
    });
  }

  for (const agent of agentEvents) {
    unifiedLogs.push({
      id: `agent-${agent.id}`,
      type: 'agent',
      timestamp: agent.lastHeartbeat,
      data: {
        name: agent.name,
        version: agent.version,
        capabilities: agent.capabilities,
      },
    });
  }

  for (const sc of stateChanges) {
    unifiedLogs.push({
      id: `state-${sc.id}`,
      type: 'state_change',
      timestamp: sc.timestamp,
      data: {
        previousState: sc.previousState,
        newState: sc.newState,
        userId: sc.userId,
        reason: sc.reason,
        severity: sc.severity,
      },
    });
  }

  // Sort unified by timestamp descending
  unifiedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  json(res, 200, {
    machineId: id,
    logs: unifiedLogs.slice(0, limit),
    total: unifiedLogs.length,
    limit,
    offset,
  });
  return true;
}
```

#### Step 7d: Create frontend <MachineLogs> component

**New file:** `apps/web-regulator/components/machines/machine-logs.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { ScrollText, Activity, Heart, Shield, Flag, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  type: "heartbeat" | "agent" | "state_change" | "flag_override";
  timestamp: string;
  data: Record<string, unknown>;
}

interface MachineLogsProps {
  machineId: string;
  limit?: number;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  heartbeat: Heart,
  agent: Activity,
  state_change: Shield,
  flag_override: Flag,
};

const TYPE_BADGES: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  heartbeat: "default",
  agent: "secondary",
  state_change: "destructive",
  flag_override: "outline",
};

export function MachineLogs({ machineId, limit = 20 }: MachineLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const typeParam = filter ? `&type=${filter}` : "";
      const data = await apiGet<{ logs: LogEntry[] }>(
        `/api/machines/${machineId}/logs?limit=${limit}${typeParam}`
      );
      setLogs(data.logs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [machineId, limit, filter]);

  if (isLoading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>;
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive" role="alert">
        {error}
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchLogs}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Activity Log</h3>
          <Badge variant="secondary" className="text-xs">{logs.length}</Badge>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1">
          {["all", "heartbeat", "agent", "state_change", "flag_override"].map((t) => (
            <Button
              key={t}
              variant={(filter === t || (!filter && t === "all")) ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setFilter(t === "all" ? null : t)}
            >
              {t === "all" ? "All" : t.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Time</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((entry) => {
                const Icon = TYPE_ICONS[entry.type] ?? AlertTriangle;
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs font-mono">
                      {new Date(entry.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TYPE_BADGES[entry.type] ?? "outline"} className="gap-1 text-[10px]">
                        <Icon className="h-3 w-3" />
                        {entry.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatLogDetail(entry)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function formatLogDetail(entry: LogEntry): string {
  const d = entry.data;
  switch (entry.type) {
    case "heartbeat":
      return `CPU: ${d.cpuUsage ?? "—"}% | Mem: ${d.memoryUsage ?? "—"}% | Agent: ${d.agentName ?? "—"} v${d.agentVersion ?? "?"}`;
    case "agent":
      return `${d.name} v${d.version} — capabilities: ${Array.isArray(d.capabilities) ? (d.capabilities as string[]).join(", ") : "—"}`;
    case "state_change":
      return `${d.previousState} → ${d.newState} by ${d.userId} — "${d.reason}"`;
    case "flag_override":
      return `Flag "${d.flagKey}" set to ${d.value}`;
    default:
      return JSON.stringify(d).slice(0, 80);
  }
}
```

#### Step 7e: Wire <MachineLogs> into machine detail panel

**File:** `apps/web-regulator/app/(dashboard)/machines/page.tsx`

In the machine detail `<Card>` (around line ~230), add after DPU banner and
resource usage:

```tsx
// Add after the Memory Usage section and before the dates:
<Separator />
<MachineLogs machineId={selectedMachine.id} limit={20} />
```

#### Step 7f: Update proxy.ts to handle the new API route

**File:** `apps/web-regulator/proxy.ts`

Ensure `/api/machines/:id/logs` is proxied to the kill-switch backend.

```typescript
// Add if not already covered by wildcard /api/machines/*:
```

Check existing proxy patterns — if `/api/machines/*` is already proxied, no
change needed. Otherwise add explicit route.

### Time Estimate: 3–4 hours

### Agent Assignment

| Agent | Tasks |
|-------|-------|
| **Keridz** (BE) | Create `machine_heartbeat_log` table, update heartbeat handler to log, create `GET /v1/machines/:id/logs` endpoint with filtering/pagination (2h) |
| **Gimglich** (FE) | Create `<MachineLogs>` component with filter chips, wire into machine detail panel (1.5h) |
| **Nikaya** (Review) | Test heartbeat logging, verify log aggregation with multiple filter types, check pagination (30m) |

---

## Execution Order & Dependencies

```
Phase 1 (Parallel, no deps):
  ├── Issue #2  — Mermaid diagrams        [Gimglich + Talanara]  2–3h
  ├── Issue #3  — UI brand alignment      [Gimglich]             4–6h
  └── Issue #7  — Machine logs            [Keridz + Gimglich]    3–4h

Phase 2 (Depends on Phase 1 UI):
  └── Issue #4  — Flags completeness      [Keridz + Gimglich]    3–4h
       ↑ Requires color system + UI patterns from Issue #3

Review Gate:
  └── All issues → Nikaya review          30m–1h
```

### Rationale

- **Issue #3 should ship first** because it establishes the visual foundation
  (colors, patterns, shared components). Issue #4 builds on this.
- **Issue #2 and #7 are independent** and can run in parallel with #3.
- **Issue #4 depends on #3** because: the flag editor will use the new color
  primaries, the Slider/Switch components need the brand colors, and the stats
  overview cards follow the pattern established in #3.

### Total Estimated Time: 8–13 hours (parallel execution reduces wall time to ~8h max)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Schema migration breaks existing data | Low | High | Backup SQLite DB before migration. Use Drizzle migration script. |
| Mermaid rendering fails on SSR | Low | Medium | MermaidDiagram is client-only (`"use client"`), no SSR risk. |
| Color change not approved by Andler | Medium | Low | Flag primary color choice with Andler before implementing. |
| Flags typed-value migration causes data loss | Low | High | Add new columns with defaults, keep old `value` column for backward compat during transition. |
| Machine heartbeat log table grows unbounded | Low | Medium | Add retention policy (DELETE WHERE timestamp < now - 30 days) as a periodic cleanup job. |

---

## Success Criteria

1.  **Issue #2:** 4 Mermaid diagrams render correctly in light and dark modes,
    with fallback error display. No ASCII art remains in docs.

2.  **Issue #3:** Alygn brand colors applied across all pages. ConnectionNotice
    extracted as shared component. Sidebar shows version. Stats have icons.
    Dead cluster routes removed from nav.

3.  **Issue #4:** Flags support boolean, string, number, and JSON value types.
    Rollout percentage slider works (0–100). Segments can be added/removed.
    UpdatedAt column visible in table. Audit log correctly captures typed
    value changes.

4.  **Issue #7:** Heartbeat history is persisted to `machine_heartbeat_log`
    table. Machine detail panel shows unified activity log with filter chips
    (All, Heartbeat, Agent, State, Flag). Log entries are timestamped and
    sortable.

---

*May the spirits of scalability guide your keystrokes.* 📐
