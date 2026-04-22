# Alygn Outreach Pipeline

Automated outreach pipeline for VC and municipal (Costa Rica) campaigns with personalization, dedup, and email validation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Pipeline Flow                         │
│                                                         │
│  Discover → Validate → Research → Personalize → Review │
│      ↓          ↓          ↓           ↓          ↓    │
│  [Supabase]  [ZeroBounce] [Perplexity] [Grok]  [Human] │
│      ↓                               ↓                  │
│  municipalities table          outreach_emails          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Data Source Priority: Remote DB First            │   │
│  │  1. Supabase (outreach_emails, municipalities)   │   │
│  │  2. Notion API (VC tracker, dedup)               │   │
│  │  3. Local cache (fallback only, never source)     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** All reads go to remote DBs (Supabase/Notion) first. Local JSON files are legacy artifacts, NOT the source of truth. The `SentEmailTracker` queries Supabase `outreach_emails` table, not `sent-emails.json`.

## Environment Variables

Required (loaded from `~/.openclaw/workspace/config/credentials.json` if not set as env vars):

| Variable | Source | Purpose |
|---|---|---|
| `SUPABASE_URL` | credentials.json → supabase.url | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | credentials.json → supabase.serviceKey | DB read/write access |
| `NOTION_KEY` | credentials.json → notion.apiKey | Notion API auth |
| `NOTION_VC_DATABASE_ID` | credentials.json → notion.databases.vc_outreach | VC dedup queries |
| `PERPLEXITY_API_KEY` | credentials.json → perplexity | Deep research (optional) |
| `FIRECRAWL_API_KEY` | credentials.json → firecrawl | Web scraping (optional) |
| `ZBOUNCE_API_KEY` | credentials.json → zerobounce | Email validation |
| `SMARTLEAD_API_KEY` | credentials.json → smartlead | Email sending |

## Usage

### Basic Commands

```bash
# VC Outreach (dry-run, mock data)
bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=discover --limit=5 --dry-run

# Municipal Outreach (dry-run, mock data)
bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=discover --region=costa-rica --limit=82 --dry-run

# Research with real API calls (Mode B)
USE_DIRECT_API=true bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=research --limit=5 --dry-run
```

### Deep Research Flag

Add `--deep-research` to any discover/research/pipeline command for enhanced multi-source research:

```bash
# VC deep research (Perplexity + Firecrawl + web search)
USE_DIRECT_API=true bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=vc --action=research --deep-research --dry-run

# Municipal deep research
USE_DIRECT_API=true bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=municipal --action=research --deep-research --dry-run
```

### Execution Modes

| Mode | Command | API Calls | DB Writes | Emails Sent |
|---|---|---|---|---|
| A (Mock) | `bun alygn-outreach.ts --dry-run` | Mock | Simulated | No |
| B (Real API + Dry Run) | `USE_DIRECT_API=true bun alygn-outreach.ts --dry-run` | Real | Simulated | No |
| C (Production) | `bun alygn-outreach.ts` | Real | Real | **Yes** |

### Lobster Pipelines

```bash
# Full VC campaign pipeline
openclaw lobster .lobster/alygn-vc-outreach.lobster

# Full municipal campaign pipeline
openclaw lobster .lobster/alygn-muni-outreach.lobster
```

## Database Schema (Supabase)

### `outreach_emails`
Sent email tracking — used by `SentEmailTracker` for dedup.

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `recipient_email` | TEXT | Contact email |
| `recipient_name` | TEXT | Contact name |
| `partner_name` | TEXT | VC partner name |
| `vc_name` | TEXT | VC firm name |
| `type` | TEXT | 'vc' or 'municipal' |
| `subject` | TEXT | Email subject |
| `sent_at` | TIMESTAMPTZ | When sent |
| `status` | TEXT | 'sent'/'bounced'/'replied'/'failed' |

### `municipalities`
Costa Rica cantones — 82 entries.

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | TEXT | Canton name |
| `province` | TEXT | Province |
| `mayor_name` | TEXT | Mayor name (researched) |
| `mayor_email` | TEXT | Mayor email (validated) |
| `discovered_at` | TIMESTAMPTZ | Discovery timestamp |
| `researched_at` | TIMESTAMPTZ | Research timestamp |
| `outreach_sent_at` | TIMESTAMPTZ | Email sent timestamp |

## E2E Tests

```bash
# Run DB sync validation (verifies remote DB queries work)
bun scripts/alygn/tests/e2e-db-sync-test.js
```

Tests verify:
1. `SentEmailTracker` queries Supabase (not local JSON)
2. No stale local data dependencies
3. Municipal discovery queries Supabase `municipalities` table
4. Municipal research mock mode works
5. VC dedup queries Notion API
6. Supabase client module loads correctly

## Troubleshooting

### Missing Environment Variables

**Symptom:** `Supabase credentials not found` or `Notion API key not found`

**Fix:** Ensure `~/.openclaw/workspace/config/credentials.json` contains the required keys:
```json
{
  "supabase": { "url": "...", "serviceKey": "..." },
  "notion": { "apiKey": "ntn_...", "databases": { "vc_outreach": "..." } }
}
```

### Notion 404: "Could not find database"

**Symptom:** `Could not find database with ID: ... Make sure the relevant pages and databases are shared with your integration`

**Fix:** Open the Notion database → Share → Add the "ClawdBot AndlerSVR" integration. The API key is valid but the specific database must be explicitly shared.

### Stale Local Data (sent-emails.json)

**Symptom:** Duplicate emails sent to already-contacted VCs/municipalities.

**Root cause:** `sent-emails.json` exists but `SentEmailTracker` now reads from Supabase. The local file is legacy.

**Fix:** The `SentEmailTracker` class queries Supabase `outreach_emails` table. If you see stale data, verify Supabase has the latest records:
```bash
# Check Supabase directly
curl "${SUPABASE_URL}/rest/v1/outreach_emails?select=recipient_email,sent_at&order=sent_at.desc&limit=10" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"
```

### CLI Double Output

**Symptom:** CLI prints results twice.

**Status:** Known issue — the CLI entry point runs `main()` twice (import + call). Non-blocking.

### Build Required

**Symptom:** `Module not found` when running `alygn-outreach.ts`

**Fix:** Build the dist first:
```bash
cd ~/.agents/skills/alygn-outreach && bun run build
```

---

_Updated: 2026-04-22 — Phase 3 E2E validation complete_