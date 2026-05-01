# ALYGN Daily Signal Brief — Environment Setup

## Required Environment Variables

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`) or `.env` file:

```bash
# ─── Notion API ──────────────────────────────────────────────────────────────
export NOTION_KEY="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"

# Notion DataSource IDs
export NOTION_GRANT_DATA_SOURCE="32c33487-4af6-8130-b265-de7464a51a72"  # Grant Tracker (FIXED 2026-04-27)
export NOTION_VC_DATA_SOURCE="32c334874af68130b265de7464a51a72"              # VC Tracker

# ─── Supabase ────────────────────────────────────────────────────────────────
export SUPABASE_URL="https://uwusstfgikzeryvaruuk.supabase.co"
export SUPABASE_KEY=""  # Get from: Supabase Dashboard → Settings → API → service_role key

# ─── Email Tracking (Gmail IMAP) ─────────────────────────────────────────────
# Generate app passwords at: https://myaccount.google.com/apppasswords
export GMAIL_APP_PASSWORD=""           # alyyygn@gmail.com (3 y's) — generate at Google App Passwords
export OUTREACH_EMAIL_APP_PASSWORD=""  # outreach@alyygn.com (2 y's) — generate at Google App Passwords

# ─── Twitter/X API ──────────────────────────────────────────────────────────
export TWITTER_BEARER_TOKEN=""  # Get from: X Developer Portal → Apps → Keys → Bearer Token

# ─── Kill Switch Health ─────────────────────────────────────────────────────
export KILL_SWITCH_URL=""  # Set to your Kill Switch health endpoint URL

# ─── Signal Delivery ────────────────────────────────────────────────────────
export ALYGN_SIGNAL_GROUP_ID=""  # Production Signal group ID (leave empty for test mode)
```

## Where to Get Each Credential

| Variable | Source | Notes |
|----------|--------|-------|
| `NOTION_KEY` | Notion Integrations page | Already set; workspace-level integration |
| `NOTION_GRANT_DATA_SOURCE` | Notion database page URL | Fixed: `32c33487-4af6-8130-b265-de7464a51a72` |
| `NOTION_VC_DATA_SOURCE` | Notion database page URL | Already correct |
| `SUPABASE_KEY` | Supabase Dashboard → Settings → API | Use `service_role` key for full access |
| `GMAIL_APP_PASSWORD` | Google App Passwords | Requires 2FA enabled first |
| `OUTREACH_EMAIL_APP_PASSWORD` | Google App Passwords | Requires 2FA enabled first |
| `TWITTER_BEARER_TOKEN` | X Developer Portal | Free tier has limited endpoint access |
| `KILL_SWITCH_URL` | Your deployment | Health endpoint URL |
| `ALYGN_SIGNAL_GROUP_ID` | Signal group discovery | Run `signal-cli listGroups` after daemon is stopped |

## Quick Test

```bash
cd /home/andlersrv/.openclaw/workspace

# Test data collection
node scripts/alygn/signal-daily-brief/collect-data.js 2>&1 | jq '.operations | keys'

# Expected output:
# [
#   "killSwitch",
#   "grants",
#   "vc",
#   "github",
#   "localWork"
# ]

# Test full pipeline (text-only)
node scripts/alygn/signal-daily-brief/collect-data.js \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js \
  | jq -r '.textReport'

# Test audio generation
node scripts/alygn/signal-daily-brief/collect-data.js \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js \
  | node scripts/alygn/signal-daily-brief/generate-audio.js --output /tmp/test.ogg \
  | jq '.estimatedDurationSec, .wordCount'

# Expected: ~150-165 seconds, ~380-400 words (with full data)
```

## Gmail App Password Setup

### For alyyygn@gmail.com (3 y's)

1. Go to https://myaccount.google.com/apppasswords
2. Select app: "Mail"
3. Select device: "Other (Custom name)"
4. Enter name: "ALYGN Daily Brief"
5. Click "Generate"
6. Copy 16-character password
7. Set env var: `export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"`

### For outreach@alyygn.com (2 y's)

1. Go to https://myaccount.google.com/apppasswords
2. Select app: "Mail"
3. Select device: "Other (Custom name)"
4. Enter name: "ALYGN Outreach"
4. Click "Generate"
5. Copy 16-character password
6. Set env var: `export OUTREACH_EMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"`

## Cron Job Setup

```bash
# Edit crontab
crontab -e

# Test mode (sends to Andler only)
0 14 * * * cd /home/andlersrv/.openclaw/workspace && \
  node scripts/alygn/signal-daily-brief/collect-data.js 2>/dev/null | \
  node scripts/alygn/signal-daily-brief/synthesize-report.js 2>/dev/null | \
  node scripts/alygn/signal-daily-brief/generate-audio.js 2>/dev/null | \
  node scripts/alygn/signal-daily-brief/send-signal.js --test 2>&1 | \
  tee -a /tmp/alygn-brief.log

# Production mode (sends to Alygn team group)
0 14 * * * cd /home/andlersrv/.openclaw/workspace && \
  node scripts/alygn/signal-daily-brief/collect-data.js 2>/dev/null | \
  node scripts/alygn/signal-daily-brief/synthesize-report.js 2>/dev/null | \
  node scripts/alygn/signal-daily-brief/generate-audio.js 2>/dev/null | \
  node scripts/alygn/signal-daily-brief/send-signal.js --production 2>&1 | \
  tee -a /tmp/alygn-brief.log
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No GitHub data | Run `gh auth status` to verify auth |
| No Notion data (404) | Verify `NOTION_GRANT_DATA_SOURCE` is `32c33487-4af6-8130-b265-de7464a51a72` (was wrong before) |
| No Notion data (auth) | Check `NOTION_KEY` is valid and integration has access to the database |
| No Supabase data | Check `SUPABASE_URL` and `SUPABASE_KEY` — use service_role key for full access |
| No Twitter data | Set `TWITTER_BEARER_TOKEN`; note free tier has limited endpoint access |
| No email data | Set `GMAIL_APP_PASSWORD` and `OUTREACH_EMAIL_APP_PASSWORD` (requires 2FA + app password) |
| No local work data | Check `memory/*.md` and `HEARTBEAT.md` files exist |
| Audio generation fails | Check Piper TTS: `$HOME/.local/share/piper-tts-env/bin/piper --help` |
| Signal send fails | Use OpenClaw message tool (signal-cli daemon no longer needed) |
| Audio too short | Verify `MAX_WORDS` in `generate-audio.js` (should be 400) |
| Audio timeout | Timeout is 120s in `generate-audio.js` |
| Zombie daemon hanging | `pkill -f "signal-cli.*daemon"` — daemon is no longer used |

## Verification Checklist

- [ ] All environment variables set
- [ ] `node scripts/alygn/signal-daily-brief/collect-data.js` returns JSON with all keys
- [ ] VC tracker shows data from Notion
- [ ] Grant tracker shows data from Notion (verify correct DB ID)
- [ ] Local work tracking finds memory files
- [ ] Audio generation completes within 120s timeout
- [ ] Audio duration is ~2-3 minutes (not truncated to 90s)
- [ ] Signal delivery works via OpenClaw message tool

---

**Last Updated:** 2026-04-27  
**Status:** ✅ Ready for production