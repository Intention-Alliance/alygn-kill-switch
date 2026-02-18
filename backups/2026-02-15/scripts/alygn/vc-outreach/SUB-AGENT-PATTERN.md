# Sub-Agent Pattern - Correct Implementation

**Date:** Feb 14, 2026  
**Status:** ✅ CORRECTED  
**Source:** https://docs.openclaw.ai/tools/subagents

## The Problem (Feb 13 - WRONG)

Was trying to use `sessions_spawn` from a Node.js script:

```javascript
const { stdout } = await execAsync(
  `openclaw sessions spawn --task="..." --timeout-seconds=180 2>&1`
);
// This doesn't work! Scripts can't call OpenClaw tools.
```

**Why this failed:**
- `sessions_spawn` is a **tool only AI agents can use**
- Scripts don't have access to OpenClaw's tool system
- Shell `exec` can't trigger tool execution in an agent's session
- Result: Generic text responses instead of structured JSON

## The Solution (Feb 14 - RIGHT)

**Correct architecture:**

```
1. Script identifies VCs needing research
2. Script posts request to Discord (or files)
3. Wobblus (AI agent) receives request
4. Wobblus uses sessions_spawn tool to spawn sub-agents
5. Sub-agents execute web_search/web_fetch and return JSON
6. Wobblus saves results to /tmp/vc-research-[name].json
7. Script waits for file, reads results
8. Script updates Notion, continues to next item
```

## Key Pattern

**Scripts orchestrate. AI executes tools. Files coordinate.**

```javascript
// SCRIPT (deep-research-vcs-v3.js)
async function requestResearch(vc) {
  console.log(`🔍 Requesting research for: ${vc.name}`);
  
  // Check cache first
  if (fs.existsSync('/tmp/vc-research-[name]-result.json')) {
    return JSON.parse(fs.readFileSync(...));
  }
  
  // Post request to Discord for Wobblus
  // "Please research and save to /tmp/vc-research-[name]-result.json"
  
  // Wait for file (max 30s)
  let attempts = 0;
  while (!fs.existsSync(researchFile) && attempts < 30) {
    await sleep(1000);
    attempts++;
  }
  
  // Read and return
  if (fs.existsSync(researchFile)) {
    return JSON.parse(fs.readFileSync(researchFile));
  }
}
```

```javascript
// WOBBLUS (Me, the AI agent)
// When I see the Discord message:

// 1. I have access to sessions_spawn tool
const subagent = await sessions_spawn({
  task: `Research Khosla Ventures.
    Use web_search and web_fetch.
    Extract: emails, thesis, investments, pain points.
    Return JSON with partnerEmails[], painPoints[], thesis, partners[], governanceSignals[]`,
  timeout: 180
});

// 2. Sub-agent executes with native tools (web_search, web_fetch)
// 3. I receive results and save to file
fs.writeFileSync(
  '/tmp/vc-research-khosla-ventures-result.json',
  JSON.stringify(result)
);

// 4. Script detects file and continues
```

## Documentation Reference

**Official docs:** https://docs.openclaw.ai/tools/subagents

**Key concepts:**
- Sub-agents run in isolated sessions
- They can access most tools (except sessions_*, gateway, cron)
- Results are announced back to main session
- File-based coordination works because both can read/write /tmp/

## Tool Access

**What sub-agents CAN do:**
- ✅ web_search
- ✅ web_fetch (firecrawl)
- ✅ read/write files
- ✅ exec/process commands
- ✅ image analysis
- ✅ browser automation

**What sub-agents CANNOT do:**
- ❌ sessions_spawn (no nested spawn)
- ❌ sessions_send/sessions_list
- ❌ cron (status checking)
- ❌ gateway (system admin)

## Implementation: VC Research

**Location:** `deep-research-vcs-v3.js`

**Workflow:**
1. Load 1 VC from Notion (one-by-one)
2. Check if already researched (cache)
3. If not cached:
   - Post request to Discord
   - Wait 30s for results file
   - If timeout, skip and move to next
4. If results exist:
   - Read JSON
   - Update Notion (emails, pain points, thesis)
   - Mark "Ready for outreach"
5. Next iteration

**Usage:**
```bash
# Research 1 VC
node deep-research-vcs-v3.js

# Research 5 VCs (one at a time)
node deep-research-vcs-v3.js --limit=5

# Dry-run (show requests, don't wait)
node deep-research-vcs-v3.js --dry-run
```

## Why This Works

1. **Proper separation:** Scripts coordinate, Wobblus executes
2. **Tool access:** Wobblus has sessions_spawn, scripts don't
3. **Reliability:** Files are simple and always work
4. **Transparency:** Each request is visible, can be monitored
5. **Scalability:** One-by-one allows for manual review if needed
6. **Error recovery:** Failed research doesn't block entire batch

## Lessons Learned

1. **Check official docs first** - Don't assume CLI commands exist
2. **Understand tool permissions** - Only AI agents can use certain tools
3. **Separate concerns** - Scripts orchestrate, AI executes
4. **File coordination** - Simple and reliable between processes
5. **One-by-one** - Better for transparency and debugging

---

**Reference:** Andler's guidance (Feb 14, 2026)
> "We might be spawning the sub-agents wrongly. Look at your official docs on how to use sub-agents. You should be able to send to yourself in the main session to spawn it."

✅ **NOW FIXED**
