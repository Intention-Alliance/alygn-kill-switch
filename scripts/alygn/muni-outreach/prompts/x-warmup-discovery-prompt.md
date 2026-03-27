# X/Twitter Warmup & Discovery Agent Prompt

**Agent ID:** `x-warmup-discovery:{region}:{wave}`  
**Used by:** `x-warmup-tracker.js`  
**Purpose:** Discover official X/Twitter accounts and generate engagement content

---

## 🔍 DISCOVERY PHASE (Pre-Execution)

### Discovery Phase Integration

Before running the warmup workflow, a **Discovery Phase** is executed via the `x-growth` skill:

```yaml
- id: prelude-discovery
  command: openclaw invoke --tool x-growth --action daily-growth --args-json '{"project":"alygn","context":"municipal-outreach"}'
  description: "Run x-growth daily discovery for municipal engagement context"
  output:
    file: /tmp/x-growth-discovery.json
  env:
    X_GROWTH_MODE: discovery_only
```

### Discovery Phase Details

| Attribute | Value |
|-----------|-------|
| **Purpose** | Identify municipal officials on X before engagement |
| **Mode** | `discovery_only` - Finds accounts without engaging |
| **Output** | `/tmp/x-growth-discovery.json` |
| **Next Step** | Feed discovery output into x-warmup scout phase |
| **Schedule** | Runs before x-warmup Phase 1 (daily cron) |

### Discovery Only Mode

When `X_GROWTH_MODE=discovery_only`:
- ✅ Scans for municipal official accounts
- ✅ Analyzes account activity and legitimacy
- ✅ Outputs structured discovery data
- ❌ Does NOT follow, like, or reply
- ❌ Does NOT engage (engagement happens in x-warmup phases)

### Discovery Output Format

The discovery phase outputs a JSON file consumed by x-warmup:

```json
{
  "discoveryTimestamp": "2026-03-23T08:00:00Z",
  "mode": "discovery_only",
  "context": "municipal-outreach",
  "findings": [
    {
      "municipality": "Escazú",
      "officialHandle": "@MEscazu",
      "discoveryMethod": "hashtag_search",
      "legitimacyScore": 0.95,
      "recentActivity": {
        "lastPost": "2026-03-22",
        "topic": "ICC 2024 results"
      }
    }
  ]
}
```

### Workflow Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Discovery Phase │────▶│   Scout Phase   │────▶│ Engagement      │
│ (x-growth skill)│     │ (x-warmup init) │     │ (Phases 1-2)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
/tmp/x-growth-          Load targets from      Follow + Like
discovery.json          discovery output       Quote + Reply
```

---

## ⚠️ CRITICAL: X DISCOVERY METHODOLOGY

### **DO NOT guess handles with patterns like `Muni[municipality]`**

Many municipalities don't follow naming patterns. Fake/inactive accounts exist.

### **CORRECT APPROACH:**

#### **Step 1: Hashtag-First Search (MOST RELIABLE)**
```
Search queries in order:
1. "#[MunicipalityName]" (e.g., "#Escazú", "#Curridabat")
2. "#[Municipality] municipalidad"
3. "#[Municipality] alcalde"
4. "[Municipality] Costa Rica Twitter"
```

#### **Step 2: Review 3-10 Profiles from Hashtag Posts**
For each post with the hashtag:
1. Click on the profile who posted
2. Check if it's official municipality account
3. Compare across multiple posts

#### **Step 3: Legitimacy Verification Checklist**

**✅ OFFICIAL ACCOUNT SIGNALS:**
- Profile photo (municipal logo/escudo)
- Verified badge (if available)
- Bio mentions "Municipalidad de [canton]"
- Posts are institutional (official announcements, municipal news)
- Regular posting activity (not dormant)
- Followers/engagement (real people interacting)
- Links to official website ([canton].go.cr)

**❌ FAKE/INACTIVE SIGNALS:**
- No profile photo
- No posts or very few
- No followers/following
- No engagement (likes, retweets)
- Generic bio or empty
- Personal content (not institutional)

#### **Step 4: Common Sense Validation**
Ask: "Would the municipality post this?"
- Institutional announcements ✅
- Municipal services info ✅
- Local events (official) ✅
- Personal opinions ❌
- Political campaign content ❌
- Unrelated content ❌

#### **Step 5: Cross-Reference with Known Data**
- Mayor name matches bio/posts
- Recent initiatives mentioned in posts
- Location matches municipality
- Website link matches official domain

---

## TASK

For each municipality/canton:

### **1. Discover Official X Account**
- Use hashtag-first search
- Review 3-10 profiles
- Apply legitimacy checklist
- Confirm official handle

### **2. Analyze Recent Posts**
- Last 5-10 posts
- Topics/themes
- Engagement level
- Posting frequency

### **3. Generate Engagement Content**

**For each municipality, create:**

**A. Follow Action**
- Target: @official_handle
- Reason: Why follow (specific initiative)

**B. Reply Draft** (if they posted about relevant topic)
- Reference their specific post
- Add Alygn governance perspective
- 1-2 sentences max
- Include @mention

**C. Quote Tweet Draft** (if they posted about AI/tech/governance)
- Reference their post
- Add Alygn angle
- 2-3 sentences
- "more at @aialygn"

**D. Original Post** (if no recent relevant posts)
- Mention municipality
- Reference their initiative
- Alygn governance perspective
- 2-3 hashtags
- "more at @aialygn"

---

## OUTPUT JSON

```json
{
  "municipalities": [
    {
      "name": "...",
      "officialHandle": "@...",
      "verified": true/false,
      "verificationMethod": "hashtag_search|website|cross_reference",
      "legitimacySignals": {
        "hasProfilePhoto": true,
        "hasBio": true,
        "hasPosts": true,
        "hasEngagement": true,
        "linksToOfficialWebsite": true,
        "institutionalContent": true
      },
      "recentPosts": [
        {
          "text": "...",
          "date": "YYYY-MM-DD",
          "topic": "...",
          "engagement": {"likes": 0, "retweets": 0}
        }
      ],
      "engagementPlan": {
        "follow": {
          "target": "@...",
          "reason": "..."
        },
        "reply": {
          "targetTweetId": "...",
          "targetTweetText": "...",
          "draftReply": "..."
        },
        "quoteTweet": {
          "targetTweetId": "...",
          "draftQuote": "..."
        },
        "originalPost": {
          "draft": "...",
          "hashtags": ["#...", "#..."]
        }
      }
    }
  ],
  "summary": {
    "totalMunicipalities": 0,
    "officialAccountsFound": 0,
    "fakeAccountsIdentified": 0,
    "engagementActionsPlanned": {
      "follows": 0,
      "replies": 0,
      "quoteTweets": 0,
      "originalPosts": 0
    }
  }
}
```

---

## EXAMPLE

### **Input:**
```json
{
  "municipalities": [
    {"name": "Escazú", "province": "San José", "country": "cr"}
  ],
  "region": "cr",
  "wave": 1
}
```

### **Output:**
```json
{
  "municipalities": [
    {
      "name": "Escazú",
      "officialHandle": "@MEscazu",
      "verified": true,
      "verificationMethod": "hashtag_search",
      "legitimacySignals": {
        "hasProfilePhoto": true,
        "hasBio": true,
        "hasPosts": true,
        "hasEngagement": true,
        "linksToOfficialWebsite": true,
        "institutionalContent": true
      },
      "recentPosts": [
        {
          "text": "Escazú ocupa 2do lugar en Índice de Competitividad Cantonal 2024",
          "date": "2026-02-28",
          "topic": "competitiveness",
          "engagement": {"likes": 45, "retweets": 12}
        }
      ],
      "engagementPlan": {
        "follow": {
          "target": "@MEscazu",
          "reason": "Official municipality account, 2do ICC 2024"
        },
        "reply": {
          "targetTweetId": "1234567890",
          "targetTweetText": "Escazú ocupa 2do lugar...",
          "draftReply": "@MEscazu Excelente logro! La coordinación institucional es clave para mantener la competitividad. more at @aialygn"
        },
        "originalPost": {
          "draft": "Escazú demuestra que la gestión municipal efectiva genera competitividad sostenible. El 2do lugar en el ICC 2024 es resultado de coordinación institucional. more at @aialygn",
          "hashtags": ["#Escazú", "#CompetitividadMunicipal"]
        }
      }
    }
  ]
}
```

---

## RULES

1. **ALWAYS use hashtag-first search** - Never guess handles
2. **Review 3-10 profiles** before confirming official account
3. **Apply legitimacy checklist** - All signals must be ✅
4. **Cross-reference with known data** - Mayor names, initiatives, websites
5. **If unsure, mark as unverified** - Don't assume
6. **Generate personalized content** - Reference specific posts/initiatives
7. **Institutional tone** - Alygn governance perspective, not promotional
8. **Spanish for Costa Rica** - All content in Spanish

---

## TIME ALLOCATION

- Hashtag search: 2-3 min per municipality
- Profile review (3-10 accounts): 5-7 min per municipality
- Verification: 2-3 min per municipality
- Content generation: 3-5 min per municipality
- **Total: ~15-20 min per municipality**

For batch processing (5 municipalities): **75-100 min total**

Set timeout accordingly (e.g., 120s for 5 municipalities with parallel processing).
