---
name: alygn-muni-outreach
description: Municipal outreach sub-skill for Alygn. Delegates execution to alygn-outreach parent skill with --type=municipal configuration. Handles municipal-specific edge cases, wave tracking, and TRAIGA Act personalization.
metadata:
  openclaw:
    emoji: "🏛️"
    parent_skill: alygn-outreach
    skill_type: sub-skill
    entity_type: municipal
    requires:
      bins: [node, bun, bash]
      env:
        - FIRECRAWL_API_KEY
        - SUPABASE_URL
        - SUPABASE_SERVICE_KEY
        - PERPLEXITY_API_KEY
        - BRAVE_API_KEY
        - ZEROBOUNCE_API_KEY
        - SMARTLEAD_API_KEY
        - SMTP_SERVER
        - SMTP_PORT
        - SMTP_USER
        - SMTP_PASS
        - GROK_API_KEY
      os: [linux, darwin]
    delegates_to: alygn-outreach
    delegate_command: "bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal"
    lobster: ".lobster/alygn-muni-outreach.lobster"
---

# Alygn Municipal Outreach Skill

**Purpose:** Municipal outreach automation for Alygn's AI governance campaign. Delegates all execution to the unified `alygn-outreach` parent skill with municipal-specific configuration.

**Status:** Development (CR Pilot — 82 cantones)

**Target:** 100,000 municipalities across 6 waves

**Parent Skill:** [alygn-outreach](../alygn-outreach/SKILL.md)

---

## ⚠️ DELEGATION NOTICE

This is a **configuration sub-skill**. All pipeline execution delegates to the unified parent skill.

**DO NOT** implement outreach logic, pipeline stages, or sending mechanisms here. Use the parent skill for all execution.

### Delegate Command
```bash
# All actions route through alygn-outreach with --type=municipal
bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal [action] [options]
```

### Parent Skill Location
```
$HOME/.agents/skills/alygn-outreach/
├── SKILL.md              # Master documentation
├── bin/alygn-outreach.ts # Unified CLI entry point
├── src/
│   ├── core/Pipeline.ts  # Orchestrator
│   ├── entities/         # VCEntity, MunicipalEntity
│   └── strategies/       # Municipal-specific strategies
└── .lobster/             # No lobster here — use sub-skill lobster
```

---

## Municipal-Specific Decision Framework

The parent skill provides the base decision framework. This sub-skill defines **municipal-specific thresholds**.

### Risk Levels (Municipal Context)

| Level | Threshold | Action Required | Examples |
|-------|-----------|-----------------|----------|
| **Low** | ≤50 entities, routine ops | Execute autonomously | Batch research, DB updates, X-warmup tracking |
| **Medium** | 51-200 entities, regional | Present recommendation | Wave activation, template variant selection, priority ranking |
| **High** | >200 entities, new region | ALWAYS confirm before execute | New country activation, budget decisions, template changes |

### Municipal-Specific Rules

1. **Wave-based batching** — Municipalities processed in waves (6 total)
2. **Spanish language** — All outreach in Spanish with institutional tone
3. **TRAIGA Act focus** — Personalization centered on AI governance readiness
4. **X-warmup first** — X engagement before email (follow → like → quote → reply)
5. **Supabase primary** — ALL status tracking in Supabase, Notion for approval only

---

## Municipal-Specific Edge Cases

### 1. X-Warmup Before Email

**Trigger:** Municipality ready for email but X-warmup incomplete

**Protocol:**
- Phase 1: Follow + Like (Day 1-2)
- Phase 2: Quote + Reply (Day 3-4)
- Mark `x_warmup_phase1_at` and `x_warmup_phase2_at` in Supabase
- Only proceed to email when `x_warmup_phase2_at IS NOT NULL`
- Check `v_ready_for_email` view for qualified municipalities

**Sub-skill override:** X-warmup engagement managed by `x-warmup` skill.

### 2. No Mayor Email Available

**Trigger:** Municipality has only `general_email` or `council_emails`

**Protocol:**
- Use `general_email` as fallback
- Research mayor name via Perplexity + Firecrawl
- Try pattern: `alcalde@muniname.go.cr`
- If still no email, mark for manual research
- NEVER send to council-only without mayor identification

### 3. Wave Checkpoint Recovery

**Trigger:** Previous wave failed mid-execution

**Protocol:**
- Check `checkpoints` table in Supabase
- Resume from `last_processed_id`
- Use `--resume-from=<checkpoint>` flag
- Log recovery in `$HOME/.openclaw/workspace/logs/muni-outreach/`

### 4. Batch Status Mismatch

**Trigger:** Municipality `batch_status` doesn't match expected pipeline stage

**Valid transitions:**
```
researched → drafted → approved → sent → failed
```

**Invalid transitions (require manual review):**
```
approved → researched
sent → drafted
failed → approved (without re-research)
```

### 5. Context Window Overflow

**Trigger:** >100 municipality records loaded into context

**Protocol:**
- NEVER load more than 100 records at once
- Use `batch_size=50` default
- Paginate with `offset` + `limit`
- ALWAYS checkpoint after each batch

### 6. Translation Quality Gates

**Trigger:** Municipal outreach requires Spanish content

**Protocol:**
- Use `translation-qa` sub-skill for quality assurance
- Translator agent + Reviewer agent + Decision agent
- Max 3 iterations, quality threshold 0.85
- All templates pre-approved by Tania before wave activation

---

## Wave Architecture

### 6-Cronjob Pipeline

| Cronjob | Schedule | Purpose | Status Field |
|---------|----------|---------|--------------|
| `research-wave` | Daily 9:00 AM | Discover + research municipalities | `researched` |
| `draft-wave` | Daily 10:00 AM | Generate email drafts | `drafted` |
| `approve-wave` | Manual trigger | Human review and approval | `approved` |
| `send-wave` | Daily 2:00 PM | Send approved emails | `sent` |
| `track-wave` | Hourly | Monitor replies and engagement | `replied` |
| `report-wave` | Weekly Monday | Generate analytics | — |

### Wave Tracking Fields

| Field | Type | Description |
|-------|------|-------------|
| `wave_number` | INTEGER | Wave 1-6 |
| `wave_date` | DATE | Assignment date |
| `batch_status` | TEXT | `researched` \| `drafted` \| `approved` \| `sent` \| `failed` |

---

## Parameters & Defaults

| Parameter | Municipal Default | Description |
|-----------|-------------------|-------------|
| `--type` | `municipal` | Fixed by sub-skill |
| `--region` | `costa-rica` | Default region for pilot |
| `--variant` | `traiga` | Email variant: traiga, governance, institutional |
| `--limit` | `10` | Default batch size per run |
| `--language` | `es` | Spanish for municipal outreach |
| `--batch-size` | `50` | Max records per batch |
| `--source` | `directory` | Discovery source |

---

## Lobster Protocol

```bash
# Run municipal outreach campaign
lobster run .lobster/alygn-muni-outreach.lobster
```

### Lobster Phases

| Phase | Command | Description |
|-------|---------|-------------|
| Prelude | `x-growth discovery` | Discover municipal accounts on X |
| Phase 1 | `alygn-outreach.ts --type=municipal --action=discover` | Discover municipalities |
| Phase 2 | `alygn-outreach.ts --type=municipal --action=validate` | Validate emails |
| Phase 3 | `alygn-outreach.ts --type=municipal --action=research` | Research municipalities |
| Phase 4 | `alygn-outreach.ts --type=municipal --action=personalize` | Generate drafts |
| Phase 5 | Human review | Approve/reject in Notion |
| Phase 6 | `alygn-outreach.ts --type=municipal --action=send` | Send approved |
| Phase 7 | `alygn-outreach.ts --type=municipal --action=track` | Track replies |
| Phase 8 | `alygn-outreach.ts --type=municipal --action=report` | Weekly report |

---

## Supabase Schema (Relevant Tables)

### municipalities
```sql
id UUID PRIMARY KEY,
name TEXT NOT NULL,
country TEXT NOT NULL,
region TEXT,
province TEXT,
population INTEGER,
website_url TEXT,
mayor_name TEXT,
mayor_email TEXT,
general_email TEXT,
council_emails TEXT[],
phone TEXT,
x_handle TEXT,
x_url TEXT,
discovered_at TIMESTAMPTZ DEFAULT NOW(),
researched_at TIMESTAMPTZ,
verified_at TIMESTAMPTZ,
outreach_sent_at TIMESTAMPTZ,
replied_at TIMESTAMPTZ,
reply_sentiment TEXT,
wave_number INTEGER DEFAULT 1,
batch_status TEXT DEFAULT 'researched',
wave_date DATE,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### Key Views
- `v_pipeline_summary` — Counts by wave
- `v_x_warmup_status` — Warmup phase tracking
- `v_ready_for_email` — Municipalities ready for email

---

## Quick Reference

### Discovery (Costa Rica)
```bash
bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=municipal --region=costa-rica --action=discover --limit=10 --dry-run
```

### Full Pipeline (Dry Run)
```bash
USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=municipal --region=costa-rica --action=pipeline --limit=10 --dry-run
```

### Send Approved (Production)
```bash
bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=municipal --action=send \
  --draft-status=Approved \
  --email-send-to=entity-id-1,entity-id-2 \
  --rate-limit=30
```

---

## References

- **Parent Skill:** `skills/alygn-outreach/SKILL.md`
- **X-Warmup Skill:** `skills/x-warmup/SKILL.md`
- **Translation QA:** `skills/translation-qa/SKILL.md`
- **Lobster:** `.lobster/alygn-muni-outreach.lobster`
- **Scripts:** `$HOME/.agents/skills/alygn-outreach/src/`
- **CLI:** `$HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts`
- **Supabase:** `scripts/alygn/muni-outreach/supabase/`

---

**Created:** 2026-03-04
**Updated:** 2026-04-23 (delegation pattern, parent skill reference)
**Status:** Development (CR Pilot)
