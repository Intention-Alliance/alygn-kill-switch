# ALYGN Grant Discovery Skill — Architecture

**Status:** Design Specification  
**Author:** Hugrukal (Architect)  
**Based On:** `alygn-vc-outreach` v2.0 patterns  
**Last Updated:** 2026-03-24

---

## 1. Overview

**Purpose:** Automated discovery, deep research, alignment validation, and pipeline management for AI safety grants targeting ALYGN's funding strategy.

**Core Principle:** Mirrors the VC outreach pipeline architecture (discover → validate → research → score/personalize → track) but adapts each stage for grant-specific entities, funding sources, and compliance requirements.

**Key Difference from VC Outreach:** Grants are time-bounded, eligibility-gated, and mission-critical vs. VC's continuous relationship-building. The scoring/validation layers emphasize eligibility and mission alignment over investment thesis compatibility.

---

## 2. Directory Structure

```
$HOME/.agents/skills/alygn-grant-discovery/
├── ARCHITECTURE.md                    # This file
├── SKILL.md                           # Skill definition (runtime metadata)
│
├── src/
│   ├── entities/
│   │   ├── GrantEntity.js             # Base grant entity
│   │   ├── FederalGrantEntity.js      # Federal grants (NSF, DARPA, etc.)
│   │   ├── PrivateGrantEntity.js       # Private foundation grants
│   │   ├── CorporateGrantEntity.js     # Corporate CSR/responsible AI grants
│   │   └── ResearchInstitutionEntity.js # University/research institution grants
│   │
│   ├── strategies/
│   │   ├── discovery/
│   │   │   ├── DiscoveryStrategy.js         # Abstract base
│   │   │   ├── GrokDiscoveryStrategy.js     # Grok search + synthesis
│   │   │   ├── PerplexityDiscoveryStrategy.js # Perplexity deep search
│   │   │   ├── FirecrawlDiscoveryStrategy.js  # Firecrawl site scraping
│   │   │   └── CrossReferenceStrategy.js    # Multi-source validation
│   │   │
│   │   ├── research/
│   │   │   ├── ResearchStrategy.js          # Abstract base
│   │   │   ├── DeepResearchStrategy.js      # Multi-source synthesis
│   │   │   ├── EligibilityResearchStrategy.js # Eligibility verification
│   │   │   └── ImpactAnalysisStrategy.js    # Grant impact scoring
│   │   │
│   │   ├── validation/
│   │   │   ├── ValidationStrategy.js        # Abstract base
│   │   │   ├── EligibilityValidator.js      # ALYGN eligibility check
│   │   │   └── ComplianceValidator.js       # Reporting/usage compliance
│   │   │
│   │   ├── scoring/
│   │   │   ├── ScoringStrategy.js           # Abstract base
│   │   │   ├── AlygnFitScorer.js            # ALYGN mission alignment score
│   │   │   └── PriorityScorer.js             # Deadline/amount priority score
│   │   │
│   │   └── StrategyRegistry.js              # Factory + registry
│   │
│   ├── pipeline/
│   │   ├── GrantPipeline.js           # Main orchestrator (5-stage)
│   │   ├── DiscoveryPhase.js          # Phase 1: Find grants
│   │   ├── ResearchPhase.js           # Phase 2: Deep-dive research
│   │   ├── ValidationPhase.js         # Phase 3: Eligibility + compliance
│   │   ├── ScoringPhase.js            # Phase 4: Scoring + prioritization
│   │   └── NotificationPhase.js       # Phase 5: Output delivery
│   │
│   ├── core/
│   │   ├── PipelineOrchestrator.js    # Cron-triggered master runner
│   │   └── StateManager.js            # Pipeline state persistence
│   │
│   ├── notion/
│   │   ├── GrantDatabase.js           # Notion API wrapper (grants DB)
│   │   └── NotionMapper.js            # Entity ↔ Notion property mapping
│   │
│   ├── utils/
│   │   ├── logger.js                  # Structured logging (rotated)
│   │   ├── rate-limiter.js            # API throttling (exponential backoff)
│   │   ├── deduplicator.js            # Grant deduplication by URL/name
│   │   └── date-utils.js              # Deadline, fiscal-year helpers
│   │
│   └── index.js                       # Main skill entry point
│
├── bin/
│   └── alygn-grant-discovery           # CLI wrapper (chmod +x)
│
├── config/
│   ├── credentials.json.example       # Template (API keys, Notion token)
│   ├── discovery-sources.json         # Source URLs, search query templates
│   ├── scoring-weights.json           # Scoring factor weights (tunable)
│   └── notification-channels.json     # Email/Discord/Slack channel configs
│
├── templates/
│   ├── grant-analysis-report.md       # Detailed report template
│   ├── summary-email-tania.md          # Email summary template
│   └── discord-notification.md         # Discord embed template
│
└── logs/                              # Runtime logs (gitignored)
```

---

## 3. Class Hierarchy

### 3.1 Entity Classes

```
OutreachEntity (abstract base)
└── GrantEntity
    ├── FederalGrantEntity
    ├── PrivateGrantEntity
    ├── CorporateGrantEntity
    └── ResearchInstitutionEntity
```

**GrantEntity schema:**

```javascript
{
  id: 'grant-xxx',                  // Internal ID (not Notion page ID)
  type: 'grant',
  grantType: 'federal',             // federal | private | corporate | research-institution
  name: 'NSF AI Safety Program',
  agency: 'National Science Foundation',
  url: 'https://www.nsf.gov/funding/ai-safety',
  email: 'program-officer@nsf.gov',
  location: { country: 'US', state: null },
  status: 'discovered',             // Pipeline stage tracker
  // Core grant fields
  amount: {
    min: 500000,
    max: 1500000,
    currency: 'USD'
  },
  deadline: {
    LOI: '2026-05-01',              // Letter of Intent (optional)
    full: '2026-06-15',             // Full application deadline
    notification: '2026-09-01',     // Award notification
    start: '2026-09-15'             // Project start date
  },
  duration: {                        // Project period
    minMonths: 12,
    maxMonths: 36
  },
  eligibility: {
    organizationTypes: ['nonprofit', 'university', 'research-institution'],
    geographicRequirements: ['US-based'],
    aiSpecific: true                // True if AI safety is explicit focus
  },
  focusAreas: [                      // Mission alignment tags
    'AI safety',
    'governance',
    'alignment',
    'AGI oversight'
  ],
  // Research + scoring outputs
  typeData: {
    aligmentScore: 8.5,              // 1-10 ALYGN mission fit
    priorityScore: 9.0,              // Deadline urgency × amount
    eligibilityConfidence: 0.95,      // Likelihood ALYGN qualifies
    researchSources: ['url1', 'url2'],
    keyRequirements: ['req1', 'req2'],
    applicationComplexity: 'medium', // low | medium | high
    fitSummary: 'Strong fit: NSF explicitly funds AI alignment research...'
  }
}
```

### 3.2 Strategy Classes

```
Strategy (abstract base)
├── DiscoveryStrategy
│   ├── GrokDiscoveryStrategy
│   ├── PerplexityDiscoveryStrategy
│   ├── FirecrawlDiscoveryStrategy
│   └── CrossReferenceStrategy
│
├── ResearchStrategy
│   ├── DeepResearchStrategy
│   ├── EligibilityResearchStrategy
│   └── ImpactAnalysisStrategy
│
├── ValidationStrategy
│   ├── EligibilityValidator
│   └── ComplianceValidator
│
└── ScoringStrategy
    ├── AlygnFitScorer
    └── PriorityScorer
```

**Strategy base interface:**

```javascript
class Strategy {
  async discover(context)   { throw new Error('Not implemented') }
  async validate(context)   { throw new Error('Not implemented') }
  async score(context)      { throw new Error('Not implemented') }

  // Shared helpers
  async throttle(ms = 1000) { /* rate-limit delay */ }
  async fetchWithRetry(url, options, retries = 3) { /* exponential backoff */ }
}
```

### 3.3 Pipeline Phase Classes

```
PipelinePhase (abstract base)
├── DiscoveryPhase
│   ├── Runs GrokDiscoveryStrategy
│   ├── Runs PerplexityDiscoveryStrategy
│   ├── Runs FirecrawlDiscoveryStrategy
│   └── Merges + deduplicates results
│
├── ResearchPhase
│   ├── Runs DeepResearchStrategy (multi-source synthesis)
│   ├── Runs EligibilityResearchStrategy
│   └── Attaches: keyRequirements, applicationComplexity, fitSummary
│
├── ValidationPhase
│   ├── Runs EligibilityValidator
│   ├── Runs ComplianceValidator
│   └── Marks: eligibilityConfidence, validationNotes
│
├── ScoringPhase
│   ├── Runs AlygnFitScorer (weights from scoring-weights.json)
│   ├── Runs PriorityScorer (deadline urgency × amount × confidence)
│   └── Computes: compositePriorityScore
│
└── NotificationPhase
    ├── Writes to Notion (Grant Opportunities Tracker)
    ├── Generates analysis report
    ├── Sends email summary to Tania
    └── Sends Discord digest
```

---

## 4. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ALYGN GRANT DISCOVERY PIPELINE                           │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   SCHEDULE   │───▶│ ORCHESTRATOR │───▶│  STATE MGMT  │                   │
│  │  Cron trigger│    │  (Pipeline)  │    │  (.json log) │                   │
│  └──────────────┘    └──────┬───────┘    └──────────────┘                   │
│                             │                                               │
│         ┌───────────────────┼───────────────────────┐                       │
│         ▼                   ▼                       ▼                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐                  │
│  │   STAGE 1   │    │   STAGE 2   │    │    STAGE 3      │                  │
│  │  DISCOVER   │───▶│   RESEARCH  │───▶│    VALIDATE     │                  │
│  │             │    │             │    │                 │                  │
│  │ Grok search │    │ Multi-source│    │ Eligibility     │                  │
│  │ Perplexity  │    │ synthesis    │    │ Compliance      │                  │
│  │ Firecrawl   │    │ Impact       │    │                 │                  │
│  │ scraping    │    │ analysis     │    │                 │                  │
│  │             │    │             │    │                 │                  │
│  │ Deduplicate │    │ Fit summary  │    │ Confidence      │                  │
│  │ → Grants[]  │    │ Requirements │    │ flags           │                  │
│  └──────┬──────┘    └──────┬──────┘    └────────┬────────┘                  │
│         │                │                     │                          │
│         ▼                ▼                     ▼                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐                  │
│  │   STAGE 4   │    │   STAGE 5   │    │   NOTION DB     │                  │
│  │   SCORING   │───▶│ NOTIFICATION│───▶│   UPDATES       │                  │
│  │             │    │             │    │                 │                  │
│  │ ALYGN fit   │    │ Email Tania │    │ Grant Opp.      │                  │
│  │ Priority    │    │ Discord     │    │ Tracker         │                  │
│  │ composite   │    │ Report gen  │    │                 │                  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────────┘                  │
│         │                │                                             │
│         ▼                ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐      │
│  │                    OUTPUT DELIVERY                               │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │      │
│  │  │  Notion  │  │  Email to │  │   Discord    │  │  Analysis   │  │      │
│  │  │ Database │  │   Tania   │  │   Channel    │  │   Report    │  │      │
│  │  └──────────┘  └──────────┘  └──────────────┘  └──────────────┘  │      │
│  └─────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Discovery Source Aggregation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DISCOVERY STRATEGY LAYER                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐          │
│  │  Grok Search │  │Perplexity   │  │   Firecrawl      │          │
│  │  Strategy    │  │Deep Search   │  │   Site Scraping  │          │
│  │              │  │Strategy      │  │   Strategy       │          │
│  │ "AI safety   │  │              │  │                  │          │
│  │  grants 2026"│  │"NSF AI safety │  │ Scrape:          │          │
│  │              │  │  funding"    │  │ - nsf.gov        │          │
│  │ Returns:     │  │              │  │ - arxiv.org      │          │
│  │ grant names, │  │ Returns:      │  │ - responsible.ai │          │
│  │ amounts,     │  │ synthesized   │  │ - foundational   │          │
│  │ deadlines    │  │ results with  │  │   grants orgs    │          │
│  │ sources      │  │ citations     │  │                  │          │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘          │
│         │                │                   │                    │
│         └────────────────┼───────────────────┘                    │
│                          ▼                                        │
│               ┌─────────────────────┐                           │
│               │  CrossReferenceStrat │                           │
│               │  - Deduplicate by URL │                           │
│               │  - Merge field data   │                           │
│               │  - Score confidence   │                           │
│               │  - Flag conflicts     │                           │
│               └──────────┬────────────┘                           │
│                          ▼                                        │
│               ┌─────────────────────┐                           │
│               │  GrantEntity[]      │                           │
│               │  (deduplicated,     │                           │
│               │   enriched)         │                           │
│               └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Notion Database Schema

**Database Name:** Grant Opportunities Tracker  
**Parent:** ALYGN R&D (root or specified page)

### Properties

| Property | Type | Purpose |
|----------|------|---------|
| **Grant Name** | Title | Primary identifier |
| **Agency/Funder** | Text | Granting organization |
| **Grant Type** | Select | Federal / Private Foundation / Corporate / Research Institution |
| **Status** | Select | discovered / researched / validated / scored / submitted / awarded / rejected / closed |
| **Priority** | Select | Critical (7+ days) / High (30 days) / Medium (90 days) / Low (>90 days) |
| **Amount Min** | Number | Minimum award amount (USD) |
| **Amount Max** | Number | Maximum award amount (USD) |
| **LOI Deadline** | Date | Letter of Intent deadline (optional) |
| **Full Deadline** | Date | Full application deadline |
| **Notification Date** | Date | Expected award notification |
| **Project Start** | Date | Anticipated project start |
| **Duration (months)** | Number | Project period length |
| **Focus Areas** | Multi-select | AI Safety / Governance / Alignment / AGI / Coordination / Other |
| **ALYGN Fit Score** | Number | 1-10 mission alignment |
| **Priority Score** | Number | Composite (deadline × amount × confidence) |
| **Eligibility Confidence** | Number | 0-1 likelihood ALYGN qualifies |
| **Eligibility Notes** | Text | Eligibility verification details |
| **Key Requirements** | Text | Top 3-5 eligibility/app requirements |
| **Application Complexity** | Select | Low / Medium / High |
| **Research Sources** | URL | Links to research (multi-value) |
| **Fit Summary** | Text | 2-3 sentence ALYGN fit description |
| **Application Due in** | Formula | Days remaining until deadline |
| **Submitted** | Checkbox | Has application been submitted? |
| **Submission Date** | Date | When application was submitted |
| **Awarded** | Checkbox | Was grant awarded? |
| **Award Amount** | Number | Actual awarded amount |
| **Notes** | Text | Manual notes (Andler/Tania) |
| **Last Updated** | Date | Auto-timestamp of last change |

### Views

| View | Filter | Sort |
|------|--------|------|
| **Critical Deadline** | Status ≠ submitted/awarded/rejected/closed AND Full Deadline ≤ 7 days | Full Deadline ASC |
| **High Priority** | Status ≠ submitted/awarded/rejected/closed AND Priority = High | ALYGN Fit Score DESC |
| **Research Queue** | Status = discovered | ALYGN Fit Score DESC |
| **Validation Queue** | Status = researched | Priority Score DESC |
| **Submitted Applications** | Submitted = true | Submission Date DESC |
| **Awarded Grants** | Awarded = true | Award Amount DESC |
| **Weekly Digest** | Full Deadline within 30 days | Priority Score DESC |

---

## 6. Cron Job Specifications

**Managed via OpenClaw cron system (`openclaw cron`):**

### 6.1 Weekly Full Discovery Run

```javascript
{
  name: "ALYGN Grant Discovery - Weekly Full Run",
  schedule: {
    kind: "cron",
    expr: "0 8 * * 1",           // Monday 8:00 AM Costa Rica
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "cd $HOME/.agents/skills/alygn-grant-discovery && node bin/alygn-grant-discovery --action=pipeline --full"
  },
  sessionTarget: "main",
  enabled: true,
  notification: {
    onFailure: { channel: "whatsapp", to: ["andler", "tania"] },
    onSuccess: false
  }
}
```

### 6.2 Daily Deadline Monitoring

```javascript
{
  name: "ALYGN Grant Deadline Monitor",
  schedule: {
    kind: "cron",
    expr: "0 9 * * 1-5",         // Weekdays 9:00 AM Costa Rica
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "cd $HOME/.agents/skills/alygn-grant-discovery && node bin/alygn-grant-discovery --action=monitor-deadlines"
  },
  sessionTarget: "main",
  enabled: true,
  notification: {
    onFailure: { channel: "whatsapp", to: ["andler", "tania"] },
    triggers: [
      { type: "deadline-approaching", days: 7, channel: "discord" },
      { type: "deadline-approaching", days: 3, channel: "whatsapp" },
      { type: "new-high-priority", channel: "discord" }
    ]
  }
}
```

### 6.3 Daily Notion Sync + Score Recalculation

```javascript
{
  name: "ALYGN Grant Pipeline - Daily Sync",
  schedule: {
    kind: "cron",
    expr: "0 10 * * 1-5",         // Weekdays 10:00 AM Costa Rica
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "cd $HOME/.agents/skills/alygn-grant-discovery && node bin/alygn-grant-discovery --action=sync-notion --recalculate-scores"
  },
  sessionTarget: "main",
  enabled: true
}
```

### 6.4 Weekly Report to Tania

```javascript
{
  name: "ALYGN Grant Weekly Report - Tania",
  schedule: {
    kind: "cron",
    expr: "0 11 * * 5",          // Friday 11:00 AM Costa Rica
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "cd $HOME/.agents/skills/alygn-grant-discovery && node bin/alygn-grant-discovery --action=report --format=email --recipient=tania"
  },
  sessionTarget: "main",
  enabled: true,
  notification: {
    onFailure: { channel: "whatsapp", to: ["andler"] }
  }
}
```

### 6.5 Weekly Discord Digest

```javascript
{
  name: "ALYGN Grant Discord Digest",
  schedule: {
    kind: "cron",
    expr: "0 12 * * 5",          // Friday 12:00 PM Costa Rica
    tz: "America/Costa_Rica"
  },
  payload: {
    kind: "systemEvent",
    text: "cd $HOME/.agents/skills/alygn-grant-discovery && node bin/alygn-grant-discovery --action=report --format=discord --channel=alygn-grants"
  },
  sessionTarget: "main",
  enabled: true
}
```

---

## 7. CLI Interface

```bash
# Full pipeline (discover → research → validate → score → notify)
node bin/alygn-grant-discovery --action=pipeline --full

# Individual phases
node bin/alygn-grant-discovery --action=discover --limit=50 --dry-run
node bin/alygn-grant-discovery --action=research --limit=20 --dry-run
node bin/alygn-grant-discovery --action=validate --limit=20 --dry-run
node bin/alygn-grant-discovery --action=score --limit=20 --dry-run
node bin/alygn-grant-discovery --action=notify --limit=10

# Monitoring
node bin/alygn-grant-discovery --action=monitor-deadlines --days=7
node bin/alygn-grant-discovery --action=sync-notion --recalculate-scores

# Reporting
node bin/alygn-grant-discovery --action=report --format=email --recipient=tania
node bin/alygn-grant-discovery --action=report --format=discord --channel=alygn-grants
node bin/alygn-grant-discovery --action=report --format=analysis --grant-id=grant-xxx

# Utility
node bin/alygn-grant-discovery --action=list-sources
node bin/alygn-grant-discovery --action=check-status
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--action` | Phase to run | `pipeline` |
| `--full` | Run all phases (shorthand) | false |
| `--limit` | Max grants to process | 50 |
| `--dry-run` | Simulate without writing to Notion | false |
| `--grant-type` | Filter by grant type | all |
| `--min-score` | Minimum ALYGN fit score | 0 |
| `--days` | Deadline window (monitoring) | 14 |
| `--format` | Report format | `email` |
| `--recipient` | Email recipient | `tania` |
| `--channel` | Discord channel name | `alygn-grants` |
| `--grant-id` | Specific grant to report on | null |

---

## 8. Output Specifications

### 8.1 Notion Updates

- Create new grant entries for discovered grants (Status: `discovered`)
- Update existing grants through pipeline stages (Status: `researched`, `validated`, `scored`)
- Recalculate Priority Score when deadline changes
- Flag deadlines < 7 days as Critical

### 8.2 Email Summary to Tania

**Subject:** `ALYGN Grant Discovery — {count} new opportunities, {critical} critical deadlines`

**Body sections:**
1. **Critical Deadlines (≤7 days)** — Table: Grant Name | Deadline | Amount | Fit Score
2. **High-Priority Opportunities (Score ≥ 8)** — Table: Grant Name | Agency | Amount | Deadline | Fit Summary
3. **New This Week** — List: Grant Name | Source | Quick take
4. **Recommended Actions** — Prioritized next steps for Tania

### 8.3 Discord Digest

**Embed fields:**
- **Critical Deadline Alerts** — Inline table
- **Top 5 Grant Opportunities** — Table (name, agency, amount, deadline, fit score)
- **New Grants Discovered** — Bulleted list with source
- **Pipeline Statistics** — Discovered / Researched / Validated / Ready to Apply counts

### 8.4 Analysis Report (on-demand)

Detailed markdown report per grant:
- Executive summary (fit assessment)
- Grant overview (funder, amount, duration)
- Eligibility analysis
- Key requirements checklist
- Application complexity assessment
- Recommended approach
- Research sources with citations

---

## 9. Discovery Source Configuration

```javascript
// config/discovery-sources.json
{
  "grok": {
    "enabled": true,
    "queries": [
      "AI safety research grants 2026",
      "AGI governance funding opportunities",
      "frontier AI oversight grants",
      "responsible AI development funding",
      "AI alignment research grants non-profits"
    ]
  },
  "perplexity": {
    "enabled": true,
    "queries": [
      "NSF AI safety funding opportunities 2026",
      "DARPA AI governance grants",
      "foundation AI alignment grants",
      "corporate responsible AI grants"
    ]
  },
  "firecrawl": {
    "enabled": true,
    "targetDomains": [
      "nsf.gov/funding",
      "darpa.gov/workitems",
      "responsible.ai",
      "foundationalventures.org",
      "openphilanthropy.org",
      "ea-foundation.org",
      "hrf.org",
      "aiisafety.info"
    ],
    "maxPagesPerDomain": 10
  }
}
```

---

## 10. Scoring Weights

```javascript
// config/scoring-weights.json
{
  "alygnFit": {
    "aiSafetyExplicit": 3.0,      // Grant explicitly mentions AI safety
    "governanceRelevant": 2.0,    // Addresses AI governance
    "alignmentResearch": 2.0,    // Funds alignment research
    "nonprofitEligible": 1.0      // ALYGN (nonprofit) qualifies
  },
  "priority": {
    "deadlineWeight": 0.4,        // Urgency factor (inverse days)
    "amountWeight": 0.3,          // Amount relative to $1M baseline
    "confidenceWeight": 0.3        // Eligibility confidence
  }
}
```

**Composite Score Formula:**
```
compositeScore = (
  (alygnFitScore / 10) * 0.5 +
  (deadlineUrgency / maxUrgency) * 0.3 +
  (amountScore / maxAmount) * 0.2
) * 100
```

---

## 11. Key Implementation Notes

### 11.1 Deduplication Strategy
Grants are deduplicated by normalized name + agency + deadline tuple. A grant seen from multiple sources (Grok, Perplexity, Firecrawl) is merged — taking the highest confidence values for each field.

### 11.2 Rate Limiting
- Grok: 60 req/min (tier dependent)
- Perplexity: 100 req/day (Pro tier)
- Firecrawl: 100 pages/min (Pro tier)
- Notion: 3 req/sec (hard limit)

### 11.3 State Persistence
Pipeline state saved to `/tmp/alygn-grants-{phase}-{date}.json` between phases. Resume via `--input` flag.

### 11.4 Error Handling
- Discovery failures: Log + skip source, continue with others
- Validation failures: Flag grant with error note, don't halt pipeline
- Notion write failures: Retry 3x with exponential backoff, alert on persistent failure
- Cron failures: WhatsApp notification to Andler

### 11.5 ALYGN-Specific Eligibility Defaults
```javascript
const ALYGN_ELIGIBILITY = {
  organizationType: 'nonprofit-501c3',
  location: ['US', 'International'],
  aiSpecific: true,
  governanceFocus: true,
  yearsOperating: 1                // ALYGN is new but qualifies for most grants
};
```

---

## 12. Port Mapping from VC Outreach

| VC Outreach Component | Grant Discovery Equivalent |
|-----------------------|---------------------------|
| `VCEntity` | `GrantEntity` |
| `VCDiscoveryStrategy` | `DiscoveryStrategy` (multi-source) |
| `PainPointExtractor` | `AlignmentValidator` (ALYGN fit check) |
| `EmailPersonalizer` | `ApplicationPreparer` (optional prep workflow) |
| `OutreachOrchestrator` | `PipelineOrchestrator` |
| `ReplyTracker` | `DeadlineMonitor` + `StatusTracker` |
| `WeeklyReport` | `GrantReportGenerator` |
| `Notion VC DB` | `Notion Grant DB` |
| Gmail IMAP | Notion API polling |

---

**End of Architecture Document**
