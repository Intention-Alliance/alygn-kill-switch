# ALYGN VC Outreach Automation — Roadmap & Ontology

**Status:** Phase 1 Complete (Email Templates) | Phase 2 Pending (Browser/Research Automation)  
**Last Updated:** 2026-02-05 23:38 CST

---

## Phase 1: Email Template System ✅ COMPLETE

### Deliverables
- [x] Secure credential loading (JSON-based, no hardcoding)
- [x] Two professional email variants (Governance + Technical)
- [x] SOS Protocol positioning (Kill Switch narrative)
- [x] MIME-embedded logo (universal email client compatibility)
- [x] Dark header (#252525) with centered ALYGN logo + wordmark
- [x] Margin-based alignment (flexbox-free for broad email support)
- [x] Personalization framework (recipient name, company, pain points)
- [x] Tania Lea signature (CEO, tanialeaidm@gmail.com)
- [x] AI agent transparency P.S. ("researched and drafted by our AI agent")

### Files
```
scripts/alygn/
├── vc-outreach-email-template.py          # Python sender with secure creds
├── vc-outreach-email-template.js          # JS template generator
├── email-template-governance.html         # Governance variant (editable)
├── email-template-technical.html          # Technical variant (editable)
└── send-email-test.js                     # Test/demo script
```

### Key Features
- **Email Security:** Credentials loaded from `~/.openclaw/workspace/config/credentials.json`
- **MIME Architecture:** Related multipart messages with inline image embedding (Content-ID)
- **Copy Strategy:** High-EQ, intelligent positioning (not generic startup fluff)
- **Variants:**
  - Governance: "Who Coordinates the Response?" (appeals to safety/risk mindset)
  - Technical: "Existential Risk Management" (deep-dive architecture focus)

---

## Phase 2: Browser Automation + VC Research 🔄 PENDING

### Architecture (Tomorrow)

```
┌─────────────────────────────────────────────────────────────┐
│                  VC OUTREACH ORCHESTRATION                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. VC RESEARCH & DISCOVERY (Web Search + Scraping)          │
│     ├─ Input: Industry vertical, stage, geography            │
│     ├─ Tools: web_search, web_fetch, browser scraping        │
│     ├─ Output: VC contacts, portfolios, investment theses    │
│     └─ Enrichment: Company pain points, recent activity      │
│                                                               │
│  2. CONTACT INTELLIGENCE (Browser Navigation)                │
│     ├─ LinkedIn profile scraping → decision makers           │
│     ├─ VC website navigation → contact forms                 │
│     ├─ Portfolio analysis → relevance scoring                │
│     └─ Pain point extraction → personalization data          │
│                                                               │
│  3. EMAIL PERSONALIZATION (Dynamic Template Rendering)       │
│     ├─ Recipient: [VC partner name]                          │
│     ├─ Company: [VC firm, recent investments]                │
│     ├─ Pain Points: [extracted context]                      │
│     ├─ Variant Selection: governance | technical             │
│     └─ Subject Line: Dynamic (based on research)             │
│                                                               │
│  4. EMAIL DELIVERY (Secure SMTP)                             │
│     ├─ Load HTML from variant template                       │
│     ├─ Embed ALYGN logo (MIME)                               │
│     ├─ Render personalized content                           │
│     └─ Send via alyyygn@gmail.com (secure creds)             │
│                                                               │
│  5. TRACKING & LOGGING (Notion Database)                     │
│     ├─ VC contact info + research data                       │
│     ├─ Email sent timestamp, variant, subject                │
│     ├─ Link to research sources                              │
│     └─ Manual follow-up notes field                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Tools & APIs

| Task | Tool | Method | Notes |
|------|------|--------|-------|
| **Search VCs** | `web_search` | Brave API + keywords | "Series A VCs AI safety", location filters |
| **Scrape Context** | `web_fetch` | HTML → markdown | VC websites, portfolio pages, blog posts |
| **Browser Automation** | `browser` (Playwright) | profile="openclaw" | LinkedIn scraping, contact extraction |
| **VC Intelligence** | Manual + AI analysis | Search + browser combo | Extract pain points, recent bets |
| **Personalization** | Python script | Template + JSON | Merge research data into email template |
| **Delivery Tracking** | Notion API | REST calls | Log all outreach attempts + metadata |

### Phase 2 Workflow

```python
# Pseudo-code for orchestration
for vc_firm in vc_list:
    # 1. RESEARCH
    research_data = {
        'web_search': search_vc_firm(vc_firm.name, filters),
        'website': fetch_vc_website(vc_firm.url),
        'portfolio': extract_portfolio_companies(research_data),
        'partners': browser_scrape_partners(vc_firm.linkedin)
    }
    
    # 2. INTELLIGENCE EXTRACTION
    pain_points = extract_pain_points(research_data)
    relevance_score = score_alignment(research_data, ALYGN_thesis)
    
    # 3. PERSONALIZATION
    for partner in research_data['partners']:
        email_context = {
            'recipient_name': partner.name,
            'company_name': vc_firm.name,
            'pain_points': pain_points,
            'variant': select_variant(relevance_score),
            'subject': generate_subject(research_data)
        }
        
        # 4. RENDER & SEND
        html = render_email_template(email_context)
        send_email(partner.email, html, email_context)
        
        # 5. LOG TO NOTION
        log_outreach(vc_firm, partner, email_context, research_data)
```

### Tech Stack (Phase 2)

**Web Research:**
- `web_search()` → Find VCs by vertical/stage/geo
- `web_fetch()` → Scrape firm websites, blogs, portfolios
- `browser` tool → LinkedIn scraping, dynamic content, contact forms

**Data Processing:**
- Parse search results → structured VC contact list
- Extract pain points from: blog posts, pitch decks, announcements
- Score relevance (investment thesis alignment)

**Personalization:**
- Template: `vc-outreach-email-template.py` (existing)
- Context injection: recipient name, company, pain points, variant
- Subject line generation (dynamic based on research)

**Delivery & Tracking:**
- SMTP: Secure Gmail credentials (existing)
- Notion API: Log outreach, research sources, timestamps
- Cron job: Schedule batch sends (e.g., Monday 10 AM VC discovery)

---

## Phase 3: Advanced Optimization (Future)

- [ ] A/B testing framework (variant performance tracking)
- [ ] Response detection (Gmail label tracking)
- [ ] Follow-up sequence automation (Cron-based drip campaign)
- [ ] VC database enrichment (ongoing refresh from web sources)
- [ ] Multi-channel outreach (Twitter mentions, LinkedIn InMail)

---

## Critical Dependencies for Phase 2

### 1. **Web Search Integration**
- Verify Brave Search API configured
- Test queries: "Series A VCs AGI", "AI safety investors"
- Parse results → extract firm names, URLs

### 2. **Browser Automation Setup**
- Test `browser` tool with profile="openclaw" (Playwright)
- LinkedIn scraping: headless navigation, contact extraction
- Handle: paywalls, login redirects, dynamic content

### 3. **Notion Integration (Existing)**
- Database: `vc_outreach` (ID in credentials.json)
- Fields: vc_name, partner_name, email, research_summary, variant_sent, timestamp

### 4. **Data Pipeline**
- Input validation (VC names, emails)
- Deduplication (no duplicate sends)
- Error handling (missing contacts, scrape failures)

---

## Tomorrow's Agenda (Phase 2 Execution)

1. **VC Research Module**
   - Build web_search queries → VC discovery
   - Extract firm URLs, partner names, emails
   - Fetch and analyze websites (pain point extraction)

2. **Browser Automation**
   - Set up `browser` tool (Playwright)
   - LinkedIn scraping: find VC partners
   - Contact form navigation (fallback contact methods)

3. **Integration**
   - Merge research data with email templates
   - Personalization logic (recipient, company, pain points)
   - Subject line dynamism based on research

4. **Testing**
   - Send test batch to sample VCs
   - Verify personalization rendering
   - Check Notion logging

5. **Scheduling**
   - Cron job setup (Monday 10:30 AM discovery, 11 AM send)
   - Rate limiting (avoid Gmail throttling)
   - Batch processing (20-50 sends/week)

---

## Key Insights & Design Decisions

**Why This Approach?**
- **AI Agent Transparency:** We eat our own dog food (automated outreach proves our tech works)
- **Research-Driven Personalization:** Not spray-and-pray; every email is contextual
- **Email Client Compatibility:** Margin-based CSS, MIME images, no flexbox
- **Security First:** Credentials never in source code; JSON-based loading only
- **Scalability:** Modular pipeline allows batch processing, A/B testing, follow-ups

**Risk Mitigation:**
- Gmail SMTP rate limits → batch sends with delays
- LinkedIn anti-bot detection → headless navigation, user-agent rotation
- Web scraping failures → fallback to manual contact extraction
- Duplicate sends → deduplication logic before each send batch

---

## Files to Create/Update (Phase 2)

```
scripts/alygn/
├── vc-research.py              # NEW: Web search + scraping logic
├── vc-intelligence.py          # NEW: Pain point extraction, relevance scoring
├── vc-browser-automation.js    # NEW: Browser navigation, LinkedIn scraping
├── vc-outreach-orchestrator.py # NEW: Master coordination script
├── vc-contact-dedup.py         # NEW: Deduplication + validation
├── vc-notion-logger.py         # NEW: Notion API integration
├── vc-outreach-config.json     # NEW: VC discovery parameters (verticals, stages)
└── vc-outreach-logs/           # NEW: Directory for batch logs
    └── outreach-[timestamp].json
```

---

## Success Metrics (Post-Phase 2)

- ✅ Automated VC discovery: 50+ qualified contacts/week
- ✅ Personalization rate: 100% (no generic emails)
- ✅ Research enrichment: company/pain points in each email
- ✅ Delivery rate: 100% (no bounces from secure sending)
- ✅ Notion logging: complete audit trail
- ✅ Response rate: benchmark (target: 10-15% reply rate)

---

**Owner:** Andler / Wobblus  
**Next Review:** 2026-02-06 (post-Phase 2 execution)  
**Slack/Discord Channel:** #alygn-automation
