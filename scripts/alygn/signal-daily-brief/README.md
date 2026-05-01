# ALYGN Daily Signal Brief

Automated daily briefing for the Alygn team, delivered via Signal (text + audio).

## Architecture

```
collect-data.js → synthesize-report.js → generate-audio.js → send-signal.js
       ↓                    ↓                      ↓                  ↓
   GitHub API          Executive Summary      Piper TTS (Wobblus)    OpenClaw Message
   Notion API          Categorization         balanced profile      (Signal channel)
   Supabase            Suggestions             OGG output           --test or --production
   Twitter/X           Daily Targets
   Kill Switch         Data Completeness
   Gmail (2 accounts)
   Local Work (Brain)
```

## Quick Start

### Full pipeline (recommended)

```bash
cd /home/andlersrv/.openclaw/workspace

# Test mode (sends to Andler only)
node scripts/alygn/signal-daily-brief/collect-data.js \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js \
  | node scripts/alygn/signal-daily-brief/generate-audio.js \
  | node scripts/alygn/signal-daily-brief/send-signal.js --test

# Production mode (sends to Alygn team group)
node scripts/alygn/signal-daily-brief/collect-data.js \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js \
  | node scripts/alygn/signal-daily-brief/generate-audio.js \
  | node scripts/alygn/signal-daily-brief/send-signal.js --production
```

### Individual steps

```bash
# Step 1: Collect data
node scripts/alygn/signal-daily-brief/collect-data.js > /tmp/alygn-data.json

# Step 2: Generate report
node scripts/alygn/signal-daily-brief/synthesize-report.js < /tmp/alygn-data.json > /tmp/alygn-report.json

# Step 3: Generate audio
node scripts/alygn/signal-daily-brief/generate-audio.js < /tmp/alygn-report.json > /tmp/alygn-audio.json

# Step 4: Send via Signal
node scripts/alygn/signal-daily-brief/send-signal.js --test < /tmp/alygn-audio.json
```

### Text-only (no audio)

```bash
node scripts/alygn/signal-daily-brief/collect-data.js \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js \
  | node scripts/alygn/signal-daily-brief/send-signal.js --test --text-only
```

### Custom date

```bash
node scripts/alygn/signal-daily-brief/collect-data.js --date 2026-04-23 \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTION_KEY` | Yes | Notion API key |
| `NOTION_GRANT_DATA_SOURCE` | Yes | Grant Tracker DataSource ID (`32c33487-4af6-8130-b265-de7464a51a72`) |
| `NOTION_VC_DATA_SOURCE` | Yes | VC Tracker DataSource ID (`32c334874af68130b265de7464a51a72`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon/service key |
| `GMAIL_APP_PASSWORD` | No | Gmail app password for `alyyygn@gmail.com` (3 y's) |
| `OUTREACH_EMAIL_APP_PASSWORD` | No | Gmail app password for `outreach@alyygn.com` (2 y's) |
| `GITHUB_TOKEN` | No | GitHub token (uses `gh` CLI auth) |
| `TWITTER_BEARER_TOKEN` | No | Twitter/X API v2 bearer token |
| `KILL_SWITCH_URL` | No | Kill Switch health check endpoint |

## Data Sources

### GitHub (Multi-Repo)
- **Repos:** `AndlerRL/andler-ops` + `Intention-Alliance/align-core-infra`
- Commits in last 24h
- PRs merged
- Issues closed (filtered for Alygn project tags)
- Continuation from previous days' activity

### Notion (DataSource API)
- **Grant Tracker:** Uses `dataSource` terminology (not `database`)
  - DataSource ID: `32c33487-4af6-8130-b265-de7464a51a72`
  - Active grants with status
  - Urgent deadlines (< 30 days)
  - Priority classification (P1/P2)
- **VC Tracker:** Uses `dataSource` terminology
  - DataSource ID: `32c334874af68130b265de7464a51a72`
  - Sent/replied/meetings metrics
  - Pipeline status tracking

### Supabase (Municipal Pipeline)
- Warmup counts
- Approved emails pending
- Sent/response tracking
- Wave numbers and priority scores

### Twitter/X
- Follower count
- Impressions (requires elevated API)
- Top posts (requires elevated API)

### Kill Switch
- Health status
- Uptime percentage
- Health check count

### Email Tracking (Gmail IMAP)
- **alyyygn@gmail.com** (3 y's): Sent/received/grant-related
- **outreach@alyygn.com** (2 y's): Sent/received/grant-related
- Requires app passwords for both accounts

### Local Work Tracking (Brain/Memory)
- Reads from `memory/YYYY-MM-DD.md` files
- Extracts Alygn-related features and progress
- Checks `HEARTBEAT.md` for active work streams
- Provides continuity and team progress acknowledgment

## Report Structure

```
📡 ALYGN DAILY SIGNAL BRIEF — YYYY-MM-DD

📈 EXECUTIVE SUMMARY
• [Top win] • [Critical item] • [Overall status]

🔧 OPERATIONS & SYSTEMS
• Kill Switch: ✅ status
• 📋 Grant deadlines
• 💻 GitHub activity (both repos)
• 🧠 Local work (Brain) — NEW
• 📧 VC Outreach — NEW

📧 OUTREACH
• 📧 VC pipeline
• 🏛️ Municipal progress
• 📧 Email tracking (both accounts) — NEW
• 🐦 Twitter metrics

💡 SUGGESTIONS
• AI-driven recommendations
• Local work continuation — NEW

🎯 TODAY'S TARGETS
1. [P1] Critical task
2. [P2] High task
3. [P3] Medium task
4. [P2] Local work continuation — NEW
5. [P3] Admin task
```

## Audio

- **Voice:** Wobblus (Piper TTS, balanced profile)
- **Duration target:** Up to 2:45 minutes (~400 words) — UPDATED
- **Format:** OGG (Opus codec, Signal-compatible)
- **Script:** Detailed version with all categories, no extreme truncation
- **Timeout:** 120 seconds (increased from 60s) — UPDATED

## Signal Delivery

- **Test mode:** `+50662163355` (Andler) — default, no flags needed
- **Production mode:** `--production` flag — sends to `ALYGN_SIGNAL_GROUP_ID` env var
- **Delivery method:** OpenClaw native message tool (signal-cli daemon no longer used)
- **Format:** Text message + audio attachment

### How it works

The pipeline outputs a JSON payload. OpenClaw's agent infrastructure picks up the payload and delivers it via the Signal channel. The old `signal-cli` daemon approach was replaced because the daemon held a config lock, causing all CLI commands to hang.

### Production setup

1. Kill any zombie daemon: `pkill -f "signal-cli.*daemon"`
2. Discover group ID: `signal-cli -u +50662163355 listGroups`
3. Set env var: `export ALYGN_SIGNAL_GROUP_ID="<group_id>"`
4. Run with: `--production` flag

## Cron Setup

```bash
# Test mode (sends to Andler only)
0 14 * * * cd /home/andlersrv/.openclaw/workspace && node scripts/alygn/signal-daily-brief/collect-data.js | node scripts/alygn/signal-daily-brief/synthesize-report.js | node scripts/alygn/signal-daily-brief/generate-audio.js | node scripts/alygn/signal-daily-brief/send-signal.js --test >> /tmp/alygn-brief.log 2>&1

# Production mode (sends to Alygn team group — set ALYGN_SIGNAL_GROUP_ID first)
0 14 * * * cd /home/andlersrv/.openclaw/workspace && node scripts/alygn/signal-daily-brief/collect-data.js | node scripts/alygn/signal-daily-brief/synthesize-report.js | node scripts/alygn/signal-daily-brief/generate-audio.js | node scripts/alygn/signal-daily-brief/send-signal.js --production >> /tmp/alygn-brief.log 2>&1
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No GitHub data | Run `gh auth status` to verify auth |
| No Notion data (404) | Verify `NOTION_GRANT_DATA_SOURCE` is `32c33487-4af6-8130-b265-de7464a51a72` (was wrong before) |
| No Notion data (auth) | Check `NOTION_KEY` is valid and integration has access |
| No Supabase data | Check `SUPABASE_URL` and `SUPABASE_KEY` |
| No Twitter data | Set `TWITTER_BEARER_TOKEN` (requires X API v2) |
| No email data | Set `GMAIL_APP_PASSWORD` and `OUTREACH_EMAIL_APP_PASSWORD` |
| No local work data | Check `memory/*.md` and `HEARTBEAT.md` files exist |
| Audio generation fails | Check Piper TTS: `$HOME/.local/share/piper-tts-env/bin/piper --help` |
| Signal send fails | Use OpenClaw message tool (signal-cli daemon no longer needed) |
| Audio too short | Verify `MAX_WORDS` in `generate-audio.js` (should be 400) |
| Audio timeout | Timeout is 120s in `generate-audio.js` |
| Zombie daemon hanging | `pkill -f "signal-cli.*daemon"` — daemon is no longer used |
| Emojis in audio | `clean()` function strips all Unicode emojis before TTS |

## Production Deployment Checklist

- [ ] Kill zombie signal-cli daemon: `pkill -f "signal-cli.*daemon"`
- [ ] Verify correct `NOTION_GRANT_DATA_SOURCE` ID in env
- [ ] Set `ALYGN_SIGNAL_GROUP_ID` for production delivery
- [ ] Set `SUPABASE_KEY` for municipal data
- [ ] Set `TWITTER_BEARER_TOKEN` for X data (if available)
- [ ] Set `KILL_SWITCH_URL` for health monitoring
- [ ] Set `GMAIL_APP_PASSWORD` + `OUTREACH_EMAIL_APP_PASSWORD` for email tracking
- [ ] Test full pipeline: `collect-data | synthesize-report | generate-audio | send-signal --test`
- [ ] Verify audio output has no emoji artifacts
- [ ] Set up cron job for daily delivery

## Files

| File | Purpose |
|------|---------|
| `collect-data.js` | Data collection from all sources (GitHub, Notion, Supabase, Twitter, Gmail, Local Work) |
| `synthesize-report.js` | Executive summary + categorization + suggestions + targets |
| `generate-audio.js` | Piper TTS with Wobblus voice (up to 2:45min, 120s timeout) |
| `send-signal.js` | OpenClaw message tool payload (replaces signal-cli daemon) |
| `README.md` | This file |

## Key Updates (2026-04-27)

### collect-data.js
- ✅ Multi-repo GitHub tracking (`andler-ops` + `Intention-Alliance`)
- ✅ Notion DataSource API (not database) for grants and VC
- ✅ Local work tracking from memory files and HEARTBEAT.md
- ✅ Email tracking setup for both Gmail accounts
- ✅ VC outreach metrics from Notion

### synthesize-report.js
- ✅ All data gaps filled (VC, local work, emails)
- ✅ Detailed reporting with continuation context
- ✅ Up to 5 daily targets instead of 3
- ✅ Data completeness tracking

### generate-audio.js
- ✅ Extended word limit: 400 words (was 180)
- ✅ Longer timeout: 120s (was 60s)
- ✅ Duration estimate: ~2:45min max
- ✅ No extreme truncation

---

_Part of the ALYGN Daily Signal Brief system. See `docs/alygn/ALYGN-DAILY-SIGNAL-BRIEF-PLAN.md` for full specification._
