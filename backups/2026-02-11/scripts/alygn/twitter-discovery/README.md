# Twitter Discovery System

**Purpose:** Hybrid browser discovery + X API execution for intelligent Twitter automation

## Architecture

```
Phase 1: Browser Discovery (browser-explore.js)
   ↓
   Scroll /explore → extract posts → discovery-*.json
   
Phase 2: Decision Engine (decision-engine.js)
   ↓
   Evaluate with Grok → research profiles → workflow-*.json
   
Phase 3: X API Execution (x-api-executor.js)
   ↓
   Execute actions via X API → track results → notify
```

## Workflow

### Phase 1: Browser Discovery ✅ BUILT
**Script:** `browser-explore.js`  
**Input:** Browser snapshot of /explore feed (via OpenClaw agent)  
**Output:** `discovery-{timestamp}.json`

**Features:**
- Navigate to /explore with alygn profile
- Scroll feed (simulate natural browsing)
- Extract post data: IDs, authors, content, engagement
- Keyword extraction (AI safety, alignment, AGI)
- Save raw discovery data

**Output Format:**
```json
{
  "timestamp": "2026-02-11T02:30:00Z",
  "source": "explore_feed",
  "discovered": [
    {
      "postId": "1234567890",
      "author": "@handle",
      "content": "Tweet text...",
      "engagement": { "likes": 456, "retweets": 123, "replies": 89 },
      "url": "https://x.com/handle/status/1234567890",
      "keywords": ["agi", "ai safety"]
    }
  ]
}
```

### Phase 2: Decision Engine ✅ COMPLETE
**Script:** `decision-engine.js`  
**Input:** `discovery-{timestamp}.json` (from Phase 1)  
**Output:** `workflow-{timestamp}.json`

**Features:**
- Load discovered posts
- Grok evaluation: "Is this worth engaging? How?"
- Web search for author credibility verification
- Action determination: reply / quote / follow
- Generate workflow JSON for API execution

**Evaluation Criteria:**
1. Relevance to ALYGN mission (AGI safety, alignment)
2. Author credibility in AI/safety space
3. Engagement potential (visibility, authority building)
4. Best strategy (reply with insight / quote with commentary / just follow)

**Output Format:** (same as twitter-automation.js)
```json
{
  "timestamp": "2026-02-11T02:35:00Z",
  "posts": [],
  "replies": [
    {
      "id": 1,
      "targetHandle": "@elonmusk",
      "targetUrl": "https://x.com/elonmusk/status/1234567890",
      "content": "Reply text with @aialygn mention",
      "mention": "@aialygn"
    }
  ],
  "profiles": ["@elonmusk", "@karpathy"]
}
```

### Phase 3: X API Execution ✅ COMPLETE
**Script:** `x-api-executor.js`  
**Input:** `workflow-{timestamp}.json` (from Phase 2)  
**Output:** Execution results + WhatsApp notification

**Features:**
- X API client initialization (XDK)
- Media upload (existing ✅)
- Reply execution (new)
- Quote execution (new)
- Poll creation (new)
- Result tracking + error handling
- WhatsApp summary notification

**X API Actions:**
| Action | Status | API Call |
|--------|--------|----------|
| Post with media | ✅ Working | `client.posts.create({ text, media })` |
| Reply to post | ✅ Working | `client.posts.create({ text, reply: { in_reply_to_tweet_id } })` |
| Quote post | ✅ **TESTED** | `client.posts.create({ text, quote_tweet_id })` - 2 live posts! |
| Create poll | ✅ Ready | `client.posts.create({ text, poll: { options[], duration_minutes } })` |

## Usage

### Manual Execution
```bash
# Phase 1: Browser Discovery (requires OpenClaw agent with browser access)
node scripts/alygn/twitter-discovery/browser-explore.js

# Phase 2: Decision Engine (evaluates discoveries)
node scripts/alygn/twitter-discovery/decision-engine.js

# Phase 3: X API Execution (posts to Twitter)
node scripts/alygn/twitter-discovery/x-api-executor.js
```

### Automated Execution (Future)
**Cron Integration:**
```
# Daily discovery + execution
0 11 * * * openclaw run scripts/alygn/twitter-discovery/browser-explore.js
5 11 * * * openclaw run scripts/alygn/twitter-discovery/decision-engine.js
10 11 * * * openclaw run scripts/alygn/twitter-discovery/x-api-executor.js
```

## Directory Structure
```
scripts/alygn/twitter-discovery/
├── README.md                    # This file
├── browser-explore.js          # Phase 1: Browser Discovery
├── decision-engine.js          # Phase 2: Decision Engine (TODO)
└── x-api-executor.js           # Phase 3: X API Execution (TODO)

twitter-outputs/alygn/
├── discovery/                  # Phase 1 output
│   └── discovery-*.json
└── workflows/                  # Phase 2 output
    └── workflow-*.json
```

## ✅ System Status: COMPLETE & VALIDATED

**Test Date:** Feb 11, 2026  
**Results:** 2/3 quote tweets posted successfully

**Posted Tweets:**
1. [Leopold Aschenbrenner quote](https://x.com/aialygn/status/2021417150179610626) - "AGI alignment needs way more firepower..."
2. [Roland Roy quote](https://x.com/aialygn/status/2021417173046981063) - "Reducing human existence to an optional variable..."

**Next Steps:**

1. **Cron Integration:**
   - Schedule daily discovery (search "AGI alignment", "AI safety", etc.)
   - Auto-execute approved quotes/replies
   - Target: 2-5 engagements per day

2. **Improve Discovery:**
   - Add more search keywords
   - Monitor specific authors (@eliezeryudkowsky, @AnthropicAI, etc.)
   - Track engagement performance

3. **WhatsApp Notifications:**
   - Send summary after execution
   - Alert on high-value opportunities

## Related Files
- `scripts/alygn/x-twitter/twitter-automation.js` - Existing Grok integration
- `scripts/alygn/x-twitter/post-x-api.js` - X API posting (with media)
- `twitter-outputs/alygn/workflows/workflow-*.json` - Existing workflow format
