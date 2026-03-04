# X/Twitter Growth Scripts (General, Multi-Project)

**Purpose:** Project-agnostic Twitter automation for any brand/account.

**Skill:** `x-growth` (📣)

---

## Directory Structure

```
scripts/x-growth/
├── daily-growth.js         # Main daily workflow orchestrator
├── trend-discovery.js      # Discovers and analyzes X trends
├── content-generator.js    # Generates content via Grok API
├── reply-engine.js         # Strategic reply generation
├── format-validator.js     # Validates tweet format per project config
└── projects/
    ├── project-a.json      # Project A config
    ├── project-b.json      # Project B config
    └── template.json       # Template for new projects
```

---

## Project Configuration Template

```json
{
  "name": "project-name",
  "twitter": {
    "handle": "@handle",
    "consumerKey": "...",
    "consumerSecret": "...",
    "accessToken": "...",
    "accessSecret": "...",
    "voice": "professional",
    "topics": ["AI", "Technology", "Governance"],
    "hashtags": ["#AI", "#Tech"],
    "signature": "more at @handle",
    "signaturePosition": "end"
  },
  "grok": {
    "systemPrompt": "You are a professional AI assistant...",
    "temperature": 0.7,
    "maxTokens": 1000
  },
  "schedule": {
    "postsPerDay": 3,
    "repliesPerDay": 5,
    "quotesPerDay": 2
  }
}
```

---

## Usage

### Daily Growth Workflow
```bash
node scripts/x-growth/daily-growth.js --project=myproject
```

### Trend Discovery Only
```bash
node scripts/x-growth/trend-discovery.js --project=myproject --output=trends.json
```

### Content Generation Only
```bash
node scripts/x-growth/content-generator.js --project=myproject --trends=trends.json
```

---

## Integration with Lobster

```lobster
name: x-growth-daily
steps:
  - id: discover
    command: node scripts/x-growth/trend-discovery.js --project={{project}}
  - id: generate
    command: node scripts/x-growth/content-generator.js --project={{project}}
    after: discover
  - id: post
    command: node scripts/x-growth/daily-growth.js --project={{project}}
    after: generate
    approval: optional
```

---

**Created:** 2026-03-01
**Status:** Skeleton created, implementation pending
