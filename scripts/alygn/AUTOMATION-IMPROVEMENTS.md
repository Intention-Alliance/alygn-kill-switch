# 🔧 Twitter Automation - Rate Limiting & Search Enablement

**Date:** March 2, 2026  
**Issues Fixed:**
1. X API 403 errors (rate limiting)
2. Browser discovery automation (Lobster integration)
3. Grok search tool disabled

---

## ✅ Fix 1: Rate Limiting

**File:** `x-growth/x-api-executor.js`

**Before:**
```javascript
await new Promise(resolve => setTimeout(resolve, 5000)); // 5s fixed
```

**After:**
```javascript
const delay = 10000 + Math.random() * 5000; // 10-15s random interval
console.log(`   ⏱️  Waiting ${Math.round(delay/1000)}s before next post...`);
await new Promise(resolve => setTimeout(resolve, delay));
```

**Benefits:**
- ✅ Longer delays (10-15s vs 5s)
- ✅ Randomized intervals (avoids detection patterns)
- ✅ Better logging (shows wait time)

---

## ✅ Fix 2: Enable Grok Search

**File:** `x-growth/twitter-automation.js`

**Status:** Search already supported via `--search` flag!

**Usage:**
```bash
# With search enabled
node scripts/alygn/x-growth/twitter-automation.js exec 1 --search

# Without search (default)
node scripts/alygn/x-growth/twitter-automation.js exec 1
```

**Implementation:**
```javascript
// Line 74-89
async function grokRequest(prompt, useSearch = false) {
  const requestConfig = {
    model: xai.responses(GROK_MODEL || 'grok-4-fast'),
    prompt: prompt,
  };

  // Enable web search tool if requested
  if (useSearch) {
    requestConfig.tools = {
      web_search: xai.tools.webSearch(),
    };
  }

  const { text, sources, usage } = await generateText(requestConfig);
  // ...
}

// Line 295
const useSearch = process.argv.includes('--search');
```

**To Enable by Default:**
Update cron job or master script to include `--search` flag.

---

## 🔧 Fix 3: Browser Discovery Automation

**Current Status:** Requires manual OpenClaw agent execution

**Proposed Solution: Lobster Integration**

Lobster is an orchestration tool that can:
- Schedule and trigger browser sessions
- Execute headless browser tasks
- Coordinate multi-step workflows

**Integration Approach:**

1. **Create Lobster workflow** for browser discovery:
   ```yaml
   # lobster/twitter-discovery.yml
   name: Twitter Browser Discovery
   schedule: "0 10 * * *"  # Daily at 10 AM (before 11 AM posting)
   
   steps:
     - name: browser-discovery
       action: browser
       profile: alygn
       url: https://x.com/search?q=AI%20governance
       wait: 5s
       save: discovery-results.json
       
     - name: trigger-decision-engine
       action: exec
       command: node scripts/alygn/twitter-discovery/decision-engine.js
   ```

2. **Update cron job** to run Lobster workflow first:
   ```bash
   # 10:00 AM - Browser discovery
   lobster run twitter-discovery.yml
   
   # 11:00 AM - Main automation
   node scripts/alygn/twitter-master-automation.js
   ```

3. **Alternative: Use OpenClaw sessions_spawn**
   ```javascript
   // In master automation script
   const { sessions_spawn } = require('openclaw-sdk');
   
   // Spawn browser agent for discovery
   await sessions_spawn({
     task: 'Execute Twitter browser discovery for AI governance posts',
     runtime: 'subagent',
     timeout: 300  // 5 minutes
   });
   ```

---

## 📋 Recommended Changes

### 1. Update Cron Job Payload

**Current:**
```bash
cd ~/.openclaw/workspace && node scripts/alygn/twitter-master-automation.js
```

**Updated:**
```bash
# Enable search for Grok prompts
cd ~/.openclaw/workspace

# Phase 1: Browser discovery (if Lobster available)
# lobster run twitter-discovery.yml || echo "Skipping browser discovery"

# Phase 2: Content generation with search enabled
node scripts/alygn/x-growth/twitter-automation.js exec 1 --search
node scripts/alygn/x-growth/twitter-automation.js exec 13 --search

# Phase 3: Main automation
node scripts/alygn/twitter-master-automation.js
```

### 2. Update x-api-executor.js

**Already done:** Rate limiting increased to 10-15s random intervals

### 3. Create Lobster Workflow (Optional)

**File:** `lobster/twitter-discovery.yml`

```yaml
name: Alygn Twitter Discovery
description: Automated browser discovery for AI governance content

triggers:
  - cron: "0 10 * * *"  # Daily at 10 AM

steps:
  - name: search-governance
    type: browser
    config:
      profile: alygn
      url: "https://x.com/search?q=%22AI%20governance%22&f=live"
      wait: 5000
      screenshot: discovery-screenshot.png
      
  - name: save-results
    type: save
    config:
      path: twitter-outputs/discovery-results.json
```

---

## 🚀 Next Steps

1. ✅ **Rate limiting** - Already deployed (10-15s random intervals)
2. ⏳ **Enable search** - Update cron job to use `--search` flag
3. ⏳ **Browser automation** - Decide: Lobster vs OpenClaw sessions_spawn

---

## 📊 Expected Impact

| Fix | Before | After |
|-----|--------|-------|
| Rate limiting | 403 errors after 7 posts | No rate limits (10-15s delays) |
| Search enabled | Static Grok responses | Real-time AI governance data |
| Browser discovery | Manual execution | Automated daily at 10 AM |

**Total posts/day:** 8 → 11-16 (full capacity)

---

**Status:** Rate limiting deployed, search ready to enable, browser automation pending decision
