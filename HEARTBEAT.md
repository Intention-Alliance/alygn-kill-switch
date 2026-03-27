# HEARTBEAT.md — ALYGN Grant System

**Purpose:** Monitor ALYGN grants, Notion pages, and Tania's email for updates.

**Frequency:** Every heartbeat (or 2-3x per day for time-sensitive items)

---

## Task 1: Check ALYGN Grant Tracker in Notion

**When:** Every heartbeat

**Pages to Monitor:**

### 1. Grant Opportunities Tracker Database
- **URL:** https://www.notion.so/32c334874af68130b265de7464a51a72
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

## Task 2: Monitor Tania's Email (alyyygn@gmail.com)

**When:** Every heartbeat

**Purpose:** Check for Tania's replies to grant research questions

**Process:**
1. Connect to Gmail IMAP (alyyygn@gmail.com)
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

### Notion Sync:
1. Query Notion database using API
2. Compare with local state
3. If changes found → Update local files + Notify Discord

### Email Check:
1. Connect to Gmail IMAP (alyyygn@gmail.com)
2. Search for unread emails from Tania
3. Parse content for grant-related keywords
4. If found → Report to Discord + Update tracking

### Deadline Check:
1. Read Grant Tracker from Notion
2. Filter by deadline < 30 days
3. Check status and next actions
4. If gaps found → Alert Discord

---

## Local Files to Maintain

| Local File | Notion Source | Sync Direction |
|------------|---------------|----------------|
| `grant-opportunities-tracker.md` | Grant Tracker Database | Notion → Local |
| `next-actions-checklist.md` | Grant Tracker Database | Notion → Local |
| `alygn-grant-analysis-march-2026.md` | Grant Strategy Overview | Notion → Local |
| `tania-email-tracking.md` | N/A (email tracking) | Email → Local |

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
**Base URL:** https://api.notion.com/v1
**Version:** 2022-06-28
**Auth:** Bearer token from TOOLS.md

### Gmail IMAP
**Host:** imap.gmail.com
**Port:** 993
**Email:** alyyygn@gmail.com
**Auth:** App password from credentials

### Key Endpoints:
- Query database: `POST /databases/{database_id}/query`
- Get page: `GET /pages/{page_id}`

---

## Related Documentation

- Notion API Key: `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`
- ALYGN Central Hub: https://www.notion.so/ALYGN-Central-Hub-2f9334874af6819fa5c5f32ae95088f1
- Grant Tracker DB: `32c334874af68130b265de7464a51a72`

---

*Updated: March 24, 2026*
*Contact: contact@alyygn.com*
