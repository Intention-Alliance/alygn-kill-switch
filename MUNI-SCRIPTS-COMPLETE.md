# Municipal Outreach Scripts - COMPLETE ✅

**Date:** 2026-03-01 17:35 CST  
**Status:** ✅ **ALL 9 SCRIPTS CREATED**

---

## Scripts Created (9/9)

### Phase 1: Discovery ✅
1. **`discovery/muni-discovery.js`** - Discovers municipalities via Firecrawl
   - Regional configs (CR, USA states, EU countries)
   - Mock mode for testing
   - Extracts name, population, website, province

### Phase 2: Research ✅
2. **`research/muni-research.js`** - Deep research per municipality
   - Scrapes websites (Firecrawl)
   - Finds contacts (mayor email, council)
   - Searches AI governance signals (Perplexity)
   - Finds X/Twitter handles
   - Mock mode: generates realistic sample data

### Phase 3: Verification ✅
3. **`sending/verify-emails.js`** - Verifies emails via ZeroBounce
   - Validates mayor email
   - Validates council emails
   - Returns status: valid, invalid, catch-all, risky
   - Mock mode: 90% valid rate simulation

### Phase 4: Personalization ✅
4. **`personalization/muni-personalizer.js`** - Generates personalized emails
   - Two variants: Governance & Institutional
   - Uses Grok API for personalization
   - Template-based fallback (mock mode)
   - Pain point matching

### Phase 5: Review ✅
5. **`review/compliance-review.js`** - Human approval gate
   - Prepares review package for Discord
   - Formats for Discord with approval commands
   - Commands: APPROVE_ALL, APPROVE, EDIT, REJECT, HALT
   - Flags issues (missing emails, errors)

### Phase 6: Database ✅
6. **`database/supabase-sync.js`** - Syncs to Supabase
   - Upserts to `alygn_global_muni.municipalities`
   - Calculates priority score
   - Tracks wave number, research status, outreach status
   - Mock mode: simulates insert/update

### Phase 7: Sending ✅
7. **`sending/email-sender.js`** - Sends via Smartlead
   - Multi-domain sending
   - Tracks campaign IDs, message IDs
   - Variant-based campaigns (governance vs institutional)
   - Mock mode: simulates send with mock message IDs

### Phase 8: Engagement ✅
8. **`engagement/x-engager.js`** - X/Twitter engagement
   - Follows municipal accounts
   - Replies to recent tweets
   - Quote tweets (optional)
   - Mock mode: simulates follows and replies

### Phase 9: Reporting ✅
9. **`reporting/weekly-summary.js`** - Weekly progress reports
   - Aggregates all pipeline stages
   - Calculates conversion rates
   - Posts to Discord #annotations
   - Lists next steps

---

## Pipeline Flow

```
1. Discovery (Firecrawl)
   ↓
2. Research (Firecrawl + Perplexity)
   ↓
3. Verify Emails (ZeroBounce)
   ↓
4. Personalize (Grok)
   ↓
5. Review ⚠️ APPROVAL GATE
   ↓
6. Sync DB (Supabase)
   ↓
7. Send Emails (Smartlead)
   ↓
8. X Engagement (Twitter API)
   ↓
9. Report (Discord)
```

---

## Lobster Workflow: CR Pilot

**File:** `.lobster/cr-pilot.lobster`

**9 Steps:**
```lobster
1. phase1-discovery → muni-discovery.js
2. phase2-research → muni-research.js
3. phase3-verify → verify-emails.js
4. phase4-personalize → muni-personalizer.js
5. phase5-review → compliance-review.js (APPROVAL REQUIRED)
6. phase6-sync-db → supabase-sync.js
7. phase7-send → email-sender.js
8. phase8-x-engage → x-engager.js
9. phase9-report → weekly-summary.js
```

---

## Mock Mode Support

**All 9 scripts support `--mock` flag:**

```bash
# Discovery
node discovery/muni-discovery.js --region=cr --mock

# Research
node research/muni-research.js --input=/tmp/muni-cr-discovered.json --mock

# Verify
node sending/verify-emails.js --input=/tmp/muni-cr-researched.json --mock

# Personalize
node personalization/muni-personalizer.js --input=/tmp/muni-cr-verified.json --mock

# Review
node review/compliance-review.js --input=/tmp/muni-cr-personalized.json

# Sync DB
node database/supabase-sync.js --input=/tmp/muni-cr-approved.json --mock

# Send
node sending/email-sender.js --input=/tmp/muni-cr-approved.json --mock

# Engage
node engagement/x-engager.js --municipalities=/tmp/muni-cr-approved.json --mock

# Report
node reporting/weekly-summary.js --wave=1 --region=cr
```

---

## Credentials Status

| Credential | Script | Status |
|------------|--------|--------|
| `FIRECRAWL_API_KEY` | muni-discovery.js, muni-research.js | ✅ Available |
| `SUPABASE_URL` | supabase-sync.js | ✅ Available |
| `SUPABASE_KEY` | supabase-sync.js | ❌ **MISSING** |
| `ZEROBOUNCE_API_KEY` | verify-emails.js | ✅ **JUST ADDED** |
| `PERPLEXITY_API_KEY` | muni-research.js | ❌ **MISSING** |
| `SMARTLEAD_API_KEY` | email-sender.js | ❌ **MISSING** |
| `X_API_*` | x-engager.js | ✅ Available (Twitter creds) |
| `GROK_API_KEY` | muni-personalizer.js | ✅ Available |

**Missing: 3 credentials** (`SUPABASE_KEY`, `PERPLEXITY_API_KEY`, `SMARTLEAD_API_KEY`)

---

## Email Templates

### Variant A: Governance
**Subject:** Coordination Before Crisis: AI Governance for {municipality}

**Key points:**
- Neutral governance infrastructure
- Coordination without centralization
- Cross-departmental accountability
- Emergency preparedness

### Variant B: Institutional
**Subject:** The Real AI Risk is Coordination Failure

**Key points:**
- Institutional risks > technical risks
- Legitimacy as infrastructure
- Accountability without control
- Network of municipalities

Both templates:
- ✅ Personalized pain points
- ✅ Governance-first positioning (NOT compliance)
- ✅ Clear CTA (30-min conversation)
- ✅ Institutional signature

---

## Database Schema (Supabase)

```sql
CREATE TABLE municipalities (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  population INTEGER,
  website_url TEXT,
  mayor_name TEXT,
  mayor_email TEXT,
  council_emails TEXT[],
  researched_at TIMESTAMPTZ,
  outreach_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  reply_sentiment TEXT,
  x_engagement_count INTEGER DEFAULT 0,
  wave_number INTEGER,
  priority_score INTEGER,
  notes TEXT
);
```

---

## Testing Checklist

### Without Credentials (Mock Mode)
- [ ] Test discovery (CR, 82 cantones)
- [ ] Test research (mock contacts, pain points)
- [ ] Test verify-emails (90% valid rate)
- [ ] Test personalizer (template-based)
- [ ] Test compliance-review (Discord format)
- [ ] Test supabase-sync (mock insert)
- [ ] Test email-sender (mock send)
- [ ] Test x-engager (mock follows/replies)
- [ ] Test weekly-summary (aggregation)
- [ ] Test full Lobster workflow (dry-run)

### With Credentials (Live Mode)
- [ ] Test Firecrawl scraping (real websites)
- [ ] Test ZeroBounce verification (real emails)
- [ ] Test Supabase sync (real DB)
- [ ] Test Smartlead sending (real emails)
- [ ] Test Perplexity research (real AI signals)
- [ ] Test X engagement (real follows/replies)
- [ ] End-to-end CR pilot (82 cantones)

---

## Next Steps

### Immediate (Can do now, mock mode)
1. ✅ Test all 9 scripts individually
2. ✅ Test Lobster workflow dry-run
3. ✅ Verify Discord formatting
4. ✅ Create region configs for USA states

### Pending Credentials
1. ⏳ Get `SUPABASE_KEY` from Andler
2. ⏳ Get `PERPLEXITY_API_KEY`
3. ⏳ Get `SMARTLEAD_API_KEY`
4. ⏳ Set up Supabase project + tables

### After Credentials
1. ⏳ Test end-to-end with real APIs
2. ⏳ Deploy CR pilot (82 cantones)
3. ⏳ Monitor replies, iterate templates
4. ⏳ Scale to Wave 2 (USA, ~19,500 municipalities)

---

## Files Created

```
scripts/alygn/muni-outreach/
├── README.md ✅
├── discovery/
│   └── muni-discovery.js ✅
├── research/
│   └── muni-research.js ✅
├── sending/
│   ├── verify-emails.js ✅
│   └── email-sender.js ✅
├── personalization/
│   └── muni-personalizer.js ✅
├── review/
│   └── compliance-review.js ✅
├── database/
│   └── supabase-sync.js ✅
├── engagement/
│   └── x-engager.js ✅
└── reporting/
    └── weekly-summary.js ✅

.lobster/
└── cr-pilot.lobster ✅
```

---

**Status:** ✅ **ALL SCRIPTS COMPLETE**  
**Next:** Test with mock mode, then await credentials for live testing
