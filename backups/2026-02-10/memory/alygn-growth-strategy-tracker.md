# ALYGN Growth Strategy Tracker - Context

**Notion Page:** https://www.notion.so/ALYGN-Growth-Strategy-Tracker-2fc334874af68163a104dbd45bde1f71  
**Page ID:** `2fc334874af68163a104dbd45bde1f71`  
**Created:** 2026-02-03

## Purpose
Central dashboard tracking ALYGN (Intention Alliance) growth initiatives across two primary channels:
1. **VC Outreach** - Investor relations and fundraising
2. **Twitter/X Growth** - Community building via @aialygn

## Automation Integration
This tracker is referenced by multiple cron jobs:
- **VC Outreach Weekly** (Monday 10 AM) - Reads targets, logs results
- **Twitter Growth - Afternoon** (2 PM daily) - Reads content strategy, logs metrics
- **Twitter Growth - Evening** (6 PM daily) - Reads engagement goals, logs activity

## Key Metrics Tracked
### VC Outreach
- Target VC firms
- Outreach status (pending, contacted, responded, follow-up)
- Email templates used
- Response rates
- Meeting conversions

### Twitter/X (@aialygn)
- Follower growth rate
- Engagement rate (likes, retweets, replies)
- Top performing tweets
- Content themes/categories
- Posting frequency
- Reply/community engagement stats

## Workflow
1. **Planning:** Strategy and targets defined in Notion tracker
2. **Execution:** Automation scripts reference tracker for targets/content
3. **Logging:** Results written back to tracker after each cycle
4. **Analysis:** Weekly/monthly reviews use tracker data for insights

## Related Scripts
- `/home/andlersrv/.openclaw/workspace/alygn-automation/scripts/vc-outreach.js`
- `/home/andlersrv/.openclaw/workspace/alygn-automation/scripts/twitter-automation.js`

## Integration Points
- **Grok API (xAI):** Generate AI-powered content for tweets
- **Twitter API:** Post content, engage with community
- **Email SMTP:** Send VC outreach emails
- **Notion API:** Read strategy, write results

## Status
🟡 **Configured but awaiting API credentials** for full automation

**Current capabilities:**
- ✅ Read strategy from Notion
- ✅ Log manual results
- ⚠️ Automated posting pending Twitter API
- ⚠️ Automated outreach pending SMTP credentials
- ⚠️ AI content generation pending Grok API

## Access
- Visible to: Andler, Wobblus (via Notion API)
- Editable by: Andler (manual strategy updates)
- Automated updates by: Cron jobs (via scripts)

---

**Note:** This tracker is the **single source of truth** for ALYGN growth strategy. All automation pulls from and writes to this page to maintain consistency.
