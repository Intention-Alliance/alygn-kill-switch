# Developer Setup Guide

> Get the alygn-outreach skill running locally in minutes.

## Prerequisites

| Requirement      | Version    | Notes                                   |
| ---------------- | ---------- | --------------------------------------- |
| **Bun**          | ≥ 1.0      | Primary runtime. Required.              |
| **Node.js**      | ≥ 18       | Fallback if Bun isn't available         |
| **Git**          | Any recent | For cloning/pulling                     |
| **Supabase CLI** | Latest     | Only if you need to regenerate DB types |

### Install Bun

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Via Homebrew
brew install bun

# Verify
bun --version
```

### Install Supabase CLI (optional, for DB work)

```bash
# macOS
brew install supabase/tap/supabase

# Linux
npm install -g supabase
```

---

## Installation

### 1. Navigate to the skill directory

```bash
cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach
```

### 2. Install dependencies

```bash
bun install
```

This reads `package.json` and installs all dependencies via Bun (faster than npm/yarn).

### 3. Verify the CLI works

```bash
bun bin/alygn-outreach.ts --help
```

Expected output:

```
🎯 Alygn Outreach CLI (TypeScript)

Usage: bun bin/alygn-outreach.ts [options]
...
```

---

## Environment Variables

The skill uses environment variables for external service credentials. Create a `.env` file in the skill root:

```bash
cp .env.example .env
```

### Required Variables

| Variable               | Description                                | Example                   |
| ---------------------- | ------------------------------------------ | ------------------------- |
| `ZEROBOUNCE_API_KEY`   | ZeroBounce email validation API key        | `xxx`                     |
| `SUPABASE_URL`         | Supabase project URL                       | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY`    | Supabase anonymous (public) key            | `eyJ...`                  |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (for migrations) | `eyJ...`                  |

### SMTP Variables (for email sending)

| Variable      | Description                   | Default            |
| ------------- | ----------------------------- | ------------------ |
| `SMTP_SERVER` | SMTP server hostname          | `smtp.gmail.com`   |
| `SMTP_PORT`   | SMTP port                     | `587`              |
| `SMTP_USER`   | SMTP username                 | `user@gmail.com`   |
| `SMTP_PASS`   | SMTP password or app password | `xxxx`             |
| `SMTP_FROM`   | From email address            | `andrew@alygn.com` |

### Smartlead Variables (alternative to SMTP)

| Variable            | Description                |
| ------------------- | -------------------------- |
| `SMARTLEAD_API_KEY` | Smartlead campaign API key |

### Optional Variables

| Variable             | Description                        | Default |
| -------------------- | ---------------------------------- | ------- |
| `NOTION_API_KEY`     | Notion integration token           | —       |
| `NOTION_DATABASE_ID` | Notion database ID for VC outreach | —       |
| `XAI_API_KEY`        | x.ai/Grok API key for research     | —       |

### Loading env vars

The skill loads `.env` automatically via Bun's built-in support. If running outside the skill directory:

```bash
export $(cat /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/.env | grep -v '^#' | xargs)
```

---

## Running in Development

### Basic Commands

```bash
# VC Discovery (dry run)
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=3 --dry-run

# Municipal Discovery (dry run)
bun bin/alygn-outreach.ts --type=municipal --region=costa-rica --action=discover --limit=3 --dry-run

# Full pipeline (dry run)
bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=1 --dry-run

# Single stage - validate
bun bin/alygn-outreach.ts --type=vc --action=validate --limit=5

# Single stage - research
bun bin/alygn-outreach.ts --type=vc --action=research --limit=5

# Single stage - personalize (dry run)
bun bin/alygn-outreach.ts --type=vc --action=personalize --limit=3 --dry-run

# Send approved drafts
bun bin/alygn-outreach.ts --type=vc --action=send \
  --draft-status=Approved \
  --email-send-to=entity-abc123,entity-def456 \
  --dry-run
```

### Input/Output State Files

State is persisted to `$HOME/.openclaw/workspace/reports/alygn/{subFolderType}/alygn-{type}-{phase}-{date}.json` automatically. To resume from a previous run:

```bash
bun bin/alygn-outreach.ts --type=vc --action=validate \
  --input=$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-26.json \
  --limit=10
```

To use a specific output directory for state files:

```bash
export STATEDIR=/home/andlersrv/.openclaw/workspace/reports/alygn/{subFolderType}/
```

### Development Debugging

To see verbose output and stack traces:

```bash
# Bun's built-in debugger
bun --inspect bin/alygn-outreach.ts --type=vc --action=discover --limit=1

# Or with verbose logging via env
DEBUG=* bun bin/alygn-outreach.ts --type=vc --action=discover --limit=1
```

### Running Tests

```bash
bun test

# Or via npm script
npm run test
```

The test script runs a minimal discovery dry run:

```bash
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=1 --dry-run
```

---

## Project Structure Reference

```
alygn-outreach/
├── bin/
│   └── alygn-outreach.ts          # CLI entry point
├── src/
│   ├── index.ts                   # CLI parser + main()
│   ├── core/
│   │   ├── Pipeline.ts            # Main orchestrator
│   │   └── OutreachPipeline.ts
│   ├── entities/
│   │   ├── types.ts               # All TypeScript interfaces
│   │   ├── OutreachEntity.ts      # Base entity class
│   │   ├── VCEntity.ts            # VC entity
│   │   └── MunicipalEntity.ts     # Municipal entity
│   ├── strategies/
│   │   ├── StrategyRegistry.ts    # Strategy factory
│   │   ├── discovery/             # Discovery strategies
│   │   ├── validation/           # Validation strategies
│   │   ├── research/             # Research strategies
│   │   ├── personalization/       # Personalization strategies
│   │   └── sending/               # Sending strategies
│   └── lib/
│       ├── email/                 # Email service, providers, validators
│       └── sent-emails.json       # Sent email tracking
├── docs/                          # This documentation
│   ├── DEVELOPER.md              # (this file)
│   ├── STRATEGIES.md
│   ├── DEPLOYMENT.md
│   └── TROUBLESHOOTING.md
├── package.json
└── .env.example
```

---

## TypeScript Notes

- All imports **must** use `.js` extension (ESM requirement): `import { Pipeline } from './Pipeline'`
- The skill uses **inline Supabase types** in `src/entities/types.ts` to avoid external file dependencies
- Supabase DB types are defined inline in `src/entities/types.ts` as `Database`, `Tables`, `TablesInsert`, `TablesUpdate` (placeholder aliases)
- If you need to regenerate types from a live Supabase schema, run `supabase gen types typescript` in `scripts/alygn/muni-outreach/supabase/`

---

## Supabase Local Development

If you need to run Supabase locally for development:

```bash
cd /home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase
supabase start
supabase db reset  # Applies migrations
```

The migration files are at:

```
scripts/alygn/muni-outreach/supabase/migrations/
├── 000_municipal_outreach_pipeline_schema.sql
├── 001_local_government_outreach_schema.sql
├── 002_rollback_wave_tracking.sql
└── 003_add_wave_tracking.sql
```

---

## IDE Setup

### VS Code

Recommended extensions:

- `esbenp.prettier-vscode` — formatting
- `denoland.vscode-deno` — TypeScript/Bun support (optional)
- `bradlc.vscode-tailwindcss` — if working on email templates

Add to `.vscode/settings.json`:

```json
{
  "deno.enable": false,
  "typescript.preferences.includePackageJsonAutoImports": true
}
```

### IntelliJ / WebStorm

- Mark `src/` as the sources root
- Enable ESM module support
- Set the default Node.js/Bun runtime

---

## Common Setup Issues

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for solutions to common problems.
