# Municipal Outreach — Evening (Research)

**Schedule:** 7:00 PM (Sun-Thu)
**Purpose:** Research new municipalities and populate tomorrow's wave
**Discord Thread:** 1486784946134712500

---

## Prerequisites

- Supabase database is accessible for querying uncontacted municipalities
- Lobster file `.lobster/alygn-muni-outreach.lobster` is present and functional
- Discord thread 1486784946134712500 is active for posting tomorrow's wave summary
- Review `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md` for discovery and research phase details

---

## Instructions

1. **Read the skill documentation**
   → `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md`
   → Focus on `phase1-source`, `phase2-qualify`, and `phase3-enrich` phases for municipal outreach

2. **Prepare tomorrow's wave file**
   → Tomorrow's wave file: `$HOME/.openclaw/workspace/reports/alygn/muni-waves/YYYY-MM-DD.json` (current date + 1)
   → If it doesn't exist, create it with metadata header:
     ```json
     {
       "wave_date": "YYYY-MM-DD",
       "wave_type": "municipal",
       "region": "costa-rica",
       "entities": [],
       "created_at": "[ISO timestamp]"
     }
     ```

3. **Query Supabase for uncontacted municipalities**
   → Connect to Alygn Supabase database
   → Query municipalities table for:
     - `contact_status = 'uncontacted'` OR `contact_status IS NULL`
     - `last_research_date IS NULL` OR older than 30 days
   → Prioritize Costa Rica cantones (San José, Cartago, Heredia, Alajuela, Limón, Puntarenas, Guanacaste provinces)
   → Select batch size: 10–15 municipalities per day

4. **Run Phase 1 (Discover) via the alygn-outreach CLI**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=municipal \
     --region=costa-rica \
     --action=discover \
     --limit=15 \
     --dry-run   # Use --dry-run to avoid API credits during testing
   ```
   → Lobster file: `.lobster/alygn-muni-outreach.lobster`

5. **Run Phase 2 (Qualify) on discovered entities**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=municipal \
     --region=costa-rica \
     --action=qualify \
     --input=$HOME/.openclaw/workspace/reports/alygn/muni-waves/YYYY-MM-DD.json \
     --limit=15 \
     --dry-run
   ```
   → Score each municipality based on:
     - Population size (larger = higher priority)
     - Infrastructure activity (active projects = higher priority)
     - Digital presence (modern website suggests tech openness)
     - TRAIGA Act relevance (transparency initiatives)

6. **Run Phase 3 (Research) on qualified entities**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=municipal \
     --region=costa-rica \
     --action=research \
     --input=$HOME/.openclaw/workspace/reports/alygn/muni-waves/YYYY-MM-DD.json \
     --limit=10 \
     --dry-run
   ```
   → For each qualified municipality, gather:
     - Mayor name and current term
     - Contact email (general municipal + planning/permits department)
     - Website URL
     - Recent projects or initiatives (construction, urban planning)
     - Current challenges (permitting backlogs, code enforcement needs)
     - TRAIGA Act relevance (how transparency/accountability applies)

7. **Write researched entities to tomorrow's wave file**
   → Each entity should include:
     - `entity_id`, `municipality_name`, `province`, `population`
     - `mayor_name`, `mayor_email`, `department_email`, `website`
     - `recent_projects`, `traiga_relevance`, `qualification_score`
     - `status: "researched"`, `created_at`

8. **Post summary to Discord**
   → Thread 1486784946134712500:
     ```
     🔬 [alygn-muni-evening] — Tomorrow's Municipal Wave Ready
     Researched: X new municipalities
     Provinces: [List of provinces covered]
     Mayors identified: Y contacts found
     Wave file: $HOME/.openclaw/workspace/reports/alygn/muni-waves/YYYY-MM-DD.json
     Pipeline total: Z municipalities in queue
     ```

9. **Log research session**
   → Log to: `$HOME/.openclaw/workspace/reports/alygn/muni-waves/logs/research-log.json`
   → Include: session timestamp, municipalities researched, provinces covered, any errors

---

## Expected Output

- Tomorrow's wave file contains 10–15 new `researched` municipalities
- Each entity has mayor name and at least one contact method
- Discord receives a clear research summary with pipeline health metrics
- Supabase municipalities table updated to reflect `in_progress` status for researched entries

---

## Error Handling

| Situation | Action |
|---|---|
| Supabase query fails | Post `⚠️ [alygn-muni-evening] Database query failed — check Supabase connection` to Discord and exit |
| Phase 3 (research) fails for a municipality | Skip that entity, log to error-log.json, continue with others |
| Wave file cannot be written | Attempt to write to a temp location and alert via Discord |
| Tomorrow is a weekend/holiday | Still run research; add `skip_weekend: true` flag to wave file metadata |
| Pipeline has < 5 municipalities | Pull additional targets from backlog to keep pipeline full |
| Municipal website scraping fails | Use public records/government directories as fallback, log source |

> **Important:** Do not let a single entity failure halt the entire run. Process all remaining entities.

---

## Notes

- **Spanish focus:** All research should target Spanish-speaking contacts and sources
- **TRAIGA Act angle:** Municipalities with transparency initiatives are higher priority
- **Costa Rica focus:** Prioritize Costa Rican municipalities; expand to LATAM later
- **Rate limiting:** Respect municipal website scraping limits — add delays between requests
- **Data compliance:** Respect public records laws when gathering contact information

---

## Test Mode

Add `--dry-run` flag to all phase commands to test without using API credits.
