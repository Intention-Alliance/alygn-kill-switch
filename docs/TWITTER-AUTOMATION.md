# Twitter Automation System - ALYGN

**Status:** ✅ Fully operational (Feb 11, 2026)  
**Handle:** @aialygn  
**System:** Dual workflow (Content Generation + Discovery)

---

## Overview

ALYGN's Twitter automation combines two complementary systems:

1. **Content Generation** - Original posts/threads via Grok
2. **Discovery System** - Reactive engagement with AI safety community

**Target:** 5 original posts + 2-5 reactive engagements per day

---

## Architecture

### System 1: Content Generation (Existing)

**Purpose:** Generate original thought leadership content

**Workflow:**
```
Grok Prompts (Notion) 
  ↓
twitter-automation.js (generate 10 ideas, select 5)
  ↓
workflow-*.json
  ↓
Browser Relay (alygn profile) → post threads
```

**Features:**
- Grok-powered content generation
- AI selects best 5 from 10 ideas
- Multi-point threads
- Strategic replies to thought leaders
- Profile follows

**Scripts:**
- `scripts/alygn/x-twitter/twitter-automation.js` - Content generation
- `scripts/alygn/x-twitter/twitter-browser-executor.ts` - Browser posting

---

### System 2: Discovery System (NEW - Feb 2026)

**Purpose:** Discover and engage with AI safety community posts

**3-Phase Workflow:**

```
Phase 1: Browser Discovery
  ↓
  Search "AGI alignment", "AI safety", etc.
  Extract posts (IDs, authors, engagement)
  ↓
  discovery-{timestamp}.json

Phase 2: Decision Engine
  ↓
  Grok evaluation: "Should we engage?"
  Strategy: reply / quote / follow / skip
  ↓
  workflow-{timestamp}.json

Phase 3: X API Executor
  ↓
  Execute: quote tweets, replies, polls
  Track results
  ↓
  Posted to @aialygn
```

**Features:**
- Keyword-based search discovery (100% relevance)
- Grok mission-alignment evaluation
- Quote tweets (`quote_tweet_id`)
- Replies (`in_reply_to_tweet_id`)
- Polls (`poll: { options[], duration_minutes }`)
- Media uploads
- Rate limiting (5s delays)

**Scripts:**
- `scripts/alygn/twitter-discovery/browser-explore.js` - Phase 1
- `scripts/alygn/twitter-discovery/decision-engine.js` - Phase 2
- `scripts/alygn/twitter-discovery/x-api-executor.js` - Phase 3

**Test Results (Feb 11, 2026):**
- Discovery relevance: 100% (search "AGI alignment")
- Decision approval: 100% (3/3 posts approved)
- Execution success: 67% (2/3 posted)
- Live tweets: [tweet1](https://x.com/aialygn/status/2021417150179610626), [tweet2](https://x.com/aialygn/status/2021417173046981063)

---

## Master Automation

**Script:** `scripts/alygn/twitter-master-automation.js`

**Combines both systems:**
```bash
node scripts/alygn/twitter-master-automation.js
```

**Execution Order:**
1. Content Generation → workflow JSON
2. Discovery System → search → evaluate → post
3. Browser Posting → original content threads

**Expected Output:**
- 5 original posts (threads)
- 2-5 reactive engagements (quotes/replies)
- Summary report via WhatsApp

---

## Configuration

### Browser Profile

**Profile:** `alygn`  
**Location:** Chrome user data dir (separate from default)  
**Status:** Authenticated to X.com  
**Usage:** `browser --profile="alygn"` in all calls

### Timeouts

- **Navigation:** 120s (page load)
- **Snapshot:** 60s (rendering)
- **Actions:** 90s (complex interactions)
- **Between posts:** 45s (rate limit stability)

### X API Credentials

**Location:** `~/.openclaw/workspace/config/credentials.json`

```json
{
  "twitter": {
    "consumerKey": "...",
    "consumerSecret": "...",
    "accessToken": "...",
    "accessTokenSecret": "..."
  }
}
```

---

## Cron Schedule

**Daily Execution:** 11:00 AM Costa Rica time

```bash
openclaw cron list | grep Twitter
```

**Job:** "ALYGN: Twitter Master Automation (Content + Discovery)"  
**Session:** Isolated (1h timeout)  
**Delivery:** Discord #annotations thread "Alygn: X/Twitter Growth Engagement" (`1470977688368840928`)

---

## Discovery Keywords

**Primary searches:**
- "AGI alignment"
- "AI safety"
- "existential risk"
- "mechanistic interpretability"
- "AI governance"

**Target authors (monitor):**
- @eliezeryudkowsky
- @AnthropicAI
- @amodei
- @karpathy (safety-related)
- @RogerGrosse
- @leopoldasch
- @rohinmshah

---

## Grok Prompts

**Location:** Notion "Twitter/X Growth Strategy"  
**Page ID:** `2fc334874af681889a5fd95a1fa1dd72`

**Key Prompts:**
- Prompt #1: Content generation (10 ideas)
- Prompt #13: Strategic replies
- (Discovery System uses inline evaluation prompts)

---

## Output Directories

```
twitter-outputs/alygn/
├── discovery/           # Phase 1 output (browser search results)
│   └── discovery-*.json
├── workflows/           # Phase 2 output (approved actions)
│   └── workflow-*.json
└── posts/              # Historical posts
    └── YYYY-MM-DD/
```

---

## Performance Tracking

### Metrics

- **Discovery relevance:** Search-based = 100%
- **Approval rate:** Grok evaluation ~75-100%
- **Execution success:** 60-80% (X API + rate limits)
- **Daily engagement:** Target 7-10 total posts

### Common Issues

**HTTP 403 on old posts:**
- Quote tweets fail on posts >6 months old
- Solution: Focus on recent posts (<3 months)

**Rate limiting:**
- Wait 5s between API calls
- Wait 45s between browser actions
- Reduce frequency if hitting limits

**Browser relay timeouts:**
- Use extended timeouts (120s+ for navigation)
- Keep browser profile active between runs
- Restart if session becomes stale

---

## Manual Execution

### Content Generation Only
```bash
cd ~/.openclaw/workspace
node scripts/alygn/x-twitter/twitter-automation.js
```

### Discovery System Only
```bash
cd ~/.openclaw/workspace

# Phase 1: Browser discovery (via OpenClaw agent)
# (requires browser access)

# Phase 2: Decision engine
node scripts/alygn/twitter-discovery/decision-engine.js

# Phase 3: X API execution
node scripts/alygn/twitter-discovery/x-api-executor.js
```

### Full Master Automation
```bash
cd ~/.openclaw/workspace
node scripts/alygn/twitter-master-automation.js
```

---

## Maintenance

### Update Grok Prompts
1. Edit in Notion: "Twitter/X Growth Strategy"
2. Prompts auto-sync via API
3. No code changes needed

### Add Discovery Keywords
Edit `scripts/alygn/twitter-discovery/browser-explore.js`:
```javascript
const keywords = ["AGI alignment", "AI safety", "NEW KEYWORD"];
```

### Adjust Selectivity
Edit `scripts/alygn/twitter-discovery/decision-engine.js`:
- Lower approval threshold: engage with more posts
- Raise approval threshold: engage with fewer posts

### Monitor Performance
```bash
# Check recent workflows
ls -lt twitter-outputs/alygn/workflows/ | head -5

# View latest discovery
cat twitter-outputs/alygn/discovery/discovery-*.json | jq '.stats'

# Check cron execution
openclaw cron runs <job-id>
```

---

## Future Enhancements

### Phase 4: Advanced Features (TODO)

- **Author monitoring:** Track specific high-value accounts
- **Trending analysis:** Detect emerging AI safety topics
- **Engagement metrics:** Track quote/reply performance
- **WhatsApp notifications:** Alert on high-value opportunities
- **Sentiment analysis:** Avoid negative/controversial posts
- **Thread chaining:** Multi-post discussions
- **Image generation:** Visual content for threads

---

## References

- **System Design:** `scripts/alygn/twitter-discovery/README.md`
- **Cron Configuration:** `openclaw cron list --json`
- **X API Docs:** https://docs.x.com/x-api/
- **Browser Relay:** OpenClaw browser tool (profile="alygn")

---

**Last Updated:** Feb 11, 2026  
**Maintained By:** Wobblus (@aialygn automation)
