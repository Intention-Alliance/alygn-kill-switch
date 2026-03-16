# 🧵 Thread Pair Strategy - Content + Sources

**Date:** March 10, 2026  
**Goal:** Post credible content with source links in threaded replies

---

## 📋 New Format

### Post 1 (Main Tweet - Hook)
```
Microsoft's Tay bot turned racist in HOURS from Twitter trolls. 
Unaligned AI absorbs the web's worst.

Lesson learned? #AIFail #AIAlignment 🤯
```

### Post 2 (Reply - Source + Context)
```
📚 Source: https://www.wired.com/story/microsoft-tay-bot-racist

This 2016 incident showed AI alignment isn't optional—malicious input corrupts models instantly. Modern systems need robust input filtering + continuous monitoring.

What's your take on this?
```

---

## 🔧 Implementation Plan

### Step 1: Parser Extracts 3 Elements
For each governance item:
1. **Hook** (<200 chars) - punchy insight
2. **Source URL** - from Grok's citations
3. **Context** (<250 chars) - additional analysis

### Step 2: Executor Posts as Thread
```javascript
// Post main tweet
const mainResponse = await client.posts.create({
  text: mainTweet
});

// Reply with source + context
await client.posts.create({
  text: replyText,
  reply: {
    in_reply_to_tweet_id: mainResponse.data.id
  }
});
```

---

## 📊 Expected Output

**Before (Single Post):**
- 1 post per item
- No source link
- Less credible

**After (Thread Pair):**
- 2 posts per item (main + reply)
- Source link included
- More context/analysis
- **Higher credibility + engagement**

**Daily Capacity:**
- 5 Grok items → 10 posts (5 threads)
- 1 pre-approved → 1 post
- 2-5 discovery → 2-5 posts
- **Total: 13-16 posts/day**

---

## 🎯 Benefits

1. ✅ **Credibility** - Sources prove claims
2. ✅ **Engagement** - Threads get more replies
3. ✅ **Context** - Room for deeper analysis
4. ✅ **Professional** - Shows research effort
5. ✅ **Institutional tone** - Matches Alygn's positioning

---

## 🚀 Next Steps

1. Update parser to extract: hook + source + context
2. Update x-api-executor to post thread pairs
3. Test with next automation run
4. Monitor engagement metrics

**Status:** Ready to implement
