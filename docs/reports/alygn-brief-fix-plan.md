# ALYGN Daily Signal Brief — Fix Plan

**Date:** 2026-04-27  
**Author:** Hugrukal 📐  
**Priority:** P0-Critical  

---

## ✅ RESOLVED: Signal CLI Daemon Lock → OpenClaw Message Tool

**Original Problem:** Daemon held config lock → all CLI commands hung.

**Wobblus's Fix:** Replaced `send-signal.js` CLI-based delivery with OpenClaw native message tool payload. The new `send-signal.js` outputs a JSON payload that OpenClaw's agent infrastructure delivers via its Signal channel.

**Remaining cleanup:**
- Kill the zombie daemon process (PID 2107803) — it's still running but no longer needed
- `pkill -f "signal-cli.*daemon"`
- The `signal-cli` binary and config are still present but unused

**No further action needed on this item.**

---

### Fix 2: Notion Grant Database ID ⚠️ STILL UNFIXED

**Problem:** Wrong database ID → 404 error → no grant data.

**Fix:** Change `NOTION_GRANT_DATA_SOURCE` in `collect-data.js` from:
```
32c33487-4af6-8191-8d35-000bba56be84
```
to:
```
32c33487-4af6-8130-b265-de7464a51a72
```

**Also update** the `ENV-SETUP.md` default value.

**Verification:**
```bash
curl -s -X POST "https://api.notion.com/v1/databases/32c334874af68130b265de7464a51a72/query" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -d '{"page_size": 1}' | jq '.results | length'
```

Expected: > 0 results.

---

## P1 — Quality Improvements (Should Do)

### Fix 3: Twitter/X Bearer Token

**Problem:** `TWITTER_BEARER_TOKEN` not set → 401 Unauthorized.

**Fix:** Set the environment variable in the cron job or shell profile.

**Note:** The X API v2 free tier may not support the followers endpoint. Verify API access level before investing time.

---

### Fix 4: Kill Switch URL

**Problem:** `KILL_SWITCH_URL` not set → status always "unknown".

**Fix:** Set the environment variable. If the Kill Switch has a health endpoint, add it.

---

### Fix 5: Gmail App Passwords + IMAP Implementation

**Problem:** `GMAIL_APP_PASSWORD` not set, and the IMAP code is a placeholder.

**Fix:**
1. Generate Gmail app passwords for both accounts
2. Implement IMAP connection using `node-imap` or `imapflow` package
3. Search for unread emails from key contacts
4. Extract grant-related content

**Estimated effort:** 2-3 hours for IMAP implementation.

---

### Fix 6: Supabase API Key

**Problem:** `SUPABASE_KEY` defaults to empty string → limited query access.

**Fix:** Set the Supabase service role key or anon key in environment.

---

### Fix 7: Emoji Cleanup in Audio Script

**Problem:** The `clean()` function in `synthesize-report.js` strips some emojis but not all. Unicode emojis like 🧠, 📋, etc. may cause TTS artifacts.

**Fix:** Use a comprehensive regex:
```javascript
const clean = (s) => s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s+/g, ' ').trim();
```

---

## P2 — Long-Term Improvements (Nice to Have)

### Fix 8: Fallback Delivery Channel

**Problem:** If Signal delivery fails, the brief is lost. No fallback.

**Fix:** Add a fallback in `send-signal.js`:
1. Save text report to `/tmp/alygn-brief-YYYY-MM-DD.txt`
2. Save audio to `/tmp/alygn-brief-YYYY-MM-DD.ogg`
3. If Signal fails, post to Discord #annotations channel
4. Log the failure for manual retry

---

### Fix 9: Signal Group ID Discovery

**Problem:** `listGroups` hangs due to daemon lock. No way to discover group IDs.

**Fix:** After resolving the daemon lock issue:
1. Run `signal-cli -u +50662163355 listGroups` to discover the Alygn team group ID
2. Hard-code the group ID in `send-signal.js` as `PRODUCTION_GROUP_ID`
3. Add validation for group ID format

---

### Fix 10: Cron Job Setup

**Problem:** No cron job configured for daily delivery.

**Fix (after P0 fixes):**
```bash
# Add to crontab
0 8 * * * cd /home/andlersrv/.openclaw/workspace && node scripts/alygn/signal-daily-brief/collect-data.js 2>/dev/null | node scripts/alygn/signal-daily-brief/synthesize-report.js 2>/dev/null | node scripts/alygn/signal-daily-brief/generate-audio.js 2>/dev/null | node scripts/alygn/signal-daily-brief/send-signal.js --test 2>&1 | tee -a /tmp/alygn-brief.log
```

---

### Fix 11: Data Completeness Validation

**Problem:** Pipeline silently accepts empty data from failed sources.

**Fix:** Add a data completeness check in `synthesize-report.js`:
```javascript
const completeness = report.dataCompleteness;
const failedSources = Object.entries(completeness).filter(([k, v]) => !v);
if (failedSources.length > 3) {
  console.error(`⚠️  More than 3 data sources failed: ${failedSources.map(f => f[0]).join(', ')}`);
  // Consider adding a warning to the report
}
```

---

## Implementation Order

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| ✅ Done | Signal delivery (OpenClaw message tool) | Done by Wobblus | Unblocks delivery |
| P0-2 | Notion Grant DB ID | 5 min | Restores grant data |
| P1-3 | Twitter bearer token | 5 min | Restores Twitter data |
| P1-4 | Kill Switch URL | 5 min | Restores health status |
| P1-5 | Gmail IMAP | 2-3 hrs | Restores email data |
| P1-6 | Supabase key | 5 min | Completes municipal data |
| P1-7 | Emoji cleanup | 15 min | Better TTS quality |
| P1-8 | Kill zombie daemon | 1 min | Cleanup |
| P2-9 | Fallback delivery | 1 hr | Resilience |
| P2-10 | Group ID for production | 30 min | Production readiness |
| P2-11 | Cron job | 15 min | Automation |
| P2-12 | Data validation | 30 min | Quality assurance |

**Remaining P0 effort:** ~5 minutes  
**Remaining P1 effort:** ~3 hours  
**Remaining P2 effort:** ~2.5 hours

---

## Production Hardening Recommendations

### 1. Group ID for Production Deployment

**Current:** `send-signal.js` targets `+50662163355` (Andler's direct number) — test mode only.

**For production:** Need to discover the Alygn team Signal group ID and update the target.

**Steps:**
1. Kill the zombie daemon: `pkill -f "signal-cli.*daemon"`
2. Run `signal-cli -u +50662163355 listGroups` to discover group IDs
3. Update `send-signal.js` line 68: `target: '+50662163355'` → `target: '<GROUP_ID>'`
4. Add a `--production` flag that switches between test and group targets

### 2. Zombie Daemon Cleanup

**Current:** PID 2107803 running `signal-cli -a +50662163355 daemon --http 127.0.0.1:8080` — no longer needed.

**Action:**
```bash
pkill -f "signal-cli.*daemon"
```

**Consider:** If signal-cli daemon is needed for other purposes (receiving messages, etc.), document why it's running. Otherwise, remove it from startup.

### 3. Error Handling & Fallback Delivery

**Current:** If OpenClaw message tool fails, the brief is lost.

**Recommendation:** Add fallback in the pipeline:
1. Save text report to `daily-reports/YYYY-MM-DD-briefing.txt`
2. Save audio to `daily-reports/audio/YYYY-MM-DD-briefing.ogg`
3. If Signal delivery fails, post to Discord #annotations as fallback
4. Log all delivery attempts for debugging

### 4. Data Source Monitoring

**Current:** Failed data sources silently return empty data.

**Recommendation:** Add a health check step that:
1. Counts how many data sources returned non-empty data
2. If < 50% of sources succeed, adds a warning to the report
3. Logs source health to a daily status file

### 5. Morning Briefing Integration

**Current:** Two separate briefing systems exist:
- `scripts/alygn/signal-daily-brief/` (ALYGN-specific, detailed)
- `scripts/system/morning-briefing-v2.js` (general, simpler)

**Recommendation:** Consolidate into a single pipeline:
- `morning-briefing-v2.js` handles general briefing (all projects)
- `signal-daily-brief/` handles ALYGN-specific data enrichment
- Both share the same audio generation and delivery infrastructure

### 6. Cron Job Setup

**After all P0/P1 fixes are verified:**
```bash
# Add to crontab (8:00 AM CST = 14:00 UTC)
0 14 * * * cd /home/andlersrv/.openclaw/workspace && node scripts/alygn/signal-daily-brief/collect-data.js 2>/dev/null | node scripts/alygn/signal-daily-brief/synthesize-report.js 2>/dev/null | node scripts/alygn/signal-daily-brief/generate-audio.js 2>/dev/null | node scripts/alygn/signal-daily-brief/send-signal.js --test 2>&1 | tee -a /tmp/alygn-brief.log
```

**For production (after group ID is configured):**
```bash
0 14 * * * cd /home/andlersrv/.openclaw/workspace && node scripts/alygn/signal-daily-brief/collect-data.js 2>/dev/null | node scripts/alygn/signal-daily-brief/synthesize-report.js 2>/dev/null | node scripts/alygn/signal-daily-brief/generate-audio.js 2>/dev/null | node scripts/alygn/signal-daily-brief/send-signal.js --production 2>&1 | tee -a /tmp/alygn-brief.log
```