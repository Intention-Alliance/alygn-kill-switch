# ALYGN Grant Discovery Skill

Automated AI safety grant discovery, deep research, alignment validation, and pipeline management for ALYGN.

## Architecture

This skill mirrors the `alygn-vc-outreach` pipeline pattern but for grant opportunities:

```
discover → research → validate → score → notify
```

### Directory Structure

```
alygn-grant-discovery/
├── ARCHITECTURE.md           # Full architecture document
├── SKILL.md                  # Skill definition
├── README.md                 # This file
├── src/
│   ├── entities/
│   │   └── GrantEntity.js    # Grant entity (name, amount, deadline, eligibility)
│   ├── strategies/
│   │   ├── discovery/
│   │   │   ├── GrokDiscoveryStrategy.js       # Grok search
│   │   │   ├── PerplexityDiscoveryStrategy.js  # Perplexity deep search
│   │   │   ├── FirecrawlDiscoveryStrategy.js   # Site scraping
│   │   │   └── CrossReferenceStrategy.js       # Multi-source merge/dedup
│   │   ├── research/
│   │   │   ├── DeepResearchStrategy.js         # Multi-source synthesis
│   │   │   └── EligibilityResearchStrategy.js  # ALYGN eligibility check
│   │   └── scoring/
│   │       ├── AlygnFitScorer.js   # Mission alignment score (1-10)
│   │       └── PriorityScorer.js    # Deadline × amount × confidence
│   ├── core/
│   │   ├── PipelineOrchestrator.js  # Cron-triggered master runner
│   │   ├── StateManager.js          # Pipeline state persistence
│   │   └── NotificationService.js   # Email/Discord/WhatsApp delivery
│   └── notion/
│       └── GrantDatabase.js          # Notion API wrapper
├── config/
│   ├── discovery-sources.json       # Search queries per source
│   ├── scoring-weights.json         # Scoring factor weights
│   ├── notification-channels.json   # Email/Discord/Slack configs
│   └── credentials.json.example     # API key template
└── templates/
    ├── grant-analysis-report.md
    ├── summary-email-tania.md
    └── discord-notification.md
```

## Discovery Sources

| Source | Method | Output |
|--------|--------|--------|
| **Grok** | Search queries + synthesis | Grant names, amounts, deadlines |
| **Perplexity** | Deep research with citations | Detailed descriptions, eligibility |
| **Firecrawl** | Site scraping (nsf.gov, etc.) | Requirements, application materials |
| **Cross-reference** | Multi-source merge + dedup | Unified GrantEntity objects |

## Notion Database

**Database:** Grant Opportunities Tracker

**Status Flow:**
```
discovered → researched → validated → scored → submitted → awarded/rejected/closed
```

**Key Properties:**
- `ALYGN Fit Score` (1-10): Mission alignment
- `Priority Score`: Composite deadline urgency × amount × confidence
- `Eligibility Confidence` (0-1): Likelihood ALYGN qualifies
- `Key Requirements`: Top eligibility/app requirements
- `Application Complexity`: Low / Medium / High

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Weekly Full Discovery | Monday 8 AM | Full pipeline run |
| Daily Deadline Monitor | Weekdays 9 AM | Flag approaching deadlines |
| Daily Notion Sync | Weekdays 10 AM | Recalculate scores |
| Weekly Email Report | Friday 11 AM | Summary to Tania |
| Weekly Discord Digest | Friday 12 PM | Channel digest |

## Usage

```bash
# Full pipeline
node bin/alygn-grant-discovery --action=pipeline --full

# Discover only
node bin/alygn-grant-discovery --action=discover --limit=50 --dry-run

# Monitor deadlines
node bin/alygn-grant-discovery --action=monitor-deadlines --days=7

# Report to Tania
node bin/alygn-grant-discovery --action=report --format=email --recipient=tania
```

## Port from VC Outreach

| VC Outreach | Grant Discovery |
|-------------|-----------------|
| `VCEntity` | `GrantEntity` |
| `VCDiscoveryStrategy` | `DiscoveryStrategy` (multi-source) |
| `PainPointExtractor` | `AlignmentValidator` |
| `OutreachOrchestrator` | `PipelineOrchestrator` |
| `ReplyTracker` | `DeadlineMonitor` |
| `WeeklyReport` | `GrantReportGenerator` |
| `Notion VC DB` | `Notion Grant DB` |

## Status

**Architecture:** Complete  
**Implementation:** Skeleton in place, API integrations pending credentials

See `ARCHITECTURE.md` for complete design specification.
