# ALYGN VC Outreach Automation

**Intelligent capital outreach system for discovering, researching, and engaging venture capital partners aligned with Alygn's AI governance mission.**

> **⚠️ Architecture Note (2026-04-19):** This pipeline is **Notion-only**. No Supabase dependency. All data, tracking, and state live in the Notion VC Outreach Tracker database.

---

## 🎯 Quick Start

```bash
# Discover new VCs (adds to Notion)
node core/automated-vc-discovery.js --limit=20

# Draft personalized emails for "Ready for outreach" VCs
node email/draft-outreach-emails.js --limit=5

# Send approved emails (Draft Status = "Approved")
node email/send-approved-emails.js --limit=3 --provider=smtp

# Verify research data completeness
node core/verify-research-data.js

# Generate weekly report
node orchestration/weekly-report.js
```

---

## 📊 Notion Database Reference

**Database:** ALYGN VC Outreach Tracker  
**ID:** `305334874af681ef983df57c7f70de33`  
**URL:** <https://www.notion.so/305334874af681ef983df57c7f70de33>  
**Parent:** ALYGN - Central Hub

**Current Stats (2026-04-19):** 303 VCs total

| Status | Count | Next Step |
|--------|-------|-----------|
| Ready for outreach | 105 | Draft emails → Approve → Send |
| Not contacted | 172 | Research (fill pain points) → Move to "Ready" |
| Sent | 11 | Track replies |
| Contacted | 9 | Track replies |
| Invalid email | 4 | Skip / fix emails |
| Failed / Passed | 2 | Skip |

**Key Properties:**

- `Name` (Title)
- `Email` (Email)
- `Status` (Select: Not contacted → Ready for outreach → Sent → Contacted → Invalid email / Failed / Passed)
- `Draft Status` (Select: None → Not drafted → Approved)
- `Variant` (Select: Governance / Institutional)
- `Relevance Score` (Number: 1-10)
- `Pain Points` (Multi-select)
- `Focus Areas` (Multi-select)
- `Sentiment` (Select)
- `Stage` (Multi-select)
- `Geography` (Rich Text)
- `Website` (URL)
- `Partners` (Rich Text)
- `Notes` (Rich Text)
- `Sent Date` (Date)
- `Last Contacted` (Date)
- `Reply Date` (Date)
- `ID` (Rich Text)

---

## 📁 Directory Structure

```plaintext
scripts/alygn/vc-outreach/
├── README.md                              # This file
├── notion-config.json                     # Notion DB config (CORRECT ID)
│
├── config/
│   └── notion-config.json                 # Notion DB config (copy)
│
├── core/
│   ├── automated-vc-discovery.js          # VC discovery (web search → Notion)
│   ├── notion-utils.js                    # Notion API helpers
│   ├── setup-vc-notion-tracker.js          # Database setup (one-time)
│   ├── vc-contact-discovery.js            # Contact extraction
│   ├── verify-batch.js                    # Batch verification
│   ├── verify-research-data.js            # Research completeness check
│   └── schedule-batch-iterations.js       # Batch scheduling
│
├── email/
│   ├── draft-outreach-emails.js           # Generate personalized drafts
│   ├── send-approved-emails.js            # Send approved emails (SMTP/Smartlead)
│   └── CC_FEATURE.md                      # CC feature documentation
│
├── tracking/
│   ├── deep-research-vcs.js               # Deep research pipeline
│   ├── reply-tracker.js                   # IMAP reply detection
│   ├── vc-contact-finder.js               # Contact search utilities
│   ├── vc-discovery-curation.js           # Discovery curation
│   └── vc-outreach.js                     # Outreach tracking
│
├── orchestration/
│   ├── outreach-orchestrator.js           # Campaign orchestration
│   └── weekly-report.js                   # Performance reporting
│
├── drafts/                                # Generated email drafts
├── logs/                                  # Execution logs
├── tests/
│   └── send-email-test.js                 # Email delivery test
├── tracking/                              # Tracking utilities
├── utils/
│   └── logger.js                          # Structured logging
└── workflow.json                          # Workflow definitions
```

---

## 🔄 Pipeline Workflow

**The VC Outreach pipeline is entirely Notion-based:**

```
1. DISCOVER          → web search → Add to Notion (Status: "Not contacted")
2. RESEARCH          → Fill pain points, relevance score → Status: "Ready for outreach"
3. DRAFT             → Generate personalized email → Draft Status: "Not drafted"
4. APPROVE           → Human review → Draft Status: "Approved"
5. SEND              → SMTP delivery → Status: "Sent"
6. TRACK             → IMAP reply detection → Status: "Contacted"
7. FOLLOW-UP         → Based on sentiment → Next action
```

**No Supabase.** All state, tracking, and reporting live in the Notion database.

---

## 🕐 Cron Schedule

| Time | Frequency | Job | Command |
|------|-----------|-----|---------|
| Mon 10:30 AM | Weekly | VC Discovery | `node core/automated-vc-discovery.js --limit=20` |
| Mon 11 AM | Weekly | VC Outreach | `node email/draft-outreach-emails.js --limit=5` |
| Daily 9 AM | Daily | Reply Tracking | `node tracking/reply-tracker.js` |
| Fri 5 PM | Weekly | Performance Report | `node orchestration/weekly-report.js` |

---

## 🔐 Configuration

### Notion Database

```json
{
  "databaseId": "305334874af681ef983df57c7f70de33",
  "databaseUrl": "https://www.notion.so/305334874af681ef983df57c7f70de33"
}
```

### Email (SMTP)

```json
{
  "address": "alyyygn@gmail.com",
  "smtp": {
    "server": "smtp.gmail.com",
    "port": 587,
    "password": "..."
  }
}
```

### Email Addresses

⚠️ **CRITICAL: Do not confuse these email addresses:**

- **Staging:** `alyyygn@gmail.com` (3 y's) — For testing/validation
- **Production:** `outreach@alyygn.com` (2 y's) — For live campaigns

---

## 🧪 Testing

```bash
# Dry-run email sending (no actual sends)
node email/send-approved-emails.js --limit=3 --dry-run

# Test with specific email
node email/send-approved-emails.js --test-email=contact@andler.dev --limit=1

# Verify research data
node core/verify-research-data.js

# Verify batch status
node core/verify-batch.js
```

---

## 📚 Documentation

- **SKILL.md** — Complete skill reference (in `skills/alygn-vc-outreach/`)
- **workflow.json** — Modular workflow definitions
- **notion-config.json** — Database ID configuration

---

## 💬 Support

**Owner:** Andler + Wobblus  
**Notion Hub:** [ALYGN VC Outreach Tracker](https://www.notion.so/305334874af681ef983df57c7f70de33)

For questions, ping @Wobblus in Discord.