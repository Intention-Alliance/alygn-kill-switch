#!/bin/bash
#
# CRON CLEANUP & RECREATION SCRIPT
# 
# Purpose:
# 1. Delete ALL existing cron jobs
# 2. Recreate from clean configuration
# 3. Consolidate automation systems
#
# UPDATED 2026-02-11:
# - Integrated Twitter Discovery System
# - Discord notifications (not WhatsApp)
# - Consolidated redundant jobs
#

set -e

echo "🗑️  CRON CLEANUP & RECREATION"
echo "============================"
echo ""

# ============================================================================
# STEP 1: DELETE ALL EXISTING JOBS
# ============================================================================

echo "📋 Listing current jobs..."
CURRENT_JOBS=$(openclaw cron list --json 2>&1 | jq -r '.jobs[].id')
JOB_COUNT=$(echo "$CURRENT_JOBS" | wc -l)

echo "Found $JOB_COUNT existing jobs"
echo ""

if [ "$JOB_COUNT" -gt 0 ]; then
    echo "🗑️  Deleting all existing cron jobs..."
    for JOB_ID in $CURRENT_JOBS; do
        echo "  Deleting: $JOB_ID"
        openclaw cron remove "$JOB_ID" 2>&1 | grep -v "^$" || true
    done
    echo "✅ All jobs deleted"
else
    echo "✅ No jobs to delete"
fi

echo ""
echo "============================================================"
echo ""

# ============================================================================
# STEP 2: CREATE NEW JOBS (CONSOLIDATED)
# ============================================================================

echo "🔧 Creating consolidated cron jobs..."
echo ""

# ----------------------------------------------------------------------------
# SYSTEM JOBS (3 jobs)
# ----------------------------------------------------------------------------

echo "📦 SYSTEM JOBS"
echo "--------------"

# 1. Backup & Archive (2:00 AM)
echo "1. Backup & Archive (2:00 AM CST)..."
openclaw cron add \
  --name "System: Backup & Archive" \
  --description "Daily backup of workspace data and logs" \
  --cron "0 2 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run backup: cd $HOME/.openclaw/workspace && node scripts/system/backup.js" \
  --thinking low \
  --timeout 1800

# 2. Morning Briefing (8:00 AM)
echo "2. Morning Briefing (8:00 AM CST)..."
openclaw cron add \
  --name "System: Morning Briefing (Multi-Org)" \
  --description "Generate Wobblus audio briefing for all organizations via WhatsApp" \
  --cron "0 8 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Generate morning briefing: cd $HOME/.openclaw/workspace && node scripts/system/morning-briefing.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver \
  --timeout 1800

# 3. End-of-Day Summary (9:00 PM)
echo "3. End-of-Day Summary (9:00 PM CST)..."
openclaw cron add \
  --name "System: End-of-Day Summary" \
  --description "Daily summary: GitHub activity, Twitter automation, daily logs via WhatsApp" \
  --cron "0 21 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Generate end-of-day summary: cd $HOME/.openclaw/workspace && node scripts/alygn/eod-summary.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver \
  --timeout 1800

echo ""

# ----------------------------------------------------------------------------
# ALYGN JOBS (4 jobs)
# ----------------------------------------------------------------------------

echo "🚀 ALYGN JOBS"
echo "-------------"

# 1. Daily Activity Tracker (3:30 AM)
echo "4. ALYGN Daily Tracker (3:30 AM CST)..."
openclaw cron add \
  --name "ALYGN: Daily Activity Tracker" \
  --description "Track ALYGN project metrics and save daily report" \
  --cron "30 3 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run ALYGN daily tracker: cd $HOME/.openclaw/workspace && node scripts/alygn/daily-tracker.js" \
  --thinking low \
  --timeout 1800

# 2. Twitter Master Automation (11:00 AM) - CONSOLIDATED
echo "5. ALYGN Twitter Master Automation (11:00 AM CST)..."
openclaw cron add \
  --name "ALYGN: Twitter Master Automation (Content + Discovery)" \
  --description "Dual system: Generate original posts via Grok + Discover/engage with AI safety community. Reports to Discord #annotations thread. Target: 5 posts + 2-5 engagements/day" \
  --cron "0 11 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message 'Execute ALYGN Twitter Master Automation (Content Generation + Discovery System):

## OVERVIEW
Combines two workflows:
1. Content Generation → original posts/threads
2. Discovery System → reactive engagement with AI safety posts

Target: 5 original posts + 2-5 reactive engagements per day

## PHASE 1: CONTENT GENERATION (Existing System)
```bash
cd $HOME/.openclaw/workspace && node scripts/alygn/x-twitter/twitter-automation.js
```
Generates workflow JSON:
- 10 post ideas via Grok Prompt #1
- AI selects best 5 posts
- 5 strategic replies via Grok Prompt #13
- Saves to twitter-outputs/alygn/workflows/workflow-*.json

## PHASE 2: DISCOVERY SYSTEM (New - Feb 2026)

### Step 2.1: Browser Discovery
```bash
browser --profile="alygn" navigate https://x.com/explore --target host
browser --profile="alygn" search "AGI alignment" --target host
browser --profile="alygn" snapshot → extract posts --target host
```
Discover AI safety posts:
- Keywords: "AGI alignment", "AI safety", "existential risk"
- Extract: IDs, authors, content, engagement
- Output: twitter-outputs/alygn/discovery/discovery-*.json

### Step 2.2: Decision Engine
```bash
cd $HOME/.openclaw/workspace && node scripts/alygn/twitter-discovery/decision-engine.js
```
Grok evaluation:
- Filter AI-related posts (keywords.length > 0)
- Evaluate: "Should @aialygn engage? How?"
- Strategy: reply / quote / follow / skip
- Output: workflow-*.json with approved actions

### Step 2.3: X API Execution
```bash
cd $HOME/.openclaw/workspace && node scripts/alygn/twitter-discovery/x-api-executor.js
```
Post via X API:
- Quote tweets (quote_tweet_id)
- Replies (in_reply_to_tweet_id)
- 5s delay between actions (rate limiting)
- Track results + summary

## PHASE 3: BROWSER POSTING (Original Content)
```bash
cd $HOME/.openclaw/workspace && bun scripts/alygn/twitter-browser-executor.ts
```
Post original content via browser relay:
- Profile: --profile="alygn" (authenticated X.com)
- Timeouts: 120s navigation, 60s snapshot, 90s actions
- 45s wait between posts
- Post threads + replies + follows from Phase 1 workflow

## PHASE 4: SUMMARY REPORT
Post summary to Discord #annotations thread:
- Thread: "Alygn: X/Twitter Growth Engagement"
- Thread ID: 1470977688368840928
- Original posts: X/5 published (with links)
- Discovery engagements: X posted (quotes/replies with links)
- Workflows: file locations
- Performance metrics
- Any errors/issues

## CRITICAL RULES
✅ ALWAYS use --profile="alygn" for browser
✅ ALWAYS use extended timeouts (120s+)
✅ Discovery keywords: "AGI alignment", "AI safety", "existential risk"
✅ Grok evaluates ALL discovered posts before posting
✅ Include @aialygn mention in posts
✅ 5s delay between X API calls, 45s between browser actions
✅ Log all actions for tracking
✅ Post summary to Discord thread (not WhatsApp)

## SUCCESS METRICS
- Content generation: 5 posts/day
- Discovery relevance: 100% (search-based)
- Decision approval: ~75-100%
- Execution success: ~60-80%
- Total daily output: 7-10 posts/engagements' \
  --thinking medium \
  --deliver \
  --channel discord \
  --to "1470977688368840928" \
  --best-effort-deliver \
  --timeout 3600

# 3. VC Contact Discovery (Monday 10:30 AM)
echo "6. ALYGN VC Contact Discovery (Monday 10:30 AM CST)..."
openclaw cron add \
  --name "ALYGN: VC Contact Discovery" \
  --description "Weekly VC contact search and database update" \
  --cron "30 10 * * 1" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute VC contact discovery: cd $HOME/.openclaw/workspace && node scripts/alygn/vc-contact-discovery.js" \
  --thinking medium \
  --timeout 1800

# 4. VC Weekly Outreach (Monday 11:00 AM)
echo "7. ALYGN VC Outreach (Monday 11:00 AM CST)..."
openclaw cron add \
  --name "ALYGN: VC Outreach Weekly" \
  --description "Weekly VC outreach with Grok enhancement + Notion tracking" \
  --cron "0 11 * * 1" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute VC outreach: cd $HOME/.openclaw/workspace && node scripts/alygn/vc-outreach.js" \
  --thinking high \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver \
  --timeout 1800

echo ""

# ----------------------------------------------------------------------------
# BITCASH JOBS (1 job)
# ----------------------------------------------------------------------------

echo "💰 BITCASH JOBS"
echo "---------------"

# 1. Daily Activity Tracker (3:45 AM)
echo "8. BitcashOrg Daily Tracker (3:45 AM CST)..."
openclaw cron add \
  --name "BitcashOrg: Daily Activity Tracker" \
  --description "Track BitcashOrg project metrics and save daily report" \
  --cron "45 3 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run BitcashOrg daily tracker: cd $HOME/.openclaw/workspace && node scripts/bitcash/daily-tracker.js" \
  --thinking low \
  --timeout 1800

echo ""

# ----------------------------------------------------------------------------
# PERSONAL JOBS (1 job)
# ----------------------------------------------------------------------------

echo "👤 PERSONAL JOBS"
echo "----------------"

# 1. Daily Activity Tracker (4:00 AM)
echo "9. AndlerRL Daily Tracker (4:00 AM CST)..."
openclaw cron add \
  --name "AndlerRL: Daily Activity Tracker" \
  --description "Track personal project metrics and save daily report" \
  --cron "0 4 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run AndlerRL daily tracker: cd $HOME/.openclaw/workspace && node scripts/personal/daily-tracker.js" \
  --thinking low \
  --timeout 1800

echo ""
echo "============================================================"
echo ""

# ============================================================================
# STEP 3: VERIFY
# ============================================================================

echo "✅ VERIFICATION"
echo "---------------"
echo ""

FINAL_COUNT=$(openclaw cron list --json 2>&1 | jq -r '.jobs[].id' | wc -l)
echo "Total jobs created: $FINAL_COUNT"
echo ""

openclaw cron list 2>&1 | head -20

echo ""
echo "============================================================"
echo ""
echo "🎉 CRON CLEANUP & RECREATION COMPLETE!"
echo ""
echo "Summary:"
echo "  - System: 3 jobs (backup, briefing, EOD)"
echo "  - ALYGN: 4 jobs (tracker, Twitter Master, VC discovery, VC outreach)"
echo "  - BitcashOrg: 1 job (tracker)"
echo "  - AndlerRL: 1 job (tracker)"
echo "  - Total: $FINAL_COUNT jobs"
echo ""
echo "Key Changes:"
echo "  ✅ Twitter Discovery System integrated"
echo "  ✅ Discord notifications (thread: 1470977688368840928)"
echo "  ✅ Consolidated redundant Twitter jobs"
echo "  ✅ Removed obsolete jobs"
echo ""
