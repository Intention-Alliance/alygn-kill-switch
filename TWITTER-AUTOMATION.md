# ALYGN Twitter Automation System

**Last Updated:** 2026-02-05 10:57 CST  
**Status:** ✅ Active & Automated

---

## Overview

Automated, AI-driven Twitter engagement system for @aialyygn:
- **5 curated posts daily** (selected from 10 AI-generated ideas)
- **5 strategic replies** to key alignment researchers
- **Browser automation** via OpenClaw Chrome extension
- **Scheduled execution** via cron job (11:00 AM daily)

---

## System Architecture

### 1. Content Generation (Grok Prompts)
- **Prompt #1** (Daily): Generate 10 thread ideas on AI alignment
  - Topics: oversight, reward hacking, interpretability, deception, corrigibility, etc.
  - Output: Markdown file with hooks, expansions, and viral points
  - Storage: `twitter-outputs/prompt-1-*.md`

- **Prompt #13** (Every 6h): Monitor AI alignment trends + generate 5 replies
  - Search: xAI, AGI safety, interpretability trends
  - Output: 5 tailored replies for high-engagement posts
  - Storage: `twitter-outputs/prompt-13-*.md`

### 2. Content Curation
**Selection Criteria:**
- Timely (references recent AI news)
- Technical depth (appeals to alignment researchers)
- Engagement potential (questions, controversy, or surprising angle)
- Thread-ready (has 3-5 expansion points)

**Best 5 Posts (Locked):**
1. **Superintelligent Oversight** (#1) — Most fundamental, evergreen
2. **Inner vs Outer Alignment** (#3) — Technical depth, debate-worthy
3. **Fast AI Takeoff** (#4) — Timely with GPT-5.2 6.6hr benchmark
4. **Deceptive Alignment** (#5) — Scary/engaging, high RT potential
5. **Constitutional AI** (#10) — Recent news (Anthropic), practical

### 3. Browser Automation
**Engine:** OpenClaw Chrome Extension + Playwright  
**Flow:**
```
1. Click compose box
2. Type post (280 char limit enforcement)
3. Post (Ctrl+Enter)
4. Navigate to reply target
5. Type reply (custom per handle)
6. Post reply
7. Follow profile (if new)
8. Log results + metrics
```

**Handles:** @xai, @Dr_Singularity, @AhmedZRashad, @KaiwenZhou9, @steve47285

### 4. Cron Job Orchestration
**Job ID:** `f0e2a878-ed73-4de0-bcf9-b99580ff5e6a`  
**Schedule:** `0 11 * * *` (11:00 AM, America/Costa_Rica)  
**Isolated Session:** Runs as separate agent, posts summary to +50662163355  

**Execution:**
```bash
cd ~/.openclaw/workspace
node scripts/alygn/twitter-browser-automation.js
```

---

## Daily Workflow

**11:00 AM (Cron triggers):**
1. ✅ Generate 10 thread ideas via Grok (#1)
2. ✅ Monitor trends + generate 5 replies (#13)
3. ✅ Open browser (Chrome extension attached)
4. ✅ Post 5 selected posts (one every 2 minutes)
5. ✅ Post 5 strategic replies to target profiles
6. ✅ Follow 5 profiles (if not already following)
7. ✅ Log results to `automation-run-*.json`
8. ✅ Send summary to WhatsApp

**Expected Output:**
- 5 posts posted
- 5 replies posted
- 5 profiles followed
- ~30 minute runtime (with browser delays)

---

## File Structure

```
~/.openclaw/workspace/
├── scripts/alygn/
│   └── twitter-browser-automation.js    # Main automation script
├── twitter-outputs/
│   ├── prompt-1-*.md                    # 10 thread ideas
│   ├── prompt-13-*.md                   # 5 reply ideas
│   ├── prompt-15-*.md                   # 20 generic templates
│   └── automation-run-*.json            # Execution logs
├── TWITTER-AUTOMATION.md                # This file
└── MEMORY.md                            # System recorded here
```

---

## Configuration

### Selected Posts (Locked)
See `scripts/alygn/twitter-browser-automation.js` → `SELECTED_POSTS` array

### Reply Targets (Locked)
See `scripts/alygn/twitter-browser-automation.js` → `REPLY_TARGETS` array

### Cron Job Config
Access via: `openclaw cron list` → Search for "ALYGN: Automated Twitter Browser Posting"

---

## Monitoring & Logging

### Execution Logs
- **Location:** `twitter-outputs/automation-run-*.json`
- **Format:** JSON with posts sent, replies sent, errors, timestamps
- **Retention:** All logs kept (purge manually if needed)

### WhatsApp Updates
- Daily summary posted to +50662163355
- Includes: Posts sent count, reply count, any errors
- Time: 11:05 AM (after cron execution)

### Engagement Tracking (Manual)
- Check @aialyygn timeline for likes/RTs daily
- Monitor mention activity in Notifications
- Use analytics tools (X Creator Studio) for detailed metrics

---

## Troubleshooting

### Posts Not Posting
1. Check cron job status: `openclaw cron list | grep "ALYGN"`
2. Verify Chrome extension is attached
3. Check browser automation logs: `~/.openclaw/workspace/logs/`
4. Ensure account is still logged in

### Replies Not Posting
1. Verify target accounts exist (check URL manually)
2. Ensure character limits respected (280 char max)
3. Check rate limiting (X may throttle rapid posts)

### Browser Automation Issues
1. Restart OpenClaw: `openclaw gateway restart`
2. Reattach Chrome extension: Open tab, click OpenClaw icon
3. Check for browser updates or X layout changes

---

## Manual Overrides

### Post a One-off Tweet
```bash
cd ~/.openclaw/workspace
# Just go to x.com and post manually via compose box
```

### Update Selected Posts
Edit `scripts/alygn/twitter-browser-automation.js`:
- Modify `SELECTED_POSTS` array (1-10 options from Prompt #1)
- Run `node scripts/alygn/twitter-browser-automation.js` manually

### Update Reply Targets
Edit `scripts/alygn/twitter-browser-automation.js`:
- Modify `REPLY_TARGETS` array
- Update handles and content as needed

### Disable Automation
Disable cron job: `openclaw cron update f0e2a878-ed73-4de0-bcf9-b99580ff5e6a --disable`

---

## Performance Metrics

**Expected Engagement (Best 5 Posts):**
- **Impressions:** 50-200 per post (new account, niche audience)
- **Engagement Rate:** 2-5% (replies, RTs, likes)
- **Growth:** 5-20 followers per day (from replies)

**Reply Engagement:**
- **Reply CTR:** 10-15% (strategic, targeted replies)
- **Follow-back Rate:** 20-30% (quality audience)

---

## Future Improvements

**Planned Enhancements:**
- [ ] A/B test post timing (11 AM vs 2 PM vs 6 PM)
- [ ] Add emoji variation to A/B test engagement
- [ ] Implement reply scoring (rank by engagement potential)
- [ ] Auto-follow high-interaction accounts
- [ ] Track sentiment of replies (positive/negative/neutral)
- [ ] Integrate with analytics dashboard
- [ ] Add thread continuation (post #1 → reply with continuation)

---

## References

- **Cron Job ID:** `f0e2a878-ed73-4de0-bcf9-b99580ff5e6a`
- **Grok Prompts:** 1 (ideas), 13 (replies), 15 (templates)
- **Target Account:** @aialyygn (ALYGN R&D)
- **Followers:** Starting from [check current count]

---

**Automation established by Wobblus on 2026-02-05.**  
*Runs automatically. No manual intervention needed (unless customizing).*
