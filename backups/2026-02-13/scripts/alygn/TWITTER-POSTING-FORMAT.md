# ALYGN Twitter Posting Format - MANDATORY RULES

## 🔒 CRITICAL: Every Tweet Must Follow This Format

### 1. Signature (MANDATORY)
**Every tweet MUST end with:** `more at @aialygn`

**Examples:**
- Short posts: "Legitimacy is infrastructure.\n\nmore at @aialygn"
- Threads: Last tweet in thread ends with signature
- Replies: Include signature at end

### 2. Hashtags (MANDATORY)
**Pick 1-3 relevant tags from this list:**
- `#AIGovernance` (primary - use most often)
- `#AIAlignment` (technical posts)
- `#AISafety` (safety-focused posts)
- `#AGI` (frontier AI discussions)
- `#AIPolicy` (policy/institutional posts)
- `#AIEthics` (ethical considerations)
- `#AIRisk` (risk management posts)

**Hashtag placement:**
- For short posts: Before signature
- For threads: In first tweet or last tweet before signature
- For replies: Optional, use if relevant

### 3. Complete Format Template

```
[Main content - institutional message, thread, or reply]

[Optional: 1-3 hashtags]

more at @aialygn
```

### 4. Examples

**Short institutional post:**
```
Legitimacy is infrastructure.

#AIGovernance

more at @aialygn
```

**Thread (last tweet):**
```
4/ This is why neutral governance infrastructure matters - not to control AI, but to support coordination across developers, operators, and public institutions.

#AIGovernance #AIAlignment

more at @aialygn
```

**Reply:**
```
This is a critical point. Emergency coordination mechanisms need to exist *before* crisis, not be improvised during one.

#AISafety

more at @aialygn
```

**Discovery quote tweet:**
```
Exactly. The hardest AI risks are institutional, not technical. Governance legitimacy is the missing infrastructure.

#AIGovernance

more at @aialygn
```

---

## 📋 Script Integration Checklist

### Scripts That Need Signature + Hashtags:

✅ **Content Generation (Grok prompts)**
- `scripts/alygn/x-twitter/twitter-automation.js`
- Update Notion Prompt #1 (post generation)
- Update Notion Prompt #13 (reply generation)

✅ **Pre-Approved Posts**
- `scripts/alygn/post-pre-approved.js`
- Add signature + hashtag wrapper function

✅ **Discovery System**
- `scripts/alygn/twitter-discovery/decision-engine.js` (replies/quotes)
- `scripts/alygn/twitter-discovery/x-api-executor.js`

✅ **Browser Executor**
- `scripts/alygn/twitter-browser-executor.ts`

---

## 🔧 Implementation Steps

### Step 1: Create Format Helper Function
```javascript
function formatTweet(content, hashtags = ["#AIGovernance"]) {
  const hashtagStr = hashtags.join(" ");
  return `${content}\n\n${hashtagStr}\n\nmore at @aialygn`;
}
```

### Step 2: Update Grok Prompts (Notion)
**Add to Prompt #1 (Post Generation):**
```
MANDATORY FORMAT:
- Every tweet MUST end with: "more at @aialygn"
- Include 1-3 relevant hashtags: #AIGovernance, #AIAlignment, #AISafety, #AGI
- Example: "[content]\n\n#AIGovernance\n\nmore at @aialygn"
```

**Add to Prompt #13 (Reply Generation):**
```
MANDATORY FORMAT:
- Every reply MUST end with: "more at @aialygn"
- Include 1-2 relevant hashtags if appropriate
```

### Step 3: Update All Posting Scripts
- Wrap all tweet content with `formatTweet()`
- Pre-approved posts: Add signature + default hashtag
- Discovery replies: Add signature + contextual hashtag
- Browser executor: Verify formatted content

---

## ⚠️ Common Mistakes to Avoid

❌ **DON'T:**
- Post without signature
- Skip hashtags entirely
- Use more than 3 hashtags
- Post signature in middle of thread
- Forget signature on replies

✅ **DO:**
- Always include "more at @aialygn"
- Use 1-3 relevant hashtags
- Place signature at end (or thread end)
- Apply to ALL tweets (posts, replies, quotes)
- Keep hashtags relevant to content

---

## 🎯 Cron Job Requirements

**Daily automation MUST:**
1. Generate content via Grok (with format instructions)
2. Apply signature + hashtags to all tweets
3. Execute posts + replies + follows
4. Verify format before posting
5. Report formatted content in Discord

---

*Created: 2026-02-11*  
*Status: MANDATORY for all ALYGN Twitter automation*
