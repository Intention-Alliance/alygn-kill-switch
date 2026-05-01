# X-Scout Browser Integration Documentation

## Overview

The `x-scout-unified.js` script now uses actual OpenClaw browser relay calls for live X/Twitter profile verification. The previous `browserAction()` placeholder that returned mock data has been replaced with real browser tool integration.

## Changes Made

### 1. Replaced `browserAction()` Placeholder

**Before:**
```javascript
async function browserAction(action, params) {
  // Mock implementation returning fake data
  console.log(`   🔧 Browser action: ${action}`, params);
  if (action === "open") {
    return {
      targetId: `WINDOW_${Date.now()}`,
      url: params.targetUrl
    };
  }
  return { success: true };
}
```

**After:**
- `browserAction()` function **removed entirely**
- Direct `browser()` tool calls used throughout
- No more mock data - all calls hit the real browser relay
- Added `browserToolCall()` wrapper with retry logic for transient errors

### 2. Implemented `verifyWithBrowserRelay()` with Real Browser Calls

The single-target verification function now:
1. Opens a browser window via `browser({ action: "open", ... })`
2. Waits 15 seconds for page load
3. Navigates via `browser({ action: "navigate", ... })`
4. Takes snapshot via `browser({ action: "snapshot", ... })`
5. Parses snapshot for profile data
6. Checks follow button state
7. Closes window via `browser({ action: "close", ... })`

**Browser call pattern:**
```javascript
const openResult = await browserToolCall({
  action: "open",
  profile: "alygn",
  target: "host",
  targetUrl: profileUrl
});

await browserToolCall({
  action: "navigate",
  profile: "alygn",
  target: "host",
  targetId: openResult.targetId,
  targetUrl: profileUrl,
  loadState: "domcontentloaded",
  timeoutMs: 15000
});

const snapshot = await browserToolCall({
  action: "snapshot",
  profile: "alygn",
  target: "host",
  targetId: openResult.targetId,
  refs: "aria",
  compact: true
});

await browserToolCall({
  action: "close",
  profile: "alygn",
  target: "host",
  targetId: openResult.targetId
});
```

### 3. Added `browserToolCall()` - Retry Wrapper

New function that wraps browser calls with retry logic:
- Retries on `PortInUseError`
- Retries on `browser not running`
- Retries on timeout errors
- Exponential backoff: 2s, 4s, 6s between retries
- Validates `browser()` function exists (OpenClaw context check)

```javascript
async function browserToolCall(params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (typeof browser !== "function") {
        throw new Error("browser() tool not available...");
      }
      return await browser(params);
    } catch (error) {
      const isTransient = error.message?.includes("PortInUse") ||
                         error.message?.includes("browser not running") ||
                         error.message?.includes("timeout");
      if (isTransient && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        continue;
      }
      throw error;
    }
  }
}
```

### 4. Added `parseProfileSnapshot()` - Real Snapshot Parsing

**Before:**
```javascript
function parseProfileSnapshot(snapshot, expectedHandle) {
  return {
    exists: true,  // Always true!
    handle: `@${expectedHandle}`,
    followers: null,
    following: null,
    verified: null,
    hasRecentTweets: true  // Always true!
  };
}
```

**After:**
- Parses actual aria snapshot text for profile indicators
- Detects "This account doesn't exist" and suspension messages
- Extracts follower/following counts (e.g., "1.2K followers")
- Detects verified badge indicators
- Checks for recent activity via time indicators ("min", "hour", "today", etc.)
- Returns `exists: false` when profile indicators are missing

### 5. Added `checkFollowButton()` - Real Follow Detection

**Before:**
```javascript
async function checkFollowButton(targetId) {
  return {
    canFollow: true,  // Always true!
    alreadyFollowing: false
  };
}
```

**After:**
- Takes a fresh browser snapshot
- Searches for "Follow" vs "Following" button text
- Returns accurate `canFollow` and `alreadyFollowing` states
- Handles errors gracefully

### 6. Added `batchVerify()` - Multi-Target Window Management

New function implementing the full browser relay pattern:

**Phase 1:** Open all windows simultaneously
```javascript
for (const target of targets) {
  const openResult = await browserToolCall({ action: "open", ... });
  windows.push({ target, targetId: openResult.targetId, ... });
}
```

**Phase 2:** Wait 15 seconds for all pages to load

**Phase 3:** Iterate through each window for verification
```javascript
for (const win of windows) {
  await browserToolCall({ action: "navigate", targetId: win.targetId, ... });
  const snapshot = await browserToolCall({ action: "snapshot", targetId: win.targetId, ... });
  win.verification = parseProfileSnapshot(snapshot, win.cleanHandle);
}
```

**Phase 4:** Check follow buttons for verified profiles

**Phase 5:** Retry failed windows with `networkidle` load state

**Phase 6:** Close all windows

### 7. Updated `main()` to Use Batch Mode

- Single target (n=1): Uses `verifyWithBrowserRelay()` (individual)
- Multiple targets (n>1): Uses `batchVerify()` (parallel window management)
- Zero targets: Exits with warning

## Browser Relay Profile

- **Profile:** `alygn`
- **Target:** `host`
- **Timeout:** 15s for navigation, 15s for snapshot
- **Snapshot refs:** `aria` (for accessibility tree parsing)
- **Compact mode:** `true` (reduces token usage)

## Error Handling

- Window open failures: Logged, skipped
- Navigation timeouts: Caught, marked as error
- Snapshot failures: Caught, marked as error
- Follow check failures: Returns `canFollow: false`
- Cleanup: Always attempts to close windows even on error
- PortInUse errors: Retried up to 3 times with backoff

## Usage

### Single Target (Test Mode)
```bash
# Run within OpenClaw agent context
openclaw exec "node scripts/alygn/x-scout-unified.js --scope=vc --batch-size=1"
```

### Batch Mode
```bash
openclaw exec "node scripts/alygn/x-scout-unified.js --scope=vc --batch-size=10"
openclaw exec "node scripts/alygn/x-scout-unified.js --scope=municipal --wave=1 --batch-size=10"
```

### Test Script
```bash
openclaw exec "node scripts/alygn/x-scout-browser-test.js"
```

## Testing

Test with a known VC account:
```bash
# Ensure vc-outreach/drafts/ contains a file with handle @lightspeedvp
openclaw exec "node scripts/alygn/x-scout-unified.js --scope=vc --batch-size=1"
```

Expected output:
```
🔍 X-Scout Unified - Zero-Trust Verification
   Scope: vc
   Batch Size: 1
   Reports Dir: /home/andlersrv/.openclaw/workspace/reports/x-scout

📊 Loading VC targets from draft files...
   Found 1 VC firms

🎯 Total targets to verify: 1

============================================================
🔍 Verifying: Lightspeed Venture Partners (vc)
============================================================
   🌐 Opening browser relay for: https://x.com/lightspeedvp
   ✅ Window opened: <targetId>
   ⏳ Waiting 15 seconds for page load...
   📍 Navigated to profile
   📊 Followers: 123456
   📊 Following: 567
   ✅ Verified account
   📝 Recent activity detected
   ➕ Follow button available
   ✅ Verification complete: verified

💾 JSON Report: /home/andlersrv/.openclaw/workspace/reports/x-scout/...
📄 Markdown Report: /home/andlersrv/.openclaw/workspace/reports/x-scout/...
```

## Files Modified

- `scripts/alygn/x-scout-unified.js` - Main script with real browser integration
- `scripts/alygn/reports/x-scout-browser-integration.md` - This documentation
- `scripts/alygn/x-scout-browser-test.js` - Standalone test script

## Important Notes

### OpenClaw Context Required

The `browser()` tool is only available when running within an OpenClaw agent context. Running the script directly with `node` will fail with:
```
❌ Error verifying [name]: browser() tool not available. This script must be executed within an OpenClaw agent context.
```

**Always run via:**
```bash
openclaw exec "node scripts/alygn/x-scout-unified.js [args]"
```

### Browser Port Issues

During testing, we encountered `PortInUseError` on port 18801. The `browserToolCall()` wrapper handles this with automatic retries. If issues persist:
1. Check for zombie browser processes: `ps aux | grep chrome`
2. Restart OpenClaw gateway: `openclaw gateway restart`
3. Use `--batch-size=1` to reduce concurrent connections

### Snapshot Parsing

The snapshot parser uses regex patterns on the aria snapshot text. X/Twitter's DOM structure changes frequently, so the parser may need updates if:
- Follower counts are not extracted
- Verified badges are missed
- Profile existence detection fails

Monitor the logs for "⚠️ No profile indicators found" messages.

## Next Steps

1. Test with single VC account (@lightspeedvp) via `openclaw exec`
2. Verify snapshot parsing accuracy
3. Test batch mode with 2-3 accounts
4. Monitor for rate limiting or CAPTCHA challenges
5. Adjust wait times if pages load slower/faster
6. Consider adding proxy rotation for large batches

---
*Documentation generated: 2026-04-27*
*Version: 1.1 - Browser Relay Integration*
