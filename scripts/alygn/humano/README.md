# @humano Twitter Automation

End-to-end content system for [@humano](https://x.com/humano) — AI governance voice for Alygn.

---

## Prerequisites

- Node.js 18+ or Bun
- X Developer account with OAuth 1.0a credentials
- xAI API key ([console.x.ai](https://console.x.ai))

## Setup

**1. Credentials — copy `.env-sample` to `.env` and fill it in**

```bash
cp .env-sample .env
# Edit .env
```

```env
X_CONSUMER_KEY=...
X_CONSUMER_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
X_ACCOUNT_HANDLE=humano
XAI_API_KEY=...
```

All credentials live in `.env` — no JSON config file needed.

**2. Install dependencies** (this folder has its own `package.json`)

```bash
cd scripts/alygn/humano
bun install
```

**3. Configure Custom Agent in Grok Chat (Fase 1)**

In [grok.com](https://grok.com), create a Custom Agent and paste the system prompt from `./SYSTEM-CONFIG.md § Grok Chat Custom Agent`.

**4. Run Fase 1 — First content session**

Open Grok Chat with the Custom Agent. Ask:

> "Quiero crear contenido para @humano. Tema: gobernanza de IA y legitimidad institucional."

Grok Chat will reply with CLI commands like `node lib/x-client.js --text "..." --post`. Run them directly.

---

## Two Execution Paths

### Fase 1 — On-demand (Human + Grok Chat)

Human talks to Grok Chat → Grok generates content + produces CLI commands → Human runs them:

```bash
# Post a single tweet (on-demand, human-reviewed)
node lib/x-client.js --text "AI governance isn't a tech problem. It's a coordination problem." \
  --hashtags "#AIGovernance #SmartCities"

# Reply to a tweet
node lib/x-client.js --reply-to 1234567890 \
  --text "Exactly — legitimacy must be built before the crisis."

# Post a thread
node lib/x-client.js --thread '[{"text":"First tweet"},{"text":"Second tweet"}]'

# Post with image
node lib/x-client.js --text "Visual governance data" --media=/path/to/image.png

# Run a saved workflow (from Grok output)
node lib/x-client.js --workflow /tmp/humano-workflow.json --option=2
```

### Fase 2 — Full automation (post.js + cron)

`post.js` is the driver — runs the full 3-agent Grok pipeline then posts:

```bash
# Full agent chain — generate content via 3 Grok agents, --post to publish
node post.js --project=humano --topic="AI governance legitimacy" --agent-chain --post

# Single Grok call (faster, less structured)
node post.js --project=humano --topic="Smart city transparency" --post

# Use pre-discovered trends as input
node post.js --project=humano --trends=/tmp/trends.json --post

# Dry run (generate but don't post)
node post.js --project=humano --topic="AI governance" --agent-chain --dry-run

# Mock mode (no API calls at all, for testing)
node post.js --project=humano --topic="test" --mock --post
```

---

## Discover Trends

```bash
# Search governance topics on X, save for use with post.js --trends
node trend-discovery.js --project=humano --output=/tmp/trends.json

# Custom query
node trend-discovery.js --project=humano --query="AI regulation LATAM" --output=/tmp/trends.json

# Mock mode (no API)
node trend-discovery.js --project=humano --mock
```

---

## Automated Cron (Fase 2)

```bash
# Start the scheduler (runs every 3h, 8AM-8PM Costa Rica)
node cron.js --project=humano

# Single cycle test — dry run
node cron.js --project=humano --once --dry-run

# Or via bun scripts
bun run cron
bun run test
```

Logs are saved to `logs/YYYY-MM-DD/humano-automation.jsonl`.

---

## File Structure

```
scripts/alygn/humano/
├── package.json               # Independent — own dependencies
├── .env-sample                # Credentials template (copy to .env)
├── post.js                    # Full automation driver (cron entry point)
├── trend-discovery.js         # Governance topic search via X API
├── cron.js                    # Automated scheduler
├── load-project.js            # Loads projects/humano.json
├── lib/
│   ├── x-client.js            # On-demand X posting CLI + @xdevplatform/xdk wrapper
│   ├── agent-chain.js         # 3-agent Grok pipeline
│   └── agent-prompts.js       # Agent 1/2/3 system prompts
├── projects/
│   └── humano.json            # @humano project config
└── config/
    ├── humano-following.txt   # @usernames to monitor
    └── humano-template.json   # Approved post template
```

---

## Architecture

```
Fase 1 (Human)
  Grok Chat Custom Agent
    → generates content + cliCommand strings
    → Human runs: node lib/x-client.js --text "..." [--reply-to ID] [--media=...] [--dry-run]
    → x-client.js posts directly to X API

Fase 2 (Automated)
  cron.js (node-cron, every 3h)
    → post.js  (discovers trends, runs 3-agent chain, posts)
        → lib/agent-chain.js  (Agent 1 Research → Agent 2 Content → Agent 3 Validate)
        → lib/x-client.js     (posts to X via @xdevplatform/xdk)
```

See full architecture and Grok Chat setup: `./SYSTEM-CONFIG.md`
