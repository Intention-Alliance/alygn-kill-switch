# VC Outreach — Evening (Research)

**Schedule:** 6:00 PM daily (Mon-Fri)
**Purpose:** Research new VC contacts and populate tomorrow's wave
**Discord Thread:** 1486784711928975460

---

## Prerequisites

- Notion VC Outreach database is accessible for querying uncontacted VCs
- Lobster file `.lobster/alygn-vc-outreach.lobster` is present and functional
- Discord thread 1486784711928975460 is active for posting tomorrow's wave summary
- Review `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md` for discovery and research phase details

---

## Instructions

1. **Read the skill documentation**
   → `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md`
   → Focus on `phase1-source`, `phase2-qualify`, and `phase3-enrich` phases

2. **Prepare tomorrow's wave file**
   → Tomorrow's wave file: `$HOME/.openclaw/workspace/reports/alygn/vc-waves/YYYY-MM-DD.json` (current date + 1)
   → If it doesn't exist, create it with an empty entity list and metadata header:
     ```json
     {
       "wave_date": "YYYY-MM-DD",
       "wave_type": "vc",
       "entities": [],
       "created_at": "[ISO timestamp]"
     }
     ```

3. **PRE-FLIGHT: Check for already-contacted VCs (Duplicate Prevention)**
   
   Before researching, build exclusion list from multiple sources:
   
   **3a. Check sent-emails.json for already-sent VCs:**
   ```bash
   cat ~/.openclaw/workspace/scripts/alygn/lib/sent-emails.json | jq -r '.vcs[].vcName' | sort -u > /tmp/already-sent-vcs.txt
   ```
   
   **3b. Check wave-state.json for completed entities:**
   ```bash
   cat ~/.openclaw/workspace/reports/alygn/vc-waves/wave-state.json | jq -r '.completedEntities | keys[] as $k | .[$k].vcName' 2>/dev/null | sort -u >> /tmp/already-sent-vcs.txt
   ```
   
   **3c. Query Notion for contacted VCs:**
   ```bash
   # Query Notion database for VCs with Status: Contacted, Sent, Replied, Meeting
   curl -s -X POST "https://api.notion.com/v1/databases/${NOTION_VC_DATASOURCE_ID}/query" \
     -H "Authorization: Bearer ${NOTION_TOKEN}" \
     -H "Content-Type: application/json" \
     -H "Notion-Version: 2022-06-28" \
     -d '{
       "filter": {
         "or": [
           {"property": "Status", "select": {"equals": "Contacted"}},
           {"property": "Status", "select": {"equals": "Sent"}},
           {"property": "Status", "select": {"equals": "Replied"}},
           {"property": "Status", "select": {"equals": "Meeting"}}
         ]
       }
     }' | jq -r '.results[].properties.Name.title[0].text.content' >> /tmp/already-sent-vcs.txt
   ```
   
   **3d. Consolidate exclusion list:**
   ```bash
   sort -u /tmp/already-sent-vcs.txt > /tmp/exclude-vcs.txt
   echo "📊 Exclusion list count: $(wc -l < /tmp/exclude-vcs.txt) VCs already contacted"
   ```

4. **Query Notion for uncontacted VCs (with filtering)**
   → Query VC Outreach database for records where:
     - `contact_status = 'uncontacted'` OR `contact_status IS NULL`
     - `last_research_date IS NULL` OR older than 30 days
   → **FILTER OUT** any VCs in `/tmp/exclude-vcs.txt`
   → Select batch size: 10–15 VCs per day
   → These become tomorrow's research targets

4. **Run Phase 1 (Discover) via the alygn-outreach CLI**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=vc \
     --action=discover \
     --limit=15 \
     --dry-run   # Use --dry-run to avoid API credits during testing
   ```
   → Lobster file: `.lobster/alygn-vc-outreach.lobster`

5. **Run Phase 2 (Qualify) on discovered entities**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=vc \
     --action=qualify \
     --input=$HOME/.openclaw/workspace/reports/alygn/vc-waves/YYYY-MM-DD.json \
     --limit=15 \
     --dry-run
   ```
   → Score each VC based on: fund size, thesis alignment, portfolio fit, recent activity

6. **Run Phase 3 (Research) on qualified entities**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=vc \
     --action=research \
     --input=$HOME/.openclaw/workspace/reports/alygn/vc-waves/YYYY-MM-DD.json \
     --limit=10 \
     --dry-run
   ```
   → For each qualified VC, gather:
     - Partner name and role
     - Partner's recent investments/publications
     - Firm's portfolio companies (identify warm intros or overlaps)
     - Best contact email (general + partner-specific)
     - Any Alygn-specific talking points (shared connections, thesis alignment)

7. **Write researched entities to tomorrow's wave file**
   → Each entity should include:
     - `entity_id`, `firm_name`, `partner_name`, `partner_email`
     - `firm_domain`, `fund_size`, `thesis_focus`
     - `recent_deals`, `portfolio_overlap`, `qualification_score`
     - `status: "researched"`, `created_at`

8. **Post summary to Discord**
   → Thread 1486784711928975460:
     ```
     🔬 [alygn-vc-evening] — Tomorrow's VC Wave Ready
     Researched: X new VCs
     Top partners: [List of 2-3 high-priority names]
     Wave file: $HOME/.openclaw/workspace/reports/alygn/vc-waves/YYYY-MM-DD.json
     Pipeline total: Z VCs in queue
     ```

9. **Log research session**
   → Log to: `$HOME/.openclaw/workspace/reports/alygn/vc-waves/logs/research-log.json`
   → Include: session timestamp, VCs researched, any errors encountered

---

## Expected Output

- Tomorrow's wave file contains 10–15 new `researched` VCs
- Each entity has partner name and at least one contact method
- Discord receives a clear research summary with pipeline health metrics
- Notion VC Outreach database updated to reflect `in_progress` status for researched VCs

---

## Error Handling

| Situation | Action |
|---|---|
| Notion query fails | Post `⚠️ [alygn-vc-evening] Database query failed — check Notion connection` to Discord and exit |
| Phase 3 (research) fails for a VC | Skip that entity, log to error-log.json, continue with others |
| Wave file cannot be written | Attempt to write to a temp location and alert via Discord |
| Tomorrow is a weekend/holiday | Still run research; add `skip_weekend: true` flag to wave file metadata |
| Pipeline has < 5 VCs | Pull additional targets from backlog to keep pipeline full |

> **Important:** Do not let a single entity failure halt the entire run. Process all remaining entities.

---

## Test Mode

Add `--dry-run` flag to all phase commands to test without using API credits.
