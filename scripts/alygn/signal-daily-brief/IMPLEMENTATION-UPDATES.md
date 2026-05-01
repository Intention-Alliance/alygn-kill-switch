# ALYGN Daily Signal Brief — Implementation Updates (2026-04-27)

## Overview

All three scripts have been updated according to Andler's observations to fix data collection gaps, improve report synthesis, and extend audio duration.

---

## 1. collect-data.js — Data Aggregation Updates

### ✅ Multi-Repo GitHub Tracking

**Before:** Only tracked `AndlerRL/andler-ops`

**After:** Tracks both:
- `AndlerRL/andler-ops`
- `Intention-Alliance/align-core-infra`

**Features:**
- Commits from both repos (aggregated count)
- PRs merged from both repos
- Issues closed **filtered for Alygn project tags** (labels containing "alygn" or "project")
- Detailed breakdown by repo in output

```javascript
const GITHUB_REPOS = ['AndlerRL/andler-ops', 'Intention-Alliance/align-core-infra'];
```

### ✅ Notion DataSource API (Not Database)

**Before:** Used `database` terminology, wrong DataSource ID

**After:** Uses correct `dataSource` terminology and IDs:

```javascript
const NOTION_GRANT_DATA_SOURCE = '32c33487-4af6-8191-8d35-000bba56be84'; // Grant Tracker
const NOTION_VC_DATA_SOURCE = '32c334874af68130b265de7464a51a72'; // VC Tracker
```

**New Function:** `collectNotionVC()` — Tracks VC outreach pipeline:
- Sent count
- Replies count
- Meetings scheduled
- Details per VC

### ✅ Local Work Tracking (Brain/Memory)

**Before:** No tracking of local work done outside GitHub

**After:** New `collectLocalWork()` function reads:
- `memory/YYYY-MM-DD.md` files (today + yesterday)
- `HEARTBEAT.md` for active work streams
- Filters for Alygn-related features with completion markers (✅, shipped, complete, working on)

**Output:**
```json
{
  "localWork": {
    "features": ["✅ Feature X complete", "Working on Feature Y"],
    "progress": ["Stream 1: Alygn Outreach System"],
    "continuation": []
  }
}
```

### ✅ Email Tracking Setup

**Before:** No email tracking

**After:** Placeholder for IMAP tracking of both accounts:
- `alyyygn@gmail.com` (3 y's) — `GMAIL_APP_PASSWORD` env var
- `outreach@alyygn.com` (2 y's) — `OUTREACH_EMAIL_APP_PASSWORD` env var

**Note:** Requires `npm install imap` for full implementation. Currently logs placeholder message.

### ✅ New Environment Variables

```bash
NOTION_GRANT_DATA_SOURCE=32c33487-4af6-8191-8d35-000bba56be84
NOTION_VC_DATA_SOURCE=32c334874af68130b265de7464a51a72
GMAIL_APP_PASSWORD=your-app-password-here
OUTREACH_EMAIL_APP_PASSWORD=your-app-password-here
```

---

## 2. synthesize-report.js — Report Generation Updates

### ✅ Filled Data Gaps

**Before:** Report referenced data that wasn't being collected (VC metrics, local work, emails)

**After:** All sections now have corresponding data:

| Section | Data Source | Status |
|---------|-------------|--------|
| VC Pipeline | `collectNotionVC()` | ✅ Now collected |
| Local Work | `collectLocalWork()` | ✅ Now collected |
| Email Tracking | `collectEmails()` | ✅ Structure ready (IMAP TODO) |
| GitHub (multi-repo) | `collectGitHub()` | ✅ Now tracks both repos |

### ✅ Enhanced Operations Section

**New subsections:**
- 🧠 **Local Work (Brain):** Shows features in progress and active streams
- 📧 **VC Outreach:** Shows sent/replies/meetings from Notion VC Tracker

### ✅ Enhanced Suggestions

**New suggestion types:**
- Local work continuation: "X features in progress → Continue implementation and sync to GitHub"
- GitHub activity: "X commits but no PRs merged → Review and merge pending work"

### ✅ Extended Daily Targets

**Before:** Max 3 targets

**After:** Up to 5 targets to accommodate:
1. P1: Urgent grant deadline
2. P1/P2: Municipal sends
3. P2: VC follow-ups
4. P2: Local work continuation
5. P2/P3: GitHub/admin tasks

### ✅ Data Completeness Tracking

New output field to verify all data sources were queried:

```json
"dataCompleteness": {
  "github": true,
  "grants": true,
  "vc": true,
  "municipal": true,
  "localWork": true,
  "emails": true
}
```

---

## 3. generate-audio.js — TTS Pipeline Updates

### ✅ Extended Audio Duration

**Before:** 
- Max words: 180
- Estimated duration: 60-90 seconds
- Timeout: 60 seconds

**After:**
- Max words: **400** (122% increase)
- Estimated duration: **Up to 2:45 minutes** (~165 seconds)
- Timeout: **120 seconds** (100% increase)

### ✅ No Extreme Truncation

**Before:** Aggressive truncation to fit 90-second target

**After:** 
- Preserves all categories (operations, outreach, suggestions, targets)
- Reads 4-6 operations points (was 2-3)
- Reads 3-5 outreach points (was 2-3)
- Reads 2-3 suggestions (was 1-2)
- Reads all 5 targets (was 3)

### ✅ Duration Estimation

Audio output now includes estimated duration:

```json
{
  "wordCount": 385,
  "estimatedDurationSec": 154,
  "fileSizeKB": "245.3"
}
```

---

## Testing Checklist

### Unit Tests

```bash
# Test collect-data.js
node scripts/alygn/signal-daily-brief/collect-data.js --date 2026-04-27 > /tmp/test-data.json

# Verify JSON structure
cat /tmp/test-data.json | jq '.operations | keys'
# Expected: ["killSwitch", "grants", "vc", "github", "localWork"]

cat /tmp/test-data.json | jq '.outreach | keys'
# Expected: ["vc", "municipal", "twitter", "emails"]
```

### Pipeline Test

```bash
# Full pipeline (text-only for speed)
node scripts/alygn/signal-daily-brief/collect-data.js \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js \
  | node scripts/alygn/signal-daily-brief/send-signal.js --test --text-only
```

### Audio Test

```bash
# Full pipeline with audio
node scripts/alygn/signal-daily-brief/collect-data.js \
  | node scripts/alygn/signal-daily-brief/synthesize-report.js \
  | node scripts/alygn/signal-daily-brief/generate-audio.js \
  | jq '.estimatedDurationSec, .wordCount'
# Expected: ~150-165 seconds, ~380-400 words
```

---

## Migration Notes

### Breaking Changes

None — all changes are additive or internal improvements.

### Required Actions

1. **Set new environment variables:**
   ```bash
   export NOTION_GRANT_DATA_SOURCE=32c33487-4af6-8191-8d35-000bba56be84
   export NOTION_VC_DATA_SOURCE=32c334874af68130b265de7464a51a72
   export GMAIL_APP_PASSWORD=your-gmail-app-password
   export OUTREACH_EMAIL_APP_PASSWORD=your-outreach-app-password
   ```

2. **Update cron jobs** (if any) to use new script paths

3. **Optional:** Install `imap` for full email tracking:
   ```bash
   cd scripts/alygn/signal-daily-brief
   npm install imap
   ```

---

## Files Modified

| File | Lines Changed | Key Changes |
|------|---------------|-------------|
| `collect-data.js` | ~450 lines | Multi-repo GitHub, Notion DataSource API, local work tracking, email setup |
| `synthesize-report.js` | ~400 lines | Filled data gaps, extended targets, data completeness tracking |
| `generate-audio.js` | ~150 lines | 400 word limit, 120s timeout, duration estimation |
| `README.md` | ~220 lines | Updated documentation for all changes |

---

## Next Steps

1. ✅ **Complete:** Code implementation
2. ⏳ **Test:** Run full pipeline with real data
3. ⏳ **Verify:** Check audio duration (~2:30-2:45min)
4. ⏳ **Deploy:** Update cron job if needed
5. ⏳ **Monitor:** First few daily briefs for quality

---

**Implementation Date:** 2026-04-27  
**Implemented By:** Wobblus 🔧  
**Status:** ✅ Ready for testing
