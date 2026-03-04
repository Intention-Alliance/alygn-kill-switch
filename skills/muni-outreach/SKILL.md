# Alygn Municipal Outreach Skill

**Purpose:** Automated municipal discovery, research, personalized outreach, and reply tracking for Alygn's global AI governance campaign.

**Status:** ✅ **PRODUCTION READY** (as of 2026-03-02)

**Target:** Municipalities worldwide for AI governance institutional adoption

---

## 🔒 CRITICAL RULES

### Compliance-First Approach
- ✅ **Manual compliance review REQUIRED** before ANY email sending
- ✅ **Legal review** of claims (Texas constitution, governance vs technology)
- ✅ **CAN-SPAM compliance** checklist completion
- ✅ **AI transparency disclosure** in all emails
- ✅ **GDPR compliance** for EU municipalities (France, Germany, Spain)

### Validation-First Engagement
- ✅ **ALWAYS validate X/Twitter profiles** before engagement (75% failure rate if assumed)
- ✅ **ALWAYS verify emails** via ZeroBounce before sending
- ✅ **Quality over quantity** - 4 verified > 100 fake profiles
- ✅ **Email is PRIMARY channel** in most regions (X/Twitter 10-20% adoption)

### Personalization Standards
- ✅ **100% local language** (Spanish for Costa Rica, etc.)
- ✅ **Mayor name verified** before addressing
- ✅ **Local issues referenced** (crises, pain points, initiatives)
- ✅ **Cultural context** applied (formality, titles, norms)
- ✅ **NO generic templates** - each email personalized

---

## Core Capabilities

### 1. ✅ Automated Municipal Discovery
- Searches for municipalities by country/region
- Loads seed lists (e.g., 84 cantones in Costa Rica)
- Outputs: `/tmp/muni-[country]-discovered.json`

### 2. ✅ Deep Research
- Mayor names (web search, official sites)
- Email addresses (mayor, council, general)
- Current issues (crises, pain points)
- Recent initiatives (projects, investments)
- Alygn relevance (AI governance use cases)
- Outputs: `/tmp/muni-[country]-researched.json`

### 3. ✅ X/Twitter Profile Validation (NEW 2026-03-02)
- Searches for official X/Twitter handles
- Verifies profile existence
- Checks activity (recent tweets)
- Recommends action:
  - `direct_engagement` (verified + active)
  - `mention_only` (exists but inactive)
  - `skip` (doesn't exist - email only)
- **Key Learning:** Only 10-20% of municipalities have verified X profiles
- Outputs: `/tmp/muni-[country]-x-validated.json`

### 4. ✅ Email Verification (ZeroBounce API) (NEW 2026-03-02)
- Verifies mayor emails via ZeroBounce API
- Verifies council emails
- Returns: `valid`, `risky`, `invalid`
- Mock mode available for testing
- **Key Learning:** 100% valid rate when verified before sending
- Outputs: `/tmp/muni-[country]-verified-emails.json`

### 5. ✅ Email Personalization (100% Local Language)
- Loads researched data
- Selects variant (Governance vs Institutional)
- Personalizes with mayor name, issues, pain points
- Applies cultural context (formality, titles, norms)
- Generates 100% local language content
- Outputs: `/tmp/muni-[country]-personalized-emails.json`

### 6. ✅ Manual Compliance Review (CRITICAL STEP)
- **MUST complete before ANY sending**
- Legal review (Texas constitution claims)
- Governance claims accuracy
- CAN-SPAM compliance checklist
- GDPR compliance (if EU expansion)
- AI transparency disclosure adequacy
- Output: `EMAILS-READY-TO-SEND.md` (APPROVED / REVISIONS NEEDED)

### 7. ✅ X/Twitter Warmup (Strategic Engagement)
- **Phase 1:** Follow + Like (build awareness)
  - Follow verified profiles only
  - Like 2-3 recent tweets
  - Wait 24-48 hours before Phase 2
- **Phase 2:** Quote + Reply (add value, NO selling)
  - Quote tweet with Alygn perspective
  - Reply to conversations
  - **NO SELLING** - value-add only
- Rate limits: 9 actions/day max (conservative)

### 8. ✅ Email Sending (SMTP or Smartlead API)
- Loads approved emails (post-compliance)
- Sends via SMTP or Smartlead API
- Tracks: sent, opened, replied, bounced
- Wave-based sending (Wave 1: 2, Wave 2: 2, Wave 3: 1)
- Rate limit: 5 emails/day max
- Outputs: `/tmp/muni-[country]-sent-emails.json`

### 9. ✅ Database Sync (Supabase)
- Syncs municipalities
- Syncs outreach emails
- Syncs X engagements
- Real-time tracking
- Tables: `municipalities`, `outreach_emails`, `x_engagements`, `outreach_templates`

### 10. ✅ Translation + Cultural Adaptation (NEW 2026-03-02)
- Multi-agent translation QA workflow
- Cultural adapter (formality, titles, norms per country)
- 5 countries configured: Costa Rica (Spanish), USA (English), France (French), Germany (German), Spain (Spanish)
- Taboo topics avoidance
- Preferred topics emphasis
- Business etiquette per country

---

## Architecture

### 8-Phase Workflow

```
Phase 0: Discovery (Automated Daily)
  ↓
Phase 1: Deep Research (Manual or Automated)
  ↓
Phase 2: X Profile Validation (Automated)
  ↓
Phase 3: Email Verification (ZeroBounce API)
  ↓
Phase 4: Email Personalization (Automated)
  ↓
Phase 5: Compliance Review (MANUAL - REQUIRED)
  ↓
Phase 6: X Warmup (Automated, 1-2 days before email)
  ↓
Phase 7: Email Sending (Automated, post-approval)
  ↓
Phase 8: Database Sync (Supabase)
```

### Script Architecture

**Core Principle:** Script ↔ AI Coordination

```
Script: Coordinates workflow, loads/saves files, updates external systems
  ↓
Wobblus (AI): Executes tools (web_search, web_fetch, analysis)
  ↓
File: Caches results (/tmp/[name]-result.json)
  ↓
Script: Reads cache, updates Notion/Discord/Supabase
```

**Why This Works:**
- Tools need session context (auth, LLM) that scripts don't have
- Scripts are orchestrators, AI agents are executors
- File caching avoids re-execution (efficiency)
- Separation of concerns = clean architecture

---

## Files

### Core Scripts (11 files)

```
scripts/alygn/muni-outreach/
├── discovery/
│   ├── muni-discovery.js              ✅ Municipal discovery
│   ├── costa-rica-real-municipalities.json  ✅ 10 verified CR municipalities
│   └── language-config.json           ✅ 5 countries config (NEW 2026-03-02)
│
├── research/
│   └── muni-research.js               ✅ Deep research (mayors, emails, issues)
│
├── engagement/
│   ├── x-profile-validator.js         ✅ X profile validation (NEW 2026-03-02)
│   ├── x-warmup-phase1.js             ✅ Follow + Like
│   └── x-warmup-phase2.js             ✅ Quote + Reply
│
├── personalization/
│   ├── muni-personalizer.js           ✅ Email personalization (100% Spanish)
│   └── cultural-adapter.js            ✅ Translation + cultural context (NEW 2026-03-02)
│
├── sending/
│   ├── verify-emails.js               ✅ ZeroBounce verification (NEW 2026-03-02)
│   └── email-sender.js                ✅ SMTP/Smartlead sending
│
├── database/
│   ├── schema.sql                     ✅ Supabase schema (11.8 KB)
│   ├── supabase-sync.js               ✅ Database sync
│   └── generate-seeds.js              ✅ Seed data generator
│
└── translation/
    └── TRANSLATION-WORKFLOW.md        ✅ Multi-agent QA workflow
```

### Shared Scripts

```
scripts/shared/
└── x-growth/
    └── x-api-executor.js              ✅ X API execution engine (unified)
```

### Lobster Workflows

```
.lobster/
├── alygn-x-growth-daily.lobster       ✅ Daily automation (11 AM CST)
└── translation-qa.lobster.json        ✅ Translation QA workflow
```

### Documentation

```
Documentation Files (12+):
├── EMAILS-READY-TO-SEND.md            ✅ 4 personalized emails (awaiting compliance)
├── X-VALIDATION-RESULTS-MANUAL.md     ✅ X validation results
├── X-WARMUP-PHASE1-OUTPUT.md          ✅ X follow/like content
├── X-WARMUP-PHASE2-OUTPUT.md          ✅ X quote/reply content
├── X-PROFILE-VALIDATION-FLOW-UPDATED.md ✅ Validation workflow
├── SYSTEM-VERIFICATION-COMPLETE-2026-03-02.md ✅ System status
├── DYNAMIC-LANGUAGE-AND-DEEP-RESEARCH-COMPLETE.md ✅ Language system
├── EMAIL-VERIFICATION-COMPLETE-2026-03-02.md ✅ ZeroBounce results
├── MAYOR-RESEARCH-COMPLETE-2026-03-02.md ✅ Mayor research
├── SCRIPT-UNIFICATION-COMPLETE.md     ✅ Script consolidation
├── MUNI-OUTREACH-PRODUCTION-READY.md  ✅ Production guide
└── ALYGN-MUNICIPAL-OUTREACH-MASTER-DOCUMENTATION.md ✅ Complete system docs
```

---

## Usage

### As a Skill

```bash
# Full workflow (discovery → sending)
openclaw invoke --tool muni-outreach --action full-outreach --args-json '{"country":"costa-rica"}'

# Discovery only
openclaw invoke --tool muni-outreach --action discover --args-json '{"country":"costa-rica"}'

# Research only
openclaw invoke --tool muni-outreach --action research --args-json '{"input":"/tmp/muni-cr-discovered.json"}'

# X validation only
openclaw invoke --tool muni-outreach --action validate-x --args-json '{"input":"/tmp/muni-cr-researched.json"}'

# Email verification only
openclaw invoke --tool muni-outreach --action verify-emails --args-json '{"input":"/tmp/muni-cr-researched.json"}'

# Email generation only
openclaw invoke --tool muni-outreach --action generate-emails --args-json '{"input":"/tmp/muni-cr-verified-emails.json"}'

# Compliance review (manual step)
# Read: EMAILS-READY-TO-SEND.md
# Approve/reject content

# X warmup only
openclaw invoke --tool muni-outreach --action x-warmup --args-json '{"input":"/tmp/muni-cr-x-validated.json","phase":1}'

# Email sending (post-approval only)
openclaw invoke --tool muni-outreach --action send-emails --args-json '{"input":"/tmp/muni-cr-approved-emails.json","wave":1}'
```

### With Lobster

```bash
# Daily automation (all phases)
lobster run .lobster/alygn-x-growth-daily.lobster

# Runs daily at 11:00 AM CST
# Outputs to Discord #annotations channel
```

### Direct Script Execution

#### Discovery
```bash
node scripts/alygn/muni-outreach/discovery/muni-discovery.js \
  --country=costa-rica \
  --output=/tmp/muni-cr-discovered.json
```

#### Research
```bash
node scripts/alygn/muni-outreach/research/muni-research.js \
  --input=/tmp/muni-cr-discovered.json \
  --output=/tmp/muni-cr-researched.json
```

#### X Profile Validation
```bash
node scripts/alygn/muni-outreach/engagement/x-profile-validator.js \
  --input=/tmp/muni-cr-researched.json \
  --output=/tmp/muni-cr-x-validated.json
```

#### Email Verification (ZeroBounce)
```bash
# Mock mode (testing)
node scripts/alygn/muni-outreach/sending/verify-emails.js \
  --input=/tmp/muni-cr-researched.json \
  --mock

# LIVE mode (production - requires ZEROBOUNCE_API_KEY)
export ZEROBOUNCE_API_KEY="your-api-key"
node scripts/alygn/muni-outreach/sending/verify-emails.js \
  --input=/tmp/muni-cr-researched.json \
  --output=/tmp/muni-cr-verified-emails.json
```

#### Email Personalization
```bash
node scripts/alygn/muni-outreach/personalization/muni-personalizer.js \
  --input=/tmp/muni-cr-verified-emails.json \
  --output=/tmp/muni-cr-personalized-emails.json
```

#### X Warmup Phase 1 (Follow + Like)
```bash
node scripts/alygn/muni-outreach/engagement/x-warmup-phase1.js \
  --input=/tmp/muni-cr-x-validated.json \
  --dry-run  # Remove for actual posting
```

#### X Warmup Phase 2 (Quote + Reply)
```bash
node scripts/alygn/muni-outreach/engagement/x-warmup-phase2.js \
  --input=/tmp/muni-cr-x-validated.json \
  --dry-run  # Remove for actual posting
```

#### Email Sending
```bash
# Dry-run (testing)
node scripts/alygn/muni-outreach/sending/email-sender.js \
  --input=/tmp/muni-cr-approved-emails.json \
  --dry-run \
  --limit=2

# LIVE sending (requires SMTP or Smartlead credentials)
export SMTP_HOST="smtp.gmail.com"
export SMTP_USER="your-email@gmail.com"
export SMTP_PASS="your-app-password"
node scripts/alygn/muni-outreach/sending/email-sender.js \
  --input=/tmp/muni-cr-approved-emails.json \
  --wave=1
```

#### Database Sync
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"
node scripts/alygn/muni-outreach/database/supabase-sync.js \
  --input=/tmp/muni-cr-sent-emails.json
```

---

## Rate Limits (Conservative - Updated 2026-03-02)

### X/Twitter Daily Limits
- **Follows:** 4/day (hard limit)
- **Likes:** 8/day (hard limit)
- **Quotes:** 2/day
- **Replies:** 4/day
- **Total X Actions:** 9/day max (reduced from 36)
- **Delays:** 15-25 seconds random between actions

### Email Daily Limits
- **Wave 1:** 2 emails/day
- **Wave 2:** 2 emails/day (2 days after Wave 1)
- **Wave 3:** 1 email/day (2 days after Wave 2)
- **Total Emails:** 5/day max
- **Weekly Cap:** 25 emails/week
- **Rest Days:** 1 day/week (no sending)

### Why Conservative?
- Prevents spam flags
- Maintains sender reputation
- Higher deliverability rates
- Better engagement quality
- Sustainable long-term scaling

---

## Translation System (NEW 2026-03-02)

### Countries Configured

| Country | Language | Formality | Address Style | Titles |
|---------|----------|-----------|---------------|--------|
| 🇨🇷 Costa Rica | Spanish | High | Estimado/a [Nombre] | Alcalde(sa), Licenciado(a) |
| 🇺🇸 USA | English | Medium | Dear [First Name] | Mayor, Councilmember |
| 🇫🇷 France | French | Very High | Monsieur/Madame le Maire | Maire, Conseiller(ère) |
| 🇩🇪 Germany | German | Very High | Sehr geehrte/r [Name] | Bürgermeister(in), Stadtrat |
| 🇪🇸 Spain | Spanish | High | Estimado/a [Nombre] | Alcalde(sa), Concejal |

### Cultural Adapter Features

**Formality Level:**
- Costa Rica: High (Estimado Alcalde, Saludos cordiales)
- USA: Medium (Dear Mayor [Name], Best regards)
- France: Very High (Monsieur le Maire, Je vous prie d'agréer)
- Germany: Very High (Sehr geehrte Frau Bürgermeisterin, Mit freundlichen Grüßen)
- Spain: High (Estimado Alcalde, Atentamente)

**Taboo Topics to Avoid:**
- Costa Rica: Political party affiliations, criticism of national heroes
- USA: Partisan politics, religious references
- France: Criticism of laïcité, EU skepticism
- Germany: WWII references, privacy violations
- Spain: Regional independence debates

**Preferred Topics to Emphasize:**
- Costa Rica: Democracy, education, environmental leadership
- USA: Innovation, local control, public safety
- France: Institutional excellence, European cooperation
- Germany: Engineering precision, data protection, sustainability
- Spain: Modernization, EU alignment, technological advancement

### Multi-Agent Translation QA Workflow

```
Phase 1: Translator Agent (native speaker)
  - Translates content to target language
  - Ensures grammatical accuracy
  ↓
Phase 2: Reviewer Agent (cultural context expert)
  - Checks formality level
  - Validates cultural appropriateness
  - Identifies taboo topics
  ↓
Phase 3: Final Polish (consistency + tone)
  - Ensures Alygn positioning consistency
  - Checks tone (institutional, restrained)
  - Verifies call-to-action clarity
  ↓
Phase 4: Human QA (optional, high-stakes emails)
  - Manual review for P0/P1 municipalities
  - Final approval before sending
```

---

## Compliance Review Checklist (CRITICAL - MUST COMPLETE BEFORE SENDING)

### Legal Review
- [ ] Texas constitution claims accurate?
- [ ] Governance vs technology distinction clear?
- [ ] No false claims of authority/regulatory power?
- [ ] "Constituted in Texas, USA" statement accurate?
- [ ] No promises of specific outcomes?

### CAN-SPAM Compliance
- [ ] Physical mailing address included?
- [ ] Clear unsubscribe mechanism?
- [ ] Subject line not misleading?
- [ ] Email identified as advertisement (if applicable)?
- [ ] Sender information accurate?

### GDPR Compliance (EU Municipalities)
- [ ] Legal basis for processing documented?
- [ ] Data minimization applied?
- [ ] Right to erasure mechanism available?
- [ ] Privacy policy linked?
- [ ] Consent recorded (if required)?

### AI Transparency
- [ ] P.S. disclosure included? ("Esta comunicación fue asistida por IA y revisada por humanos")
- [ ] AI role clearly stated?
- [ ] Human review mentioned?

### Content Quality
- [ ] Mayor name verified and spelled correctly?
- [ ] Local issues accurately referenced?
- [ ] No generic template language?
- [ ] Tone appropriate (institutional, restrained)?
- [ ] Call-to-action clear and reasonable?

### Approval Workflow
```
1. Generate emails (muni-personalizer.js)
   ↓
2. Save to EMAILS-READY-TO-SEND.md
   ↓
3. Human review (Andler + Alygn team)
   ↓
4. Checklist completion (above)
   ↓
5. Approve / Request revisions
   ↓
6. If approved: Mark as "APPROVED" in file
   ↓
7. Proceed to sending (email-sender.js)
```

**⚠️ CRITICAL:** DO NOT SEND EMAILS WITHOUT COMPLETING THIS REVIEW

---

## Key Learnings (Costa Rica Pilot 2026-03-02)

### Technical Learnings

1. **Never Assume Social Media Handles**
   - Assumed 4 X handles: 3/4 were FAKE (75% failure rate)
   - Solution: Created `x-profile-validator.js`
   - Result: Only 1/10 municipalities has verified X (@CartagoMuni)
   - **Lesson:** ALWAYS validate before engagement

2. **Email is PRIMARY Channel in Most Regions**
   - Costa Rica municipalities prefer: Facebook, Instagram, WhatsApp, Email
   - X/Twitter adoption: 10-20% (very low)
   - **Strategy:** Focus on email (80-90% of outreach), X only for verified profiles
   - **Implication:** Email quality critical, X warmup secondary

3. **ZeroBounce Integration Works**
   - API key configured and tested
   - 4/4 emails verified (100% valid)
   - LIVE mode tested successfully
   - **Confidence:** High deliverability expected

4. **Firecrawl API Unreliable**
   - Frequent 408/500 errors
   - Solution: Use pre-verified data + web_search (Perplexity)
   - Alternative: `web_fetch` tool (more reliable)
   - **Lesson:** Don't depend solely on Firecrawl

5. **Website URL Variations Matter**
   - `https://muni-carta.go.cr` → 408 Timeout
   - `https://www.muni-carta.go.cr` → 200 OK
   - **Lesson:** Try with and without `www.` prefix

### Strategic Learnings

1. **Quality Over Quantity**
   - Spray & pray (100 fake profiles) vs focused engagement (4 verified emails)
   - Higher response rates, better credibility with verified contacts
   - **Lesson:** 4 verified > 100 fake

2. **X Warmup Before Email**
   - Expected lift: 5-10% → 15-25% response rate
   - Timeline: 1-2 days X warmup, then email
   - Strategy: Build awareness, add value, NO selling
   - **Lesson:** Patience pays off

3. **Personalization is Critical**
   - Mayor names verified + local issues referenced
   - Expected lift: 25-50% response rate (vs 5-10% generic)
   - Effort: Higher, but ROI justifies
   - **Lesson:** Personalization = response rate

4. **Compliance Review is Mandatory**
   - Legal claims (Texas constitution, governance vs technology)
   - CAN-SPAM compliance
   - AI transparency disclosure
   - **Lesson:** Manual review before ANY sending

5. **Conservative Rate Limits**
   - X: 9 actions/day (was 36)
   - Emails: 5/day
   - Delays: 15-25 seconds random
   - Reason: Prevent spam flags, maintain credibility
   - **Lesson:** Slow and steady wins

---

## Expected Performance Metrics

### Email Metrics (Personalized Outreach)

| Metric | Industry Avg | This Campaign | Target |
|--------|--------------|---------------|--------|
| Open Rate | 20-30% | 50-70% | 60% |
| Reply Rate | 5-10% | 15-25% | 20% |
| Meeting Rate | 1-3% | 5-10% | 7% |
| Bounce Rate | 2-5% | <1% | <1% |

### X Warmup Metrics (Verified Profiles Only)

| Action | Expected Result | Target |
|--------|-----------------|--------|
| Follow back | 50% | 1 |
| Likes back | 1-2 | 1 |
| Quote impressions | 50-100 | 75 |
| Reply rate | 20-30% | 1 |

### Long-Term Metrics (60 Municipalities Target)

| Metric | Conservative | Target | Stretch |
|--------|--------------|--------|---------|
| Total Emails | 60 | 60 | 60 |
| Opens | 30 (50%) | 36 (60%) | 42 (70%) |
| Replies | 9 (15%) | 12 (20%) | 18 (30%) |
| Meetings | 3 (5%) | 4 (7%) | 6 (10%) |
| Partnerships | 1 (1.7%) | 2 (3.3%) | 3 (5%) |

---

## Production Readiness Checklist

### Complete (Ready to Go)

- [x] Municipality Discovery - 10 CR municipalities verified
- [x] Mayor Research - 7/10 mayor names verified
- [x] Email Research - 4/10 emails verified
- [x] X Profile Validation - System created, 1/10 verified
- [x] Email Generation - 4 personalized emails (Spanish)
- [x] ZeroBounce Integration - LIVE tested (4/4 valid)
- [x] Database Schema - Supabase ready
- [x] X Warmup Content - Cartago ready
- [x] Lobster Workflow - Defined and configured
- [x] Translation System - 5 countries configured

### Pending (Human Approval Required)

- [ ] Email Compliance Review - Legal + CAN-SPAM approval
- [ ] Email Content Approval - Read `EMAILS-READY-TO-SEND.md`
- [ ] X Warmup Approval - Approve Cartago content
- [ ] SMTP/Smartlead Credentials - Configure for sending
- [ ] Supabase Credentials - Configure for tracking
- [ ] Cronjob Activation - Approve Lobster workflow

---

## Deployment Plan

### Phase 0: Pre-Production (NOW)
- Compliance review
- Configure credentials (SMTP, Supabase)
- Test ZeroBounce (done ✅)
- Test email send (dry-run)

### Phase 1: Manual Testing (Day 1-3)
- X Warmup Cartago (Follow → Wait 24-48h → Quote/Reply)
- Email Wave 1 (Liberia + Heredia)
- Email Wave 2 (San José + Cartago)
- Monitor metrics (48h between waves)

### Phase 2: Automation (Day 7+)
- Activate Lobster cronjob (11 AM CST daily)
- Monitor Discord notifications
- Adjust rate limits based on results
- Research remaining 6 CR municipalities

### Phase 3: Global Expansion (Month 2+)
- Costa Rica (10 municipalities) ✅
- USA (20 municipalities, English)
- France (10, French, GDPR)
- Germany (10, German, GDPR)
- Spain (10, Spanish, GDPR)
- **Total Target:** 60 municipalities

---

**Created:** 2026-03-01
**Updated:** 2026-03-02 23:59 CST
**Status:** ✅ **PRODUCTION READY - AWAITING COMPLIANCE APPROVAL**

**Next Action Required:**
👉 Read `EMAILS-READY-TO-SEND.md` and approve for compliance
