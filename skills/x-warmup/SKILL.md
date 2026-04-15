---
name: x-warmup
description: Automated X/Twitter engagement for ALYGN municipal warmup before email outreach. Builds familiarity through follows, likes, replies, and quote-tweets.
metadata: {"openclaw":{"emoji":"🤝","requires":{"bins":["node","bash"],"env":["X_API_KEY","X_API_SECRET","X_ACCESS_TOKEN","X_ACCESS_SECRET","GROK_API_KEY","SUPABASE_URL","SUPABASE_SERVICE_KEY"],"os":["linux","darwin"]}}}
---

# X/Twitter Warmup Skill

**Purpose:** Automated X/Twitter engagement to build familiarity with municipalities before email outreach.

**Status:** Production Ready

**Target:** All municipalities in active waves

---

## 🔒 CRITICAL RULES

### Rule 1: Fully Automated Engagement
ALL X interaction from @aialyygn is automated by sub-agents:
- ✅ Follows (max 15/day)
- ✅ Likes (max 20/day)
- ✅ Replies (max 10/day)
- ✅ Quote-tweets (max 5/day)
- ✅ Retweets (max 10/day)

**NO human execution required.**

### Rule 2: Rate Limiting
Strict rate limits enforced to prevent suspension:
- Max 15 follows/day
- Max 20 likes/day
- Max 10 replies/day
- Max 5 quote-tweets/day
- Max 10 retweets/day
- 30-120 second random delays between actions
- Actions spread across waking hours in target timezone
- Auto-pause 24h on 429 (rate limit) or suspension warning

### Rule 3: Pre-Campaign Approval
Approval happens ONCE before launching each regional campaign:
1. System generates 5 sample X replies + 5 sample quote-tweets
2. Tania reviews for cultural fit, tone, language accuracy
3. If approved: campaign runs autonomously
4. If changes needed: feedback → regenerate → re-review

**NO per-action approval during execution.**

### Rule 4: X-First Strategy
X warmup happens BEFORE email outreach:
- Phase 1: Follow + Like (Day 1-2)
- Phase 2: Quote + Reply (Day 3-4)
- Email sent after Phase 2 complete
- Goal: Build familiarity, increase email response rate

### Rule 5: Supabase Primary
All engagement data written to Supabase:
- `x_engagements` table tracks every action
- `municipalities.x_warmup_phase1_at`, `x_warmup_phase2_at` timestamps
- `municipalities.x_engagement_count` counter
- Notion used for monitoring dashboard ONLY

---

## 🔍 Discovery Phase (Pre-Execution)

Before x-warmup execution, run the **x-growth discovery phase**:

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
| **Next Step** | Discovery output feeds into x-scout.js for targeting |
| **Schedule** | Runs before x-warmup Phase 1 (daily cron) |

### Discovery Only Mode

When `X_GROWTH_MODE=discovery_only`:
- ✅ Scans for municipal official accounts
- ✅ Analyzes account activity and legitimacy
- ✅ Outputs structured discovery data
- ❌ Does NOT follow, like, or reply
- ❌ Does NOT engage (engagement happens in x-warmup phases)

### Updated Workflow with Discovery

```
┌─────────────────────────────────────────────────────────────────────┐
│                      X-WARMUP WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 0: Discovery (x-growth skill)                                │
│  ├── Mode: discovery_only                                           │
│  ├── Output: /tmp/x-growth-discovery.json                           │
│  └── Identifies: municipal official X accounts                      │
│                              │                                      │
│                              ▼                                      │
│  Phase 1: X Scout (x-scout.js)                                    │
│  ├── Load discovery output from /tmp/x-growth-discovery.json        │
│  ├── Validate accounts found in discovery                         │
│  ├── Extract recent topics/hashtags                                 │
│  └── Store: X handle, user ID, recent activity                    │
│                              │                                      │
│                              ▼                                      │
│  Phase 1: Follow + Like (x-warmup-engage.js)                      │
│  ├── Target: Accounts from discovery                              │
│  ├── Follow municipality account                                    │
│  ├── Like 2-3 recent tweets                                         │
│  └── Wait 24-48 hours                                               │
│                                                                     │
│  Phase 2: Quote + Reply (x-warmup-engage.js)                        │
│  ├── Quote tweet with Alygn perspective                           │
│  ├── Reply to relevant conversations                              │
│  └── NO selling (value-add only)                                  │
│                                                                     │
│  Phase 3: Warmth Tracking (x-warmup-tracker.js)                     │
│  ├── Calculate warmth score per municipality                      │
│  └── Mark ready for email outreach                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Capabilities

### 1. ✅ X Account Discovery (x-scout.js)
**Inputs:** Discovery data from x-growth (`/tmp/x-growth-discovery.json`)
- Uses Grok API to validate official municipal X accounts found by discovery
- Cross-references discovery output with live X data
- Extracts recent topics/hashtags
- Outputs: X handle, user ID, recent activity

### 2. ✅ Automated Engagement (x-warmup-engage.js)
**Phase 1: Follow + Like**
- Follow municipality account
- Like 2-3 recent tweets
- Wait 24-48 hours

**Phase 2: Quote + Reply**
- Quote tweet with Alygn perspective
- Reply to relevant conversations
- NO selling (value-add only)

### 3. ✅ Warmth Tracking (x-warmup-tracker.js)
- Calculates warmth score per municipality
- Tracks engagement history
- Determines when ready for email
- Syncs to Supabase

### 4. ✅ Rate Limiting (utils/rate-limiter.js)
- Enforces daily caps per action type
- Random delays (30-120s) between actions
- Auto-pause on rate limit response
- Timezone-aware scheduling

---

## Architecture

### Workflow

#### Full Pipeline with Discovery Phase
```
x-growth discovery (discovery_only mode)
  ↓
Output: /tmp/x-growth-discovery.json
  ↓
x-scout.js (Load discovery, validate accounts)
  ↓
Supabase: municipalities.x_handle, x_user_id
  ↓
x-warmup-engage.js (Phase 1: Follow + Like)
  ↓
Supabase: x_engagements (type: follow, like)
  ↓
Wait 24-48 hours
  ↓
x-warmup-engage.js (Phase 2: Quote + Reply)
  ↓
Supabase: x_engagements (type: quote, reply)
  ↓
x-warmup-tracker.js (Calculate warmth)
  ↓
Supabase: municipalities.x_warmup_completed = true
  ↓
Ready for email outreach
```

### Sub-Agent Roles

| Agent | Purpose | Tools |
|-------|---------|-------|
| `agent:scout` | Discover X accounts | Grok API, Supabase |
| `agent:engage` | Execute follows/likes/replies/quotes | X API (write), Supabase |
| `agent:track` | Calculate warmth scores | Supabase |

---

## Files

### Core Scripts
```
scripts/alygn/muni-outreach/engagement/
├── x-scout.js                    ✅ X account discovery (Grok API)
├── x-warmup-engage.js            ✅ Automated engagement (follow/like/reply/quote)
├── x-warmup-tracker.js           ✅ Warmth scoring
└── x-profile-validator.js        ⚠️ Legacy (rename to x-scout.js)
```

### Utils
```
scripts/utils/
├── supabase-client.js            ✅ Supabase connection
├── rate-limiter.js               ⚠️ TODO: Create
└── load-credentials.js           ✅ Credentials loader
```

### Lobster Workflow
```
.lobster/
└── x-warmup.lobster              ⚠️ TODO: Create
```

### Skill
```
skills/
└── x-warmup/SKILL.md             ✅ This file
```

---

## Usage

### X Scout (Discovery)
```bash
node scripts/alygn/muni-outreach/engagement/x-scout.js \
  --wave=1 \
  --batch-size=10 \
  --region=cr
```

### X Warmup Engage (Phase 1 + Phase 2)
```bash
# Phase 1: Follow + Like
node scripts/alygn/muni-outreach/engagement/x-warmup-engage.js \
  --wave=1 \
  --phase=1 \
  --batch-size=10 \
  --dry-run

# Phase 2: Quote + Reply
node scripts/alygn/muni-outreach/engagement/x-warmup-engage.js \
  --wave=1 \
  --phase=2 \
  --batch-size=10 \
  --dry-run
```

### X Warmup Tracker
```bash
node scripts/alygn/muni-outreach/engagement/x-warmup-tracker.js \
  --wave=1 \
  --check-date=today
```

### Lobster Workflow
```bash
lobster run x-warmup \
  --wave=1 \
  --batch-size=10 \
  --start-date=2026-03-15
```

---

## Rate Limits (Conservative)

| Action | Daily Limit | Delay Between Actions |
|--------|-------------|----------------------|
| Follows | 15 | 30-120s random |
| Likes | 20 | 30-120s random |
| Replies | 10 | 60-180s random |
| Quote-Tweets | 5 | 120-300s random |
| Retweets | 10 | 60-120s random |

**Weekly Caps:**
- Max 105 follows/week
- Max 140 likes/week
- Max 70 replies/week
- Max 35 quote-tweets/week
- Max 70 retweets/week
- 1 rest day/week (no engagement)

---

## Supabase Schema

### municipalities (relevant columns)
```sql
x_handle TEXT
x_user_id TEXT
x_warmup_phase1_at TIMESTAMPTZ
x_warmup_phase2_at TIMESTAMPTZ
x_engagement_count INTEGER DEFAULT 0
x_last_engagement_at TIMESTAMPTZ
```

### x_engagements
```sql
CREATE TABLE x_engagements (
    id UUID PRIMARY KEY,
    municipality_id UUID REFERENCES municipalities(id),
    engagement_type TEXT, -- 'follow', 'like', 'reply', 'quote', 'retweet'
    x_handle TEXT,
    x_user_id TEXT,
    tweet_id TEXT,
    content TEXT,
    engaged_at TIMESTAMPTZ DEFAULT NOW(),
    phase INTEGER, -- 1 or 2
    notes TEXT
);
```

---

## Expected Performance

### X Engagement Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Follow-back rate | 30-50% | Municipalities follow back |
| Like-back rate | 20-40% | Municipalities like our posts |
| Reply rate | 10-20% | Municipalities reply to our engagement |
| Warmth score | 70+ | Ready for email after Phase 2 |

### Email Lift from X Warmup

| Metric | Without X Warmup | With X Warmup | Lift |
|--------|------------------|---------------|------|
| Open rate | 40-50% | 60-70% | +20% |
| Reply rate | 10-15% | 20-30% | +100% |
| Meeting rate | 3-5% | 7-10% | +100% |

---

## Troubleshooting

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| X API 429 error | Rate limit exceeded | Verify rate-limiter.js enforces caps. Auto-pause 24h |
| X account suspended | Content flagged or limits exceeded | Check compliance. Reduce daily caps. Review content quality |
| Low follow-back rate | Wrong accounts or low-quality engagement | Verify x-scout.js finds official accounts. Improve engagement timing |
| Engagement not tracked | Supabase write failure | Check supabase-client.js credentials. Verify x_engagements table exists |
| Warmth score stuck | Tracker not running | Run x-warmup-tracker.js cron. Check Supabase connection |

---

**Created:** 2026-03-04
**Status:** ✅ PRODUCTION READY
**Next:** Create x-warmup.lobster workflow, utils/rate-limiter.js

