# Analysis Report: Previous Outreach Failures

**Prepared by:** Nikaya 🔍 (Code Reviewer)  
**Date:** 2026-03-26  
**Context:** Alygn Outreach - VC vs Municipal Campaign Analysis  
**Sources Reviewed:**
- Discord #annotations channel (past 48 hours, ~100 messages)
- alygn-vc-outreach.lobster workflow file
- alygn-muni-outreach.lobster workflow file  
- alygn-campaign.lobster (municipal)
- alygn-outreach skill files

---

## EXECUTIVE SUMMARY

**Primary Finding:** The VC outreach works while municipal outreach fails due to fundamental architectural differences in data storage, entity ID management, and workflow orchestration. The system is suffering from "context overflow" caused by mixing two different database paradigms (Notion for VC, Supabase for municipal) and attempting to run them through a unified workflow that doesn't properly handle their differences.

---

## SPECIFIC FAILURES IDENTIFIED

### FAILURE 1: Entity ID Mismatch Crisis

**What Happened:**
- Agent generated municipal drafts using custom entity IDs like `muni-alvarado-cartago` and `muni-desamparados-sj`
- These IDs do NOT exist in the Supabase `municipalities` table (which uses UUIDs like `56be6450-c75e-4b1e-871e-859058a44426`)
- When attempting to send emails, the system couldn't match drafts to database records

**Evidence from Discord:**
```
andler.dev: "No. Something is off on all of this. The entity ID doesn't match at all 
with Notion (VC) and Supabase (Municipalities). I see these drafts would be able 
to pass the email send step since these ID MUST match with their reference on 
their databases, otherwise we will fail on running this."
```

**Root Cause:**
- VC workflow uses Notion entity IDs (custom format like `vc-J1XPeT`)
- Municipal workflow uses Supabase UUIDs (format like `56be6450-c75e-4b1e-871e-859058a44426`)
- The agent was generating synthetic IDs instead of querying actual Supabase UUIDs

**Impact:** HIGH - Drafts cannot be linked to database records, blocking the entire send pipeline.

---

### FAILURE 2: Database State Inconsistency

**What Happened:**
- The agent reported municipalities as "sent" that were NOT properly marked in Supabase
- Some had `outreach_sent_at: null` despite being sent the previous day
- Only 5 municipalities existed in Supabase when there should have been 82

**Evidence from Discord:**
```
Wobblus: "I see the issue - these municipalities have `outreach_sent_at: null` 
but we sent to them yesterday."
```

**Root Cause:**
- Discovery phase claimed to find all 82 cantones but didn't actually populate Supabase
- Sent status tracking was inconsistent between local JSON files and Supabase database
- The 82-cantone discovery either failed silently or wasn't saved properly

**Impact:** HIGH - Cannot determine which municipalities have been contacted, leading to duplicate outreach risk.

---

### FAILURE 3: Context Overflow from Mixed Workflow Attempts

**What Happened:**
- The agent attempted to run VC and municipal outreach simultaneously
- Each workflow has different requirements, database schemas, and rate limits
- The agent lost track of which phase each workflow was in
- Multiple "Continue where you left off" messages indicate session/state loss

**Evidence from Discord:**
```
andler.dev: "Continue where you left off. The previous step (2) either failed or timeout."
andler.dev: "Continue where you left off. The previous model either timeout or failed."
```

**Root Cause:**
- The unified `alygn-outreach` skill attempts to handle both VC and municipal but the lobster files define separate workflows
- VC: 3 emails/day, uses Notion for entity tracking
- Municipal: 5 emails/day, uses Supabase for entity tracking
- Mixing them in the same session causes state confusion

**Impact:** CRITICAL - Agent cannot maintain state across workflow restarts, leading to repeated work and data inconsistency.

---

### FAILURE 4: Draft-to-Send Connection Breakdown

**What Happened:**
- The "Two-Filter System" (Draft Status + Explicit Entity IDs) was not properly implemented
- Agent was selecting VCs for sending that didn't match the drafted/personalized content
- This caused generic emails to be sent instead of personalized ones

**Evidence from Discord:**
```
Wobblus: "I've been generating local JSON drafts instead of inserting into the 
correct database tables."

Root Cause: "The outreach workflow expects:
1. VCs: Notion entity IDs + outreach_emails table entries
2. Municipalities: Supabase outreach_emails table (not just municipalities table)"
```

**Root Cause:**
- Drafts were created as local JSON files, not inserted into the `outreach_emails` table
- The send phase expected records in the database to link against
- Entity IDs in drafts didn't match database primary keys

**Impact:** HIGH - Personalized content exists but cannot be linked to actual sends.

---

### FAILURE 5: Rate Limit and Daily Cap Confusion

**What Happened:**
- Agent was confused about daily email limits (5 per type vs 5 total)
- Attempted to mix VC and municipal counts
- Generated 6 drafts total (2 VC + 1 municipal) when expecting 5 per type

**Evidence from Discord:**
```
andler.dev: "You are also mixing the maximum emails. It is 5 per type of outreach 
(10 total), not 5 between those 2."
```

**Root Cause:**
- VC workflow: 3 emails/day, 60-180s delay
- Municipal workflow: 5 emails/day, 60-180s delay
- Agent was treating them as shared quota instead of separate quotas

**Impact:** MEDIUM - Could exceed rate limits or under-utilize daily capacity.

---

## ROOT CAUSE ANALYSIS

### Architecture Problem: Split Data Stores

The fundamental issue is that VC and municipal outreach use **different data stores**:

| Aspect | VC Outreach | Municipal Outreach |
|--------|-------------|-------------------|
| **Primary DB** | Notion | Supabase PostgreSQL |
| **Entity IDs** | Notion page IDs (vc-xxx) | Supabase UUIDs |
| **Draft Storage** | Notion properties | `outreach_emails` table |
| **Status Tracking** | Notion select properties | `outreach_sent_at` timestamp |
| **CLI Command** | `alygn-outreach --type=vc` | `alygn-outreach --type=municipal` |
| **Rate Limit** | 3/day | 5/day |
| **Language** | English | Spanish |
| **Template** | Governance/Technical | TRAIGA Act (governance) |

**Why This Causes Context Overflow:**

1. **Schema Switching Overhead:** The agent must constantly switch between Notion and Supabase mental models
2. **ID Format Confusion:** Custom IDs vs UUIDs require different validation and lookup patterns
3. **State Persistence:** Notion updates via API vs Supabase via Bun CLI utilities
4. **Error Handling:** Different failure modes (Notion API 429 vs Supabase connection errors)

---

### Workflow Problem: Too Many Steps in Single Session

The municipal lobster file defines **7 phases**:
1. Prelude: X Account Discovery
2. Phase 1: Discovery (Firecrawl)
3. Phase 2: Research Mayor Names
4. Phase 2.5: Email Validation
5. Phase 3: Supabase Status Update
6. Phase 4: Personalization
7. Phase 5: Manual Review
8. Phase 5.5: SentEmailTracker Check
9. Phase 6: Email Sending
10. Phase 7: Full Pipeline

**Problem:** Running all phases sequentially in one session exceeds context window and causes timeout/failure. The agent cannot maintain state across this many steps.

**Evidence:** Multiple "Continue where you left off" messages from Andler indicate the agent kept losing context and needing to restart.

---

### Process Problem: Missing State Tracking

The agent has no persistent checkpoint mechanism between phases. When a session fails:
- Discovery results may not be saved
- Research progress is lost
- Draft generation must restart
- Previously sent status is unclear

**The supabase-utils.ts script exists but is not properly integrated** into the workflow orchestration.

---

### Design Problem: Unclear Handoffs Between Phases

Phase transitions require manual approval (Phase 5: "Manual Review") but there's no clear mechanism for:
- How the agent knows which drafts are approved
- How approved drafts link to send phase
- How to resume after human intervention

The two-filter system (`--draft-status=Approved` + `--email-send-to={ids}`) requires precise coordination that wasn't happening.

---

## RECOMMENDATIONS FOR SPLIT ARCHITECTURE

### RECOMMENDATION 1: Separate Lobster Files by Type

**Current State:** Attempting to use unified `alygn-outreach` skill with `--type` flag  
**Recommended State:** Separate lobster files for each outreach type

```
.lobster/
├── alygn-vc-outreach.lobster           # VC-specific workflow
├── alygn-municipal-outreach.lobster    # Municipal-specific workflow
├── alygn-grant-outreach.lobster        # Grant-specific workflow (future)
└── alygn-outreach-orchestrator.lobster # High-level coordinator (optional)
```

**Rationale:**
- Each workflow has different rate limits, databases, and approval checkpoints
- Separating them eliminates context switching overhead
- Allows independent cron scheduling (VC at 9 AM, Municipal at 2 PM)

---

### RECOMMENDATION 2: Implement Phase-Based State Management

**Create a state checkpoint system:**

```yaml
# alygn-municipal-outreach.lobster (revised)
state_management:
  backend: supabase  # or file-based for local dev
  table: outreach_state_checkpoints
  columns:
    - workflow_id: varchar (e.g., "muni-cr-wave1")
    - phase: varchar (e.g., "phase2-research")
    - status: varchar (completed|running|failed)
    - input_file: varchar (path to phase input)
    - output_file: varchar (path to phase output)
    - completed_at: timestamp
    - resumed_from: varchar (previous checkpoint)

phases:
  - id: phase1-discovery
    checkpoint: true  # Save state after this phase
    command: bun alygn-outreach --type=municipal --action=discover
    
  - id: phase2-research
    depends_on: phase1-discovery
    checkpoint: true
    command: bun alygn-outreach --type=municipal --action=research
    
  - id: phase3-validate
    depends_on: phase2-research
    checkpoint: true
    command: bun alygn-outreach --type=municipal --action=validate
    
  - id: phase4-personalize
    depends_on: phase3-validate
    checkpoint: true
    command: bun alygn-outreach --type=municipal --action=personalize
    
  - id: phase5-human-review
    depends_on: phase4-personalize
    checkpoint: true
    requires_approval: true  # Pause for human
    notification:
      channel: discord
      message: "Drafts ready for review at {{output_file}}"
    
  - id: phase6-send
    depends_on: phase5-human-review
    checkpoint: true
    command: bun alygn-outreach --type=municipal --action=send --approved-only
```

**Benefits:**
- Agent can resume from last successful checkpoint
- Human approval gates are explicit
- Failed phases can be retried independently
- Progress tracking is automatic

---

### RECOMMENDATION 3: Entity ID Resolution Layer

**Create an ID mapping utility:**

```typescript
// $HOME/.openclaw/workspace/scripts/alygn/shared/entity-id-resolver.ts
export class EntityIDResolver {
  async resolveEntityID(
    type: 'vc' | 'municipal' | 'grant',
    identifier: string
  ): Promise<ResolvedEntity> {
    switch (type) {
      case 'vc':
        // Query Notion by ID or name
        return await this.notionClient.queryVC(identifier);
        
      case 'municipal':
        // Query Supabase by UUID or name
        return await this.supabaseClient.queryMunicipality(identifier);
        
      case 'grant':
        // Query appropriate store
        return await this.grantStore.query(identifier);
    }
  }
  
  async getDraftEntityIDs(
    type: 'vc' | 'municipal',
    status: 'drafted' | 'approved' | 'rejected'
  ): Promise<string[]> {
    // Returns actual database IDs, not synthetic ones
  }
}
```

**Usage in Lobster:**
```yaml
- id: phase4-generate-drafts
  command: bun alygn-outreach --type=municipal --action=personalize
  post_process:
    - resolve_ids: true  # Convert synthetic IDs to database IDs
    - save_mapping: /tmp/id-mapping.json
    
- id: phase6-send
  command: bun alygn-outreach --type=municipal --action=send
  pre_process:
    - load_mapping: /tmp/id-mapping.json  # Use resolved IDs
```

---

### RECOMMENDATION 4: Simplified Daily Workflow

**Instead of trying to run full pipeline daily, split into discrete tasks:**

**Municipal Workflow (Revised):**

```
Monday:
  - Morning: Run discovery for next 20 municipalities
  - Afternoon: Research mayor names for discovered municipalities

Tuesday:
  - Morning: Validate emails for researched municipalities
  - Afternoon: Generate personalized drafts

Wednesday:
  - Morning: Present drafts for human approval (Discord)
  - Afternoon: Send approved emails (max 5)

Thursday:
  - Morning: Check replies, update Supabase
  - Afternoon: X-warming for next batch

Friday:
  - Morning: Generate weekly report
  - Afternoon: Plan next week's targets
```

**Benefits:**
- Each day has clear, bounded scope
- Human approval gates are natural pause points
- Agent can complete discrete tasks within session limits
- Failure in one day doesn't block others

---

### RECOMMENDATION 5: Enhanced supabase-utils.ts Integration

**Expand the existing utility to handle all state operations:**

```typescript
// Additional actions needed:
- checkpoint-phase: Save phase completion state
- get-last-checkpoint: Resume from last known good state
- get-drafts-for-approval: Query outreach_emails where status='draft'
- update-draft-status: Mark draft as approved/rejected
- get-approved-for-send: Get entity IDs ready for Phase 6
- record-send-attempt: Log attempted sends with message IDs
- record-send-success: Update on successful send
- record-send-failure: Log bounces/failures for retry logic
```

**Usage in Lobster:**
```yaml
- id: phase4-generate-drafts
  command: bun supabase-utils.ts --action=insert-drafts --input=/tmp/drafts.json
  
- id: phase5-get-approved
  command: bun supabase-utils.ts --action=get-approved-for-send --limit=5
  capture_output: /tmp/approved-ids.json
  
- id: phase6-send
  command: bun alygn-outreach --type=municipal --action=send --input=/tmp/approved-ids.json
  post_process:
    - command: bun supabase-utils.ts --action=record-send-success --input=/tmp/sent.json
```

---

### RECOMMENDATION 6: Separate Cron Jobs by Workflow

**Instead of single cron, create separate scheduled tasks:**

```javascript
// VC Outreach Cron (3 emails/day max)
{
  name: "Alygn VC Outreach - Daily Send",
  schedule: "0 9 * * 1-5",  // 9 AM weekdays
  command: "lobster run .lobster/alygn-vc-phase6.lobster",
  timeout: "30m"
}

// Municipal Discovery Cron (weekly)
{
  name: "Alygn Municipal Discovery",
  schedule: "0 8 * * 1",  // Monday 8 AM
  command: "lobster run .lobster/alygn-muni-phase1.lobster",
  timeout: "1h"
}

// Municipal Send Cron (5 emails/day max, different time)
{
  name: "Alygn Municipal Outreach - Daily Send",
  schedule: "0 14 * * 2,4",  // Tuesday/Thursday 2 PM
  command: "lobster run .lobster/alygn-muni-phase6.lobster",
  timeout: "30m"
}

// Reply Tracking (shared, runs frequently)
{
  name: "Alygn Reply Tracking",
  schedule: "0 7,11,15,19 * * 1-5",
  command: "lobster run .lobster/alygn-reply-tracking.lobster",
  timeout: "15m"
}
```

**Benefits:**
- VC and municipal workflows don't compete for agent time
- Different schedules accommodate different rate limits
- Reply tracking is unified (replies come to same inbox)
- Each cron has bounded scope and timeout

---

## PRIORITY ACTIONS

### Immediate (Fix Before Next Run)

1. **Fix Entity ID Mismatch:**
   - Query actual Supabase UUIDs for municipalities
   - Update existing drafts to use correct IDs
   - Create ID mapping file for reference

2. **Verify Database State:**
   - Run `supabase-utils.ts --action=query-pending --limit=100`
   - Identify which municipalities are actually in Supabase
   - Re-run discovery for missing municipalities

3. **Separate VC and Municipal Sessions:**
   - Do NOT attempt both in same session
   - Complete VC workflow first, then start municipal
   - Use different Discord threads if running concurrently

### Short-term (This Week)

4. **Implement Checkpoint System:**
   - Add `--checkpoint` flag to alygn-outreach CLI
   - Save state to `/tmp/alygn-checkpoints/{workflow}/{phase}.json`
   - Add `--resume-from-checkpoint` flag

5. **Create Phase-Specific Lobster Files:**
   - Split alygn-muni-outreach.lobster into:
     - alygn-muni-phase1-discovery.lobster
     - alygn-muni-phase2-research.lobster
     - alygn-muni-phase3-validate.lobster
     - alygn-muni-phase4-personalize.lobster
     - alygn-muni-phase5-review.lobster (human gate)
     - alygn-muni-phase6-send.lobster

6. **Fix Draft-to-Database Linkage:**
   - Ensure `personalize` action INSERTs into `outreach_emails` table
   - Verify `send` action reads from `outreach_emails`, not local files
   - Test with `--dry-run` before production

### Medium-term (Next 2 Weeks)

7. **Build Unified Reporting:**
   - Create cross-workflow dashboard
   - Track total outreach volume (VC + municipal combined)
   - Monitor reply rates by type

8. **Add Retry Logic:**
   - Failed phases should auto-retry with backoff
   - Max 3 attempts per phase before human alert
   - Alert Discord #annotations on persistent failures

---

## CONCLUSION

The outreach system is fundamentally sound in its design but suffers from implementation complexity when VC and municipal workflows are mixed. The split architecture recommendation will:

1. **Eliminate context overflow** by reducing per-session scope
2. **Fix ID mismatch issues** by using database-native identifiers
3. **Enable reliable resumption** via checkpoint system
4. **Prevent duplicate sends** via proper state tracking
5. **Support human-in-the-loop** via explicit approval gates

The VC workflow has been proven to work when executed in isolation. The municipal workflow should be given the same isolation and proper state management to achieve similar reliability.

**Next Step:** Approve the split architecture and begin implementing phase-specific lobster files, starting with Phase 1 (Discovery) for municipal outreach.

---

**Report Prepared By:** Nikaya 🔍  
**Status:** Complete  
**Distribution:** Wobblus (Lead Orchestrator), Andler
