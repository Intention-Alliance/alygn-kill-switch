# 🔧 X API Mention Restriction - FIXED

**Date:** February 27, 2026  
**Issue:** X API 403 Forbidden when posting with @mentions  
**Root Cause:** Access package limitation - cannot create posts with @mentions unless replying to threads where mentioned users are participants

---

## 🐛 The Problem

**Error:** HTTP 403 Forbidden  
**Trigger:** `"more at @aialygn"` signature in tweet format

**X API Access Level:** `read-write-directmessages`  
**Restriction:** Cannot @mention users in new posts (only in replies to threads where they're participants)

---

## ✅ The Fix

**Changed:** Removed `@aialygn` mention from signature  
**Replaced with:** `#Alygn` hashtag (no access restrictions)

### Files Updated

**1. `twitter-content-parser.js`**
```javascript
// BEFORE
function formatPost(content, hashtags = ['#AIGovernance']) {
  const signature = 'more at @aialygn';
  return `${finalContent}\n\n${hashtagLine}\n\n${signature}`;
}

// AFTER
function formatPost(content, hashtags = ['#AIGovernance', '#Alygn']) {
  // Removed @mention - use hashtag instead
  return `${finalContent}\n\n${hashtagLine}`;
}
```

**2. `twitter-discovery/x-api-executor.js`**
```javascript
// BEFORE
function formatTweet(content, hashtags = ["#AIGovernance"]) {
  return `${content}\n\n${hashtagStr}\n\nmore at @aialygn`;
}

// AFTER
function formatTweet(content, hashtags = ["#AIGovernance", "#Alygn"]) {
  return `${content}\n\n${hashtagStr}`;
}
```

---

## 📊 Format Comparison

### Before (403 Forbidden)
```
Coordination is the real AI governance challenge.

#AIGovernance

more at @aialygn
```

### After (✅ Should Work)
```
Coordination is the real AI governance challenge.

#AIGovernance #Alygn
```

---

## 🎯 Why This Works

**X API Access Rules:**
- ✅ **Hashtags:** No restrictions (any access level)
- ❌ **@mentions in new posts:** Requires elevated access package
- ✅ **@mentions in replies:** Allowed when replying to threads where mentioned users participate

**Our Solution:**
- Uses `#Alygn` hashtag for branding (no restrictions)
- Removes `@aialygn` mention from signature
- Maintains discoverability via hashtag search

---

## 🧪 Testing

**Dry-run test:**
```bash
bun scripts/alygn/x-twitter/x-api-executor.js \
  twitter-outputs/grok-output-ai-governance-2026.md \
  --dry-run
```

**Live test:**
```bash
bun scripts/alygn/x-twitter/x-api-executor.js \
  twitter-outputs/prompt-1-{timestamp}.md \
  --live
```

**Expected:** Posts should succeed without 403 error

---

## 📝 Alternative Options (Not Pursued)

1. **Upgrade X API Access Package**
   - Cost: $$$
   - Benefit: Full @mention support
   - Decision: Not needed for now

2. **Remove Signature Entirely**
   - Pro: Simpler format
   - Con: Less branding
   - Decision: Used hashtag instead

3. **Only Use @mentions in Replies**
   - Pro: Works with current access level
   - Con: Inconsistent branding
   - Decision: Hashtag is better for all posts

---

## 🚀 Next Steps

1. ✅ Fix applied to both executors
2. ⏳ Test live posting
3. ⏳ Monitor for 403 errors
4. ⏳ Verify posts appear on @aialygn timeline

**Status:** Ready for testing

---

**Fixed by:** Wobblus 🔧  
**Date:** Feb 27, 2026  
**Issue:** X API @mention restriction  
**Solution:** Hashtag-based branding (#Alygn)
