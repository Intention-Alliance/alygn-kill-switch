---
name: x-growth
description: General-purpose X/Twitter growth automation (multi-project). Handles trend discovery, dynamic content generation, and strategic engagement. Project-agnostic - use for any Twitter account growth.
metadata: {"openclaw":{"emoji":"📣","requires":{"bins":["node","bash"],"env":["X_API_KEY","X_API_SECRET","X_ACCESS_TOKEN","X_ACCESS_SECRET","GROK_API_KEY"],"os":["linux","darwin"]}}}
---

# X/Twitter Growth Automation Skill (General)

**Purpose:** Multi-project Twitter growth automation with dynamic trend discovery and engagement.

**Status:** Development (creating from scratch)

**Target:** Any Twitter account needing automated growth, trend analysis, and strategic posting.

---

## 🔒 CRITICAL RULES

### Project-Agnostic Design
- ✅ **No hardcoded project context** - works with any brand/voice
- ✅ **Dynamic voice configuration** - loads from project config file
- ✅ **Multi-account support** - can manage multiple Twitter accounts
- ✅ **Trend-agnostic** - discovers trends, doesn't assume topic

### Core Capabilities
1. ✅ Trend discovery and analysis
2. ✅ Dynamic content generation (Grok API)
3. ✅ Strategic replies and quote tweets
4. ✅ Multi-account management
5. ✅ Format enforcement (configurable per project)

---

## Architecture

### Project Configuration
Each project defines its own config:
```json
{
  "project": "project-name",
  "twitter": {
    "handle": "@projecthandle",
    "voice": "professional|casual|quirky",
    "topics": ["topic1", "topic2"],
    "hashtags": ["#Tag1", "#Tag2"],
    "signature": "more at @projecthandle"
  },
  "grok": {
    "systemPrompt": "custom system prompt",
    "temperature": 0.7
  }
}
```

### Workflow Phases
1. **Discovery** - Browse X trends, extract relevant topics
2. **Analysis** - Correlate trends with project topics
3. **Generation** - Create content using Grok (with project voice)
4. **Validation** - Check content quality and format
5. **Posting** - Post via X API (tweets, replies, quotes)
6. **Engagement** - Follow relevant accounts, engage with posts
7. **Reporting** - Summary to Discord/email

---

## Usage

### As a Skill
```bash
openclaw invoke --tool x-growth --action daily-growth --args-json '{"project":"myproject"}'
```

### With Lobster
```bash
lobster run .lobster/alygn-x-growth-daily.lobster
```

### Direct Script Execution

#### X API Executor (Unified - supports all modes)
```bash
# Search mode (for cronjob discovery)
node scripts/shared/x-growth/x-api-executor.js --search --query="AI governance" --limit=10

# Workflow mode (JSON from decision engine)
node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/workflow.json --dry-run

# Legacy mode (markdown from Grok)
node scripts/shared/x-growth/x-api-executor.js /tmp/grok-output.md --dry-run

# Auto-detect latest Alygn workflow
node scripts/shared/x-growth/x-api-executor.js --dry-run
```

#### Other Scripts
```bash
node scripts/x-growth/daily-growth.js --project=myproject
node scripts/alygn/x-growth/daily-summary.js
```

---

## Files

### Core Scripts
```
scripts/shared/x-growth/
└── x-api-executor.js          ✅ UNIFIED - X API execution engine
                                   - Supports: search, JSON workflow, markdown
                                   - Exports: postTweet, replyToPost, quotePost, etc.

scripts/alygn/x-growth/
├── daily-summary.js           ✅ Discord reporting
├── x-api-executor.js          → Symlink to scripts/shared/x-growth/x-api-executor.js
├── content/
│   ├── thread-generator.js    ✅ Grok content generation
│   └── post-pre-approved.js   ✅ Pre-approved institutional posts
├── parser/
│   ├── twitter-content-parser.js  ✅ Markdown → JSON
│   └── workflow-validator.js      ✅ JSON validation
├── posting/
│   ├── format-enforcer.js     ✅ Apply Alygn format
│   └── twitter-browser-executor.ts ✅ Browser automation
├── research/
│   ├── decision-engine.js     ✅ Grok evaluation of trends
│   ├── browser-explore.js     ✅ Trend discovery
│   ├── parse-snapshot.js      ✅ Snapshot parsing
│   └── x-api-executor.js      → Symlink to scripts/shared/x-growth/x-api-executor.js
└── engagement-system.js       ✅ Engagement coordination

workflows/
└── .lobster/alygn-x-growth-daily.lobster  ✅ Daily automation workflow
```

### Script Unification (2026-03-02)

**Problem:** Had duplicate `x-api-executor.js` in multiple locations with diverging features.

**Solution:** Created unified script at `scripts/shared/x-growth/x-api-executor.js` with:
- ✅ Search mode (for cronjob discovery)
- ✅ JSON workflow mode (municipal + decision engine)
- ✅ Markdown mode (legacy Grok output)
- ✅ Auto-detect (latest Alygn workflow)
- ✅ Exported functions for programmatic use

**Legacy paths maintained via symlinks:**
- `scripts/shared/x-growth/x-api-executor.js` → symlink
- `scripts/alygn/x-growth/research/x-api-executor.js` → symlink

See `SCRIPT-UNIFICATION-COMPLETE.md` for full details.
```

---

## Differences from `alygn-x-growth`

| Feature | `x-growth` (General) | `alygn-x-growth` (Specific) |
|---------|---------------------|----------------------------|
| **Context** | Project-agnostic | Hardcoded Alygn context |
| **Voice** | Configurable | Institutional, governance-first |
| **Signature** | Configurable | `more at @aialygn` |
| **Hashtags** | Configurable | `#AIGovernance`, `#AIAlignment`, etc. |
| **Pre-approved** | None | 100 institutional posts |
| **Parser** | Generic | Alygn-specific markdown parser |

**When to use which:**
- Use `x-growth` for new projects, multi-project management
- Use `alygn-x-growth` for @aialygn daily operations

---

**Created:** 2026-03-01
**Status:** Skeleton created, implementation in progress
