# OSS Preparation, Wizard TUI & Phase Verification — Implementation Plan

**Status:** Active plan — task breakdown for coders via team leads
**Date:** 2026-09-08
**Authority:** Design System v1.5 · Whitepaper v1.5 · ADR-146
**Live reference:** kill-switch API healthy on andlersrv (:3001, state=RUNNING, redis OK, audit active)

---

## Workstream 1 — Open Source Preparation (this branch)

### 1.1 Security cleanup (BLOCKING — do first)

| # | Task | Detail | Priority |
|---|------|--------|----------|
| 1.1.1 | ✅ Untrack `data/auth.sqlite-wal/shm` | Contained Better-Auth session schema (tokens, emails). Removed from index; .gitignore extended to all `data/auth.*` and `*.sqlite-journal` | DONE |
| 1.1.2 | Git history scan | Check history for previously committed secrets/tokens (`git log -p -- data/`, `gitleaks` full scan). If found: history rewrite (filter-repo) + secret rotation before public launch | CRITICAL |
| 1.1.3 | Rotate Better-Auth secret | If history contains auth tokens, rotate `BETTER_AUTH_SECRET` on the live deployment | CRITICAL |
| 1.1.4 | Audit docs/ for sensitive content | Review `docs/plans/`, `docs/reports/` (internal review notes), `docs/specs/verifier-system-prompt.md` (prompt engineering IP) — keep or strip per content | HIGH |
| 1.1.5 | Verify `.env.example` files | No real values, all placeholders documented | HIGH |

### 1.2 OSS documentation (this branch)

| # | Task | Detail | Priority |
|---|------|--------|----------|
| 1.2.1 | ✅ MANIFESTO.md | Project mission + principles (from design system) | DONE |
| 1.2.2 | ✅ CODE_OF_CONDUCT.md | Contributor Covenant 2.1 + Alygn safety-specific provisions | DONE |
| 1.2.3 | ✅ CONTRIBUTING.md | Setup (Bun strict), branch/commit conventions, safety-critical review bar, architecture orientation | DONE |
| 1.2.3 | ✅ SECURITY.md | Private disclosure, response targets, safety-critical scope note | DONE |
| 1.2.4 | ✅ README.md | Badges, mission framing, contributing links, built-vs-designed framing | DONE |
| 1.2.5 | GitHub templates | ISSUE_TEMPLATE (bug, feature, security-adjacent), PULL_REQUEST_TEMPLATE with safety-critical checklist, FUNDING.yml | MEDIUM |
| 1.2.6 | CI workflows | Port from KindFi: `pr.yml` (type-check + tests + security scan + commitlint), branch protection config | HIGH |
| 1.2.7 | NOTICE file | Apache 2.0 NOTICE with attribution (Tania Lea Aizenman Sanchez — SOS-Hook concept; Andler Devs Studio — technology) | MEDIUM |

### 1.3 White-label / brand agnosticism

| # | Task | Detail | Priority |
|---|------|--------|----------|
| 1.3.1 | Branding config module | `apps/web-regulator/src/lib/branding.ts` — single source: `{ productName, orgName, tagline, logoPath, footerCredit, docsUrl }` from env (`NEXT_PUBLIC_BRAND_*`) with Alygn defaults | HIGH |
| 1.3.2 | Replace hardcoded brand strings | 8+ locations: login page, logout page, dashboard-tabs, settings, page titles, sidebar brand (app-sidebar.tsx L179), clusters page | HIGH |
| 1.3.3 | Sidebar footer component | New `SidebarFooter` in app-sidebar.tsx: branded credit line ("Powered by ALYGN — Dignity Runtime" default, configurable per org) + version. Collapsed state shows logo only | HIGH |
| 1.3.4 | Docs credit section | README + docs: "Built on the ALYGN Kill Switch (Apache 2.0)" attribution requirement for orgs deploying white-labeled instances | MEDIUM |
| 1.3.5 | Login/logout/settings pages | Use branding config; remove hardcoded "ALYGN Regulator"/"Sovereign Compliance Infrastructure" | HIGH |

---

## Workstream 2 — Wizard TUI for Kill-Switch Installation (Epic)

**Goal:** a new contributor or org operator runs one command on a fresh Arch Linux machine and ends with a verified, running Kill Switch + web-regulator, guided interactively.

### Epic: `wizard-tui-installation`

**Tech choice:** Rust + `ratatui` (terminal UI) — consistent with the Rust safety-critical split; or Bun + `@clack/prompts` for v1 speed. Decision point for team lead.

#### Epic 1.1 — System Detection & Preflight
- Detect OS/distro (Arch parity check with warning on others), kernel version, systemd availability
- Detect hardware: CPU, memory, GPU (NVIDIA/other), disk, network interfaces — the same detection the agent uses at runtime
- Check prerequisites: bun, redis, git, ports 3000/3001 free
- Output: preflight report (pass/warn/fail) with remediation hints
- **Acceptance:** on a clean Arch machine, wizard lists exactly what is missing and offers to install each

#### Epic 1.2 — Guided Configuration
- Interactive prompts: org name (white-label branding seed), admin credentials (WebAuthn registration flow deferred to first dashboard login), kill-switch thresholds (safe defaults), zones, Redis connection (local/docker/remote)
- Secrets generation: `BETTER_AUTH_SECRET`, `KILL_SWITCH_AUTH_TOKEN` via the existing `generate-secrets.sh` (never echo to terminal; write to .env with 600 perms)
- License acknowledgment: Apache 2.0 + attribution notice display
- **Acceptance:** non-interactive replay via `--config file` for automated installs

#### Epic 1.3 — Service Installation & systemd
- Install service files (templates exist: `alygn-web-regulator.service`, `alygn-web-regulator-bun.service`)
- Database migration runner (drizzle)
- Redis setup (system package or docker-compose fallback)
- Post-install verification: health check loop until `{"status":"healthy"}` or fail with diagnostics
- **Acceptance:** fresh machine → running verified services, registered as systemd units with auto-restart

#### Epic 1.4 — First-Run Verification & Onboarding Handoff
- Post-install wizard screen: live health dashboard (API status, redis, machines discovered, audit log initialized)
- Pointer to web-regulator for admin onboarding (machine admission, first operator WebAuthn registration)
- Uninstall/rollback path (clean removal of services, databases optional-preserve)
- **Acceptance:** new operator completes first WebAuthn registration through the dashboard post-wizard

#### Epic 1.5 — Packaging & Distribution
- `install.sh` bootstrap (curl | sh pattern with checksum)
- Release artifacts per tag (binary + config templates)
- Documentation: install guide with the wizard as the primary path, manual path as secondary
- **Acceptance:** fresh contributor machine → working system in under 10 minutes

---

## Workstream 3 — Phase Verification ("deployed" must mean deployed)

**Principle:** the whitepaper v1.5 built-vs-designed table (§2.5) claims 9 capabilities as Deployed/Shipped. Each claim must have **live evidence** on andlersrv — a verification run documented with actual API responses, not assumptions.

### Verification matrix (evidence per claim)

| # | Claimed capability | Evidence required | How to verify | Status |
|---|-------------------|-------------------|---------------|--------|
| V1 | State machine (ARMED/RUNNING/STOPPING/STOPPED/LOCKED) | Health endpoint returns state; transition on kill command | ✅ VERIFIED LIVE: `GET /api/health` → `{"killSwitchState":"RUNNING"}` | ✅ |
| V2 | Admin dashboard (real-time WebSocket) | Dashboard renders, WS connects, state propagates <100ms | Browser session with auth; WS frame capture | ⚠️ needs auth creds |
| V3 | Per-machine flags + resolution order | Flags CRUD via API; override precedence test | Authenticated API calls; flag override test | ⚠️ needs auth creds |
| V4 | Hardware detection (CPU/memory/GPU/disk/OS) | Machine fingerprint populated; drift detection fires on change | Register a machine; inspect fingerprint; modify and observe | ⚠️ needs agent on a second machine |
| V5 | SQLite persistence (WAL) + Drizzle | Restart service → state survives | Restart process; verify state + audit intact | ⚠️ needs service restart access |
| V6 | WebSocket real-time propagation | Dashboard updates on state change without polling | WS client test with auth | ⚠️ needs auth creds |
| V7 | AI-agnostic discovery (Ollama/HF/LlamaIndex/vLLM/OpenAI-compatible) | Each provider detected on a machine with models enumerated | Install Ollama + model; verify discovery; repeat for second provider | ⚠️ needs test machine with providers |
| V8 | Hardware integrity fingerprint + tamper detection | Fingerprint hash stable; swap event fires on hardware change | Fingerprint baseline; simulate drift; verify alert | ⚠️ needs test machine |
| V9 | Registration lifecycle (NEW_MACHINE → ADMITTED/DENIED) | New machine requests registration; admin approves/denies; rogue alert on repeat | Second machine on network; observe flow | ⚠️ needs second machine |
| V10 | Rogue device alerting + monitoring-only default | Unregistered device appears → alert; no authority granted | Connect unknown device; verify alert + zero authority | ⚠️ needs second machine |

### Credentials needed to complete verification (from Andler)

1. **Better-Auth admin credentials** for the live deployment (or a test admin account) — unlocks V2, V3, V6
2. **Service restart access** (sudo systemctl or the deploy pipeline) — unlocks V5
3. **A second test machine** (or VM) with at least one AI provider — unlocks V7, V8, V9, V10
4. **Kill-switch backend URL + auth token** for scripted verification — unlocks automated evidence collection

### Verification protocol

Each verified claim gets a **live-evidence record**: the exact command, the timestamped response, and a screenshot where UI is involved — stored in `docs/verification/` and referenced in the whitepaper's built-vs-designed table. A claim without evidence moves from "✅ Deployed" to "⚠️ Deployed (pending verification)" until evidence exists.

---

## Delivery Structure for Coders (via Team Leads)

Team leads receive this plan + the design system + whitepaper v1.5. Each workstream decomposes into coder tasks with:

- **Scope boundary:** which files/packages the task may touch
- **Acceptance criteria:** testable, binary (pass/fail)
- **Safety-critical flag:** tasks touching scoring/enforcement/audit require maintainer review and ADR reference
- **Built-vs-designed discipline:** any PR that changes the status of a whitepaper capability must state it

### Suggested task sequence (dependency order)

```
Wave 1 (parallel, no deps):
  T1: Git history security scan + cleanup (1.1.2-1.1.3)          [SECURITY — blocking for public]
  T2: Branding config module + string replacement (1.3.1-1.3.5)  [frontend]
  T3: GitHub templates + CI workflows (1.2.5-1.2.6)              [devops]
  T4: Wizard TUI Epic 1.1 — system detection preflight           [Rust/TUI]

Wave 2 (after T1):
  T5: docs/ sensitive content audit + strip (1.1.4)              [SECURITY]
  T6: Wizard TUI Epic 1.2 — guided configuration                 [Rust/TUI]
  T7: NOTICE + FUNDING (1.2.7)                                   [docs]

Wave 3 (after T2, T4):
  T8: Sidebar footer + login/logout/settings branding (1.3.3, 1.3.5) [frontend]
  T9: Wizard TUI Epic 1.3 — service installation + systemd        [Rust/TUI]
  T10: Live verification runs V1-V10 with evidence records        [QA + Andler creds]

Wave 3 (after T6, T7):
  T11: Wizard TUI Epic 1.4 — first-run verification + rollback    [Rust/TUI]
  T12: Install documentation with wizard as primary path          [docs]
```

---

## Definition of Done (for the public launch)

1. Git history clean of secrets (gitleaks pass)
2. All OSS docs present and reviewed (MANIFESTO, CoC, CONTRIBUTING, SECURITY, README, NOTICE)
3. CI enforcing: type-check, tests, commitlint, secret scanning
4. Wizard TUI: fresh-machine install verified end-to-end
5. White-label: zero hardcoded brand strings outside the branding config; sidebar footer live
6. Verification records for all 9 "deployed" claims (or honest downgrade to pending)
7. Whitepaper v1.5 built-vs-designed table matches the verification records exactly
