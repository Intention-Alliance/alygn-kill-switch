# ALYGN VC Outreach Automation

**Intelligent capital outreach system for discovering, researching, and engaging venture capital partners aligned with Alygn's AI governance mission.**

---

## 🎯 Quick Start

```bash
# Check system status
node vc-outreach.js list

# Discover new VCs (20-30 per run)
node core/vc-discovery.js --source=crunchbase --limit=30

# Send daily outreach batch (12 emails, hourly 7AM-7PM)
node orchestration/outreach-orchestrator.js --send-next

# Check for replies (runs 6x/day via cron)
node tracking/reply-tracker.js

# Generate weekly report
node orchestration/weekly-report.js
```

---

## 📁 Directory Structure

```
scripts/alygn/vc-outreach/
├── README.md                              # This file
├── VC-OUTREACH-IMPLEMENTATION-PLAN.md     # Complete technical plan
├── IMPLEMENTATION-SUMMARY.md              # Executive summary
├── workflow.json                          # Example workflows (see below)
│
├── config/
│   ├── credentials.json                   # API keys (in parent workspace/config/)
│   ├── gmail-filters.json                 # Email filter patterns
│   └── discovery-config.json              # VC discovery parameters
│
├── core/
│   ├── vc-discovery.js                    # Main VC discovery script
│   ├── vc-contact-finder.js               # Contact extraction (existing)
│   ├── pain-point-extractor.js            # Grok pain point analysis
│   └── relevance-scorer.js                # VC alignment scoring
│
├── email/
│   ├── vc-outreach-email-template.py      # Python email sender (existing)
│   ├── vc-outreach-email-template.js      # JS template generator (existing)
│   ├── email-template-governance.html     # Governance variant (existing)
│   ├── email-template-technical.html      # Technical variant (existing)
│   ├── email-personalizer.js              # Dynamic personalization
│   └── subject-line-generator.js          # AI subject line generation
│
├── tracking/
│   ├── reply-tracker.js                   # IMAP reply detection
│   ├── reply-analyzer.js                  # Sentiment/intent analysis
│   ├── notion-updater.js                  # Database sync
│   └── gmail-classifier.js                # Filter matching
│
├── orchestration/
│   ├── outreach-orchestrator.js           # Main campaign runner
│   ├── batch-sender.js                    # Rate-limited email sending
│   ├── weekly-report.js                   # Performance reporting
│   └── cron-manager.js                    # Cron job coordination
│
├── notifications/
│   ├── notification-sender.js             # WhatsApp integration
│   ├── notification-templates.js          # Message templates
│   └── urgent-classifier.js               # Urgency detection
│
├── utils/
│   ├── notion-api.js                      # Notion helpers (shared)
│   ├── gmail-api.js                       # Gmail/IMAP helpers
│   ├── logger.js                          # Structured logging (shared)
│   └── rate-limiter.js                    # API throttling
│
├── logs/
│   ├── discovery.log                      # Discovery logs
│   ├── outreach.log                       # Outreach logs
│   ├── reply-tracker.log                  # Reply tracking logs
│   └── errors.log                         # Error logs
│
└── tests/
    ├── test-email-sending.js              # Email delivery tests
    ├── test-reply-detection.js            # Reply parsing tests
    └── test-notion-sync.js                # Database sync tests
```

---

## 🔄 Workflow Examples (workflow.json)

**Purpose:** Modular workflow definitions for executing VC outreach tasks via scripts or AI agent prompts.

### Example 1: Daily Discovery + Outreach

```json
{
  "name": "Daily VC Discovery + Outreach",
  "schedule": "Mon-Fri 7AM-7PM",
  "steps": [
    {
      "action": "discover",
      "source": "crunchbase",
      "query": "AI safety seed stage",
      "limit": 20,
      "minRelevance": 7
    },
    {
      "action": "research",
      "extractPainPoints": true,
      "scoringCriteria": ["investment_thesis", "portfolio_alignment", "stage"]
    },
    {
      "action": "outreach",
      "batch": 12,
      "schedule": "hourly",
      "startTime": "7AM",
      "endTime": "7PM",
      "variantSelection": "auto",
      "confirmBatch": true
    }
  ]
}
```

### Example 2: Reply Tracking + Follow-up

```json
{
  "name": "Reply Tracking + Auto Follow-up",
  "schedule": "6x/day (7AM, 9AM, 11AM, 3PM, 5PM, 7PM)",
  "steps": [
    {
      "action": "checkReplies",
      "source": "alyyygn@gmail.com",
      "label": "ALYGN-VC",
      "analyzeSentiment": true,
      "extractIntent": true
    },
    {
      "action": "updateNotion",
      "fields": ["status", "reply_sentiment", "reply_summary", "next_action"]
    },
    {
      "action": "notify",
      "channel": "whatsapp",
      "conditions": {
        "urgent": ["meeting_request", "investment_interest"],
        "summary": "all_replies"
      }
    },
    {
      "action": "suggestFollowup",
      "confirmBeforeSending": true
    }
  ]
}
```

### Example 3: Weekly Performance Analysis

```json
{
  "name": "Weekly VC Outreach Report",
  "schedule": "Fridays 5PM",
  "steps": [
    {
      "action": "queryNotion",
      "dateRange": "last_7_days",
      "metrics": [
        "vcs_discovered",
        "emails_sent",
        "replies_received",
        "meetings_scheduled"
      ]
    },
    {
      "action": "analyzePerformance",
      "breakdown": {
        "byVariant": ["governance", "technical"],
        "bySentiment": ["positive", "neutral", "negative"],
        "bySource": ["crunchbase", "angellist", "web_search"]
      }
    },
    {
      "action": "generateReport",
      "outputChannels": ["whatsapp", "discord", "notion"],
      "includeRecommendations": true
    }
  ]
}
```

### Example 4: High-Priority VC Deep Dive

```json
{
  "name": "High-Priority VC Deep Research",
  "trigger": "manual",
  "steps": [
    {
      "action": "researchVC",
      "vcName": "{input}",
      "depth": "comprehensive",
      "sources": [
        "vc_website",
        "crunchbase",
        "linkedin",
        "recent_blog_posts",
        "portfolio_companies"
      ]
    },
    {
      "action": "extractInsights",
      "focus": [
        "investment_thesis",
        "recent_investments",
        "partner_backgrounds",
        "governance_interest_signals"
      ]
    },
    {
      "action": "scorePriority",
      "criteria": {
        "ai_safety_focus": 3,
        "governance_interest": 3,
        "portfolio_alignment": 2,
        "stage_fit": 1,
        "geography": 1
      }
    },
    {
      "action": "draftEmail",
      "variantSelection": "based_on_research",
      "painPointsExtraction": "grok_analysis",
      "confirmBeforeSending": true
    }
  ]
}
```

---

## 🤖 Agent Prompt Examples

**Use these prompts to execute workflows via AI agent:**

### Prompt 1: Discover New VCs
```
Execute VC discovery workflow:
- Source: Crunchbase
- Query: "AI safety seed stage investors"
- Limit: 30 VCs
- Minimum relevance score: 7
- Extract: Investment thesis, portfolio companies, partner contacts
- Output: Add to Notion VC Outreach Tracker with research summary

Confirm top 10 highest-scoring VCs before adding to outreach queue.
```

### Prompt 2: Analyze Reply and Suggest Follow-up
```
Check Gmail (alyyygn@gmail.com) for new VC replies:
- Analyze sentiment (positive/neutral/negative)
- Extract intent (meeting request/interested/declined/info request)
- Match sender to Notion VC database
- Update Notion with reply summary and sentiment
- Generate follow-up recommendation (confirm before sending)
- If meeting request detected: Alert via WhatsApp immediately

Present findings and wait for confirmation on next action.
```

### Prompt 3: Personalize Email for Specific VC
```
Research and draft personalized outreach for [VC Name]:

1. Web search: Recent investments, blog posts, partner interviews
2. Crunchbase: Portfolio analysis, investment thesis
3. LinkedIn: Partner backgrounds, governance signals
4. Pain point extraction: Top 3 governance challenges they care about
5. Variant selection: Governance vs Technical (recommend based on research)
6. Subject line: Generate 3 options (institutional tone, governance angle)
7. Email body: Personalize template with research insights

Present draft for review before sending.
```

### Prompt 4: Weekly Performance Review
```
Generate ALYGN VC Outreach weekly report (last 7 days):

Metrics to include:
- VCs discovered (total, by source, avg relevance score)
- Emails sent (total, by variant, by day)
- Replies received (count, sentiment breakdown, reply rate)
- Meetings scheduled (count, conversion rate)
- Top performing VCs (by engagement level)

Analysis:
- What's working (variant performance, discovery sources)
- What needs improvement (reply rate, meeting conversion)
- Recommendations for next week

Output to: WhatsApp (summary), Discord (detailed), Notion (full report).
```

---

## 📊 Notion Database Reference

**Database:** VC Outreach Tracker  
**ID:** `2fc33487-4af6-8182-9013-d127ce6778b6`  
**Parent:** Organizations TODO Lists

**Key Properties:**
- `VC Name` (Title)
- `Contact Email` (Email) ⚠️ Use `alyyygn@gmail.com` (3 y's) for staging
- `Status` (Select: Pending → Contacted → Replied → Meeting Scheduled → Invested/Passed)
- `Priority` (Select: High/Medium/Low)
- `Relevance Score` (Number: 1-10)
- `Reply Sentiment` (Select: Positive/Neutral/Negative)
- `Email Variant` (Select: Governance/Technical)
- `Pain Points` (Text: Top 3 extracted)
- `Next Action` (Text: AI-generated follow-up suggestion)

**Views:**
- High Priority Pipeline (Status: Pending/Contacted, Priority: High)
- Active Conversations (Status: Replied, sorted by Reply Date)
- Needs Follow-up (Replied but no action in 3+ days)
- Weekly Outreach (Contacted in last 7 days)

---

## 🕐 Cron Schedule

**Managed via OpenClaw cron:**

| Time | Frequency | Job | Command |
|------|-----------|-----|---------|
| Mon 8 AM | Weekly | VC Discovery | `node core/vc-discovery.js --source=crunchbase --limit=30` |
| Mon-Fri 7-7 PM | Hourly | Outreach (1 email/hour) | `node orchestration/outreach-orchestrator.js --send-next` |
| Mon-Fri 7AM, 9AM, 11AM, 3PM, 5PM, 7PM | 6x/day | Reply Tracking | `node tracking/reply-tracker.js` |
| Fri 5 PM | Weekly | Performance Report | `node orchestration/weekly-report.js` |
| 1st of month 10 AM | Monthly | Database Cleanup | `node utils/database-maintenance.js` |

---

## 🔐 Configuration

### credentials.json
```json
{
  "gmail": {
    "staging": {
      "email": "alyyygn@gmail.com",
      "appPassword": "...",
      "imapHost": "imap.gmail.com",
      "imapPort": 993
    },
    "production": {
      "email": "outreach@alyygn.com",
      "appPassword": "...",
      "imapHost": "imap.gmail.com",
      "imapPort": 993
    }
  },
  "notion": {
    "apiKey": "...",
    "databases": {
      "vc_outreach": "2fc33487-4af6-8182-9013-d127ce6778b6"
    }
  },
  "whatsapp": {
    "targetNumber": "+50662163355"
  }
}
```

### gmail-filters.json
```json
{
  "filters": [
    {
      "name": "ALYGN VC Replies",
      "matches": {
        "subject_contains": "[ALYGN VC]",
        "or": {
          "from_domains": [
            "ycombinator.com",
            "a16z.com",
            "sequoiacap.com"
          ]
        }
      },
      "actions": {
        "forward_to": "alyyygn@gmail.com",
        "apply_label": "ALYGN-VC-Forwarded",
        "mark_as_read": true
      }
    }
  ]
}
```

### discovery-config.json
```json
{
  "sources": {
    "crunchbase": {
      "enabled": true,
      "filters": {
        "investmentStage": ["Seed", "Pre-Seed", "Series A"],
        "focus": ["AI/ML", "Deep Tech", "Governance"],
        "location": ["United States", "United Kingdom", "Europe"]
      },
      "limit": 30
    },
    "angellist": {
      "enabled": true,
      "queries": [
        "AI safety seed",
        "AGI alignment",
        "AI governance"
      ],
      "limit": 20
    },
    "web_search": {
      "enabled": true,
      "queries": [
        "AI safety venture capital",
        "AGI governance investors",
        "existential risk funding"
      ],
      "country": "US",
      "freshness": "pm"
    }
  },
  "relevanceScoring": {
    "minScore": 7,
    "weights": {
      "investment_thesis_keywords": 2,
      "portfolio_ai_safety_companies": 3,
      "stage_alignment": 1,
      "geography_priority": 1
    },
    "keywords": [
      "ai safety",
      "alignment",
      "agi",
      "governance",
      "existential risk",
      "coordination",
      "oversight"
    ]
  }
}
```

---

## 🧪 Testing

```bash
# Test email sending (dry run)
node tests/test-email-sending.js --dry-run --to="test@example.com"

# Test reply detection
node tests/test-reply-detection.js --sample-email="test-reply.eml"

# Test Notion sync
node tests/test-notion-sync.js --vc-id="test-page-id" --dry-run

# Test full workflow
node tests/test-full-workflow.js --workflow="discovery_to_outreach" --dry-run
```

---

## 🚨 Important Email Addresses

⚠️ **CRITICAL: Do not confuse these email addresses:**

- **Staging:** `alyyygn@gmail.com` (3 y's) - For testing/validation
- **Production:** `outreach@alyygn.com` (2 y's) - For live campaigns

---

## 📚 Documentation

- **SKILL.md** - Complete skill reference (in `skills/alygn-vc-outreach/`)
- **VC-OUTREACH-IMPLEMENTATION-PLAN.md** - Technical implementation details
- **IMPLEMENTATION-SUMMARY.md** - Executive summary
- **workflow.json** - Modular workflow examples

---

## 💬 Support

**Owner:** Andler + Wobblus  
**Discord Thread:** #alygn-vc-outreach-plan (`1471206314435809431`)  
**Notion Hub:** [VC Outreach Tracker](https://notion.so/2fc334874af681829013d127ce6778b6)

For questions, ping @Wobblus in Discord.
