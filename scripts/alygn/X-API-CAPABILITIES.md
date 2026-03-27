# X API Posting Capabilities - COMPLETE REFERENCE

**Script:** `scripts/shared/x-growth/x-api-executor.js`  
**Authentication:** OAuth 1.0a User Context  
**Handle:** @aialygn  
**Status:** ✅ PRODUCTION (Updated 2026-02-11)

---

## ✅ ALL SUPPORTED CAPABILITIES

### 1. Post Regular Tweets ✅

**Function:** `postTweet(client, content, mediaPath)`

**Capabilities:**

- Post text tweets (up to 280 chars)
- Attach media (images, videos)
- Automatic format enforcement (hashtags + signature)

**Workflow JSON format:**

```json
{
  "posts": [
    {
      "id": 1,
      "content": "Governance can't be retrofitted at frontier scale.",
      "mediaPath": "/path/to/image.png" // Optional
    }
  ]
}
```

**Result:**

```
Governance can't be retrofitted at frontier scale.

#AIGovernance

more at @aialygn

[attached image if mediaPath provided]
```

---

### 2. Mention Users ✅

**Function:** Same as `postTweet()` - mentions are automatic

**How to mention:**

- Include `@username` anywhere in content
- Can mention multiple users
- Mentions work in posts, replies, quotes

**Workflow JSON format:**

```json
{
  "posts": [
    {
      "id": 1,
      "content": "Great insights from @ResearcherName on AGI alignment challenges."
    }
  ]
}
```

**Result:**

```
Great insights from @ResearcherName on AGI alignment challenges.

#AIAlignment

more at @aialygn
```

---

### 3. Reply to Tweets ✅

**Function:** `replyToPost(client, content, targetPostId, mediaPath)`

**Capabilities:**

- Reply to any tweet by post ID
- Attach media to replies
- Automatic format enforcement

**Workflow JSON format:**

```json
{
  "replies": [
    {
      "content": "This highlights the need for neutral coordination infrastructure.",
      "targetUrl": "https://x.com/username/status/123456789",
      "targetHandle": "@username",
      "mediaPath": "/path/to/image.png" // Optional
    }
  ]
}
```

**Script extracts post ID:** `123456789` from URL  
**Result:** Reply posted with format + optional media

---

### 4. Quote Tweets ✅

**Function:** `quotePost(client, content, quoteTweetId, mediaPath)`

**Capabilities:**

- Quote any tweet by post ID
- Add commentary
- Attach media to quotes
- Automatic format enforcement

**Workflow JSON format:**

```json
{
  "posts": [
    {
      "id": 1,
      "content": "Exactly. Legitimacy is the missing infrastructure.",
      "quoteTweetId": "987654321",
      "mediaPath": "/path/to/image.png" // Optional
    }
  ]
}
```

**Result:** Quote tweet with commentary + format + optional media

---

### 5. Post with Media ✅

**Function:** All posting functions support `mediaPath` parameter

**Supported media types:**

- Images (PNG, JPG, JPEG, GIF)
- Videos (MP4, MOV)
- Animated GIFs

**Media upload process:**

1. Upload media via `client.media.uploadImage(mediaPath)`
2. Get media ID
3. Attach to post via `media: { media_ids: [mediaId] }`

**Workflow JSON format:**

```json
{
  "posts": [
    {
      "id": 1,
      "content": "Visual representation of coordination failure risks.",
      "mediaPath": "$HOME/.openclaw/workspace/assets/coordination-diagram.png"
    }
  ]
}
```

**Works with:**

- Regular posts ✅
- Replies ✅
- Quote tweets ✅

---

### 6. Create Polls ✅

**Function:** `createPoll(client, content, options, durationMinutes)`

**Capabilities:**

- Create polls with 2-4 options
- Set poll duration (minutes)
- Automatic format enforcement

**Workflow JSON format:**

```json
{
  "posts": [
    {
      "id": 1,
      "content": "What's the biggest AI governance challenge?",
      "poll": {
        "options": [
          "Coordination failure",
          "Technical alignment",
          "International cooperation",
          "Public trust"
        ],
        "duration_minutes": 1440
      }
    }
  ]
}
```

**Result:** Poll tweet with 4 options, 24-hour duration + format

---

## 🔧 Format Enforcement (MANDATORY)

**ALL tweets automatically get:**

```
[Original content]

[1-3 hashtags]

more at @aialygn
```

**Function:** `formatTweet(content, hashtags = ["#AIGovernance"])`

**Applied to:**

- ✅ Regular posts
- ✅ Replies
- ✅ Quote tweets
- ✅ Polls

**Cannot be skipped** - enforced at posting layer.

---

## 📋 Complete Workflow Example

**workflow.json:**

```json
{
  "posts": [
    {
      "id": 1,
      "content": "Regular post with text only"
    },
    {
      "id": 2,
      "content": "Post with image",
      "mediaPath": "/path/to/image.png"
    },
    {
      "id": 3,
      "content": "Mentioning @ResearcherName about AI safety"
    },
    {
      "id": 4,
      "content": "Quote tweet with commentary",
      "quoteTweetId": "123456789"
    },
    {
      "id": 5,
      "content": "What's your top AI governance priority?",
      "poll": {
        "options": ["Oversight", "Coordination", "Policy", "Research"],
        "duration_minutes": 1440
      }
    }
  ],
  "replies": [
    {
      "content": "This is critical for AGI preparedness",
      "targetUrl": "https://x.com/username/status/987654321",
      "targetHandle": "@username",
      "mediaPath": "/path/to/chart.png"
    }
  ]
}
```

**Execution:**

```bash
cd $HOME/.openclaw/workspace
node scripts/shared/x-growth/x-api-executor.js
```

**Result:**

- 5 posts published (text, media, mention, quote, poll)
- 1 reply with media
- All with format enforcement (hashtags + signature)
- 5s delay between actions (rate limiting)

---

## 🎯 Usage in Daily Automation

**Cron job workflow:**

1. **Browser discovery:** Navigate /explore → extract posts → discovery.json
2. **Decision engine:** Grok evaluates → workflow.json
3. **X API executor:** Read workflow.json → apply format → post

**Key principle:**

- Browser = explore/navigate ONLY
- Scripts = post/reply/quote/mention/media

---

## 📊 Rate Limiting

**Built-in delays:**

- 5 seconds between posts
- 5 seconds between replies
- Prevents rate limit errors

**Twitter limits:**

- ~50 posts/hour (free tier)
- ~300 posts/3 hours (paid tier)

---

## 🔒 Authentication

**Method:** OAuth 1.0a User Context  
**Credentials:** `config/credentials.json`

```json
{
  "twitter": {
    "consumerKey": "xxx",
    "consumerSecret": "xxx",
    "accessToken": "xxx",
    "accessTokenSecret": "xxx"
  }
}
```

**Setup:**

```javascript
const credentials = loadCredentials();
const oauth1 = new OAuth1(credentials);
const client = new Client({ oauth1 });
```

---

## ✅ Summary - ALL Capabilities

| Feature         | Status     | Media Support | Format Applied |
| --------------- | ---------- | ------------- | -------------- |
| Post tweets     | ✅ Working | ✅ Yes        | ✅ Yes         |
| Mention users   | ✅ Working | ✅ Yes        | ✅ Yes         |
| Reply to tweets | ✅ Working | ✅ Yes        | ✅ Yes         |
| Quote tweets    | ✅ Working | ✅ Yes        | ✅ Yes         |
| Post with media | ✅ Working | ✅ Yes        | ✅ Yes         |
| Create polls    | ✅ Working | ❌ No         | ✅ Yes         |

**100% feature coverage - NO EXCEPTIONS**

---

_Created: 2026-02-11_  
_Last Updated: 2026-02-11_  
_Status: PRODUCTION - All features tested and working_
}
}

````

**Setup:**

```javascript
const credentials = loadCredentials();
const oauth1 = new OAuth1(credentials);
const client = new Client({ oauth1 });
````

---

## ✅ Summary - ALL Capabilities

| Feature         | Status     | Media Support | Format Applied |
| --------------- | ---------- | ------------- | -------------- |
| Post tweets     | ✅ Working | ✅ Yes        | ✅ Yes         |
| Mention users   | ✅ Working | ✅ Yes        | ✅ Yes         |
| Reply to tweets | ✅ Working | ✅ Yes        | ✅ Yes         |
| Quote tweets    | ✅ Working | ✅ Yes        | ✅ Yes         |
| Post with media | ✅ Working | ✅ Yes        | ✅ Yes         |
| Create polls    | ✅ Working | ❌ No         | ✅ Yes         |

**100% feature coverage - NO EXCEPTIONS**

---

_Created: 2026-02-11_  
_Last Updated: 2026-02-11_  
_Status: PRODUCTION - All features tested and working_
