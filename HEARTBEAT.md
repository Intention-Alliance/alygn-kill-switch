# HEARTBEAT.md — ALYGN Grant System

**Purpose:** Monitor ALYGN grants, Notion pages, and Tania's email for updates.

**Frequency:** Every heartbeat (or 2-3x per day for time-sensitive items)

**Main Action:** Completely autonomy with recursive revisions across the AI Agent Team. Minimal human loop, AI Agentic loop with cross-session agent communications.

---

## Task 1: Check ALYGN Grant Tracker in Notion

**When:** Every heartbeat

**Pages to Monitor:**

### 1. Grant Opportunities Tracker Database

- **URL:** <https://www.notion.so/32c334874af68130b265de7464a51a72>
- **Database ID:** `32c334874af68130b265de7464a51a72`
- **Parent:** ALYGN - Central Hub

**Check for:**

- New grant entries added
- Status changes (Researching → Drafting → Submitted → Awarded/Rejected)
- Deadline modifications
- Priority changes
- Next action updates

**Sync Action:**
If changes detected → Update local files:

- `docs/alygn/grants/grant-opportunities-tracker.md`
- `docs/alygn/grants/next-actions-checklist.md`

### 2. Grant Strategy Overview Page

- **URL:** Child page under Grant Opportunities Tracker
- **Check for:** Executive summary updates, strategy shifts, new decisions

**Sync Action:**
If changes detected → Update:

- `docs/alygn/grants/alygn-grant-analysis-march-2026.md`

---

## Task 2: Monitor Tania's Email (<alyyygn@gmail.com>)

**When:** Every heartbeat

**Purpose:** Check for Tania's replies to grant research questions

**Process:**

1. Connect to Gmail IMAP (<alyyygn@gmail.com>)
2. Check for unread emails from Tania
3. Look for keywords: "Grant", "Schmidt", "Coefficient", "Application", "Research"
4. If new email found:
   - Extract content
   - Report to Discord #alygn with summary
   - Update local tracking file

**Notification Rules:**

- Report to Discord #alygn when Tania replies about grants
- Include key points from her response
- Flag if she needs follow-up from Wobblus

---

## Task 3: Deadline Monitoring

**When:** Daily (or every heartbeat)

**Check:**

- Grants with deadlines within 30 days
- P1-Critical grants approaching deadlines
- Missing next actions on active grants

**Alert if:**

- Deadline within 14 days and status not "Drafting" or "Submitted"
- P1 grant with no next action assigned
- Overdue deadlines

---

## How to Check (Step-by-Step)

### Notion Sync

1. Query Notion database using API
2. Compare with local state
3. If changes found → Update local files + Notify Discord

### Email Check

1. Connect to Gmail IMAP (<alyyygn@gmail.com>)
2. Search for unread emails from Tania
3. Parse content for grant-related keywords
4. If found → Report to Discord + Update tracking

### Deadline Check

1. Read Grant Tracker from Notion
2. Filter by deadline < 30 days
3. Check status and next actions
4. If gaps found → Alert Discord

---

## Local Files to Maintain

| Local File                           | Notion Source           | Sync Direction |
| ------------------------------------ | ----------------------- | -------------- |
| `grant-opportunities-tracker.md`     | Grant Tracker Database  | Notion → Local |
| `next-actions-checklist.md`          | Grant Tracker Database  | Notion → Local |
| `alygn-grant-analysis-march-2026.md` | Grant Strategy Overview | Notion → Local |
| `tania-email-tracking.md`            | N/A (email tracking)    | Email → Local  |

---

## Notification Rules

**Report to Discord #alygn when:**

- Status changes to "Submitted" (celebrate)
- Status changes to "Awarded" (major celebration)
- New grant added with P1-Critical priority
- Deadline changes within 30 days
- **Tania replies to grant research questions**
- **Missing next actions on P1 grants**

**Silent sync (no notification) when:**

- Minor note updates
- Formatting changes
- P2-P4 priority adjustments
- Email check with no new replies

---

## Quick Reference

### Notion API

**Base URL:** <https://api.notion.com/v1>
**Version:** 2022-06-28
**Auth:** Bearer token from TOOLS.md

### Gmail IMAP

**Host:** imap.gmail.com
**Port:** 993
**Email:** <alyyygn@gmail.com>
**Auth:** App password from credentials

### Key Endpoints

- Query database: `POST /databases/{database_id}/query`
- Get page: `GET /pages/{page_id}`

---

## Related Documentation

- Notion API Key: `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`
- ALYGN Central Hub: <https://www.notion.so/ALYGN-Central-Hub-2f9334874af6819fa5c5f32ae95088f1>
- Grant Tracker DB: `32c334874af68130b265de7464a51a72`

---

## 🔄 Agent Coordination Pattern (For AI Agentic Work)

**When using heartbeat for multi-agent workflows:**

### The "Ping-Pong" Protocol

1. **Spawn agent** with clear task and timeout
2. **`sessions_yield`** to wait for completion
3. **Wait for push-based completion events** (don't poll aggressively)
4. **If no response after 2-3 yields:** Use `sessions_send` to ask for status
5. **Check git/files** for evidence of work before assuming idle
6. **Acknowledge completion** with specific next steps

### File Organization for Internal Work

**During heartbeat agentic workflows:**
- Use `batch-scripts/` for internal automation (gitignored)
- Store operation summaries in `docs/` (sanitized, no secrets)
- Move completed work samples to `docs/samples/`
- Check `.gitignore` patterns before creating temporary files

### Handling Queued Messages

- When agent is busy, messages queue up
- Multiple "Continue where you left off" may stack
- Process ALL queued messages in chronological order
- Read from `sessions_history` if needed to maintain context

---

_Updated: March 24, 2026_
_Contact: contact@alyygn.com_

---

## 🔄 ACTIVE WORK STREAMS (2026-04-15 01:24 CST)

### Stream 1: Phase 1 Critical Fixes (ALYGN Grant System)

**Status:** ✅ **PHASE 1 COMPLETE** — 4/4 FIXED

| Issue | Status | Agent | Result |
|-------|--------|-------|--------|
| C-001 | ✅ FIXED | Keridz | Spanish pain points restored in `fromCanton()` |
| A-001 | ✅ COMPLETE | Chanshuk | Session coordination working, no fix needed |
| B-001 | ✅ FIXED | Keridz | 5 regression vectors plugged, lang-guard + DB constraints, 23 tests |
| D-001 | ✅ FIXED | Keridz | 3 additional English leaks fixed, 17 pipeline integration tests |

**Final Test Results:** 40/40 tests passing (23 B-001 + 17 D-001)

**Phase 1 Outcome:** Entire discovery pipeline now produces **fully Spanish content** across all code paths:
- ✅ CR cantones path — canonical `SPANISH_PAIN_POINTS`, Spanish dept focus, Spanish initiatives
- ✅ Mock/dry-run path — Spanish pain points, focus, initiatives
- ✅ Firecrawl fallback — Spanish pain points hardcoded
- ✅ Research (CR, generic, dry-run) — Spanish pain points, initiatives, key contacts, departments
- ✅ Constructor guard — `assertSpanishPainPoints()` blocks English at entity creation

**Follow-up Items (Phase 2):**
- P1: Use `SPANISH_PAIN_POINTS` constant directly in `researchGeneric()` instead of inline strings
- P2: `fetchMunicipalitiesFromFirecrawl()` should return full 5 pain points, not 2
- P3: Add `assertSpanishPainPoints()` call in `discoverFromSupabase()` after DB read (defense-in-depth)
- P3: Add `assertSpanishString()` validation for initiative names/descriptions and department focus

---

### 🎉 PHASE 1 COMPLETE — Ready for Phase 2

**What's now working:**
- Municipal entities always have Spanish pain points (enforced at constructor + DB level)
- Discovery pipeline produces Spanish content end-to-end
- Research pipeline produces Spanish content across all code paths
- Mock/dry-run data fully Spanish
- 40 automated tests prevent regression

**Next:** Begin Phase 2 (P1-P3 items from follow-up) or return to grant monitoring/VC outreach.

---

### Stream 2: Kill Switch Admin UI (Phase0)

**Status:** ⏸️ BLOCKED - Awaiting Manual Deploy

**What's Done:**
- ✅ Auth endpoints added (Keridz)
- ✅ Admin UI built (vite production build)
- ✅ Nginx config updated (added `/v1/auth/` proxy)
- ✅ DEPLOY-COMMANDS.md created

**Blocked On:**
- Manual sudo commands to deploy nginx config + dist files

**Credentials Ready:**
- Email: `admin@alyygn.com`
- Password: `andlersrv-auth-token-2026`
- URL: `https://andlersrv.tail62d797.ts.net:8443/`

**Next:** Andler runs deploy commands → Test login

---

### Stream 3: Grant Monitoring (Ongoing)

**Status:** ✅ STABLE

- Schmidt Sciences: May 17, 2026 (32 days) — No alert
- Coefficient Giving: Dec 31, 2026 — No alert
- No Tania emails pending
- No status changes detected

---

## 🎯 PARALLEL WORK OPPORTUNITIES

**While waiting for manual deploy (Stream 2):**

1. ✅ **Proceed with A-001** — Session Coordination (dev-lead)
2. ✅ **Proceed with B-001** — Data Integrity (be-coder, after A-001)
3. ✅ **Proceed with D-001** — Discovery (be-coder, after B-001)
4. ⏳ **Grant outreach** — VC email drafting (if time-sensitive)
5. ⏳ **Twitter automation** — Daily posting (if cron missed)

---

## 📋 COMMUNICATION PROTOCOL

**During active work:**

- **Heartbeat updates:** Every 30 min during active phases
- **Agent completions:** Immediate acknowledgment + next steps
- **Blockers:** Report to Discord #alygn within 5 min
- **User escalations:** Only when team cannot resolve

**File updates:**

- `HEARTBEAT.md` — Phase status, task progress
- `memory/2026-04-15.md` — Session logs, decisions
- `docs/alygn/grants/` — Grant tracker sync (if changes)

---

## 🔄 REVISION IN PROGRESS (2026-04-01 15:52 CST)

**Status:** Issues under complete revision

**Problems identified:**
- Issue titles not following `[CAT-###]` format
- Labels incomplete/wrong
- Template not matching repo standard
- Context insufficient

**Action:** Talanara revising all 111 issues
- Fixing titles to `[C-001]`, `[A-001]`, etc.
- Applying correct 4-label set (bug + P0-critical + team + project)
- Using exact `.github/ISSUE_TEMPLATE/bug-report.md` template
- Adding full context: file paths, test commands, root cause

**Wait for completion before Phase 1 continues.**

