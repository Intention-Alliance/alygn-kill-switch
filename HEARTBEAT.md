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

## 🎉 DOCUMENTATION PHASE COMPLETE (2026-04-01 15:15 CST)

**Status:** ✅ **ALL 111 ISSUES FULLY DOCUMENTED BY TALANARA**

Talanara (docs-writer) completed comprehensive documentation for all 111 issues:

- Full bug-report.md template applied
- Root cause analysis for each issue
- Expected vs Actual behavior documented
- Steps to reproduce with test commands
- File paths and line numbers specified
- Team assignments and acceptance criteria

**Ready for Phase 1 execution.**

## 🚀 PHASE 1: CRITICAL FIXES (IN PROGRESS)

### Completed ✅

- **C-001:** Municipal Language Crisis — **FIXED** by be-coder
- Root cause: MunicipalEntity.fromCanton() had English pain points
- Fix: Updated to Spanish pain points
- Verified: lang="es", "Estimado/a", Spanish content

### Next 🔄

- **A-001:** Session Coordination — Spawn dev-lead (Chanshuk)
- **B-001:** Data Integrity — Spawn be-coder (Keridz)
- **D-001:** Discovery — Spawn be-coder (Keridz)

## 📊 Implementation Status

| Phase                | Status      | Progress                  |
| -------------------- | ----------- | ------------------------- |
| Documentation        | ✅ Complete | 111/111 issues            |
| C-001 Fix            | ✅ Complete | Spanish language restored |
| A-001 Coordination   | 🔄 Ready    | Waiting spawn             |
| B-001 Data Integrity | ⏳ Pending  | After A-001               |
| D-001 Discovery      | ⏳ Pending  | After B-001               |

## 🎯 Next Actions

1. Spawn **dev-lead** for A-001 (Session Coordination)
2. Spawn **be-coder** for B-001 (Data Integrity)
3. Daily standup: 09:00 CST on GitHub issues
4. Report progress every completed issue

---

**All systems ready for Phase 1 execution.** 🚀

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

