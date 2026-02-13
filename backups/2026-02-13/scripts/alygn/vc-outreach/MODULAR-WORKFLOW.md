# ALYGN VC Outreach - Modular Workflow

**Status:** Production-ready  
**Created:** Feb 12, 2026  
**Architecture:** Modular (discovery → research → drafting → approval → sending)

---

## Overview

5-phase modular workflow for AI safety/governance VC outreach with human approval.

```
1. Discovery
   ↓ (automated-vc-discovery.js - daily cron)
   Basic data to Notion

2. Deep Research
   ↓ (deep-research-vcs.js - manual/cron)
   Fill missing data → Mark "Ready for outreach"

3. Email Drafting
   ↓ (draft-outreach-emails.js - manual)
   Generate personalized emails → Post to Discord

4. Human Approval
   ↓ (Discord #annotations thread)
   Review drafts → Approve/Edit/Skip

5. Sending
   ↓ (send-approved-emails.js - scheduled)
   Send approved emails → Update Notion
```

---

## Phase 1: Discovery (Automated)

**Script:** `automated-vc-discovery.js`  
**Schedule:** Daily at 10 AM (cron)  
**Purpose:** Find new VCs and add basic data to Notion

**What it does:**
- Web search for AI safety/governance VCs (5 queries)
- Basic research (name, website, focus areas)
- Relevance scoring (1-10, threshold: 7)
- Add to Notion with status "Not contacted"
- Report to Discord

**Run manually:**
```bash
node automated-vc-discovery.js --limit=10 --dry-run
```

**Notion status:** `Not contacted`

---

## Phase 2: Deep Research (Manual/Automated)

**Script:** `deep-research-vcs.js`  
**Schedule:** On-demand or daily cron  
**Purpose:** Fill missing data for incomplete VCs

**What it does:**
- Load VCs with status != "Ready for outreach"
- For each VC, research:
  - Partner emails (website, LinkedIn)
  - Investment thesis (from About page)
  - Recent AI safety investments
  - Partner backgrounds
  - Top 3 pain points (Grok analysis)
  - Governance signals (quotes, blog posts)
- Update Notion with full personalization data
- Mark as "Ready for outreach" when complete
- Report to Discord

**Run manually:**
```bash
# Research all incomplete VCs (limit 5)
node deep-research-vcs.js --limit=5

# Research specific VC
node deep-research-vcs.js --vc-name="Khosla Ventures"

# Dry run
node deep-research-vcs.js --dry-run
```

**Notion status:** `Not contacted` → `Ready for outreach`

---

## Phase 3: Email Drafting (Manual)

**Script:** `draft-outreach-emails.js`  
**Schedule:** On-demand (before outreach batch)  
**Purpose:** Generate personalized emails for approval

**What it does:**
- Load VCs with status "Ready for outreach"
- For each VC, generate:
  - 3 subject line options (A/B/C testing)
  - Personalized email body (pain points, portfolio insights)
  - Variant selection (Governance vs Institutional)
- Save drafts to `drafts/` directory
- Post drafts to Discord (#annotations) for review
- Wait for human approval

**Run manually:**
```bash
# Draft top 5 VCs
node draft-outreach-emails.js --limit=5

# Draft specific VC
node draft-outreach-emails.js --vc-name="Lux Capital"

# Dry run
node draft-outreach-emails.js --dry-run
```

**Notion status:** `Ready for outreach` (unchanged)

---

## Phase 4: Human Approval (Discord)

**Channel:** Discord #annotations (`1466532145257255004`)  
**Purpose:** Review and approve/edit/skip email drafts

**Approval commands:**
- `APPROVE [VC Name]` - Approve email for sending
- `EDIT [VC Name]: [changes]` - Request edits to draft
- `SKIP [VC Name]` - Skip this VC (not interested)

**Example:**
```
APPROVE Khosla Ventures
EDIT Lux Capital: Use subject line B instead of A
SKIP Bloomberg Beta
```

**Approval workflow:**
1. Wobblus posts draft to Discord with 3 subject line options
2. Andler reviews and replies with command
3. Wobblus updates draft status based on approval
4. Approved emails move to sending queue

---

## Phase 5: Sending (Scheduled)

**Script:** `send-approved-emails.js` (TO BE CREATED)  
**Schedule:** Daily 9 AM - 7 PM (hourly batches, 12 emails/day max)  
**Purpose:** Send approved emails in planned timeframe

**What it does:**
- Load approved drafts from queue
- Send emails via Python SMTP (Gmail)
- Update Notion status to "Contacted"
- Set "Sent Date" in Notion
- Report to Discord

**Rate limiting:**
- Max 12 emails per day
- Spread across business hours (9 AM - 7 PM)
- 1 email per hour

**Run manually:**
```bash
# Send approved emails (respects rate limits)
node send-approved-emails.js

# Dry run (shows what would be sent)
node send-approved-emails.js --dry-run
```

**Notion status:** `Ready for outreach` → `Contacted`

---

## Scripts Reference

| Script | Purpose | Schedule |
|--------|---------|----------|
| `setup-vc-notion-tracker.js` | Create Notion database, import seed VCs | One-time setup |
| `automated-vc-discovery.js` | Discover new VCs, add basic data | Daily 10 AM (cron) |
| `deep-research-vcs.js` | Fill missing data, mark ready | On-demand or daily |
| `draft-outreach-emails.js` | Generate personalized emails | On-demand (before batch) |
| `send-approved-emails.js` | Send approved emails | Hourly 9 AM - 7 PM |

---

## Notion Database Schema

| Property | Type | Purpose |
|----------|------|---------|
| Name | Title | VC firm name |
| Email | Email | Partner contact email |
| Status | Select | Workflow status (see below) |
| Variant | Select | Email variant (Governance/Institutional) |
| Sent Date | Date | When email was sent |
| Reply Date | Date | When reply received |
| Sentiment | Select | Reply sentiment (Positive/Neutral/Negative) |
| Relevance Score | Number | 1-10 relevance score |
| Pain Points | Multi-select | Top 3 governance challenges |
| Notes | Rich Text | Thesis, investments, signals |
| Website | URL | VC firm website |
| Partners | Rich Text | Partner names and emails |
| Focus Areas | Multi-select | AI safety, governance, etc. |
| Stage | Multi-select | Seed, Pre-seed, Series A |
| Geography | Rich Text | Location |

**Status values:**
- `Not contacted` - Discovered, incomplete data
- `Ready for outreach` - Research complete, ready for drafting
- `Contacted` - Email sent
- `Replied (Positive)` - Interested
- `Replied (Neutral)` - Acknowledged, no action
- `Replied (Negative)` - Not interested
- `Passed` - Declined
- `Meeting Scheduled` - Follow-up call scheduled
- `Negotiating` - In conversation
- `Archived` - No longer active

---

## Daily Workflow Example

**Morning (10 AM):**
1. Automated discovery cron runs → Finds 5 new VCs → Adds to Notion

**Mid-morning (11 AM):**
2. Run deep research manually:
   ```bash
   node deep-research-vcs.js --limit=5
   ```
   → Fills missing data → Marks 5 VCs "Ready for outreach"

**Afternoon (2 PM):**
3. Run email drafting:
   ```bash
   node draft-outreach-emails.js --limit=5
   ```
   → Posts 5 drafts to Discord for review

**Afternoon (3 PM):**
4. Andler reviews drafts in Discord → Approves 3, edits 1, skips 1

**Evening (4 PM - 7 PM):**
5. Sending script runs hourly → Sends 3 approved emails → Updates Notion

---

## Testing Workflow

**Step 1: Setup**
```bash
# Create database and import seed VCs
node setup-vc-notion-tracker.js
```

**Step 2: Deep Research (first batch)**
```bash
# Research top 5 VCs from seed list
node deep-research-vcs.js --limit=5
```

**Step 3: Draft Emails**
```bash
# Draft emails for top 3 VCs
node draft-outreach-emails.js --limit=3
```

**Step 4: Approve in Discord**
- Go to Discord #annotations
- Review drafts
- Reply with `APPROVE [VC Name]`

**Step 5: Send (manual for testing)**
```bash
# Send approved emails (when script ready)
node send-approved-emails.js --dry-run
```

---

## Configuration

**Notion Database:** Loaded from `notion-config.json` (created by setup script)

**Discord Channels:**
- Discovery reports: `#Alygn: VC Outreach Plan & Implementation` (`1471206314435809431`)
- Draft approvals: `#annotations` (`1466532145257255004`)

**Email Rate Limits:**
- Max 12 emails/day
- Business hours only (9 AM - 7 PM)
- 1 email per hour

**Relevance Threshold:** Score ≥ 7 for Notion addition

---

## Files Structure

```
scripts/alygn/vc-outreach/
├── setup-vc-notion-tracker.js         # Setup (one-time)
├── automated-vc-discovery.js          # Phase 1 (cron)
├── deep-research-vcs.js               # Phase 2 (manual/cron)
├── draft-outreach-emails.js           # Phase 3 (manual)
├── send-approved-emails.js            # Phase 5 (cron) - TO BE CREATED
├── vc-outreach-email-template.js      # Email HTML generator
├── vc-outreach-email-template.py      # Python SMTP sender
├── seed-vc-list.json                  # 20 seed VCs
├── notion-config.json                 # Database ID (generated)
├── workflow.json                      # Workflow definitions
├── drafts/                            # Email drafts for approval
│   ├── draft-[page-id].json
│   └── ...
├── MODULAR-WORKFLOW.md                # This file
├── VC-DISCOVERY-AUTOMATION.md         # Discovery docs
└── TASK-2-COMPLETE.md                 # Setup instructions
```

---

## Next Steps

1. ✅ Setup database (`setup-vc-notion-tracker.js`)
2. ✅ Deep research seed VCs (`deep-research-vcs.js`)
3. ✅ Draft first batch (`draft-outreach-emails.js`)
4. ⏳ Create sending script (`send-approved-emails.js`)
5. ⏳ Set up approval monitoring (Discord bot integration)
6. ⏳ Schedule automated sending cron

---

**Created:** Feb 12, 2026  
**Last Updated:** Feb 12, 2026
