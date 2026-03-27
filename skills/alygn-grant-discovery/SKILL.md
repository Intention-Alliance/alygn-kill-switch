---
name: alygn-grant-discovery
description: Automated AI safety grant discovery, deep research, alignment validation, and pipeline management for ALYGN. Uses Grok, Perplexity, and Firecrawl for multi-source discovery; writes to Notion Grant Opportunities Tracker and delivers reports to Tania via email and Discord.
metadata: {"openclaw":{"emoji":"🔍","requires":{"bins":["node","bash"],"env":["NOTION_API_KEY","GROK_API_KEY","PERPLEXITY_API_KEY","FIRECRAWL_API_KEY","SMTP_PASSWORD"],"os":["linux","darwin"]}}}
---

# ALYGN Grant Discovery Skill

**Purpose:** Automated AI safety grant discovery, deep research, alignment validation, and tracking for ALYGN's funding strategy.

**Status:** Architecture complete — implementation pending  
**Target:** Federal agencies, private foundations, corporate responsible AI programs  
**Pipeline:** discover → research → validate → score → notify

---

## Quick Start

```bash
# Full discovery pipeline
node bin/alygn-grant-discovery --action=pipeline --full

# Discover new grants (dry run)
node bin/alygn-grant-discovery --action=discover --limit=50 --dry-run

# Monitor deadlines (next 7 days)
node bin/alygn-grant-discovery --action=monitor-deadlines --days=7

# Generate report for Tania
node bin/alygn-grant-discovery --action=report --format=email --recipient=tania

# Sync Notion + recalculate scores
node bin/alygn-grant-discovery --action=sync-notion --recalculate-scores
```

---

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--action` | Phase: `pipeline`, `discover`, `research`, `validate`, `score`, `notify`, `monitor-deadlines`, `sync-notion`, `report` | `pipeline` |
| `--full` | Run all phases | false |
| `--limit` | Max grants to process | 50 |
| `--dry-run` | Simulate without writing to Notion | false |
| `--grant-type` | Filter: `federal`, `private`, `corporate`, `research-institution` | all |
| `--min-score` | Minimum ALYGN fit score | 0 |
| `--days` | Deadline window for monitoring | 14 |
| `--format` | Report format: `email`, `discord`, `analysis` | `email` |
| `--recipient` | Email recipient alias | `tania` |
| `--channel` | Discord channel name | `alygn-grants` |

---

## Architecture

See `ARCHITECTURE.md` for full system design including:
- Directory structure
- Class hierarchy (GrantEntity, DiscoveryStrategy, ResearchStrategy, ScoringStrategy)
- Data flow diagrams
- Notion database schema
- Cron job specifications
- Scoring weight configuration

---

## Discovery Sources

| Source | Method | Output |
|--------|--------|--------|
| **Grok** | Search queries + synthesis | Grant names, amounts, deadlines |
| **Perplexity** | Deep research with citations | Detailed grant descriptions, eligibility |
| **Firecrawl** | Site scraping (nsf.gov, openphilanthropy.org, etc.) | Requirements, application materials |
| **Cross-reference** | Multi-source merge + deduplication | Unified GrantEntity objects |

---

## Notion Database

**Database:** Grant Opportunities Tracker  
**Status Flow:** `discovered` → `researched` → `validated` → `scored` → `submitted` → `awarded/rejected/closed`

**Key Properties:**
- `ALYGN Fit Score` (1-10): Mission alignment
- `Priority Score`: Composite deadline urgency × amount × confidence
- `Eligibility Confidence` (0-1): Likelihood ALYGN qualifies
- `Key Requirements`: Top eligibility/app requirements
- `Application Complexity`: Low / Medium / High

---

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Weekly Full Discovery | Monday 8 AM | Full pipeline run |
| Daily Deadline Monitor | Weekdays 9 AM | Flag approaching deadlines |
| Daily Notion Sync | Weekdays 10 AM | Recalculate scores |
| Weekly Email Report | Friday 11 AM | Summary to Tania |
| Weekly Discord Digest | Friday 12 PM | Channel digest |

---

## Credentials

Required environment variables (see `config/credentials.json.example`):
- `NOTION_API_KEY` — Notion integration token
- `GROK_API_KEY` — Grok search API
- `PERPLEXITY_API_KEY` — Perplexity API
- `FIRECRAWL_API_KEY` — Firecrawl scraping API
- `SMTP_PASSWORD` — Gmail app password (for email reports)

---

## Contact

**Owner:** Andler + Wobblus  
**Architect:** Hugrukal  
**Reference:** `alygn-vc-outreach` (v2.0 patterns)
