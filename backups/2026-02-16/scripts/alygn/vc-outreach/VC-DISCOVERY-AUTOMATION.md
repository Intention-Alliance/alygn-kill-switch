# ALYGN VC Discovery Automation

**Status:** Production-ready  
**Created:** Feb 12, 2026  
**Schedule:** Daily at 10 AM (cron)

---

## Overview

Automated workflow to discover, research, and curate AI safety/governance VCs for ALYGN outreach.

### Workflow

```
Daily 10 AM Cron
    ↓
Search Web (5 queries)
    ↓
Research VCs (portfolio, thesis, partners)
    ↓
Score Relevance (1-10)
    ↓
Add High-Scoring VCs (≥7) to Notion
    ↓
Report Summary to Discord
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `automated-vc-discovery.js` | Main automation script (cron job) |
| `setup-vc-notion-tracker.js` | Add seed VCs to existing Notion database |
| `vc-discovery-curation.js` | Analyze and rank seed list |
| `setup-vc-discovery-cron.sh` | Set up cron job |

---

## Setup

### 1. Create VC Tracker Database & Add Seed VCs

```bash
node setup-vc-notion-tracker.js
```

**What it does:**
- Creates new VC Outreach Tracker database in Notion
- Parent page: Organizations TODO Lists
- Loads 20 seed VCs from `seed-vc-list.json`
- Adds all VCs to new database (no contact info yet)
- Saves database ID to `notion-config.json`

**Database:** Created under [Organizations TODO Lists](https://www.notion.so/26a33487-4af6-81a8-b01c-fd1a8a5f8bcb)

---

### 2. Test Automated Discovery (Dry Run)

```bash
node automated-vc-discovery.js --dry-run --limit=5
```

**What it does:**
- Searches for 5 VCs per query (2 queries total)
- Researches each VC (portfolio, thesis, partners, pain points)
- Scores relevance (1-10)
- Shows what would be added (no actual Notion writes)

---

### 3. Set Up Cron Job

```bash
bash setup-vc-discovery-cron.sh
```

**Schedule:** Daily at 10 AM  
**Notifications:** Discord (#Alygn: VC Outreach Plan & Implementation)

---

## Cron Job Management

**List cron jobs:**
```bash
openclaw cron list
```

**Run manually:**
```bash
openclaw cron run <job-id>
```

**Remove cron job:**
```bash
openclaw cron remove <job-id>
```

---

## Configuration

**File:** `automated-vc-discovery.js` (lines 25-41)

```javascript
const CONFIG = {
  notionKey: process.env.NOTION_KEY,
  databaseId: '2fc334874af681829013d127ce6778b6',
  minRelevanceScore: 7,
  defaultLimit: 20,
  searchQueries: [
    'AI safety seed stage investors',
    'AI governance venture capital',
    'AI alignment funding',
    'existential risk investors',
    'AGI preparedness venture capital'
  ],
  discordChannel: '1471206314435809431'
};
```

---

## Relevance Scoring

**Criteria (max score: 10)**

| Factor | Points |
|--------|--------|
| High-priority keywords (AI safety, alignment, existential risk) | +4 |
| Medium-priority keywords (AI governance, ethics, policy) | +3 |
| Low-priority keywords (AI, ML, deep tech) | +2 |
| Stage fit (Seed, Pre-seed, Series A) | +3 |
| Governance signals (blog posts, quotes) | +2 |
| Recent AI safety investments (3+) | +1 |

**Threshold:** Only VCs with score ≥ 7 are added to Notion.

---

## Daily Report Format

Sent to Discord after each run:

```
🔍 **Daily VC Discovery Report** (Feb 12, 2026)

**Stats:**
- Searched: 10 VCs
- Researched: 8 VCs
- Added: 3 VCs
- Skipped: 5 VCs (duplicates/low relevance)
- Failed: 0 VCs

**New VCs Added (Score ≥ 7):**
- AI2 Incubator (Score: 10) - AI safety, AI research, NLP
- Khosla Ventures (Score: 9) - AI infrastructure, Deep tech
- Radical Ventures (Score: 9) - AI, Machine learning, Safety

Database: https://www.notion.so/2fc334874af681829013d127ce6778b6
```

---

## Seed VC List

**File:** `seed-vc-list.json`  
**Current Count:** 20 VCs  
**Target:** 100 VCs

**Top 5 by Relevance:**
1. AI2 Incubator (Score: 10) - AI research, safety-first mission
2. Khosla Ventures (Score: 9) - OpenAI investor, AI safety
3. Radical Ventures (Score: 9) - AGI safety protocols
4. Data Collective (DCVC) (Score: 9) - Governance infrastructure
5. Lux Capital (Score: 8) - AI misalignment risk

---

## Next Steps

**Phase 1: Automated Discovery ✅**
- [x] Seed list (20 VCs)
- [x] Notion database setup
- [x] Automated discovery script
- [x] Cron job setup

**Phase 2: Personalization (In Progress)**
- [ ] Deep research on top 20 VCs
- [ ] Pain point extraction (Grok-based)
- [ ] Personalized email drafting
- [ ] Variant selection (Governance vs Institutional)

**Phase 3: Outreach Automation**
- [ ] Email sending pipeline
- [ ] Reply tracking and sentiment analysis
- [ ] Follow-up automation
- [ ] Performance reporting

---

## Files Created

```
scripts/alygn/vc-outreach/
├── seed-vc-list.json                    # 20 curated VCs (targeting 100)
├── automated-vc-discovery.js            # Main automation script (cron)
├── setup-vc-notion-tracker.js           # Add seed VCs to Notion
├── vc-discovery-curation.js             # Analyze seed list
├── setup-vc-discovery-cron.sh           # Cron job setup
├── VC-DISCOVERY-AUTOMATION.md           # This file
├── workflow.json                        # Workflow definitions
└── notion-config.json                   # Database ID (generated)
```

---

**Created:** Feb 12, 2026  
**Last Updated:** Feb 12, 2026
