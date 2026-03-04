---
name: x-growth
description: Automated X/Twitter content creation and strategic engagement for @aialyygn (Alygn R&D). Generates daily threads, niche posts, and strategic replies using Grok API. All content references @aialygn or hashtag #ALYGN if mentions not allowed.
metadata: {"openclaw":{"emoji":"📣","requires":{"bins":["node","bash"],"env":["X_API_KEY","X_API_SECRET","X_ACCESS_TOKEN","X_ACCESS_SECRET","GROK_API_KEY"],"os":["linux","darwin"]}}}
---

# X/Twitter Growth Automation Skill

**Purpose:** Automated X/Twitter content creation, trend analysis, and strategic engagement for @aialygn  
**Correlation:** Aligns all content with Alygn core mission (humanizing technology, intention monetization)  
**Created:** 2026-02-10  
**Updated:** 2026-02-11 (Added X API capabilities + format enforcement)

---

## 🔒 CRITICAL RULES (READ FIRST)

### ✅ ALL PHASES ARE MANDATORY - DO NOT SKIP
**Updated: 2026-02-18** - Each phase is critical. Workflow is NOW CONNECTED.

**Daily execution MUST include (8 phases):**
1. ✅ Phase 1: Pre-approved institutional post (X API)
2. ✅ Phase 2: Content generation (Grok Prompts #1 + #13) - generates markdown
3. ✅ Phase 3: Parse content (NEW!) - converts markdown to workflow JSON
4. ✅ Phase 4: Post original content (X API) - posts Grok-generated posts + replies
5. ✅ Phase 5: Browser discovery (explore trends)
6. ✅ Phase 6: Decision engine (Grok evaluation)
7. ✅ Phase 7: Post discovery content (X API) - posts quotes/replies
8. ✅ Phase 8: Summary report (Discord thread)

**CRITICAL CONNECTION (FIXED 2026-02-18):**
BEFORE: Phase 2 generated markdown → Phase 4 posted OLD workflow.json (disconnected!)
AFTER: Phase 2 generates → Phase 3 parses to JSON → Phase 4 posts generated content (connected!)

**Why Phase 3 matters:** Parses markdown output from Grok → creates workflow JSON → bridges content generation to posting.

### Mandatory Posting Format
**EVERY tweet MUST end with:**
```
[Content]

[1-3 hashtags]

more at #ALYGN
```
Applied automatically by `formatTweet()` in all posting scripts.

### Architecture Separation
- ❌ **Browser is NOT for posting** - ONLY for exploring/navigating
- ✅ **Browser role:** Navigate /explore → Extract posts → workflow.json
- ✅ **X API role:** Read workflow.json → Apply format → Post

### X API Capabilities (100% Coverage)
1. ✅ Post tweets (text + media)
2. ✅ Mention users (@username)
3. ✅ Reply to tweets (with media)
4. ✅ Quote tweets (with media)
5. ✅ Post with media (images/videos)
6. ✅ Create polls (2-4 options)

**Documentation:** See Phase 3 below for complete details.

---

## 🎯 Core Workflow

### Phase 1: Trend Analysis (Browser Relay)

**Objective:** Understand what's trending visually + textually

**Process:**
1. Use browser relay (Alygn profile) to navigate X.com
2. Analyze trending topics (text + visual presentation)
3. Identify topics that correlate with Alygn mission
4. Screenshot trending content for context

**Tools:**
- OpenClaw browser tool with `profile="alygn"`
- X.com Explore page
- Trending hashtags analysis

**Commands:**
```javascript
// Take snapshot of X trends
browser --action=snapshot --profile=alygn --targetUrl="https://x.com/explore"

// Click into trending topic
browser --action=act --profile=alygn --request='{"kind":"click", "ref":"...", "targetId":"..."}'

// Screenshot specific trend
browser --action=screenshot --profile=alygn --fullPage=false
```

---

### Phase 2: Content Generation (Grok)

**Objective:** Generate content aligned with trends + Alygn mission

**Grok Prompts:** Located in `repos/alygn/core/grok-conversations/`

**Key Prompts:**
1. **Prompt 1:** Daily thread generation (hook + 3-4 points)
2. **Prompt 3:** Niche technical posts
3. **Prompt 13:** Trend monitoring + strategic replies
4. **Prompt 15:** Auto-engagement (replies to relevant discussions)
5. **Prompt 17:** Twitter analytics
6. **Prompt 18:** Weekly performance review
7. **Prompt 19:** Monthly strategy adjustment

**Content Requirements:**
- Must correlate with Alygn core (intention alliance, humanizing tech)
- Hook-driven (first line captures attention)
- Value-focused (not self-promotional)
- Authentic voice (not corporate)

---

### Phase 3: Content Posting (X API)

**Objective:** Post generated content via X API

**Script:** `scripts/alygn/twitter-discovery/x-api-executor.js`

**✅ ALL SUPPORTED CAPABILITIES:**
1. **Post tweets** - Regular text posts
2. **Mention users** - @username anywhere (automatic)
3. **Reply to tweets** - Reply by post ID
4. **Quote tweets** - Quote with commentary
5. **Post with media** - Images/videos (PNG, JPG, MP4, MOV)
6. **Create polls** - 2-4 options, custom duration

**🔒 MANDATORY FORMAT (ALL TWEETS):**
```
[Content]

[1-3 hashtags: #AIGovernance #AIAlignment #AISafety]

more at @aialygn
```
Applied automatically via `formatTweet()` function.

**Approved hashtags:**
- `#AIGovernance` (primary)
- `#AIAlignment` (technical)
- `#AISafety` (safety)
- `#AGI`, `#AIPolicy`, `#AIEthics`, `#AIRisk` (contextual)

**CRITICAL ARCHITECTURE:**
- ❌ Browser is NOT for posting - ONLY for exploring/navigating
- ✅ Browser: Navigate /explore → Extract data → workflow.json
- ✅ X API: Read workflow.json → Apply format → Post

**Usage:**
```bash
# Post from workflow JSON (recommended)
node scripts/alygn/twitter-discovery/x-api-executor.js

# Pre-approved posts (institutional messages)
node scripts/alygn/post-pre-approved.js
```

**Workflow JSON structure:**
```json
{
  "posts": [
    {"content": "Tweet text", "mediaPath": "/path/img.png"},
    {"content": "Quote text", "quoteTweetId": "123456789"},
    {"content": "Poll question", "poll": {"options": ["A","B"], "duration_minutes": 1440}}
  ],
  "replies": [
    {"content": "Reply text", "targetUrl": "https://x.com/user/status/123", "mediaPath": "/path/img.png"}
  ]
}
```

**Output:**
- Posts via X API (OAuth 1.0a)
- Format enforcement automatic
- 5s delay between actions (rate limiting)
- Returns tweet IDs + links

---

### Phase 4: Engagement Tracking

**Objective:** Monitor engagement and optimize strategy

**Metrics:**
- Impressions per post
- Engagement rate (likes/replies/retweets)
- Follower growth
- Best-performing content types

**Tools:**
- `engagement-system.js` - Track and optimize engagement
- Notion database - Log all activity
- Weekly/monthly reviews

---

## 🧠 Alygn Correlation Matrix

**How to align trends with Alygn mission:**

| Trending Topic | Alygn Angle | Example Hook |
|----------------|-------------|--------------|
| AI Safety | Oversight protocols | "AGI systems will need oversight at scale..." |
| Content Moderation | Decentralized governance | "Who should decide what you see online?" |
| Creator Economy | Intention monetization | "Creators are exploited by platforms..." |
| Privacy | User control | "Your attention is being harvested..." |
| AGI Progress | Humanizing technology | "As AI gets smarter, we need human values..." |
| Social Media Drama | Freedom of attention | "You should choose your feed, not an algorithm" |

**Correlation Test:**
- ✅ Does this relate to humanizing technology?
- ✅ Does this relate to intention/attention economics?
- ✅ Does this promote user freedom/dignity?
- ✅ Does this align with decentralized governance?

If YES to 2+ questions → Create content

---

## 📋 X/Twitter Growing Plan

**Reference:** Alygn X/Twitter Growing Plan  
**Goal:** 10K followers by Q2 2026

### Content Strategy

**Daily:**
- 1 thread (4-6 posts) - Core Alygn philosophy
- 2-3 niche posts - Technical insights
- 5-10 strategic replies - Engage with relevant conversations

**Weekly:**
- 1 niche deep-dive - Technical breakdown
- 1 performance review - What worked/what didn't

**Monthly:**
- 1 strategy adjustment - Optimize based on data
- 1 milestone post - Celebrate growth/achievements

### Engagement Strategy

**Follow:**
- AGI researchers (OpenAI, Anthropic, DeepMind)
- Decentralized tech advocates
- Creator economy thought leaders
- Privacy/freedom tech builders

**Reply to:**
- Posts about AI safety/alignment
- Discussions about creator monetization
- Threads about social media problems
- Content about user privacy/freedom

**Avoid:**
- Generic "great post!" replies
- Self-promotional spam
- Engagement bait
- Controversial hot takes (unless strategic)

---

## 🤖 Automation Scripts

### Main Orchestrator

**File:** `scripts/alygn/x-twitter/twitter-automation.js`

**Commands:**
```bash
# Execute specific prompt
node scripts/alygn/x-twitter/twitter-automation.js exec 1  # Daily thread
node scripts/alygn/x-twitter/twitter-automation.js exec 3  # Niche post
node scripts/alygn/x-twitter/twitter-automation.js exec 13 --search  # Trend monitoring

# List available prompts
node scripts/alygn/x-twitter/twitter-automation.js list

# Generate content only (no post)
node scripts/alygn/x-twitter/twitter-automation.js exec 1 --dry-run
```

---

### Posting Script

**File:** `scripts/alygn/x-twitter/post-via-x-api.js`

**Workflow:**
1. Read workflow JSON from `twitter-outputs/alygn/`
2. Post threads via X API
3. Attach media (if specified)
4. Update workflow with tweet IDs
5. Log success/failure

**Error Handling:**
- Rate limit → Wait and retry
- API error → Log and skip
- Auth failure → Alert human

---

### Phase 3: Content Parser (NEW - CONNECTS WORKFLOW)

**Objective:** Parse markdown output from Grok and create workflow JSON for posting

**Script:** `scripts/alygn/twitter-content-parser.js`

**Purpose:**
- Reads markdown files from Phase 2 (Grok Prompts #1 + #13)
- Extracts posts and replies from markdown
- Creates workflow JSON in correct format for x-api-executor.js
- **This is the BRIDGE between content generation and posting**

**Input:** Markdown files (`prompt-1-*.md`, `prompt-13-*.md`) in `twitter-outputs/`

**Output:** `workflow-{timestamp}.json` in `twitter-outputs/alygn/workflows/`

**Usage:**
```bash
node scripts/alygn/twitter-content-parser.js
```

**Workflow JSON structure:**
```json
{
  "timestamp": "2026-02-18T...",
  "source": "twitter-automation.js (Grok Prompts #1 + #13)",
  "posts": [
    {"id": 1, "content": "Post content from Grok", "type": "original"},
    {"id": 2, "content": "Another post", "type": "original"}
  ],
  "replies": [
    {"content": "Strategic reply from Grok", "type": "strategic-reply"}
  ],
  "profiles": []
}
```

**Critical:** Without this parser, Grok-generated content stays as markdown files and never gets posted. Phase 4 reads this workflow.json and posts it via X API.

---

### Phase 4: Post Original Content (MANDATORY)

**Objective:** Post Grok-generated content via X API

**Script:** `scripts/alygn/twitter-discovery/x-api-executor.js`

**Process:**
1. Reads workflow.json from Phase 3 (parser output)
2. Applies formatTweet() to all content
3. Posts via X API (OAuth 1.0a)
4. Returns tweet IDs + links

**What gets posted:**
- 5 original posts from Grok Prompt #1
- 5 strategic replies from Grok Prompt #13

**Result:** Content generation is now CONNECTED to posting! (was disconnected before)

---

### Phase 5: Content Generation (MANDATORY)

**Objective:** Generate original content for Alygn voice

**Scripts:**
```bash
# Prompt #1: Daily thread ideas (10 ideas → select best 5)
node scripts/alygn/x-twitter/twitter-automation.js exec 1

# Prompt #13: Strategic replies + trend monitoring
node scripts/alygn/x-twitter/twitter-automation.js exec 13
```

**Output:**
- 5 post ideas (threads with hooks + points)
- 5 strategic reply suggestions
- Saved to `twitter-outputs/alygn/`

**Critical:** This phase ALWAYS executes - generates content for next cycle or manual review. Do NOT skip.

### Engagement System

**File:** `scripts/alygn/x-twitter/engagement-system.js`

**Features:**
- Strategic reply generation
- Follow recommendations
- Engagement tracking
- Performance analytics

---

### Image Generation

**File:** `scripts/alygn/x-twitter/generate-images-selective.js`

**Process:**
1. Read workflow JSON
2. Identify posts that need images
3. Generate via Gemini 3 Pro Image
4. Save to `twitter-outputs/alygn/`
5. Update workflow JSON with paths

**Prompts:** AI-themed visuals (abstract, futuristic, tech-forward)

---

## 🔧 Browser Relay Integration

**Profile:** `alygn` (authenticated X.com session)

### Visual Trend Analysis

**Objective:** See what's trending as users see it

**Steps:**
1. Navigate to X.com Explore
2. Take snapshot of trending topics
3. Analyze visual presentation (images, formatting, hooks)
4. Identify high-engagement patterns

**Example:**
```bash
# Snapshot trends
openclaw browser --action=snapshot --profile=alygn \
  --targetUrl="https://x.com/explore" \
  --refs=aria --compact=true

# Screenshot specific trend
openclaw browser --action=screenshot --profile=alygn \
  --fullPage=false --type=png
```

---

### Engagement Actions

**Objective:** Reply, like, follow via browser (when API isn't available)

**Steps:**
1. Navigate to target tweet
2. Click reply button
3. Type generated reply
4. Submit

**Example:**
```bash
# Navigate to tweet
openclaw browser --action=navigate --profile=alygn \
  --targetUrl="https://x.com/username/status/123456789"

# Click reply
openclaw browser --action=act --profile=alygn \
  --request='{"kind":"click", "ref":"reply-button"}'

# Type reply
openclaw browser --action=act --profile=alygn \
  --request='{"kind":"type", "ref":"compose-field", "text":"Reply text..."}'

# Submit
openclaw browser --action=act --profile=alygn \
  --request='{"kind":"click", "ref":"submit-button"}'
```

---

## 📊 Success Metrics

**Track these:**
- Follower growth rate (target: +50/week)
- Engagement rate (target: 5-10%)
- Impressions per post (target: 1000+)
- Best-performing content types
- Optimal posting times

**Review:**
- Weekly: Adjust content mix
- Monthly: Adjust strategy
- Quarterly: Set new growth goals

---

## 🚀 Execution Checklist

### Daily (Automated via Cron)

- [ ] 11:00 AM - Generate & post daily thread (Prompt 1)
- [ ] Every 6h - Monitor trends (Prompt 13)
- [ ] Every 2h (8 AM-10 PM) - Auto-engage (Prompt 15)

### Weekly (Automated via Cron)

- [ ] Monday 10 AM - Niche + regular posts (Prompt 1 + 3)
- [ ] Sunday 5 PM - Weekly review (Prompt 18)

### Monthly (Automated via Cron)

- [ ] 1st of month 10 AM - Monthly review + strategy adjustment (Prompt 19)

### Manual (When Needed)

- [ ] Trend-jacking - React to breaking news/viral trends
- [ ] Community building - Engage with key followers
- [ ] Collaboration - Coordinate with Alygn team

---

## 🛠️ Troubleshooting

### "X API rate limit exceeded"

**Solution:** Wait 15 minutes, or use browser relay fallback

### "Browser relay timeout"

**Solution:** Increase timeout: `--timeoutMs=60000`

### "Trend correlation unclear"

**Solution:** Use Alygn Correlation Matrix (see above)

### "Content not posting"

**Solution:**
1. Check credentials in `config/credentials.json`
2. Verify X API access (write permissions)
3. Check logs in `logs/YYYY-MM-DD/`
4. Fallback to browser relay

---

## 📚 Related Files

**Scripts:**
- `scripts/alygn/x-twitter/twitter-automation.js` - Main orchestrator
- `scripts/alygn/x-twitter/post-via-x-api.js` - X API posting
- `scripts/alygn/x-twitter/engagement-system.js` - Engagement tracking
- `scripts/alygn/x-twitter/generate-images-selective.js` - Image generation

**Documentation:**
- `scripts/alygn/x-twitter/TWITTER-API-GUIDE.md` - X API setup
- `repos/alygn/core/grok-conversations/` - Grok prompts
- `twitter-outputs/alygn/` - Generated content & workflows

**Configuration:**
- `config/credentials.json` - X API credentials
- Browser profile: `alygn` (authenticated session)

---

## ✅ Success Pattern

**When everything works:**
1. Trend identified (browser relay visual + textual)
2. Content generated (Grok prompt + Alygn correlation)
3. Media created (Gemini image generation)
4. Posted successfully (X API or browser relay)
5. Engagement tracked (Notion + analytics)
6. Strategy optimized (weekly/monthly reviews)

**Result:** Consistent, high-quality content that grows @aialygn following while staying true to Alygn mission.

---

_Created: 2026-02-10_  
_Status: Production-ready_  
_Maintained by: Wobblus 🔧_
