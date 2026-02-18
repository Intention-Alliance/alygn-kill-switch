# Phase 2: Batch Research Strategy

## Overview

Instead of researching all VCs at once, we work in **batches of 5 VCs** with iterative cron scheduling.

**Why?**
- Manageable scope per iteration
- Allows verification between batches
- Reduces system load
- Incremental progress tracking
- Time for you to process results

---

## Core Strategy

### 1. Batch Size = 5 VCs
Each iteration researches exactly 5 VCs.

### 2. Cron Interval = 4 Hours
- Enough time to research 5 VCs (30s each = 2.5 min + overhead)
- Daily = 6 iterations = ~30 VCs/day
- Not too frequent (avoid overload)
- Not too sparse (still making progress)

### 3. Smart Detection Using Timestamps
**Key insight:** Don't re-research already-researched VCs

Check `last_edited_time` in Notion:
- If edited in last 24 hours → Likely researched recently
- If older → Needs research or needs re-research

```javascript
const isRecentlyEdited = (lastEdited, hours = 24) => {
  const editTime = new Date(lastEdited)
  const threshold = new Date(Date.now() - hours * 60 * 60 * 1000)
  return editTime > threshold
}
```

### 4. Incremental Updates
Each iteration only touches VCs it researches:
- Iteration 1: VCs 1-5 → Updated in Notion
- Iteration 2: VCs 6-10 → Updated in Notion
- Iteration 3: VCs 11-15 → Updated in Notion
- ...continues until all researched

---

## Two Scripts Working Together

### Script 1: `phase2-verify-batch.js`
**Purpose:** Check completion status and identify next batch

```bash
# Run manually to check progress
node phase2-verify-batch.js

# Output:
# ✅ Researched: 5
# ⚠️  Partial: 2
# ❌ Not researched: 8
# 🎯 Completion: 35.7%
# 📝 Next Batch: [VC6, VC7, VC8, VC9, VC10]
```

### Script 2: `schedule-batch-iterations.js`
**Purpose:** Orchestrate iterative batches via cron

```bash
# Setup cron job
node schedule-batch-iterations.js

# Manual iteration
ITERATION=1 node schedule-batch-iterations.js run
```

---

## Workflow Per Iteration

```
Iteration N:
├─ 1. Check unresearched VCs in Notion
├─ 2. Take first 5 that need research
├─ 3. Post request to Discord
├─ 4. Wobblus spawns sub-agents (sessions_spawn)
├─ 5. Sub-agents execute web_search + web_fetch
├─ 6. Save results to /tmp/vc-research-[name].json
├─ 7. Script detects files
├─ 8. Verify data (email + summary + pain points)
├─ 9. Update Notion with results
├─10. Mark as "Ready for outreach"
└─ 11. Next iteration via cron (4 hours later)
```

---

## Status Classification

### ✅ Researched (Complete)
- Has: Email + Summary + Pain Points
- Edited: Within 24 hours
- Status: "Ready for outreach"
- Action: Skip in next iteration

### ⚠️ Partial
- Has: 1-2 of (Email, Summary, Pain Points)
- Edited: Anytime
- Status: "Needs completion"
- Action: Include in next batch

### ❌ Not Researched
- Has: Only Name
- Last edited: Anytime
- Status: "Pending research"
- Action: Include in next batch

### 🔄 Needs Retry
- Has: All data
- Edited: >24 hours ago
- Status: "Stale (may need refresh)"
- Action: Include later iterations

---

## Verification & Completion Checks

### Verification Script Output

```json
{
  "timestamp": "2026-02-16T11:18:00Z",
  "summary": {
    "total": 50,
    "researched": 15,
    "partial": 3,
    "not_researched": 32,
    "completion_rate": 30.0
  },
  "next_batch": ["VC16", "VC17", "VC18", "VC19", "VC20"],
  "phase3_ready": false
}
```

### Completion Threshold

**Phase 3 is ready when:** ≥80% researched

- 0-79%: Keep iterating
- 80%+: Can draft emails (Phase 3)
- 100%: All VCs have data

---

## Cron Setup (OpenClaw)

```bash
# Check cron jobs
cron list

# Add batch research job
cron add \
  --schedule "0 */4 * * *" \
  --sessionTarget isolated \
  --payload.kind agentTurn \
  --payload.message "Run Phase 2 batch research iteration" \
  --name "Phase 2: Batch VC Research"

# Manual trigger
cron run --jobId [job-id]

# View runs
cron runs --jobId [job-id]
```

---

## Example Timeline

**Day 1:**
- 08:00 - Iteration 1: Research VCs 1-5 → 5 added ✅
- 12:00 - Iteration 2: Research VCs 6-10 → 5 added ✅ (10/50 = 20%)
- 16:00 - Iteration 3: Research VCs 11-15 → 5 added ✅ (15/50 = 30%)
- 20:00 - Iteration 4: Research VCs 16-20 → 5 added ✅ (20/50 = 40%)

**Day 2:**
- 00:00 - Iteration 5: Research VCs 21-25 → 5 added ✅ (25/50 = 50%)
- 04:00 - Iteration 6: Research VCs 26-30 → 5 added ✅ (30/50 = 60%)
- 08:00 - Iteration 7: Research VCs 31-35 → 5 added ✅ (35/50 = 70%)
- 12:00 - Iteration 8: Research VCs 36-40 → 5 added ✅ (40/50 = 80%) → **READY FOR PHASE 3** ✅
- 16:00 - Iteration 9: Research VCs 41-45 → 5 added ✅ (45/50 = 90%)
- 20:00 - Iteration 10: Research VCs 46-50 → 5 added ✅ (50/50 = 100%) → **COMPLETE** ✅

**Total: 2 days to complete 50 VCs**

---

## Key Features

✅ **Incremental:** Work at manageable pace  
✅ **Verifiable:** Check progress anytime  
✅ **Automatic:** Cron handles scheduling  
✅ **Smart:** Skips already-researched VCs  
✅ **Trackable:** Timestamps show what's done  
✅ **Flexible:** Can adjust batch size or interval  
✅ **Resilient:** Partial failures don't block progress  

---

## Running the Verification

Check progress anytime:

```bash
# See current status
node phase2-verify-batch.js

# Output tells you:
# - How many complete ✅
# - How many partial ⚠️
# - How many need research ❌
# - Next 5 VCs to research
# - When Phase 3 is ready
```

---

## Integration Points

### With Discord
- Each iteration posts to #alygn channel
- Shows which batch is being researched
- Provides transparency on progress

### With Wobblus (Me)
- I see Discord message
- I spawn sub-agents for the 5 VCs
- Sub-agents do web_search/web_fetch
- Save results to /tmp/
- Script picks up results

### With Notion
- Script verifies and updates each VC
- Marks as "Ready for outreach"
- Tracks timestamp of update
- Next iteration skips these

---

## Next Phase

Once 80%+ are researched, proceed to **Phase 3: Email Drafting**

```bash
node phase3-draft-outreach-emails.js
```

This generates personalized emails for all researched VCs.

---

**Document:** 2026-02-16  
**Strategy:** Batch-based incremental research with cron scheduling  
**Batch size:** 5 VCs  
**Interval:** Every 4 hours  
**Completion target:** 80% for Phase 3 readiness
