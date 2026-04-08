# ANALYSIS: Alygn Outreach Skill Audit

**Date:** 2026-03-27  
**Purpose:** Monday production readiness review  
**Status:** ⚠️ ISSUES FOUND — Action required before Monday

---

## 1. SKILL LOCATION

### Finding
Two copies of the skill exist:

| Path | Exists | Last Modified |
|------|--------|---------------|
| `$HOME/.agents/skills/alygn-outreach/` | ✅ YES | Mar 27 16:51 |
| `$HOME/.openclaw/workspace/skills/alygn-outreach/` | ✅ YES | Mar 27 16:51 |

**Both directories are IDENTICAL** (same file sizes, same content). This is a sync artifact.

### What Lobster Files Reference
- `alygn-vc-outreach.lobster` → `$HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts`
- `alygn-muni-outreach.lobster` → `$HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts`

### Recommendation
**Canonical path: `$HOME/.agents/skills/alygn-outreach/`**

This is what the lobster files expect. Delete the workspace copy or establish a symlink:
```bash
rm -rf /home/andlersrv/.openclaw/workspace/skills/alygn-outreach
ln -s $HOME/.agents/skills/alygn-outreach /home/andlersrv/.openclaw/workspace/skills/alygn-outreach
```

---

## 2. LOBSTER FILE DUPLICATION

### Status Matrix

| File | Lines | Last Modified | Status |
|------|-------|---------------|--------|
| `alygn-vc-outreach.lobster` | 292 | Mar 27 16:17 | ✅ **ACTIVE** — Full MODE A/B/C docs, workspace paths |
| `alygn-vc-outreach-wave.lobster` | 284 | Mar 27 13:46 | ⚠️ **OUTDATED** — Uses /tmp paths, missing docs |
| `alygn-muni-outreach.lobster` | 527 | Mar 27 16:21 | ✅ **ACTIVE** — Full schema, Supabase reference |
| `alygn-muni-outreach-wave.lobster` | 363 | Mar 27 14:43 | ⚠️ **OUTDATED** — Uses /tmp paths, missing schema |

### Key Differences

**VC Outreach (non-wave vs wave):**
- Non-wave: References `$HOME/.openclaw/workspace/reports/alygn/vc-wave-state.json`
- Wave: References `/tmp/alygn-vc-wave-state.json`
- Wave: Missing MODE A/B/C documentation block
- Wave: Missing Phase 0 sync step

**Muni Outreach (non-wave vs wave):**
- Non-wave: Has full Supabase schema in comments
- Non-wave: Correct wave state path `$HOME/.openclaw/workspace/reports/alygn/muni-wave-state.json`
- Wave: Uses `/tmp/alygn-muni-wave-state.json`
- Wave: Has typo `wave: wave: {{ LATEST_WAVE_NUMBER + 1 }}`
- Non-wave: Has X account discovery prelude

### Recommendation
**DELETE the `-wave` files.** They are older, less complete versions:

```bash
rm /home/andlersrv/.openclaw/workspace/.lobster/alygn-vc-outreach-wave.lobster
rm /home/andlersrv/.openclaw/workspace/.lobster/alygn-muni-outreach-wave.lobster
```

The non-wave files (`alygn-vc-outreach.lobster`, `alygn-muni-outreach.lobster`) are the current production versions.

---

## 3. REPORTS STATE STRUCTURE

### What Exists

| Path | Status |
|------|--------|
| `/home/andlersrv/.openclaw/workspace/reports/` | ⚠️ **EMPTY** — Only old README.md and metric files |
| `$HOME/.agents/skills/alygn-outreach/data/state/` | ⚠️ **EMPTY** — Directory exists, no files |
| `$HOME/.agents/skills/alygn-outreach/data/supabase/` | ✅ Has supabase config |

### What Lobster Files Expect (but doesn't exist)

**VC Reports Structure:**
```
$HOME/.openclaw/workspace/reports/alygn/
├── vc-wave-state.json              ← Expected but missing
├── vc-sync-result.json
├── vc-discover/
├── vc-validate/
├── vc-research/
├── vc-personalize/
├── vc-sent/
└── vc-campaign-resume-token.json
```

**Muni Reports Structure:**
```
$HOME/.openclaw/workspace/reports/alygn/
├── alygn-muni-wave-state.json      ← Expected but missing
├── alygn-vc-wave-state.json        ← Expected but missing
├── muni-discover/
├── muni-mayor/
├── muni-validate/
├── muni-research/
├── muni-personalize/
├── muni-review/
├── muni-sent/
└── muni-pipeline/
```

### The Problem
The `wave-state.ts` utility correctly writes to `$HOME/.openclaw/workspace/reports/alygn/alygn-vc-wave-state.json` and `alygn-muni-wave-state.json`, but **this directory doesn't exist**.

### Recommendation
Create the directory structure before Monday:

```bash
mkdir -p $HOME/.openclaw/workspace/reports/alygn
mkdir -p $HOME/.openclaw/workspace/reports/alygn/vc-discover
mkdir -p $HOME/.openclaw/workspace/reports/alygn/vc-validate
mkdir -p $HOME/.openclaw/workspace/reports/alygn/vc-research
mkdir -p $HOME/.openclaw/workspace/reports/alygn/vc-personalize
mkdir -p $HOME/.openclaw/workspace/reports/alygn/vc-sent
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-discover
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-mayor
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-validate
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-research
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-personalize
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-review
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-sent
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-pipeline
mkdir -p $HOME/.openclaw/workspace/reports/alygn/muni-x-accounts
```

Or update `wave-state.ts` to create directories if they don't exist.

---

## 4. WAVE PATTERNS

### Consistency Analysis

| Aspect | VC | Municipal |
|--------|----|----|
| State storage | JSON file | JSON file |
| State file path | `$HOME/.openclaw/workspace/reports/alygn/alygn-vc-wave-state.json` | `$HOME/.openclaw/workspace/reports/alygn/alygn-muni-wave-state.json` |
| Wave interval | 7 days | 7 days |
| Wave skip logic | Node.js inline check | Node.js inline check |
| Wave schema | `{ wave, entities, lastRun, phaseCompleted }` | Same |

### ✅ Patterns Are Consistent

Both use:
- Same wave-state.ts utility
- Same JSON schema
- Same 7-day interval
- Same phase completion tracking

### ⚠️ Wave Check Implementation Is Duplicated

Both lobster files have **inline Node.js wave-check scripts** that duplicate the `wave-state.ts` logic:

```yaml
# In both -wave lobster files (OUTDATED):
- id: wave-check
  command: |
    node -e "
      const fs = require('fs');
      const statePath = '/tmp/alygn-vc-wave-state.json';
      # ... inline wave check
    "
```

This inline code:
- Uses `/tmp/` paths (inconsistent with wave-state.ts)
- Is duplicated in both VC and Muni wave files
- Should be replaced with calls to `wave-state.ts`

### The wave-state.ts Script Location
```
/home/andlersrv/.openclaw/workspace/scripts/alygn/wave-state.ts
```

But there's no `alygn` subdirectory under `scripts/` — it's flat.

---

## 5. CRONJOB TASK PROMPTS

### Current State

| Prompt | Quality | Issues |
|--------|---------|--------|
| `cronjob-alygn-vc-morning.md` | ⚠️ Basic | No MODE documentation, no skill file references |
| `cronjob-alygn-vc-afternoon.md` | ⚠️ Basic | Recovery logic present but no skill references |
| `cronjob-alygn-muni-morning.md` | ⚠️ Basic | No Supabase schema reference |
| `cronjob-alygn-muni-afternoon.md` | ⚠️ Basic | Missing schema details |

### What's Missing vs Master Format

The `create-all-crons.sh` uses a "Master" format with:
- Detailed step-by-step instructions
- File path references to requirements
- Clear success/failure criteria
- Environment variable documentation

**Current prompts lack:**
1. **MODE documentation** — No explanation of MODE A (dry-run) vs MODE B (real API) vs MODE C (production)
2. **Skill file references** — No `$HOME/.agents/skills/alygn-outreach/` path references
3. **Database schema** — Muni prompts don't reference Supabase schema
4. **Approval gates** — No explicit "you must get approval before sending" guidance
5. **Wave state expectations** — No mention of where wave state is stored/read

### Recommendation: Restructure Prompts

Create unified "Master" prompts for each outreach type:

**Proposed structure:**
```markdown
# ALYGN VC Outreach Master

## Skill Location
$HOME/.agents/skills/alygn-outreach/

## Lobster File
$HOME/.openclaw/workspace/.lobster/alygn-vc-outreach.lobster

## Execution Modes
- MODE A (Dry Run): bun ... --dry-run
- MODE B (Real API): USE_DIRECT_API=true bun ... --dry-run  
- MODE C (Production): bun ... (requires approval)

## Required Files
- Wave state: $HOME/.openclaw/workspace/reports/alygn/alygn-vc-wave-state.json
- Database: Notion (VC database ID in config)

## Phases
... (详细说明)

## Approval Gate
... (approval requirements)

## Success/Failure Criteria
... (具体指标)
```

---

## ACTION ITEMS FOR MONDAY

| Priority | Action | Owner |
|----------|--------|-------|
| 🔴 CRITICAL | Create `$HOME/.openclaw/workspace/reports/alygn/` directory structure | System |
| 🔴 CRITICAL | Delete `-wave` lobster files (outdated) | System |
| 🔴 CRITICAL | Choose canonical skill path and document it | System |
| 🟡 HIGH | Update wave-state.ts to auto-create directories | Developer |
| 🟡 HIGH | Rewrite cron prompts with Master format | Developer |
| 🟡 HIGH | Add MODE documentation to all cron prompts | Developer |
| 🟢 MEDIUM | Remove inline wave-check from lobster files, use wave-state.ts | Developer |
| 🟢 MEDIUM | Add Supabase schema reference to muni cron prompts | Developer |

---

## SUMMARY

**Production Ready:** ⚠️ NO — Critical directory structure missing

**Root Cause:** The skill was designed with paths that don't exist on the filesystem (`$HOME/.openclaw/workspace/reports/alygn/`). The lobster files and wave-state.ts both expect this structure but nothing creates it.

**Immediate Fix Required:**
1. Create directory structure
2. Delete outdated `-wave` lobster files  
3. Pick one canonical skill path
4. Update cron prompts with proper documentation
