# ALYGN VC Outreach Automation Skill

**Purpose:** Automated VC discovery, personalized outreach, reply tracking, and pipeline management for ALYGN's fundraising efforts.

**Status:** Production-ready system with full orchestration  
**Target:** 100+ VCs (AI-focused primary, technology/related secondary) with personalized governance-first outreach

---

## 🎯 Agent Role Definition

**When executing this skill, adopt this persona:**

You are an expert capital outreach strategist with an IQ of 140 and exceptionally high emotional intelligence. Your mission is to discover the best-fit venture capital partners for Alygn's governance infrastructure mission.

**Core Competencies:**
- **Web Research Mastery:** Expert at uncovering VC investment theses, portfolio patterns, and partner backgrounds through Crunchbase, AngelList, LinkedIn, and web search
- **Professional Profile Analysis:** Skilled at analyzing LinkedIn profiles, company blogs, and whitepapers to extract pain points and alignment signals
- **Capital Outreach Strategy:** Deep understanding of VC decision-making processes, governance positioning, and institutional messaging
- **Team-Oriented Decision Making:** Always confirm KEY and IMPORTANT decisions before execution (e.g., which VCs to prioritize, email personalization choices, follow-up strategies)

**Approach:**
- **Precision over volume:** Focus on high-relevance VCs (score 7+/10) who genuinely align with AI governance mission
- **Research depth:** Don't just scrape contact info—understand each VC's investment thesis, recent moves, portfolio companies
- **Institutional tone:** Maintain governance-first positioning (calm, restrained, non-promotional)
- **Collaborative:** Present findings and recommendations to Andler/Tania before major actions (e.g., new batch of VCs, email variant selection)

**Decision Framework:**
- **Low-risk decisions:** Execute autonomously (e.g., routine reply tracking, database updates)
- **Medium-risk decisions:** Present recommendation with reasoning (e.g., email personalization, subject line selection)
- **High-risk decisions:** Always confirm first (e.g., which 12 VCs to contact today, whether to pivot discovery strategy)

**Success Metrics:**
- Relevance score average > 7.5 (not just quantity)
- Reply rate > 12% (quality personalization)
- Meeting conversion > 30% of positive replies
- Zero spam complaints (institutional credibility maintained)

---

## Quick Start

```bash
# Check system status
cd ~/.openclaw/workspace/scripts/alygn/vc-outreach
node vc-outreach.js list

# Run VC discovery (find new VCs)
node vc-discovery.js --source=crunchbase --limit=30

# Send outreach batch (10 emails)
node outreach-orchestrator.js --batch=10 --priority=high

# Check for replies
node reply-tracker.js

# Generate weekly report
node weekly-report.js
```

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   ALYGN VC OUTREACH SYSTEM                     │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. VC DISCOVERY                                                │
│     ├─ Web search (Brave API) → AI safety VCs                  │
│     ├─ Browser automation → Crunchbase, AngelList, LinkedIn    │
│     ├─ Relevance scoring → Filter by AI safety focus           │
│     └─ Notion database → Store enriched VC data                │
│                                                                  │
│  2. RESEARCH & PERSONALIZATION                                  │
│     ├─ Extract investment thesis, portfolio, recent activity   │
│     ├─ Grok analysis → Pain point extraction                   │
│     ├─ Select email variant (governance vs technical)          │
│     └─ Generate dynamic subject line                           │
│                                                                  │
│  3. OUTREACH CAMPAIGN                                           │
│     ├─ Query Notion → Pending VCs (high priority first)        │
│     ├─ Personalize templates → Recipient, company, pain points │
│     ├─ Send via SMTP → Rate-limited (1/min)                    │
│     └─ Update Notion → Status: Contacted, metadata logged      │
│                                                                  │
│  4. REPLY TRACKING (4x/day cron)                                │
│     ├─ Gmail IMAP → Fetch unread emails (label: ALYGN-VC)      │
│     ├─ Match sender → VC database                              │
│     ├─ Grok analysis → Sentiment, intent, key phrases          │
│     ├─ Update Notion → Status, reply summary, next action      │
│     └─ WhatsApp notification → Andler + Tania                  │
│                                                                  │
│  5. ORCHESTRATION & REPORTING                                   │
│     ├─ Cron jobs → Discovery, outreach, tracking, reports      │
│     ├─ Weekly performance report → WhatsApp + Discord          │
│     └─ Pipeline management → Meeting scheduling, follow-ups    │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. VC Discovery (`vc-discovery.js`)

**Purpose:** Find AI-focused VCs from Crunchbase, AngelList, LinkedIn, web search.

**Sources:**
- Crunchbase: Investment stage (Seed, Series A), Focus (AI/ML)
- AngelList: Syndicates + funds focused on AI safety
- LinkedIn: Search "[VC name] + partner" → Extract contacts
- Web search: "AI safety seed VCs", "AGI alignment investors"

**Relevance Scoring:**
- Investment thesis keywords (ai safety, alignment, agi, governance): +2 each
- Portfolio companies (AI safety investments): +3
- Stage alignment (seed/Series A): +1
- Geography (US/EU priority): +1
- **Target score:** 7+ (out of 10)

**Output:**
- Notion database entry (VC name, contacts, thesis, portfolio)
- Research metadata (sources, relevance score, pain points)

**Usage:**
```bash
# Crunchbase scraping
node vc-discovery.js --source=crunchbase --limit=30

# AngelList syndicates
node vc-discovery.js --source=angellist --query="AI safety"

# Web search discovery
node vc-discovery.js --source=web --query="AGI governance investors"

# LinkedIn mining
node vc-discovery.js --source=linkedin --vc-name="AI Safety Fund"
```

---

### 2. Pain Point Extraction (`pain-point-extractor.js`)

**Purpose:** Analyze VC thesis/portfolio to extract governance challenges ALYGN solves.

**Grok Prompt Template:**
```
Analyze this VC's investment focus:

Investment Thesis: {vcData.thesis}
Recent Investments: {vcData.recentInvestments}
Portfolio Companies: {vcData.portfolio}

Extract top 3 governance pain points ALYGN addresses:
1. [Institutional coordination challenge]
2. [Trust/legitimacy gap in AI oversight]
3. [Emergency preparedness at frontier scale]

For each:
- One-sentence problem statement
- Why it matters to this VC
- How ALYGN solves it (governance angle, not technical)

Tone: Institutional, restrained, non-promotional.
Language: "Supports coordination", "Enables accountability", "Neutral infrastructure"
Avoid: "Regulates", "Controls", "Ensures compliance"
```

**Output:**
```json
{
  "painPoints": [
    {
      "problem": "AI labs lack neutral coordination infrastructure for emergency response",
      "relevance": "Portfolio company X recently faced coordination failure during model release",
      "solution": "ALYGN provides pre-built governance architecture for cross-lab coordination"
    },
    ...
  ]
}
```

---

### 3. Email Personalization (`email-personalizer.js`)

**Email Variants:**
- **Governance:** "Who Coordinates the Response?" (appeals to safety/risk mindset)
- **Technical:** "Existential Risk Management at Scale" (architecture deep-dive)

**Personalization Fields:**
- `{recipient_name}` - Partner/contact name
- `{company_name}` - VC firm name
- `{pain_point_1}`, `{pain_point_2}`, `{pain_point_3}` - Top 3 extracted pain points
- `{portfolio_example}` - Relevant portfolio company reference
- `{investment_thesis_quote}` - Quote from VC's stated thesis

**Subject Line Generation (Grok):**
```
Generate 3 subject line options for this VC outreach:

VC: {vcName}
Pain Points: {painPoints}
Variant: {variant} (governance | technical)

Requirements:
- Institutional tone (not salesy)
- 5-8 words max
- Governance angle (not technical)
- Curiosity-driven (not clickbait)

Examples:
- "Governance infrastructure for AGI coordination"
- "Solving the oversight crisis before it's too late"
- "Emergency coordination at frontier scale"
```

**Template Rendering:**
```bash
node email-personalizer.js --vc-id="notion-page-id" --variant=governance
```

---

### 4. Outreach Orchestrator (`outreach-orchestrator.js`)

**Purpose:** Main campaign runner (sends batch of personalized emails).

**Workflow:**
1. Query Notion → Pending VCs (priority: High → Medium → Low)
2. For each VC:
   a. Load research data (thesis, portfolio, pain points)
   b. Generate personalized email (variant selection, subject line)
   c. Send via SMTP (rate-limited: 1 email/min)
   d. Update Notion (status: Contacted, metadata logged)
3. Send WhatsApp summary (total sent, VCs contacted)

**Rate Limiting:**
- Gmail SMTP: Max 100 emails/day
- Batch size: 12 emails/day (safe margin)
- Delay between sends: 1 hour (hourly schedule 7AM-7PM)

**Usage:**
```bash
# Send 12 high-priority emails (hourly schedule)
node outreach-orchestrator.js --batch=12 --priority=high

# Send to specific VCs
node outreach-orchestrator.js --vc-ids="id1,id2,id3"

# Dry run (generate emails without sending)
node outreach-orchestrator.js --batch=10 --dry-run
```

---

### 5. Reply Tracking (`reply-tracker.js`)

**Purpose:** Monitor Gmail for VC replies, analyze sentiment/intent, update Notion.

**Email Source:**
- Tania's Gmail → Forwarded to `alyyygn@gmail.com` (staging - 3 y's) or `outreach@alyygn.com` (production - 2 y's)
- Gmail filter: Subject contains "[ALYGN VC]" OR from known VCs
- IMAP label: "ALYGN-VC"

**Analysis (Grok):**
```
Analyze this VC reply:

From: {sender_email}
Subject: {subject}
Body: {body}

Extract:
1. Sentiment: Positive/Neutral/Negative
2. Intent: Interested/Declined/Requested-Info/Meeting-Request
3. Key phrases (3-5 important statements)
4. Suggested next action (for Andler/Tania)

Output as JSON.
```

**Auto-Status Updates:**
- "calendar", "schedule", "meet" → Status: **Meeting Scheduled**
- "interested", "forward", "connect" → Status: **Replied** (positive)
- "not a fit", "pass", "no thanks" → Status: **Passed**
- "SAFE", "investment", "terms" → Status: **Negotiating**

**Notification (WhatsApp):**
```
🎯 VC Reply Received!

From: [VC Name] - [Partner Name]
Sentiment: ✅ Positive
Intent: Meeting Request

Summary: [AI-generated 2-3 sentence summary]

Suggested Action: [Grok recommendation]

View in Notion: [Link]
```

**Cron Schedule:** 6x/day (7AM, 9AM, 11AM, 3PM, 5PM, 7PM Mon-Fri)

**Usage:**
```bash
# Manual check
node reply-tracker.js

# Process specific email
node reply-tracker.js --email-id="gmail-message-id"

# Test mode (don't update Notion)
node reply-tracker.js --dry-run
```

---

### 6. Weekly Performance Report (`weekly-report.js`)

**Purpose:** Generate comprehensive weekly summary of outreach performance.

**Metrics:**
- **Discovery:** New VCs added, total database size, avg relevance score
- **Outreach:** Emails sent, variant breakdown (governance vs technical)
- **Engagement:** Replies received, sentiment breakdown, reply rate
- **Pipeline:** Meeting requests, meetings scheduled, active conversations
- **Top performers:** VCs with highest engagement

**Output Channels:**
- WhatsApp (summary message)
- Discord (#alygn-vc-outreach-plan thread)
- Notion page (detailed report with charts)

**Usage:**
```bash
# Generate current week report
node weekly-report.js

# Generate specific date range
node weekly-report.js --start=2026-02-10 --end=2026-02-16

# Export to CSV
node weekly-report.js --export=csv --output=~/Downloads/vc-report.csv
```

---

## Notion Database Schema

**Database:** VC Outreach Tracker  
**ID:** `2fc33487-4af6-8182-9013-d127ce6778b6`  
**Parent:** Organizations TODO Lists

**Properties:**

| Property | Type | Purpose |
|----------|------|---------|
| **VC Name** | Title | Primary identifier |
| **Contact Date** | Date | When outreach was sent |
| **Contact Email** | Email | Primary contact email |
| **Contact Person** | Text | Partner/contact name |
| **Status** | Select | Pending → Contacted → Replied → Meeting Scheduled → Invested/Passed |
| **Priority** | Select | High/Medium/Low (based on relevance score) |
| **Replied** | Checkbox | Has VC replied? |
| **Reply Date** | Date | When reply was received |
| **Reply Sentiment** | Select | Positive/Neutral/Negative |
| **Reply Summary** | Text | AI-generated summary (2-3 sentences) |
| **Next Action** | Text | Suggested follow-up (Grok recommendation) |
| **Contributing** | Checkbox | Is VC investing? |
| **Investment Amount** | Number | $ amount (if committed) |
| **Investment Method** | Select | Equity/SAFE/Convertible Note/Grant |
| **Investment Date** | Date | Close date |
| **Check Size** | Text | Typical investment range |
| **Focus Areas** | Multi-select | AI Safety/Alignment/Governance/AGI |
| **Investment Thesis** | Text | VC's stated thesis |
| **Portfolio Companies** | Text | Relevant AI companies |
| **Relevance Score** | Number | 1-10 alignment score (auto-calculated) |
| **Email Variant** | Select | Governance/Technical (which template was sent) |
| **Pain Points** | Text | Top 3 extracted pain points |
| **Research Sources** | URL | Links to research (Crunchbase, LinkedIn, website) |
| **Notes** | Text | Manual notes (Andler/Tania) |

**Views:**
- **High Priority Pipeline** - Status: Pending/Contacted, Priority: High
- **Active Conversations** - Status: Replied, sorted by Reply Date
- **Meeting Pipeline** - Status: Meeting Scheduled
- **Closed Won** - Status: Invested
- **Weekly Outreach** - Contacted in last 7 days
- **Needs Follow-up** - Replied but no action in 3+ days

---

## Gmail Integration

### Forwarding Setup (Tania → ALYGN)

**Filter Pattern (Gmail):**
```
Matches: 
- Subject contains "[ALYGN VC]"
- OR from: (known VC domains)

Do this:
- Forward to: alyyygn@gmail.com (staging - NOTE: 3 y's)
- Apply label: "ALYGN-VC-Forwarded"
- Mark as read
```

**Manual Forwarding:**
- If Tania receives reply not matching filter, she forwards manually
- Subject MUST include "[ALYGN VC]" for tracking

**⚠️ CRITICAL EMAIL ADDRESSES:**
- **Staging:** `alyyygn@gmail.com` (3 y's) - for testing/validation
- **Production:** `outreach@alyygn.com` (2 y's) - for live campaigns

**IMAP Configuration:**
```javascript
// ~/.openclaw/workspace/config/credentials.json
{
  "gmail": {
    "staging": {
      "email": "alyyygn@gmail.com",  // 3 y's
      "appPassword": "...",
      "imapHost": "imap.gmail.com",
      "imapPort": 993
    },
    "production": {
      "email": "outreach@alyygn.com",  // 2 y's
      "appPassword": "...",
      "imapHost": "imap.gmail.com",
      "imapPort": 993
    }
  }
}
```

---

## Cron Jobs

**Managed via OpenClaw cron system:**

```javascript
// 1. Reply Tracking (6x/day Mon-Fri)
{
  name: "ALYGN VC Reply Tracking",
  schedule: {
    kind: "cron",
    expr: "0 7,9,11,15,17,19 * * 1-5",
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "Run ALYGN VC reply tracker: cd ~/.openclaw/workspace/scripts/alygn/vc-outreach && node reply-tracker.js"
  },
  sessionTarget: "main",
  enabled: true
}

// 2. Hourly Outreach Campaign (Mon-Fri 7AM-7PM, 12 emails/day)
{
  name: "ALYGN VC Outreach Campaign - Hourly",
  schedule: {
    kind: "cron",
    expr: "0 7-19 * * 1-5",
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "Run ALYGN VC outreach: cd ~/.openclaw/workspace/scripts/alygn/vc-outreach && node outreach-orchestrator.js --send-next"
  },
  sessionTarget: "main",
  enabled: true
}

// 3. Weekly VC Discovery (Monday 8 AM)
{
  name: "ALYGN VC Discovery",
  schedule: {
    kind: "cron",
    expr: "0 8 * * 1",
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "Run ALYGN VC discovery: cd ~/.openclaw/workspace/scripts/alygn/vc-outreach && node vc-discovery.js --source=crunchbase --limit=30"
  },
  sessionTarget: "main",
  enabled: true
}

// 4. Weekly Performance Report (Friday 5 PM)
{
  name: "ALYGN VC Weekly Report",
  schedule: {
    kind: "cron",
    expr: "0 17 * * 5",
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "Generate ALYGN VC weekly report: cd ~/.openclaw/workspace/scripts/alygn/vc-outreach && node weekly-report.js"
  },
  sessionTarget: "main",
  enabled: true
}

// 5. Monthly Database Cleanup (1st of month, 10 AM)
{
  name: "ALYGN VC Database Maintenance",
  schedule: {
    kind: "cron",
    expr: "0 10 1 * *",
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "Run ALYGN VC database maintenance: cd ~/.openclaw/workspace/scripts/alygn/vc-outreach && node database-maintenance.js"
  },
  sessionTarget: "main",
  enabled: true
}
```

---

## Security & Best Practices

### Credentials Management
- **Never hardcode** API keys, SMTP passwords, OAuth tokens
- Use `~/.openclaw/workspace/config/credentials.json` exclusively
- Rotate Gmail app password quarterly
- Use read-only Notion tokens where possible

### Rate Limiting
- **Gmail SMTP:** Max 100 emails/day → batch of 10/day is safe
- **Notion API:** Max 3 requests/second → implement exponential backoff
- **Browser automation:** Human-like delays (2-5s between actions)

### Data Privacy
- **PII handling:** VC contact info is sensitive → never log full emails
- **Notion access:** Restrict to Alygn workspace only
- **Browser automation:** Use isolated Chrome profile (`alygn`)

### Error Handling
- **Gmail failures:** Log error, skip email, continue batch
- **Notion sync errors:** Retry with exponential backoff (3 attempts)
- **Browser automation failures:** Capture screenshot, log error, alert
- **Cron failures:** Send WhatsApp alert if critical job fails

---

## Testing

### Unit Tests
```bash
# Test email sending (dry run)
node tests/test-email-sending.js --dry-run

# Test reply detection
node tests/test-reply-detection.js --sample-email=test-reply.eml

# Test Notion sync
node tests/test-notion-sync.js --vc-id="test-vc-page-id"
```

### Integration Tests
```bash
# End-to-end test (discovery → outreach → reply → update)
node tests/test-full-workflow.js --test-vc="AI Safety Fund"

# Cron job dry run
node tests/test-cron-jobs.js --job=reply-tracker --dry-run
```

### Manual Testing Checklist
- [ ] Gmail forwarding works (send test email to Tania)
- [ ] IMAP connection successful (fetch test emails)
- [ ] Notion database updates correctly (create test VC entry)
- [ ] WhatsApp notifications deliver (send test message)
- [ ] Email personalization renders correctly (preview HTML)
- [ ] Cron jobs execute on schedule (check logs)

---

## Troubleshooting

### Common Issues

**1. Gmail IMAP connection fails:**
```bash
# Check credentials
cat ~/.openclaw/workspace/config/credentials.json | jq '.gmail.staging'

# Test IMAP manually
node -e "const imap = require('imap-simple'); ..."
```

**2. Notion API 429 (rate limit):**
```bash
# Check request rate in logs
tail -f logs/notion-api.log | grep "429"

# Increase backoff delay in notion-api.js
```

**3. Email sending fails (SMTP):**
```bash
# Verify SMTP credentials
node tests/test-email-sending.js --dry-run

# Check Gmail app password is valid
```

**4. Cron job not executing:**
```bash
# Check OpenClaw cron status
openclaw cron list

# Check job logs
tail -f logs/outreach.log
```

**5. Browser automation timeout:**
```bash
# Increase timeout in browser call
browser --action=snapshot --timeoutMs=30000 --profile=alygn
```

---

## Success Metrics

**Target Metrics (Month 1):**
- ✅ VCs discovered: 100+
- ✅ Emails sent: 240+ (12/day × 20 business days)
- ✅ Reply rate: 12-15%
- ✅ Meeting conversion: 30% of positive replies
- ✅ System uptime: 99%+

**Performance Tracking:**
- Dashboard: Notion "VC Outreach Analytics" page
- Weekly reports: Discord #alygn-vc-outreach-plan
- Real-time alerts: WhatsApp notifications

---

## Future Enhancements

**Phase 2 (Month 2):**
- [ ] A/B testing framework (variant performance comparison)
- [ ] Follow-up sequence automation (drip campaigns)
- [ ] Multi-channel outreach (LinkedIn InMail, Twitter DMs)
- [ ] Predictive analytics (reply probability scoring)

**Phase 3 (Month 3):**
- [ ] CRM integration (HubSpot/Pipedrive)
- [ ] Calendar integration (auto-schedule meetings)
- [ ] Email open tracking (pixel-based)
- [ ] Link click tracking (UTM parameters)

---

## File Reference

**Core Scripts:**
- `vc-discovery.js` - VC discovery automation
- `pain-point-extractor.js` - Grok-based pain point analysis
- `email-personalizer.js` - Dynamic email generation
- `outreach-orchestrator.js` - Campaign orchestration
- `reply-tracker.js` - Reply detection & analysis
- `weekly-report.js` - Performance reporting

**Configuration:**
- `config/credentials.json` - API keys, SMTP, Notion tokens
- `config/gmail-filters.json` - Email filter patterns
- `config/discovery-config.json` - VC discovery parameters

**Templates:**
- `email-template-governance.html` - Governance variant
- `email-template-technical.html` - Technical variant

**Utilities:**
- `utils/notion-api.js` - Notion API helpers
- `utils/gmail-api.js` - Gmail/IMAP helpers
- `utils/logger.js` - Structured logging
- `utils/rate-limiter.js` - API throttling

---

## Contact & Support

**Owner:** Andler + Wobblus  
**Discord Thread:** #alygn-vc-outreach-plan (`1471206314435809431`)  
**Notion Hub:** [ALYGN VC Outreach Tracker](https://notion.so/2fc334874af681829013d127ce6778b6)  
**Last Updated:** February 12, 2026

For questions or issues, ping @Wobblus in Discord.
