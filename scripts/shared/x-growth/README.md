# X API Executor - Unified Execution Engine

**Location:** `scripts/shared/x-growth/x-api-executor.js`  
**Status:** ✅ Production Ready  
**Last Updated:** 2026-03-02

---

## 🎯 Purpose

Unified X/Twitter API execution engine supporting multiple workflows:

1. **Alygn X-Growth** - Daily automated growth (posts, replies, quotes)
2. **Municipal Outreach** - X warmup strategy for municipal engagement
3. **Search/Discovery** - Trend discovery for cronjob automation

---

## 🔧 Usage Modes

### **Mode 1: Search (Discovery/Cronjob)**

Use for trend discovery and engagement targeting:

```bash
# Basic search
node scripts/shared/x-growth/x-api-executor.js --search --query="AI governance"

# With limit
node scripts/shared/x-growth/x-api-executor.js --search --query="municipal AI" --limit=20

# Save results
node scripts/shared/x-growth/x-api-executor.js --search --query="AI policy" --limit=10 > /tmp/search-results.json
```

**Use Cases:**
- Daily trend discovery for Alygn X-Growth
- Finding relevant conversations for municipal outreach
- Monitoring brand mentions

---

### **Mode 2: JSON Workflow (Municipal/Decision Engine)**

Execute pre-built workflows from JSON files:

```bash
# Dry-run (simulate)
node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/workflow.json --dry-run

# Live execution
node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/workflow.json --live

# Auto-detect latest Alygn workflow
node scripts/shared/x-growth/x-api-executor.js --dry-run
```

**Workflow JSON Format:**
```json
{
  "posts": [
    {
      "content": "Tweet content here",
      "mediaPath": "/path/to/image.png",
      "quoteTweetId": "123456789"  // Optional for quote tweets
    }
  ],
  "replies": [
    {
      "content": "Reply content",
      "targetUrl": "https://x.com/user/status/123456789",
      "targetHandle": "@user",
      "mediaPath": "/path/to/image.png"
    }
  ]
}
```

**Use Cases:**
- Municipal outreach X warmup (Phase 1 & 2)
- Decision Engine output execution
- Batch posting from pre-generated content

---

### **Mode 3: Markdown (Legacy Grok Output)**

Execute content from Grok markdown output:

```bash
# Dry-run
node scripts/shared/x-growth/x-api-executor.js /tmp/grok-output.md --dry-run

# Live
node scripts/shared/x-growth/x-api-executor.js /tmp/grok-output.md --live
```

**Markdown Format:**
```markdown
## Posts

### Post 1
**Content:** This is the tweet content
**Status:** ready
**Media:** /path/to/image.png

### Reply 1
**Target:** @username
**Content:** This is the reply
**Target URL:** https://x.com/user/status/123456789
```

**Use Cases:**
- Legacy Alygn X-Growth workflow
- Quick manual posting from Grok output

---

### **Mode 4: Auto-Detect (Alygn Workflows)**

Automatically find and execute latest workflow:

```bash
# Auto-detect latest Alygn workflow (dry-run)
node scripts/shared/x-growth/x-api-executor.js --dry-run

# Auto-detect latest (live)
node scripts/shared/x-growth/x-api-executor.js --live
```

**Searches in:** `twitter-outputs/alygn/workflows/`

**Use Cases:**
- Daily Alygn X-Growth automation
- Cronjob execution

---

## 📦 Programmatic Usage

Import functions for custom scripts:

```javascript
import { 
  executeJsonWorkflow,      // Execute JSON workflow
  executeMarkdownWorkflow,  // Execute markdown workflow
  searchMode,               // Search X
  postTweet,                // Post single tweet
  replyToPost,              // Reply to tweet
  quotePost,                // Quote tweet
  createPoll,               // Create poll (TODO)
  loadCredentials,          // Load X API credentials
  createClient              // Create X API client
} from './scripts/shared/x-growth/x-api-executor.js';

// Example: Post a tweet
const client = createClient();
const tweetId = await postTweet(client, "Hello from unified executor!");

// Example: Execute workflow
const results = await executeJsonWorkflow('/tmp/workflow.json', false); // false = live
```

---

## 🔑 Configuration

### Credentials

Stored in: `config/credentials.json`

```json
{
  "twitter": {
    "consumerKey": "YOUR_API_KEY",
    "consumerSecret": "YOUR_API_SECRET",
    "accessToken": "YOUR_ACCESS_TOKEN",
    "accessTokenSecret": "YOUR_ACCESS_SECRET"
  }
}
```

### Rate Limits

Enforced by script (X API Free tier):

| Action | Daily Limit |
|--------|-------------|
| Posts | 50 |
| Replies | 50 |
| Quotes | 50 |
| Follows | 4 |
| Likes | 8 |

**Note:** Script includes 5-second delay between actions to respect rate limits.

---

## 📊 Output & Logging

### Console Output

```
ℹ️  Loading workflow: /tmp/workflow.json
ℹ️  Workflow: 5 posts, 3 replies
✅ X API client initialized

ℹ️  Posting: AI governance is critical for...
  ✅ Posted (ID: 1234567890)

ℹ️  Replying to @user...
  ✅ Reply posted (ID: 1234567891)

============================================================
✅ LIVE complete! 8 actions, 0 failed
============================================================
```

### Audit Logs

Saved to: `twitter-outputs/logs/audit-<timestamp>.json`

```json
{
  "mode": "live",
  "executedAt": "2026-03-02T14:30:00.000Z",
  "workflow": { ... },
  "posts": [
    { "id": "1234567890", "content": "..." }
  ],
  "replies": [
    { "id": "1234567891", "content": "...", "target": "@user" }
  ],
  "quotes": [],
  "executed": 8,
  "failed": 0
}
```

---

## 🧪 Testing

### Test Search Mode
```bash
node scripts/shared/x-growth/x-api-executor.js --search --query="test" --limit=2
```

### Test JSON Workflow (Dry-Run)
```bash
node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/test-workflow.json --dry-run
```

### Test Markdown (Dry-Run)
```bash
node scripts/shared/x-growth/x-api-executor.js /tmp/test-output.md --dry-run
```

### Test Auto-Detect
```bash
node scripts/shared/x-growth/x-api-executor.js --dry-run
```

---

## 🐛 Troubleshooting

### "Failed to load credentials"
**Solution:** Check `config/credentials.json` exists and has valid Twitter API keys.

### "No workflow files found"
**Solution:** Run Decision Engine or content generator first to create workflow JSON.

### "Rate limit exceeded"
**Solution:** Script enforces delays. Wait and retry. Consider upgrading X API tier.

### "Search failed: Unauthorized"
**Solution:** X API Free tier has limited search access. Use browser discovery instead.

---

## 📝 Examples

### Example 1: Daily Alygn X-Growth (Cronjob)

```bash
#!/bin/bash
# Daily cronjob: 10 AM CST

# 1. Discover trends
node scripts/shared/x-growth/x-api-executor.js --search --query="AI governance" --limit=10

# 2. Generate content (Grok)
node scripts/alygn/x-growth/content/thread-generator.js --prompts=1,13

# 3. Parse and validate
node scripts/alygn/x-growth/parser/twitter-content-parser.js --input=/tmp/grok.md --output=/tmp/workflow.json

# 4. Execute (dry-run first)
node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/workflow.json --dry-run

# 5. Execute live (after approval)
node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/workflow.json --live

# 6. Report
node scripts/alygn/x-growth/daily-summary.js
```

### Example 2: Municipal Outreach X Warmup

```bash
#!/bin/bash
# X Warmup Phase 1: Follow + Like

node scripts/alygn/muni-outreach/engagement/x-warmup-phase1.js \
  --input=/tmp/muni-researched.json \
  --mock

# X Warmup Phase 2: Quote + Reply
node scripts/alygn/muni-outreach/engagement/x-warmup-phase2.js \
  --input=/tmp/muni-researched.json \
  --mock
```

---

## 🔄 Version History

### v2.0 (2026-03-02) - Unified
- ✅ Merged legacy + research versions
- ✅ Added search mode
- ✅ Added auto-detect workflow
- ✅ Exported functions for programmatic use
- ✅ Comprehensive audit logging

### v1.5 (2026-02-10) - Research Version
- ✅ JSON workflow support
- ✅ Quote tweets
- ✅ Better error handling

### v1.0 (2026-01-15) - Legacy
- ✅ Markdown parsing
- ✅ Basic posting
- ✅ Dry-run mode

---

## 📚 Related Documentation

- `SCRIPT-UNIFICATION-COMPLETE.md` - Unification plan and details
- `skills/x-growth/SKILL.md` - Skill usage guide
- `.lobster/alygn-x-growth-daily.lobster` - Daily workflow definition
- `docs/alygn/PROPUESTA-RESUMEN-CONTEXT.md` - Municipal outreach context

---

**Maintained by:** Wobblus 🔧  
**Last Review:** 2026-03-02  
**Status:** ✅ Production Ready
