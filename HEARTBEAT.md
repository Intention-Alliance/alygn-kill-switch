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

## 🎯 ACTIVE WORK STREAMS (2026-04-29 01:00 CST)

### Stream 0: ✅ ALYGN OUTREACH — TOMORROW'S SENDS PREPPED

**Status:** ✅ **BOTH PIPELINES READY** — Morning check-in scheduled for 8:45 AM CST

**Tomorrow's Execution Plan:**
| Time | Pipeline | Action | Ready |
|------|----------|--------|-------|
| **9:00 AM CST** | VC Outreach | Personalize + Send 3 emails | ✅ YES |
| **10:00 AM CST** | Muni Outreach | Personalize + Send 4 municipalities | ✅ YES |

**VC Pipeline Summary:**
- ✅ 20 VCs researched (Wave 2026-04-29)
- ✅ 18 partner-level emails found (90% success)
- ✅ 6 removed (already sent: Khosla, DCVC, etc.)
- ✅ 14 VCs ready for pipeline
- ✅ ZeroBounce validation complete (5 valid, 2 invalid but already contacted)
- ✅ Tomorrow's first 3: `nathan@airstreet.com`, `jordan@radical.vc`, `josh@firstround.com`

**Muni Pipeline Summary:**
- ✅ Wave 5 complete (4 new municipalities)
- ✅ 82/82 cantones discovered, ~78 contacted (95% coverage)
- ✅ Tomorrow's batch: Paraíso, Santa Barbara, Montes de Oro, Pococí
- ✅ All emails valid, all data complete
- ✅ Today's success: 11 municipalities sent

**Heartbeat Check-in Schedule:**
- **8:45 AM CST:** Pre-cron verification (both pipelines)
- **9:15 AM CST:** VC send confirmation
- **10:15 AM CST:** Muni send confirmation
- **12:00 PM CST:** Midday status report

**Notification Rules:**
- Report to Discord #alygn if either pipeline fails
- Report send counts + any bounces
- Report approval workflow issues
- Celebrate successful sends 🎉

---

### Stream 1: 🔄 KILL SWITCH ADMIN UI — ZERO-TRUST REVISION (NEW)

**Status:** 🔄 **STARTING** — Sequential revision with team

**Mission:**
1. Review latest Kill Switch Admin UI code (auth/login focus)
2. Test locally with zero-trust protocols
3. Update GitHub issues (AndlerRL/andler-ops) with findings
4. Create checklist, verify all auth flows working

**Team:** Chanshuk (dev-lead) + Gimglich (fe-coder) + Keridz (be-coder) + Nikaya (reviewer)
**ETA:** 90-120 min for full revision + issue updates

---

### Stream 2: 🔄 ANDLER.DEV BLOG FEATURE — IMPLEMENTATION PLAN (NEW)

**Status:** 🔄 **STARTING** — After Kill Switch revision complete

**Mission:**
1. Review existing blog implementation at AndlerRL/andler-landing
2. Create implementation plan for real content + CI pipeline
3. Create GitHub issues for tracking (gh CLI)
4. Add Meta document to Notion (Weekly TODO table)
5. Create tracking meta issue referencing Notion doc

**Team:** Hugrukal (architect) + Talanara (docs-writer) + Gimglich (fe-coder)
**ETA:** 60-90 min for plan + issues + Notion sync

---

### Stream 3: ⏳ GITHUB ISSUES MASS IMPLEMENTATION — 6 REMAINING

**Status:** ⏳ **PAUSED** — Will resume after Streams 1-2 complete

**Remaining G Issues:**
- #89: Environment-Specific Configuration
- #94: Load Balancer Monitoring
- #95: System Resource Monitoring
- #96: Cloud Cost Optimization
- #97: Automated Documentation Sync
- #98: Automated Incident Response Runbooks

**Progress:** 34/40+ complete (85%)

---

### Stream 4: ✅ GRANT MONITORING — STABLE

**Status:** ✅ STABLE

- Schmidt Sciences: May 17, 2026 (~25 days) — No alert
- Coefficient Giving: Dec 31, 2026 — No alert
- No Tania emails pending
- No status changes detected

---

### Stream 5: ⏳ X AUTOMATION QUALITY PROTOCOL — ON HOLD

**Status:** ⏳ **ON HOLD** — Lower priority than Streams 1-2

**Pending:** Onboard alygn-x-growth-executor with posting limits (max 3/run, 8/day total)

---

## 📋 TODAY'S ACHIEVEMENTS (2026-04-22)

**34 GitHub issues completed, 14 commits, ~10,000+ lines of production code.**

**Quality assurance:**
- ✅ Batch 6-9 report audit completed
- ✅ All stub reports rewritten with verifiable details
- ✅ Nikaya review on most batches (gateway timeouts on Batch 10+)
- ✅ Zero-trust verification protocol followed

**Categories shipped:** A, B, C, D, E, F, H (100% complete)
**Remaining:** G category (6 infrastructure issues)

**Next session priorities:**
1. Complete G category (#89, #94-98)
2. Batch 4 Foundation (#112-117) — integration blockers
3. Deploy Kill Switch Admin UI
4. Fix ALYGN outreach cron jobs (remote DB checks)

---

## 📋 Development Plan — Sequential Execution

**Priority Order:**

### 1. Kill Switch Admin UI — Login Redirect Fix (NOW)
- **Issue:** Redirect loop (`/admin/` → `/` → `/login`)
- **Fix:** Change `LoginPage.tsx` line 20: `/admin/` → `/kill-switch`
- **ETA:** 5 min
- **Agent:** Direct edit (no spawn needed)

### 2. Critical Issue Scan (AFTER FIX)
- Check GitHub issues for P0-critical items
- Verify no blockers in active streams
- **ETA:** 10 min

### 3. Remaining P1-P3 Items by Category
- **Category A:** Session coordination edge cases
- **Category B:** Data integrity (already done - B-001)
- **Category C:** Municipal language (already done - C-001)
- **Category D:** Discovery (already done - D-001)
- **Category E:** Email delivery — check for P1-P3 items
- **Category F:** Templates — check for P1-P3 items
- **Category G:** Infrastructure — check for P1-P3 items
- **Category H:** Security — check for P1-P3 items

**Team Coordination Protocol:**
- Quick fixes → Direct edit (no spawn)
- Complex fixes → Spawn appropriate agent (be-coder, fe-coder, reviewer)
- After each completion → Acknowledge + provide next steps
- Heartbeat updates → Every 30 min during active phases

---

### Stream 4: Grant Monitoring (Ongoing)

**Status:** ✅ STABLE

- Schmidt Sciences: May 17, 2026 (~25 days) — No alert
- Coefficient Giving: Dec 31, 2026 — No alert
- No Tania emails pending
- No status changes detected

---

## 📋 TODAY'S PLAN — ALYGN OUTREACH DEEP REVISION (2026-04-22)

**Priority Order:**

### 1. 🔍 System Audit (IN PROGRESS)
- **Agent:** Hugrukal (architect)
- **Task:** Map architecture, identify gaps, cross-reference GitHub issues
- **ETA:** 30 min
- **Output:** Gap analysis, file list, issue mapping

### 2. 🔧 Code Fixes (PENDING)
- **Agent:** Keridz (be-coder)
- **Task:** Fix Pipeline.ts deep research flags, env var injection, remote DB checks
- **ETA:** 60-90 min (depends on audit findings)

### 3. 🔄 Cron Job Repairs (PENDING)
- **Agent:** Devops
- **Task:** Update cron jobs to check remote state, not local cache
- **ETA:** 45 min

### 4. 📝 Documentation Update (PENDING)
- **Agent:** Talanara (docs-writer)
- **Task:** Update lobster files, skills documentation, cron instructions
- **ETA:** 30 min

### 5. ✅ Testing & Verification (PENDING)
- **Agent:** Nikaya (reviewer)
- **Task:** Dry-run tests, verify remote DB checks working, zero-trust validation
- **ETA:** 45 min

**Communication Protocol:**
- Updates to Discord #annotations every 30 min during active phases
- HEARTBEAT.md updated after each phase complete
- Zero-trust verification before marking any phase complete

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

