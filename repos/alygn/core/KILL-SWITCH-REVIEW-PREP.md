# Kill Switch Admin UI — Review & Learning Mission

**Date:** 2026-04-15 02:11 CST  
**Status:** 📖 LEARNING PHASE — Architecture Study

---

## 🎯 Mission Statement

**Primary Goal:** Learn from the intention-alliance reference architecture → Apply learnings to upgrade phase0 Kill Switch Admin UI

**Key Insight:**

- **intention-alliance repo** = Reference architecture (mock requests, design reference)
- **phase0** = Production working system (real API, actual kill switch functionality)
- **Objective:** Extract patterns, components, and UX improvements from reference → Adapt to phase0

---

## 📚 What We're Reviewing

### Reference Architecture (Learning Source)

**Location:** `/home/andlersrv/.openclaw/workspace/repos/alygn/infrastructure/align-core-infra/`

**Structure:**

```
align-core-infra/
├── apps/
│   ├── web-regulator/          # ← Reference Admin UI (Next.js)
│   │   ├── app/
│   │   │   ├── auth/           # Auth flows (login, signup, password reset)
│   │   │   ├── clusters/       # Cluster management UI
│   │   │   └── page.tsx        # Dashboard home
│   │   ├── components/         # UI components (shadcn/ui based)
│   │   │   ├── login-form.tsx
│   │   │   ├── sign-up-form.tsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── supabase/       # Supabase client config
│   │   │   └── utils.ts        # Utility functions
│   │   └── styles/             # Global styles
│   ├── server-rdma-monitor/    # Backend services (reference)
│   ├── server-slashing-engine/ # Backend services (reference)
│   └── server-telemetry-handler/ # Backend services (reference)
├── packages/
│   ├── db-schema/              # Supabase schema + migrations
│   └── shared-types/           # Shared TypeScript types
├── tests/                      # E2E + Integration tests
└── docker-compose.yml          # Full stack deployment
```

**Tech Stack:**

- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS
- UI Library: shadcn/ui (components in `/components/`)
- Auth: Supabase Auth (email/password, sessions)
- State: React Server Components + Client Components
- Backend: Mock services (RDMA monitor, slashing engine, telemetry)

### Production System (Upgrade Target)

**Location:** `/home/andlersrv/.openclaw/workspace/phase0/`

**Structure:**

```
phase0/
├── admin-ui/
│   ├── dist/                   # Built production files (minified)
│   ├── nginx/                  # Nginx configs
│   └── scripts/                # Deploy scripts
├── kill-switch/
│   ├── kill-switch-service.mjs # Real API backend (working)
│   └── Dockerfile
├── redis/                      # Redis cluster (working)
├── tracing/                    # OpenTelemetry (working)
└── docker-compose.yml
```

**Current State:**

- ✅ Backend API fully functional (auth endpoints, kill switch control)
- ✅ Frontend built and deployed (<https://andlersrv.tail62d797.ts.net:8443/>)
- ❌ Source code missing (only minified `dist/` remains)
- ⚠️ Login redirect loop (needs investigation)

---

## 🔍 Learning Priorities (Sequential Review)

### Phase 1: Architecture Understanding

**Goal:** Understand how the reference implementation is structured

**Checklist:**

1. **Project Structure**
   - [ ] Monorepo organization (apps/, packages/)
   - [ ] Shared packages (db-schema, shared-types)
   - [ ] App separation (web-regulator vs. backend services)

2. **Frontend Architecture**
   - [ ] Next.js App Router patterns (app/ directory structure)
   - [ ] Server Components vs. Client Components usage
   - [ ] File-based routing conventions
   - [ ] Layout hierarchy (root layout, auth layouts)

3. **Authentication Flow**
   - [ ] Supabase Auth integration
   - [ ] Login form implementation
   - [ ] Session management
   - [ ] Protected routes/middleware
   - [ ] Password reset flow

4. **Component Architecture**
   - [ ] shadcn/ui component usage
   - [ ] Component composition patterns
   - [ ] Props interfaces and typing
   - [ ] State management approach

5. **Styling System**
   - [ ] Tailwind CSS configuration
   - [ ] Design tokens (colors, spacing, typography)
   - [ ] Responsive design patterns
   - [ ] Dark mode support (next-themes)

6. **Backend Services (Mock)**
   - [ ] RDMA Monitor service structure
   - [ ] Slashing Engine logic
   - [ ] Telemetry Handler patterns
   - [ ] Inter-service communication

7. **Database Schema**
   - [ ] Supabase migrations structure
   - [ ] Table relationships
   - [ ] RLS (Row Level Security) policies
   - [ ] Seed data patterns

8. **Testing Strategy**
   - [ ] E2E test structure
   - [ ] Integration test patterns
   - [ ] Mock data generation
   - [ ] Test utilities

---

### Phase 2: Component Inventory (shadcn/ui Migration Planning)

**Goal:** Catalog all UI components for potential migration to phase0

**Components to Review:**

**Auth Components:**

- [ ] `login-form.tsx` — Email/password form, error handling, loading states
- [ ] `sign-up-form.tsx` — Registration flow
- [ ] `update-password-form.tsx` — Password reset
- [ ] Auth context/provider patterns

**Dashboard Components:**

- [ ] Layout structure (sidebar, header, content area)
- [ ] Navigation patterns
- [ ] Data tables/lists
- [ ] Status indicators
- [ ] Action buttons

**Feature-Specific Components:**

- [ ] Cluster management UI
- [ ] Monitoring dashboards
- [ ] Configuration forms
- [ ] Alert/notification systems

**UI Primitives (shadcn/ui):**

- [ ] Button variants
- [ ] Input fields
- [ ] Cards
- [ ] Dialogs/Modals
- [ ] Dropdowns
- [ ] Toasts/Notifications
- [ ] Loading spinners/skeletons

---

### Phase 3: Adaptation Planning (phase0 Upgrade)

**Goal:** Plan how to apply learnings to phase0 Kill Switch Admin UI

**Migration Strategy:**

1. **Rebuild phase0/admin-ui source**
   - Use reference architecture as template
   - Adapt to phase0 API endpoints (`/v1/auth/*`, `/v1/kill-switch/*`)
   - Replace Supabase Auth with cookie-based auth (existing phase0 backend)

2. **Component Migration**
   - Adopt shadcn/ui component library
   - Recreate Kill Switch-specific components:
     - Emergency Stop Button
     - Status Indicator
     - Activation History table
     - Feature Flags UI
   - Maintain existing functionality (kill switch control, flag management)

3. **Architecture Improvements**
   - Adopt Next.js App Router (if beneficial)
   - Implement proper auth middleware
   - Add proper error boundaries
   - Improve loading states

4. **Fix Known Issues**
   - Login redirect loop (proper session handling)
   - Cookie persistence
   - Protected route guards

---

## 📋 Sequential Review Plan

### Step 1: Read Core Architecture Files

**Files to examine first:**

1. `README.md` — Project overview
2. `docker-compose.yml` — Deployment architecture
3. `apps/web-regulator/app/layout.tsx` — Root layout
4. `apps/web-regulator/app/page.tsx` — Dashboard home
5. `apps/web-regulator/components/login-form.tsx` — Auth implementation

### Step 2: Trace Auth Flow

**Follow the login flow:**

1. `/auth/login` page → `LoginForm` component
2. Form submission → Supabase client call
3. Session persistence → Cookie/local storage
4. Redirect → Protected dashboard
5. Auth check → Middleware or client-side guard

### Step 3: Map Components to phase0 Features

**phase0 Kill Switch features needing UI:**

- [ ] Kill Switch Dashboard (status, activation history)
- [ ] Emergency Stop Button
- [ ] Feature Flags management
- [ ] Audit log viewer
- [ ] System health indicators

**Match with reference components:**

- Which reference components can be adapted?
- Which need to be built from scratch?
- What shadcn/ui primitives are needed?

### Step 4: Document Learnings

**Create architecture comparison doc:**

- Reference architecture strengths
- phase0 current state gaps
- Migration priority list (P0, P1, P2)
- Estimated effort per component

---

## 🎯 Success Criteria

**After review complete:**

- [ ] Understand reference architecture thoroughly
- [ ] Component inventory complete (what exists vs. what's needed)
- [ ] Migration plan drafted (phase0 rebuild strategy)
- [ ] shadcn/ui adoption plan ready
- [ ] Auth flow understood (to fix redirect loop)
- [ ] GitHub issues created for tracking migration tasks

---

## 📝 Notes

**Key Distinction:**

- This is a **learning exercise** first, implementation second
- Reference implementation uses **mock services** — we're studying patterns, not copying code
- phase0 has **working production system** — we're upgrading the UI, not the backend logic

**Approach:**

1. Read and understand (no changes yet)
2. Document patterns and best practices
3. Plan adaptation strategy
4. Await full specifications before implementation

---

**Status:** Ready to begin sequential review. Starting with architecture overview files.

**Next:** Read `README.md`, `docker-compose.yml`, and core app structure files.
