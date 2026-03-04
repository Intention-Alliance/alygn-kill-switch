# Alygn Municipal Outreach Automation

**Purpose:** Automated municipal discovery, research, personalized outreach, and reply tracking for Alygn's global AI governance campaign.

**Target:** 100,000 municipalities across 6 waves
**Pilot:** Costa Rica (82 cantones) → Wave 1

---

## Directory Structure

```
muni-outreach/
├── discovery/
│   ├── muni-discovery.js        # Discovers municipalities via Firecrawl
│   ├── region-configs/          # Region-specific configs (CR, USA, EU, etc.)
│   └── extraction-rules/        # HTML extraction rules per site type
├── research/
│   ├── muni-research.js         # Deep research per municipality
│   ├── contact-finder.js        # Finds mayor email, council contacts
│   └── compliance-checker.js    # Checks existing AI governance signals
├── personalization/
│   ├── muni-personalizer.js     # Generates personalized outreach
│   ├── templates/               # Email templates (governance-first)
│   └── pain-point-matcher.js    # Matches municipal pain points to Alygn
├── review/
│   ├── compliance-review.js     # Human review before sending
│   ├── discord-approval.js      # Posts to Discord for approval
│   └── edit-workflow.js         # Edits based on feedback
├── database/
│   ├── supabase-sync.js         # Syncs to Supabase `alygn_global_muni`
│   ├── schema.sql               # Database schema
│   └── migrations/              # DB migrations
├── reporting/
│   ├── outreach-tracker.js      # Tracks sent emails, replies
│   ├── response-analyzer.js     # Analyzes reply sentiment
│   └── weekly-summary.js        # Weekly progress reports
└── workflows/
    ├── cr-pilot.lobster         # Costa Rica pilot workflow
    └── global-scale.lobster     # Global scaling workflow
```

---

## Database Schema (Supabase)

```sql
-- Main municipalities table
CREATE TABLE municipalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  population INTEGER,
  website_url TEXT,
  mayor_name TEXT,
  mayor_email TEXT,
  council_emails TEXT[],
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  researched_at TIMESTAMPTZ,
  outreach_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  reply_sentiment TEXT,
  x_engagement_count INTEGER DEFAULT 0,
  wave_number INTEGER,
  priority_score INTEGER,
  notes TEXT
);

-- Outreach emails log
CREATE TABLE outreach_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id UUID REFERENCES municipalities(id),
  variant TEXT, -- 'governance' or 'institutional'
  subject TEXT,
  body TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  message_id TEXT,
  status TEXT -- 'sent', 'bounced', 'replied'
);

-- X/Twitter engagements
CREATE TABLE x_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id UUID REFERENCES municipalities(id),
  engagement_type TEXT, -- 'follow', 'reply', 'quote'
  x_handle TEXT,
  content TEXT,
  engaged_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Workflow Phases (Lobster)

### Costa Rica Pilot (82 cantones)

```lobster
name: cr-pilot
steps:
  # Phase 1: Discovery
  - id: discover-cr
    command: node discovery/muni-discovery.js --region=cr
    description: "Discover all 82 Costa Rican cantones"
    output:
      file: /tmp/muni-cr-discovered.json

  # Phase 2: Research
  - id: research-cr
    command: node research/muni-research.js --input=/tmp/muni-cr-discovered.json
    description: "Research contacts, existing AI governance signals"
    after: discover-cr
    output:
      file: /tmp/muni-cr-researched.json

  # Phase 3: Personalization
  - id: personalize-cr
    command: node personalization/muni-personalizer.js --input=/tmp/muni-cr-researched.json
    description: "Generate personalized emails"
    after: research-cr
    output:
      file: /tmp/muni-cr-personalized.json

  # Phase 4: Human Review (Approval Gate)
  - id: review-cr
    command: node review/compliance-review.js --input=/tmp/muni-cr-personalized.json
    description: "Human review before sending"
    after: personalize-cr
    approval: required
    output:
      file: /tmp/muni-cr-approved.json

  # Phase 5: Database Sync
  - id: sync-db
    command: node database/supabase-sync.js --input=/tmp/muni-cr-approved.json
    description: "Sync to Supabase"
    after: review-cr

  # Phase 6: Email Sending (ZeroBounce + Smartlead)
  - id: send-emails
    command: node sending/email-sender.js --input=/tmp/muni-cr-approved.json
    description: "Verify emails + send via Smartlead"
    after: sync-db
    approval: optional

  # Phase 7: X Engagement
  - id: x-engage
    command: node engagement/x-engager.js --municipalities=/tmp/muni-cr-approved.json
    description: "Follow + engage on X/Twitter"
    after: send-emails

  # Phase 8: Reporting
  - id: report
    command: node reporting/weekly-summary.js --wave=1
    description: "Generate weekly progress report"
    after: x-engage
```

---

## Email Templates (Governance-First)

### Variant A: Governance Focus
**Subject:** Coordination Before Crisis: AI Governance for [Municipality]

**Body:**
```
Dear [Mayor Name/Council],

[Municipality] faces the same AI governance challenges as cities worldwide:
coordination across departments, accountability for automated systems, and
preparedness for AI-driven disruptions.

Alygn is an independent institution supporting coordination across AI
developers, operators, and public institutions—without centralizing control
or asserting authority.

We're sharing neutral governance infrastructure that enables:
• Cross-departmental AI accountability frameworks
• Emergency coordination without standing control
• Legitimacy through process, not enforcement

[Personalized pain point from research]

Would your council be open to a 30-minute conversation about how Alygn
supports municipal AI governance preparedness?

Governance legitimacy, not technology, is the infrastructure that scales.

Best regards,
[Name]
Alygn Governance Coordination

--
Alygn: Neutral AI governance infrastructure
[Unsubscribe link]
```

### Variant B: Institutional Focus
**Subject:** The Real AI Risk is Coordination Failure

**Body:**
```
Dear [Mayor Name/Council],

The hardest AI risks aren't technical—they're institutional.

When AI systems operate at scale, coordination failure across departments
and jurisdictions becomes the systemic threat. Governance can't be
retrofitted at frontier scale.

Alygn provides neutral infrastructure for:
• Accountability without centralization
• Oversight without control
• Coordination without authority

[Personalized local context]

We're forming a network of municipalities committed to AI governance
preparedness. [Municipality]'s leadership in [area] makes you an ideal
founding participant.

Are you available for a brief conversation next week?

Institutional legitimacy is the infrastructure that endures.

Best regards,
[Name]
Alygn Institutional Coordination

--
Alygn: Supports coordination, enables accountability
[Unsubscribe link]
```

---

## API Integration

### Required Credentials
```bash
# Supabase (Database)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx

# Firecrawl (Web scraping)
FIRECRAWL_API_KEY=fc-xxx

# ZeroBounce (Email verification)
ZEROBOUNCE_API_KEY=xxx

# Perplexity (Deep research)
PERPLEXITY_API_KEY=pplx-xxx

# Brave (News search)
BRAVE_API_KEY=xxx

# Smartlead (Email sending)
SMARTLEAD_API_KEY=xxx
```

### Optional Credentials
```bash
# Anthropic (Top-20 personalization)
ANTHROPIC_API_KEY=sk-ant-xxx

# X/Twitter (Engagement tracking)
X_API_KEY=xxx
```

---

## Testing (Without Credentials)

All scripts support **mock mode** for testing:

```bash
# Test discovery (mock)
node discovery/muni-discovery.js --region=cr --mock

# Test research (mock)
node research/muni-research.js --input=/tmp/test-munis.json --mock

# Test personalization (mock)
node personalization/muni-personalizer.js --input=/tmp/test-research.json --mock

# Test Lobster workflow (dry-run)
lobster run workflows/cr-pilot.lobster --dry-run
```

---

## Scaling Plan

### Wave 1: Costa Rica (82 cantones)
- Timeline: March 2026
- Status: Pilot testing

### Wave 2: USA (~19,500 municipalities)
- Timeline: April-May 2026
- Strategy: State-by-state rollout

### Wave 3: European Union (~88,000 municipalities)
- Timeline: June-July 2026
- Strategy: Country-by-country (DE, FR, IT, ES first)

### Wave 4-6: Global (~100,000 total)
- Timeline: August-December 2026
- Strategy: Regional coordinators + automation

---

**Created:** 2026-03-01  
**Status:** Structure created, scripts in development  
**Next:** Implement discovery + research scripts
