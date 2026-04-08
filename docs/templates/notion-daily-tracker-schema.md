# Daily Action Tracker — Notion Database Schema

## Database: Morning Brief Tracker

**Purpose:** Track daily priorities, completion, and weekly progress for morning brief podcast

---

## Properties

### Basic Info
- **Name** (Title): Brief name with date — e.g., "Morning Brief — March 29, 2026"
- **Date** (Date): Date of the brief
- **Day of Week** (Select): Mon/Tue/Wed/Thu/Fri/Sat/Sun
- **Week Number** (Number): Week of year

### Yesterday's Recap
- **GitHub Activity Summary** (Rich Text): What changed + what it means
- **Key Decisions** (Rich Text): Important decisions made
- **Blockers Hit** (Rich Text): Issues encountered
- **Wins** (Rich Text): Celebrations from yesterday

### Today's Priorities
- **P1 Task** (Rich Text): Must do today
- **P1 Status** (Select): Not Started / In Progress / Complete / Blocked
- **P2 Task** (Rich Text): Should do today
- **P2 Status** (Select): Not Started / In Progress / Complete / Blocked
- **P3 Task** (Rich Text): If time today
- **P3 Status** (Select): Not Started / In Progress / Complete / Blocked
- **Meetings Today** (Rich Text): Calls + prep needed

### Week Context
- **Week Goals** (Rich Text): Major milestones this week
- **Upcoming Deadlines** (Rich Text): 30-day view
- **Dependencies** (Rich Text): What we're waiting on

### Tracking
- **Energy Level** (Select): High / Medium / Low
- **Blockers Today** (Rich Text): Current blockers
- **Needs** (Rich Text): Resources/help needed
- **Carry Over** (Checkbox): Items moved to tomorrow

### Audio
- **Brief Generated** (Checkbox): Audio created
- **Audio File** (Files & Media): Link to generated audio
- **Discord Sent** (Checkbox): Delivered via Discord

---

## Views

### 1. Today's Brief (Gallery)
Filter: Date = Today
Show: Yesterday, Today's priorities, Week preview

### 2. This Week (Table)
Group by: Week Number
Show: Daily completion, week goals progress

### 3. Incomplete Items (Table)
Filter: P1/P2/P3 Status ≠ Complete
Group by: Date
Show: What got left behind

### 4. Weekly Review (Board)
Group by: Week Number
Show: Completed vs carry-over items

---

## Integration

**Auto-populated from:**
- GitHub API (commits, PRs, issues)
- Memory files (decisions, wins)
- Discord (key conversations)

**Manual entry:**
- Priority tasks for day
- Energy level
- Blockers
- Context/decisions

---

## Parent Database

Create under: **ALYGN - Central Hub** → **Daily Operations**

Or standalone: **Andler's Workspace** → **Daily Briefs**

---

## Related

- **Weekly Progress DB** (existing): Cross-reference week goals
- **Grant Tracker**: Include grant deadlines in upcoming items
- **GitHub Projects**: Link to active repositories

---

*Created: March 28, 2026*
*Purpose: Podcast-format morning brief tracking*