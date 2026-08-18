# ADR-141: Portal & Knowledge — Phase 5

## Status

**Accepted** — 2026-08-17

## Context

Phase 5 of the kill-switch rollout ("Portal & Knowledge") consolidates the
operator-facing surface of the ALYGN Regulator dashboard and wires up the
knowledge loop that feeds organizational context into OpenUI fine-tuning.

Four workstreams are in scope:

1. **In-network dashboard polish** — verify the existing `(dashboard)` routes
   (admin, docs, flags, kill-switch, machines, settings) match the design
   system and are mobile-responsive.
2. **Settings/RBAC** — extend the settings page with role-based access control
   (admin vs operator roles) consistent with the existing Better-Auth session.
3. **Remote admin via authorized device** — ensure the dashboard works over
   Tailscale from an authorized device.
4. **Billing redirect** — add a billing redirect stub route.
5. **OpenUI org-knowledge fine-tuning loop** — document how organizational
   knowledge feeds OpenUI fine-tuning.

## Decision

### §1 — In-network dashboard polish

The `(dashboard)` routes already exist and are built on the shared design
system: OKLCH color tokens in `app/globals.css`, `--radius: 0.625rem`, the
Figtree variable font, and shadcn/ui primitives. All pages use responsive
grids (`sm:`/`lg:` breakpoints), `overflow-x-auto` tables, and hidden table
cells on small screens.

**Gap found & fixed:** the mobile sidebar (`components/layout/mobile-sidebar.tsx`)
was missing the Dashboard, Secrets, and Documentation nav items that exist in
the desktop sidebar, and its brand link pointed at `/kill-switch` instead of
`/`. This was corrected so mobile navigation matches desktop.

### §2 — Settings/RBAC

The backend already enforces admin-only writes on settings (403 otherwise —
see `docs/architecture/settings-api.md` §4.1). The frontend now mirrors this
via a shared RBAC helper (`apps/web-regulator/lib/rbac.ts`):

- `canWriteSettings(role)` — true only for `admin`.
- `canManageRbac(role)` — true only for `admin`.
- `canViewSettings(role)` — true for any authenticated role.

The settings page (`app/(dashboard)/settings/page.tsx`) now:

- Shows the current user's role as a badge in the page header.
- Renders an **Access Control** card describing the user's permissions.
- Disables all write controls (switches, inputs, save button) for non-admin
  users, and guards `updateSetting` / `handleSaveAll` against non-admin writes.

Roles are sourced from the existing Better-Auth session via `useAuth()`
(`lib/auth-context.tsx`), which exposes `user.role` as
`"admin" | "sre" | "developer" | "viewer"`.

### §3 — Remote admin via authorized device (Tailscale)

No code change is required. The existing infrastructure already supports remote
admin over Tailscale:

- **nginx** reverse-proxies `https://andlersrv.tail62d797.ts.net:8443` →
  Next.js on port `3001` (see `docs/KILL-SWITCH-SYSTEM-DESIGN.md` §9.2 and the
  live config at `/etc/nginx/sites-available/kill-switch.conf`).
- **Tailscale** provides the secure mesh + MagicDNS hostname
  (`andlersrv.tail62d797.ts.net`) and TLS via Tailscale HTTPS certs.
- **`apps/web-regulator/proxy.ts`** handles Supabase session updates for all
  non-static routes, so authenticated sessions work over the Tailscale origin.
- **`NEXT_PUBLIC_BETTER_AUTH_URL`** must be set to the Tailscale origin
  (`https://andlersrv.tail62d797.ts.net:8443`) so the auth client's
  `getSession` fetch is same-origin and not blocked by CSP `'self'`
  (see `apps/web-regulator/.env.example`).

**To access from an authorized device:** join the device to the same Tailscale
tailnet, then open `https://andlersrv.tail62d797.ts.net:8443` and sign in.

### §4 — Billing redirect

A billing redirect stub route was added at `app/(dashboard)/billing/page.tsx`
(ADR-141). It:

- Resolves the billing provider URL from `NEXT_PUBLIC_BILLING_URL` at runtime.
- Auto-redirects to the provider when configured (with a manual fallback
  button).
- Renders a **"Billing Not Configured"** stub when no provider is set, with a
  note that the URL is injected via env at deploy time (no server config in
  the repo).

The route is linked from both the desktop and mobile sidebars.

### §5 — OpenUI org-knowledge fine-tuning loop

See `docs/architecture/OPENUI-ORG-KNOWLEDGE-LOOP.md` for the full
documentation of how organizational knowledge feeds OpenUI fine-tuning. No
runtime code is required for this workstream.

## Consequences

- Non-admin users see a read-only settings page instead of failing saves.
- The billing route is a safe stub until a provider is configured.
- Mobile navigation now matches desktop navigation.
- The OpenUI knowledge loop is documented for future fine-tuning runs.

## References

- `docs/architecture/settings-api.md` — settings API + RBAC contract.
- `docs/KILL-SWITCH-SYSTEM-DESIGN.md` — nginx/Tailscale topology.
- `apps/web-regulator/lib/rbac.ts` — frontend RBAC helper.
- `apps/web-regulator/app/(dashboard)/settings/page.tsx` — RBAC UI.
- `apps/web-regulator/app/(dashboard)/billing/page.tsx` — billing stub.
- `docs/architecture/OPENUI-ORG-KNOWLEDGE-LOOP.md` — OpenUI fine-tuning loop.
