# Municipal Outreach Status - 2026-03-01

**Date:** 2026-03-01 03:30 CST  
**Status:** ✅ **STRUCTURE COMPLETE, SCRIPTS IN DEVELOPMENT**

---

## 📊 Skills Status

### `alygn-municipal-ai-governance-outreach` 🏛️

**Requirements:**
- ✅ `FIRECRAWL_API_KEY` - Available
- ✅ `SUPABASE_URL` - Available (postgres://...)
- ✅ `ZEROBOUNCE_API_KEY` - ✅ **JUST ADDED!**
- ✅ `BRAVE_API_KEY` - Available
- ❌ `SUPABASE_KEY` - **MISSING** (Andler owes this)
- ❌ `PERPLEXITY_API_KEY` - **MISSING**
- ❌ `SMARTLEAD_API_KEY` - **MISSING**

**Status:** ⚠️ **3 credentials pending**

---

## 📁 Structure Created

```
scripts/alygn/muni-outreach/
├── README.md ✅ (comprehensive docs)
├── discovery/
│   ├── muni-discovery.js ✅ (Firecrawl integration)
│   └── region-configs/ (to implement)
├── research/
│   └── muni-research.js (to implement)
├── personalization/
│   └── muni-personalizer.js (to implement)
├── review/
│   └── compliance-review.js (to implement)
├── database/
│   └── supabase-sync.js (to implement)
├── sending/
│   ├── verify-emails.js (to implement)
│   └── email-sender.js (to implement)
├── engagement/
│   └── x-engager.js (to implement)
├── reporting/
│   └── weekly-summary.js (to implement)
└── workflows/
    └── cr-pilot.lobster ✅ (9-phase workflow)
```

---

## 🦞 Lobster Workflow: CR Pilot

**9 Phases:**

1. **Discovery** (Firecrawl) - Discovers 82 cantones
2. **Research** (Perplexity/Firecrawl) - Finds contacts, AI signals
3. **Verify** (ZeroBounce) - Validates emails
4. **Personalize** (Grok) - Generates governance/institutional variants
5. **Review** ⚠️ **APPROVAL GATE** - Human compliance review
6. **Sync DB** (Supabase) - Saves to `alygn_global_muni`
7. **Send** (Smartlead) - Multi-domain email sending
8. **X Engage** - Follow + engage on Twitter
9. **Report** (Discord) - Weekly summary to #annotations

---

## 📧 Email Templates

### Variant A: Governance Focus
**Subject:** Coordination Before Crisis: AI Governance for [Municipality]

**Key message:** Neutral governance infrastructure, coordination without centralization

### Variant B: Institutional Focus
**Subject:** The Real AI Risk is Coordination Failure

**Key message:** Institutional risks > technical risks, legitimacy as infrastructure

Both templates:
- ✅ Governance-first positioning (NOT compliance/regulation)
- ✅ Personalized pain points from research
- ✅ Clear CTA (30-min conversation)
- ✅ Alygn institutional signature

---

## 🗄️ Database Schema (Supabase)

### Tables
1. **`municipalities`** - Core data (name, country, contacts, status)
2. **`outreach_emails`** - Email log (variant, subject, body, status)
3. **`x_engagements`** - Twitter engagement tracking

### Key Fields
- `wave_number` - Tracks which wave (1=CR, 2=USA, etc.)
- `priority_score` - AI governance readiness score
- `reply_sentiment` - Positive/negative/neutral analysis
- `x_engagement_count` - Twitter interaction count

---

## 🧪 Testing (Mock Mode)

All scripts support `--mock` flag for testing without credentials:

```bash
# Test discovery (mock)
node scripts/alygn/muni-outreach/discovery/muni-discovery.js --region=cr --mock

# Test full workflow (dry-run)
lobster run .lobster/cr-pilot.lobster --dry-run
```

**Mock behavior:**
- Returns sample CR municipalities (10 cantones)
- Simulates API responses (Firecrawl, ZeroBounce, etc.)
- Creates output files in `/tmp/`
- No real API calls made

---

## 📋 Implementation Checklist

### Phase 1: Core Scripts (Can do now, mock mode)
- [x] `muni-discovery.js` ✅
- [ ] `muni-research.js`
- [ ] `muni-personalizer.js`
- [ ] `compliance-review.js`
- [ ] `supabase-sync.js`
- [ ] `verify-emails.js`
- [ ] `email-sender.js`
- [ ] `x-engager.js`
- [ ] `weekly-summary.js`

### Phase 2: Integration (Requires credentials)
- [ ] Test Firecrawl scraping (real)
- [ ] Test ZeroBounce verification (real)
- [ ] Test Supabase sync (real)
- [ ] Test Smartlead sending (real)
- [ ] Test Perplexity research (real)

### Phase 3: Production (After testing)
- [ ] Set up Supabase project + tables
- [ ] Configure Smartlead domains (20 domains, 40 inboxes)
- [ ] Set up cron jobs (daily discovery, weekly outreach)
- [ ] Configure Discord webhooks for reporting

---

## 🎯 Scaling Plan

### Wave 1: Costa Rica (82 cantones)
- **Timeline:** March 2026
- **Status:** Structure ready, awaiting credentials
- **Goal:** Test end-to-end workflow

### Wave 2: USA (~19,500 municipalities)
- **Timeline:** April-May 2026
- **Strategy:** State-by-state (CA, TX, NY first)
- **Goal:** Scale automation

### Wave 3: European Union (~88,000)
- **Timeline:** June-July 2026
- **Strategy:** Country-by-country (DE, FR, IT, ES)
- **Goal:** Multi-language support

### Wave 4-6: Global (~100,000 total)
- **Timeline:** August-December 2026
- **Strategy:** Regional coordinators + automation
- **Goal:** Full global coverage

---

## 🔑 Credentials Status

| Credential | Status | Purpose |
|------------|--------|---------|
| `FIRECRAWL_API_KEY` | ✅ Available | Web scraping municipal sites |
| `SUPABASE_URL` | ✅ Available | Database connection |
| `SUPABASE_KEY` | ❌ **MISSING** | Database auth (Andler owes) |
| `ZEROBOUNCE_API_KEY` | ✅ **JUST ADDED** | Email verification |
| `BRAVE_API_KEY` | ✅ Available | News search |
| `PERPLEXITY_API_KEY` | ❌ **MISSING** | Deep research |
| `SMARTLEAD_API_KEY` | ❌ **MISSING** | Multi-domain email sending |

---

## 🚀 Next Steps

### Immediate (No credentials needed)
1. ✅ Create remaining script skeletons (research, personalizer, etc.)
2. ✅ Test discovery script with mock data
3. ✅ Test Lobster workflow dry-run
4. ✅ Create region configs for USA states

### Pending Credentials
1. ⏳ Get `SUPABASE_KEY` from Andler
2. ⏳ Get `PERPLEXITY_API_KEY`
3. ⏳ Get `SMARTLEAD_API_KEY`
4. ⏳ Set up Supabase project + tables

### After Credentials
1. ⏳ Test end-to-end with real APIs
2. ⏳ Deploy CR pilot (82 cantones)
3. ⏳ Monitor replies, iterate on templates
4. ⏳ Scale to Wave 2 (USA)

---

**Updated:** 2026-03-01 03:30 CST  
**Status:** ✅ **Structure complete, 1/3 credentials pending**
