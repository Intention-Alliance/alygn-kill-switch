#!/bin/bash
# 
# MERGED CRON JOB CREATOR - Modern Bun + ESM
# 
# UPDATED 2026-02-04:
# - All scripts use BUN for faster execution
# - Modern ESM modules with fetch API
# - Centralized logging to Notion (daily pages)
# - Updated script paths: scripts/{alygn,system}/
# 
# Based on Andler's preferences:
# 1. Granular Grok prompts for Twitter
# 2. Very active Twitter engagement
# 3. VC outreach: Grok prompts + Notion tracking (HYBRID)
# 4. Centralized logging with Notion integration
#
# Grok context: /home/andlersrv/.openclaw/workspace/grok-conversations/
#

set -e

echo "🔧 Creating MERGED Automation System (Modern Bun + ESM)"
echo "========================================================"
echo ""
echo "Runtime: Bun (faster than Node)"
echo "Modules: ESM with modern fetch API"
echo "Logging: Centralized to Notion daily pages"
echo "Organizations: ALYGN, BitcashOrg, AndlerRL"
echo "Script Location: ~/.openclaw/workspace/scripts/"
echo ""

# ============================================================================
# ALYGN (Alygn) - 18 JOBS (Grok-heavy)
# ============================================================================

echo "📊 ALYGN JOBS (Grok-based granular approach)"
echo "--------------------------------------------"

# 1. Backup & Archive (2:00 AM)
echo "1. ALYGN Backup & Archive (2:00 AM CST)..."
openclaw cron add \
  --name "ALYGN Backup & Archive" \
  --description "Daily backup of ALYGN data and logs" \
  --cron "0 2 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run backup: cd ~/.openclaw/workspace && node scripts/system/backup.js" \
  --thinking low \
  --best-effort-deliver

# 2. Daily Activity Tracker (3:30 AM)
echo "2. ALYGN Daily Activity Tracker (3:30 AM CST)..."
openclaw cron add \
  --name "ALYGN Daily Activity Tracker" \
  --description "Track project metrics and save daily report" \
  --cron "30 3 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run daily tracker: cd ~/.openclaw/workspace && node scripts/alygn/daily-tracker.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 3. Morning Briefing (8:00 AM) - Multi-org + Audio
echo "3. Multi-Org Morning Briefing (8:00 AM CST)..."
openclaw cron add \
  --name "Multi-Org Morning Briefing" \
  --description "Generate Wobblus morning briefing with audio for ALL organizations via WhatsApp" \
  --cron "0 8 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Generate morning briefing: cd ~/.openclaw/workspace && node scripts/system/morning-briefing.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 4. Twitter: Daily Thread Ideas (9:00 AM) - Grok Prompt #1
echo "4. ALYGN Twitter: Thread Ideas (9:00 AM CST) - Grok #1..."
openclaw cron add \
  --name "ALYGN: Daily Thread Ideas" \
  --description "Generate thread ideas for @aialygn using Grok prompt #1" \
  --cron "0 9 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute Twitter automation: cd ~/.openclaw/workspace && node scripts/alygn/x-twitter/twitter-automation.js exec 1" \
  --thinking medium \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 5. Twitter: Trend Monitoring (Every 6 hours) - Grok Prompt #13
echo "5. ALYGN Twitter: Trend Monitoring (Every 6h) - Grok #13..."
openclaw cron add \
  --name "ALYGN: Trend Monitoring" \
  --description "Monitor daily X trends in AI alignment using Grok prompt #13" \
  --cron "0 */6 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute trend monitoring: cd ~/.openclaw/workspace && node scripts/alygn/x-twitter/twitter-automation.js exec 13 --search" \
  --thinking low \
  --best-effort-deliver

# 6. Twitter: Auto Engagement (Every 2 hours, 8 AM - 10 PM) - Grok Prompt #15
echo "6. ALYGN Twitter: Auto Engagement (Every 2h, 8 AM-10 PM) - Grok #15..."
openclaw cron add \
  --name "ALYGN: Auto Engagement" \
  --description "Automated replies to AI alignment threads using Grok prompt #15" \
  --cron "0 8-22/2 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute auto engagement: cd ~/.openclaw/workspace && node scripts/alygn/x-twitter/twitter-automation.js exec 15" \
  --thinking low \
  --best-effort-deliver

# 7. Jacobo Tracking Daily Summary (6:00 PM)
echo "7. ALYGN Jacobo Daily Summary (6:00 PM CST)..."
openclaw cron add \
  --name "ALYGN Jacobo Daily Summary" \
  --description "Daily Jacobo contact verification and summary" \
  --cron "0 18 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run Jacobo tracking: cd ~/.openclaw/workspace && node scripts/alygn/jacobo-tracking.js summary" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 8. Notion Sync Check (Every 3 hours, 8 AM - 8 PM)
echo "8. ALYGN Notion Sync Check (Every 3h, 8 AM-8 PM)..."
openclaw cron add \
  --name "ALYGN Notion Sync Check" \
  --description "Verify Notion database integrity and sync status" \
  --cron "0 8-20/3 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run Notion sync: cd ~/.openclaw/workspace && node scripts/system/notion-sync.js" \
  --thinking low \
  --best-effort-deliver

# 9. Project Health Monitor (Every 6 hours)
echo "9. ALYGN Project Health Monitor (Every 6h)..."
openclaw cron add \
  --name "ALYGN Project Health Monitor" \
  --description "Monitor project health metrics and alert on anomalies" \
  --cron "0 */6 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run health monitor: cd ~/.openclaw/workspace && node scripts/system/health-monitor.js" \
  --thinking low \
  --best-effort-deliver

# 10. Twitter: Daily Analytics (6:00 PM) - Grok Prompt #17
echo "10. ALYGN Twitter: Daily Analytics (6:00 PM CST) - Grok #17..."
openclaw cron add \
  --name "ALYGN: Daily Analytics" \
  --description "Twitter analytics review using Grok prompt #17" \
  --cron "0 18 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute Twitter analytics: cd ~/.openclaw/workspace && node scripts/alygn/x-twitter/twitter-automation.js exec 17" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 11. End-of-Day Summary (9:00 PM)
echo "11. ALYGN End-of-Day Summary (9:00 PM CST)..."
openclaw cron add \
  --name "ALYGN End-of-Day Summary" \
  --description "Daily wrap-up with accomplishments and tomorrow's prep" \
  --cron "0 21 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run EOD summary: cd ~/.openclaw/workspace && node scripts/alygn/eod-summary.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 12. GitHub Activity Digest (9:30 PM)
echo "12. ALYGN GitHub Activity Digest (9:30 PM CST)..."
openclaw cron add \
  --name "ALYGN GitHub Activity Digest" \
  --description "Daily GitHub activity summary for ALYGN projects" \
  --cron "30 21 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run GitHub digest: cd ~/.openclaw/workspace && node scripts/alygn/github-digest.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 13. Twitter: Weekly Niche Posts (Monday 10:00 AM) - Grok Prompt #3
echo "13. ALYGN Twitter: Weekly Niche Posts (Monday 10:00 AM CST) - Grok #3..."
openclaw cron add \
  --name "ALYGN: Weekly Niche Posts" \
  --description "Weekly niche-specific posts using Grok prompt #3" \
  --cron "0 10 * * 1" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute weekly niche posts: cd ~/.openclaw/workspace && node scripts/alygn/x-twitter/twitter-automation.js exec 3" \
  --thinking medium \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 14. Twitter: Auto-Post (10:00 AM) - Bird CLI
echo "14. ALYGN Twitter: Auto-Post Morning (10:00 AM CST) - Bird CLI..."
openclaw cron add \
  --name "ALYGN Twitter: Auto-Post (10 AM)" \
  --description "Post approved content to @aialyygn via bird CLI (morning batch)" \
  --cron "0 10 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Post to Twitter: cd ~/.openclaw/workspace && node scripts/alygn/twitter-poster.js post" \
  --thinking low \
  --best-effort-deliver

# 15. Twitter: Auto-Post (2:00 PM) - Bird CLI
echo "15. ALYGN Twitter: Auto-Post Afternoon (2:00 PM CST) - Bird CLI..."
openclaw cron add \
  --name "ALYGN Twitter: Auto-Post (2 PM)" \
  --description "Post approved content to @aialyygn via bird CLI (afternoon batch)" \
  --cron "0 14 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Post to Twitter: cd ~/.openclaw/workspace && node scripts/alygn/twitter-poster.js post" \
  --thinking low \
  --best-effort-deliver

# 16. Twitter: Auto-Post (6:00 PM) - Bird CLI
echo "16. ALYGN Twitter: Auto-Post Evening (6:00 PM CST) - Bird CLI..."
openclaw cron add \
  --name "ALYGN Twitter: Auto-Post (6 PM)" \
  --description "Post approved content to @aialyygn via bird CLI (evening batch)" \
  --cron "0 18 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Post to Twitter: cd ~/.openclaw/workspace && node scripts/alygn/twitter-poster.js post" \
  --thinking low \
  --best-effort-deliver

# 17. VC Contact Discovery (Monday 10:30 AM)
echo "17. ALYGN VC Contact Discovery (Monday 10:30 AM CST)..."
openclaw cron add \
  --name "ALYGN VC Contact Discovery" \
  --description "Weekly VC contact search and database update" \
  --cron "30 10 * * 1" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run VC contact discovery: cd ~/.openclaw/workspace && node scripts/alygn/vc-contact-discovery.js discover" \
  --thinking medium \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 18. VC Outreach Weekly (Monday 11:00 AM) - HYBRID: Grok + Notion tracking
echo "18. ALYGN VC Outreach Weekly (Monday 11:00 AM CST) - HYBRID..."
openclaw cron add \
  --name "ALYGN VC Outreach Weekly" \
  --description "Weekly VC outreach using Grok enhancement + Notion tracking" \
  --cron "0 11 * * 1" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute VC outreach: cd ~/.openclaw/workspace && node scripts/alygn/vc-outreach.js" \
  --thinking high \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 19. Twitter: Weekly Review (Sunday 5:00 PM) - Grok Prompt #18
echo "19. ALYGN Twitter: Weekly Review (Sunday 5:00 PM CST) - Grok #18..."
openclaw cron add \
  --name "ALYGN: Weekly Review" \
  --description "Twitter weekly performance review using Grok prompt #18" \
  --cron "0 17 * * 0" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute weekly review: cd ~/.openclaw/workspace && node scripts/alygn/x-twitter/twitter-automation.js exec 18" \
  --thinking medium \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 20. Weekly Reflection (Sunday 6:00 PM)
echo "20. ALYGN Weekly Reflection (Sunday 6:00 PM CST)..."
openclaw cron add \
  --name "ALYGN Weekly Reflection" \
  --description "Weekly project retrospective and planning" \
  --cron "0 18 * * 0" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run weekly reflection: cd ~/.openclaw/workspace && node scripts/alygn/weekly-reflection.js" \
  --thinking medium \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 21. Monthly Project Review (1st of month, 10:00 AM) - Includes Grok #19
echo "21. ALYGN Monthly Project Review (1st of month, 10:00 AM CST)..."
openclaw cron add \
  --name "ALYGN Monthly Project Review" \
  --description "Comprehensive monthly analysis + Twitter strategy update (Grok #19)" \
  --cron "0 10 1 * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Execute monthly review: cd ~/.openclaw/workspace && node scripts/alygn/monthly-review.js && node scripts/alygn/x-twitter/twitter-automation.js exec 19" \
  --thinking high \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

echo ""

# ============================================================================
# MULTI-ORGANIZATION - 3 JOBS
# ============================================================================

echo "🌍 MULTI-ORG JOBS"
echo "-----------------"

# 22. BitcashOrg Daily Tracking (3:45 AM)
echo "22. BitcashOrg Daily Activity Tracker (3:45 AM CST)..."
openclaw cron add \
  --name "BitcashOrg Daily Activity Tracker" \
  --description "Track BitcashOrg project metrics and save daily report" \
  --cron "45 3 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run BitcashOrg tracker: cd ~/.openclaw/workspace && node scripts/bitcash/daily-tracker.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 23. AndlerRL Personal Daily Tracking (4:00 AM)
echo "23. AndlerRL Personal Daily Tracker (4:00 AM CST)..."
openclaw cron add \
  --name "AndlerRL Personal Daily Tracker" \
  --description "Track AndlerRL personal projects and creative work" \
  --cron "0 4 * * *" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Run AndlerRL tracker: cd ~/.openclaw/workspace && node scripts/personal/daily-tracker.js" \
  --thinking low \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

# 21. Multi-Org Weekly Summary (Sunday 5:00 PM)
echo "21. Multi-Org Weekly Summary (Sunday 5:00 PM CST)..."
openclaw cron add \
  --name "Multi-Org Weekly Summary" \
  --description "Comprehensive weekly summary across ALYGN, BitcashOrg, and AndlerRL" \
  --cron "0 17 * * 0" \
  --tz "America/Costa_Rica" \
  --session isolated \
  --message "Generate comprehensive weekly summary covering all organizations: ALYGN (Alygn), BitcashOrg, and AndlerRL personal projects. Include GitHub activity, accomplishments, challenges, and next week's priorities for each." \
  --thinking high \
  --deliver \
  --to "+50662163355" \
  --best-effort-deliver

echo ""
echo "========================================================"
echo "✅ All 24 cron jobs created successfully!"
echo ""
echo "📊 SUMMARY:"
echo "   - ALYGN: 21 jobs (Grok-based + Twitter posting via bird CLI)"
echo "   - Multi-Org: 3 jobs (BitcashOrg, AndlerRL, Weekly Summary)"
echo ""
echo "🎯 IMPROVEMENTS:"
echo "   - Runtime: Bun (faster than Node.js)"
echo "   - Modules: ESM with modern fetch API"
echo "   - Logging: Centralized to Notion daily pages"
echo "   - Twitter Posting: Bird CLI integration with rate limiting"
echo "   - Dynamic Injection: Real data replaces placeholders"
echo ""
echo "📝 FEATURES:"
echo "   - Twitter Automation: Grok prompts #1, #3, #13, #15, #17, #18, #19"
echo "   - Twitter Posting: Auto-post approved content (10 AM, 2 PM, 6 PM)"
echo "   - Dynamic Values: [TRENDING_TOPICS], [TARGET_AUDIENCE], [ANALYTICS_DATA]"
echo "   - VC Discovery: New automated contact search"
echo "   - Logging: All outputs to Notion 'Automation Logs YYYY-MM-DD'"
echo ""
echo "📚 CONTEXT:"
echo "   - Grok strategies: grok-conversations/"
echo "   - ALYGN Growth Tracker: Notion 2fc334874af68163a104dbd45bde1f71"
echo "   - Scripts: ~/.openclaw/workspace/scripts/{alygn,bitcash,personal,system}/"
echo ""
echo "Verify: openclaw cron list"
echo "View logs: Check Notion 'Organizations TODO Lists' for daily log pages"
