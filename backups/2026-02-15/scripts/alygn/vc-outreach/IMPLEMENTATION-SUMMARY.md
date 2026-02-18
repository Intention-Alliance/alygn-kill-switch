# ALYGN VC Outreach - Implementation Summary & Approval
**Date:** February 12, 2026  
**Thread:** Discord #Alygn: VC Outreach Plan & Implementation  
**Status:** Awaiting approval to proceed

---

## 📋 What We're Building

A fully automated VC outreach system that:
1. **Discovers** AI-focused VCs (Crunchbase, AngelList, LinkedIn, web search)
2. **Researches** investment thesis, portfolio, pain points (Grok-enhanced)
3. **Personalizes** emails (governance vs technical variants)
4. **Sends** outreach (rate-limited SMTP, batch of 10/day)
5. **Tracks** replies (4x/day Gmail monitoring via IMAP)
6. **Updates** Notion database (status, sentiment, next actions)
7. **Notifies** team (WhatsApp alerts for replies/meetings)

**Target:** 100 AI-focused seed/Series A VCs by end of Month 1.

---

## ✅ Phase 1: Already Complete

- ✅ Email templates (Governance + Technical variants)
- ✅ MIME-embedded ALYGN logo, dark header design
- ✅ Secure credential loading (JSON-based)
- ✅ Personalization framework (recipient, company, pain points)
- ✅ Tania Lea signature + AI agent transparency P.S.

---

## 🔄 Phase 2-5: Ready to Implement

### Phase 2: Email Workflow & Reply Tracking

**Gmail Forwarding Setup:**
- Tania's Gmail → `alyyygn@gmail.com` (staging/testing - note: 3 y's)
- Filter: Subject contains "[ALYGN VC]" OR from known VCs
- Production: Move to `outreach@alyygn.com` (2 y's) after validation

**Reply Tracking Cron:**
- **Schedule:** 6x/day (7AM, 9AM, 11AM, 3PM, 5PM, 7PM Mon-Fri)
- **Action:** Check Gmail via IMAP → Analyze replies (Grok) → Update Notion → WhatsApp notification

**Deliverables:**
- `reply-tracker.js` - Main reply detection script
- `reply-analyzer.js` - Grok sentiment/intent analysis
- `notion-updater.js` - Database sync logic
- `reply-notification.js` - WhatsApp alerts

---

### Phase 3: Automated VC Discovery

**Sources:**
- **Crunchbase:** Investment stage (Seed, Series A), Focus (AI/ML) → 30 VCs
- **AngelList:** AI safety syndicates + funds → 20 VCs
- **Web Search:** "AI safety seed VCs", "AGI governance investors" → 25 VCs
- **LinkedIn:** Search "[VC name] + partner" → 15 VCs
- **Manual Research:** Whitepapers, conferences → 10 VCs

**Relevance Scoring:**
- Investment thesis keywords (ai safety, alignment, governance): +2 each
- Portfolio companies (AI safety investments): +3
- Stage alignment (seed/Series A): +1
- Geography (US/EU): +1
- **Threshold:** 7+ out of 10 (only high-relevance VCs)

**Deliverables:**
- `vc-discovery.js` - Main discovery orchestrator
- `vc-contact-finder.js` - Browser automation for contacts
- `relevance-scorer.js` - Scoring algorithm
- **Target:** 50 new VCs discovered per week

---

### Phase 4: Email Personalization Engine

**Pain Point Extraction (Grok):**
```
Analyze VC's investment thesis + portfolio:
→ Extract top 3 governance challenges ALYGN solves
→ Institutional tone, governance angle (not technical)
→ Language: "Supports coordination", "Enables accountability"
```

**Dynamic Subject Lines (Grok):**
- "Governance infrastructure for AGI coordination"
- "Solving the oversight crisis before it's too late"
- "Emergency coordination at frontier scale"

**Deliverables:**
- `pain-point-extractor.js` - Grok-based analysis
- `email-personalizer.js` - Template rendering
- `subject-line-generator.js` - AI-generated subjects

---

### Phase 5: Outreach Orchestration

**Workflow:**
1. Query Notion → Pending VCs (priority: High → Medium → Low)
2. Generate personalized emails (variant, subject, pain points)
3. Send via SMTP (rate-limited: 1 email/hour, batch of 12/day over 12 hours)
4. Update Notion (status: Contacted, metadata logged)
5. WhatsApp summary (total sent, VCs contacted)

**Schedule:** 7AM-7PM (1 email per hour, 12 emails/day)

**Deliverables:**
- `outreach-orchestrator.js` - Main campaign runner
- `batch-sender.js` - Rate-limited sending
- `weekly-report.js` - Performance analytics

---

## 📊 Notion Database Enhancements

**New Properties to Add:**
- `Reply Sentiment` (Select: Positive/Neutral/Negative)
- `Reply Summary` (Text: AI-generated 2-3 sentences)
- `Next Action` (Text: Suggested follow-up)
- `Email Variant` (Select: Governance/Technical)
- `Pain Points` (Text: Top 3 extracted)
- `Relevance Score` (Number: 1-10)
- `Research Sources` (URL: Links to research)

**New Views to Create:**
- Active Conversations (Status: Replied, sorted by Reply Date)
- Needs Follow-up (Replied but no action in 3+ days)
- Weekly Outreach (Contacted in last 7 days)

---

## 🕐 Cron Schedule

| Time | Frequency | Job | Script |
|------|-----------|-----|--------|
| Mon 8 AM | Weekly | VC Discovery | `vc-discovery.js --source=crunchbase` |
| Mon-Fri 7-7 PM | Hourly | Outreach Campaign (12 emails/day) | `outreach-orchestrator.js --hourly` |
| Mon-Fri 7AM, 9AM, 11AM, 3PM, 5PM, 7PM | 6x/day | Reply Tracking | `reply-tracker.js` |
| Fri 5 PM | Weekly | Performance Report | `weekly-report.js` |
| 1st of month 10 AM | Monthly | Database Cleanup | `database-maintenance.js` |

---

## 🎯 Success Metrics (Month 1)

**Discovery:**
- VCs discovered: 100+
- Relevance score average: 7+
- Contact info completeness: 80%+

**Outreach:**
- Emails sent: 240+ (12/day × 20 business days)
- Personalization quality: 9/10 (manual review)
- Delivery rate: 100% (no bounces)

**Engagement:**
- Reply rate: 10-15% (target)
- Meeting conversion: 30% of positive replies
- Investment conversion: 5-10% of meetings

**System Health:**
- Cron job success rate: 100%
- Gmail forwarding accuracy: 100%
- Notion sync accuracy: 100%

---

## 📁 New Files to Create

```
scripts/alygn/vc-outreach/
├── core/
│   ├── vc-discovery.js                    # Main discovery script ✨ NEW
│   ├── pain-point-extractor.js            # Grok analysis ✨ NEW
│   └── relevance-scorer.js                # Scoring algorithm ✨ NEW
│
├── email/
│   ├── email-personalizer.js              # Dynamic personalization ✨ NEW
│   └── subject-line-generator.js          # AI subject lines ✨ NEW
│
├── tracking/
│   ├── reply-tracker.js                   # IMAP reply detection ✨ NEW
│   ├── reply-analyzer.js                  # Sentiment/intent ✨ NEW
│   ├── notion-updater.js                  # Database sync ✨ NEW
│   └── gmail-classifier.js                # Filter matching ✨ NEW
│
├── orchestration/
│   ├── outreach-orchestrator.js           # Campaign runner ✨ NEW
│   ├── batch-sender.js                    # Rate-limited sending ✨ NEW
│   └── weekly-report.js                   # Performance reports ✨ NEW
│
├── notifications/
│   ├── notification-sender.js             # WhatsApp integration ✨ NEW
│   ├── notification-templates.js          # Message templates ✨ NEW
│   └── urgent-classifier.js               # Urgency detection ✨ NEW
│
└── utils/
    ├── gmail-api.js                       # Gmail/IMAP helpers ✨ NEW
    └── rate-limiter.js                    # API throttling ✨ NEW
```

**Total:** ~15 new scripts + config files

---

## ⚠️ Critical Dependencies

### 1. Gmail Forwarding (Manual Setup Required)
- **Action:** Tania creates Gmail filter (forward to `alyyygn@gmail.com` - 3 y's for staging)
- **Pattern:** Subject contains "[ALYGN VC]" OR from known VCs
- **Testing:** Send test email to verify forwarding works
- **Production:** Later move to `outreach@alyygn.com` (2 y's)

### 2. IMAP Credentials (Config Required)
- **Action:** Generate Gmail app password for `alyyygn@gmail.com` (staging)
- **Storage:** Add to `~/.openclaw/workspace/config/credentials.json`
- **Security:** Use app-specific password (not main account password)

### 3. Notion Database (Schema Updates Required)
- **Action:** Add new properties to VC Outreach Tracker database
- **Script:** `setup-vc-tracker-v2.js` (creates/updates schema)

### 4. WhatsApp Channel (Already Configured)
- **Status:** ✅ Working (verified +50662163355)
- **Action:** None (already integrated)

### 5. Browser Profile (Already Configured)
- **Status:** ✅ `profile="alygn"` Chrome instance authenticated
- **Action:** None (ready for LinkedIn/Crunchbase scraping)

---

## 🛡️ Security & Rate Limiting

**Gmail SMTP:**
- Max 100 emails/day → Batch of 12/day (safe margin)
- Delay between sends: 1 hour (1 email/hour, 7AM-7PM schedule)

**Notion API:**
- Max 3 requests/second → Exponential backoff on rate limits
- Use read-only tokens where possible

**Browser Automation:**
- Isolated Chrome profile (`alygn`)
- Human-like delays (2-5s between actions)
- Anti-bot detection: User-agent rotation, headless flags

**Data Privacy:**
- VC contact info is PII → Never log full emails
- All credentials in `credentials.json` (never hardcoded)
- Rotate Gmail app password quarterly

---

## ⏱️ Implementation Timeline

### Week 1: Foundation (Feb 12-16)
- ✅ Gmail forwarding setup (Tania → alyyygn@gmail.com - 3 y's)
- ✅ Reply tracking cron job (6x/day)
- ✅ Notion database enhancements (new properties)
- ✅ WhatsApp notification system
- **Deliverables:** Reply tracking fully functional

### Week 2: Discovery (Feb 17-23)
- ✅ VC discovery script (Crunchbase scraping)
- ✅ Browser automation (LinkedIn mining)
- ✅ Relevance scoring algorithm
- **Deliverables:** 50 new VCs discovered

### Week 3: Personalization (Feb 24-Mar 2)
- ✅ Pain point extraction (Grok integration)
- ✅ Dynamic email generation
- ✅ Subject line optimizer
- **Deliverables:** Test batch (20 emails sent)

### Week 4: Full Production (Mar 3-9)
- ✅ Outreach orchestrator (hourly sending)
- ✅ All cron jobs active
- ✅ Weekly performance reports
- **Deliverables:** System at full scale (12 emails/day, 7AM-7PM)

---

## ✅ Approval Checklist

**Before proceeding, confirm:**

- [ ] **Tone alignment:** Governance-first positioning is correctly reflected in templates
- [x] **Gmail forwarding:** Tania → `alyyygn@gmail.com` (staging - 3 y's) + `outreach@alyygn.com` (production - 2 y's) ✅
- [x] **Cron frequency:** 6x/day reply tracking (7AM, 9AM, 11AM, 3PM, 5PM, 7PM Mon-Fri) ✅
- [x] **Notification channel:** WhatsApp for urgent notifications ✅
- [x] **Batch size:** 12 emails/day (1/hour, 7AM-7PM) ✅
- [x] **VC target:** 100+ VCs (AI-focused primary, technology/related secondary) ✅
- [ ] **Skill structure:** Model after X/Twitter automation skill (similar detail level)
- [ ] **Timeline:** 4-week implementation plan is realistic

---

## 📝 Next Steps

**Once approved:**

1. **Create Gmail filter** (Tania → alyyygn@gmail.com with 3 y's)
2. **Generate IMAP app password** (alyyygn@gmail.com)
3. **Update Notion database schema** (add new properties)
4. **Build reply-tracker.js** (Week 1 priority)
5. **Add reply tracking cron job** (6x/day schedule: 7AM, 9AM, 11AM, 3PM, 5PM, 7PM)
6. **Add hourly outreach cron** (12 jobs, 7AM-7PM, 1/hour)
7. **Test with sample forwarded emails** (validate workflow)

**Then proceed to:**
- Week 2: VC discovery automation
- Week 3: Personalization engine
- Week 4: Full production deployment

---

## 📚 Documentation Created

✅ **VC-OUTREACH-IMPLEMENTATION-PLAN.md** - Complete 4-phase plan with technical details  
✅ **skills/alygn-vc-outreach/SKILL.md** - Comprehensive skill reference (similar to Twitter skill)  
✅ **IMPLEMENTATION-SUMMARY.md** - This document (executive summary)

**Location:** `scripts/alygn/vc-outreach/`

---

## 💬 Questions for Andler

~~Questions answered by Andler:~~
1. ✅ **Gmail:** Start with `alyyygn@gmail.com` (3 y's), move to `outreach@alyygn.com` (2 y's) for production
2. ✅ **Batch size:** 12 emails/day (1/hour, 7AM-7PM)
3. ✅ **Notifications:** WhatsApp for urgent alerts
4. ✅ **VC targeting:** AI-focused primary, technology/related secondary
5. ✅ **Reply tracking:** 6x/day (7AM, 9AM, 11AM, 3PM, 5PM, 7PM)

---

**Owner:** Wobblus  
**Thread:** Discord #Alygn: VC Outreach Plan & Implementation  
**Message ID:** `1471390233449992241`  
**Status:** ⏸️ Awaiting approval to proceed
