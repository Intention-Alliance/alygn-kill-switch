# Outreach System Redesign - Architecture Document
**Author:** Dev Lead (Chanshuk/Hugrukal coordination)
**Date:** 2026-03-26
**Status:** Phase 1 - Architecture Design
**Scope:** Split monolithic outreach into 3 independent cronjobs with wave tracking

---

## Executive Summary

Split the current monolithic `alygn-muni-outreach.lobster` (which combines VC + municipal + X growth concerns) into **3 independent cronjob workflows** with proper **wave date tracking** and **state persistence**.

---

## Current Problems

| Problem | Impact |
|---------|--------|
| Context overflow | Too many steps in single lobster file causes token overflow |
| Missing state tracking | No wave date tracking, no resume capability |
| Mixed concerns | VC + municipal in same workflow creates confusion |
| Municipal workflow not followed | Complex phases causing skips |

---

## Proposed Architecture: 3-Cronjob System

```
┌─────────────────────────────────────────────────────────────┐
│                    OUTREACH SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ VC CRONJOB │  │ MUNI CRONJOB│  │ X-GROWTH CRONJOB│   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│                                                             │
│  Wave-based execution          Independent execution        │
│  Wave dates tracked           No cross-dependencies        │
│  State persists between runs  Each has own lobster file   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Wave Date Tracking System

### Concept
Each outreach "wave" has a **wave date** (typically 1 week apart). State tracks:
- Last run timestamp
- Current wave number
- Next scheduled wave date
- Per-entity status

### State File Schema
```json
{
  "wave": {
    "number": 1,
    "date": "2026-03-26",
    "nextDate": "2026-04-02",
    "status": "in_progress"
  },
  "entities": {
    "vc-001": { "status": "sent", "lastContact": "2026-03-26" },
    "muni-042": { "status": "personalized", "lastContact": null }
  },
  "lastRun": "2026-03-26T14:00:00Z"
}
```

---

## 3 Lobster Files (Deliverables)

### 1. `alygn-vc-outreach-wave.lobster`
**Purpose:** VC investor outreach with wave tracking
**Location:** `$HOME/.lobster/alygn-vc-outreach-wave.lobster`
**Cron:** Weekly (Monday 10 AM)
**Phases:**
1. Discover → Validate → Research → Personalize → Review → Send → Verify

**State File:** `/tmp/alygn-vc-wave-state.json`

### 2. `alygn-muni-outreach-wave.lobster`
**Purpose:** Costa Rica municipal outreach with wave tracking
**Location:** `$HOME/.lobster/alygn-muni-outreach-wave.lobster`
**Cron:** Weekly (Wednesday 10 AM)
**Phases:**
1. Discover (82 cantones) → Research Mayors → Validate Emails → Personalize → Review → Send → Verify

**State File:** `/tmp/alygn-muni-wave-state.json`

### 3. `alygn-x-growth-daily.lobster` (EXISTING - minimal changes)
**Purpose:** Daily X/Twitter growth
**Location:** `$HOME/.lobster/alygn-x-growth-daily.lobster`
**Cron:** Daily (2 PM, 6 PM)
**Phases:** 8 phases (pre-approved → generate → parse → validate → format → post → discover → engage → summary)
**No changes needed** - already well-structured

---

## State Management Design

### Wave State Machine

```
┌──────────┐     ┌───────────────┐     ┌──────────┐     ┌─────────────┐
│ DISCOVER │ ──► │ RESEARCH      │ ──► │ PERSONAL │ ──► │ REVIEW      │
└──────────┘     └───────────────┘     └──────────┘     └─────────────┘
     │                   │                    │                   │
     │ On complete       │ On complete       │ On complete      │ On approval
     ▼                   ▼                    ▼                   ▼
┌──────────┐     ┌───────────────┐     ┌──────────┐     ┌─────────────┐
│ SAVE     │     │ SAVE          │     │ SAVE     │     │ UPDATE WAVE │ ──► SEND
│ STATE    │     │ STATE         │     │ STATE    │     │ STATUS      │
└──────────┘     └───────────────┘     └──────────┘     └─────────────┘
```

### State Persistence Rules
1. **Save after each phase** - If crash, resume from last completed phase
2. **Wave date** - Set at start, checked before execution
3. **Entity-level tracking** - Each VC/municipality has individual status
4. **No duplicate sends** - Check `sent` status before sending

---

## Implementation Phases

### Phase 1: Architecture Design (THIS DOCUMENT)
- [x] Define 3-cronjob architecture
- [x] Define wave date tracking system
- [x] Define state management
- [ ] Define database schema changes

### Phase 2: Implementation
- **Keridz (BE-Coder):** Update TypeScript scripts for wave tracking
- **Gimglich (FE-Coder):** Update lobster files (3 new files)
- **Talanara (Docs-Writer):** Update SKILL.md documentation

### Phase 3: Integration
- Test each cronjob independently
- Verify handoffs between waves
- Validate state persistence

---

## Database Schema Changes

### New Fields for `municipalities` Table
```sql
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS wave_number INTEGER DEFAULT 1;
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS wave_date DATE;
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMP;
```

### New Fields for `vc_contacts` Table
```sql
ALTER TABLE vc_contacts ADD COLUMN IF NOT EXISTS wave_number INTEGER DEFAULT 1;
ALTER TABLE vc_contacts ADD COLUMN IF NOT EXISTS wave_date DATE;
ALTER TABLE vc_contacts ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMP;
```

---

## Anti-Patterns Being Fixed

| Before | After |
|--------|-------|
| Monolithic lobster (50+ steps) | 3 independent lobster files (~10 steps each) |
| No wave tracking | Wave date + number in state |
| VC + muni mixed | Clear separation |
| Resume from arbitrary points | Phase-based state machine |
| Global state | Per-entity tracking |

---

## Testing Plan

### Unit Tests
1. Wave date validation
2. State file read/write
3. Phase transition logic

### Integration Tests
1. Full wave execution (dry-run)
2. Resume from mid-wave
3. Duplicate prevention

### E2E Tests
1. Complete wave 1, verify state
2. Start wave 2, verify wave increment
3. Verify no duplicate sends across waves

---

## Files to Create/Modify

### New Files
- `$HOME/.lobster/alygn-vc-outreach-wave.lobster` - Wave-based VC outreach
- `$HOME/.lobster/alygn-muni-outreach-wave.lobster` - Wave-based municipal outreach
- `/tmp/alygn-vc-wave-state.json` - VC wave state
- `/tmp/alygn-muni-wave-state.json` - Municipal wave state

### Files to Update
- `alygn-vc-outreach.lobster` - Migrate to wave model
- `alygn-muni-outreach.lobster` - Deprecate in favor of wave version
- `alygn-x-growth-daily.lobster` - Add wave tracking (optional)
- `scripts/alygn/muni-outreach/core/supabase-utils.ts` - Add wave fields

### Documentation
- `$HOME/.agents/skills/alygn-outreach/SKILL.md` - Update for wave system
