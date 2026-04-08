# Municipal Outreach Campaign Workflow - Evening (Research)

Run municipal outreach via Lobster below:

```yaml
name: alygn-campaign
description: Costa Rica municipal outreach pilot (82 cantones) campaign with personalization - using alygn-outreach skill
metadata:
  project: alygn
  type: muni-outreach
  wave: [latest-wave-number] + 1
  script: `cd $HOME/.openclaw/workspace && lobster run .lobster/alygn-muni-outreach.lobster`
```

## Execution

This cronjob runs the `discover` and `research` phases to populate tomorrow's wave.

### 1. Load Tomorrow's Wave File

- Tomorrow's wave file: `/tmp/waves/MUNI/YYYY-MM-DD.json` (calculated from current date + 1)
- If it doesn't exist, create it with an empty entity list and metadata header
- Alternatively, check the research queue at `/tmp/waves/MUNI/research-queue.json` for prioritized targets

### 2. Query Supabase for Uncontacted Municipalities

- Connect to Alygn Supabase database
- Query municipalities table for:
  - `contact_status = 'uncontacted'` OR `contact_status IS NULL`
  - `last_research_date IS NULL` OR older than 30 days
  - Prioritize Costa Rica municipalities (San José, Cartago, Heredia, Alajuela, Limón, Puntarenas, Guanacaste provinces)
- Select batch size: 10-15 municipalities per day

### 3. Research Mayor Names and Contact Information

For each selected municipality:

- **Research mayor name**: Search official municipal websites, government directories
- **Find contact email**: Look for:
  - Municipalidad email pattern (e.g., `alcalde@municipalidad-[name].go.cr`)
  - General contact email on official website
  - Planning/permits department emails
- **Gather context**:
  - Population size
  - Recent projects or initiatives (construction, urban planning)
  - Current challenges (permitting backlogs, code enforcement needs)
  - TRAIGA Act relevance (transparency/accountability focus)

### 4. Filter and Prioritize

- Score each municipality based on:
  - Population size (larger = higher priority)
  - Infrastructure activity (active projects = higher priority)
  - Digital presence (modern website suggests tech openness)
  - Previous tool mentions (OpenGov, permitting systems, etc.)
- Mark selected entities status as `researched`

### 5. Write to Tomorrow's Wave File

Populate the wave file with new entities, each containing:

- `entity_id` (unique identifier)
- `municipality_name` (official name)
- `province` (Costa Rica province)
- `population` (approximate)
- `mayor_name` (current mayor)
- `mayor_email` (primary contact)
- `department_email` (planning/permits if available)
- `website` (official URL)
- `recent_projects` (list of 1-3 recent initiatives)
- `traiga_relevance` (how TRAIGA Act applies)
- `source` (research method/link)
- `qualification_score` (1-10)
- `status: "researched"`
- `created_at` (ISO timestamp)

### 6. Post Summary to Discord

```txt
🔬 [alygn-muni-evening] — Tomorrow's Municipal Wave Ready
• Researched: X new municipalities
• Provinces: [List of provinces covered]
• Mayors identified: Y contacts found
• Wave file: /tmp/waves/MUNI/YYYY-MM-DD.json
• Pipeline total: Z municipalities in queue
```

## Lobster File

`~/.openclaw/workspace/.lobster/alygn-vc-outreach.lobster`
_(Same lobster file as VC — context/target-type flag differentiates behavior)_

## Phases

- `phase1-source` — Query Supabase for uncontacted municipalities
- `phase2-qualify` — Score municipalities based on population, projects, fit
- `phase3-enrich` — Gather mayor names, emails, and municipal context

## Expected Outcomes

- Tomorrow's wave file contains X new `researched` municipalities
- Each entity has mayor name and at least one contact method
- Discord receives a clear research summary with pipeline health metrics

## On Success

- Tomorrow's wave file created/updated with `researched` municipalities
- Research queue updated (mark municipalities as `in_progress`)
- Post to Discord: `✅ [alygn-muni-evening] Complete — X municipalities queued for tomorrow`
- Log research session to `/tmp/waves/MUNI/logs/research-log.json`

## On Failure

- If Supabase query fails: post to Discord `⚠️ [alygn-muni-evening] Database query failed — check Supabase connection` and exit
- If Phase 3 (enrich) fails for a municipality: skip that entity (do not add to wave), log it, continue with others
- If wave file cannot be written: attempt to write to a temp location and alert via Discord
- Log all errors to `/tmp/waves/MUNI/logs/error-log.json`

## Notes

- **Spanish focus**: All research should target Spanish-speaking contacts and sources
- **TRAIGA Act angle**: Municipalities with transparency initiatives are higher priority
- **Costa Rica focus**: Prioritize Costa Rican municipalities; expand to LATAM later
- **Data compliance**: Respect public records laws when gathering contact information
- If tomorrow is a weekend/holiday, still run research but flag wave file accordingly (the morning cron will check for a `skip_weekend` flag)
- Keep the pipeline full: if tomorrow's wave will have < 5 municipalities, pull additional targets from the backlog
- **Rate limiting**: Respect municipal website scraping limits — add delays between requests

## Important

- Revise the researched municipalities if email is already sent.
  - Only research municipalities that hasn't been contacted yet.
- Follow each step as it is. **No shortcuts allowed**.
- First read the instructions before running the lobster file.
- Run lobster first. If fails, read the lobster file and follow the steps instructions.
- Avoid updating code and finding your own solutions. Stop and report.
- You are reaching out municipalities, ensure to do all validations as described before email send.
- Provide a snippet of the email draft personalization, so as the Mayor/Politician Figure name and the draft id to quickly identify which to approve/reject.
- Once a Draft is approved by chat, ensure updating database references (Supabase).
  - Verifying database schema is a must if required to.

## Schedule

**Time:** 7:00 PM daily (Mon-Fri)
**Purpose:** Research next batch of municipalities for tomorrow's wave
**Discord Thread:** 1486784946134712500

## Test Mode

Add `--dry-run` flag for testing without using API credits.
