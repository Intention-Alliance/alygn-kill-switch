# Notion Updates Required - Alygn Context Update
**Date:** February 10, 2026

## 🚨 CRITICAL: Name Change Policy

**"Intention Alliance" is FULLY DEPRECATED.**  
- Only use "Alygn" in ALL contexts (internal, external, documentation, outreach)
- Remove ALL references to "Intention Alliance" from Notion pages, templates, and documentation
- This applies to: page titles, content, database entries, email templates, GitHub references

## Overview

Following the Alygn identity shift to governance-first positioning, several Notion pages require updates to align with new messaging.

---

## 1. Twitter/X Growth Strategy (Prompts)

**Page ID:** `2fc334874af681889a5fd95a1fa1dd72`  
**URL:** https://www.notion.so/Twitter-X-Growth-Strategy-2fc334874af681889a5fd95a1fa1dd72  
**Parent:** Organizations TODO Lists

### Prompts to UPDATE

#### Prompt #1: Generating Post Ideas
**Current:**
```
"Generate 10 engaging thread ideas on AI alignment and safety topics that would a..."
```

**Action:** Mark as DEPRECATED or reframe
**Replacement:**
```
[Prompt #1] Pre-Approved Content Posting: "Post the next sequential pre-approved post from scripts/alygn/pre-approved-posts.json. Update the tracking file with posted status, date, and tweet ID. Report summary to WhatsApp. Use post-pre-approved.js script."
```

#### Prompt #4: General Reply Starters
**Current:**
```
"Craft 15 versatile reply templates for engaging in AI alignment discussions on X..."
```

**Updated:**
```
[Prompt #4] Institutional Commentary Templates: "Generate 10 brief, institutional reply templates for AI governance discussions. Tone: calm, restrained, non-promotional. Focus: adding governance perspective, not technical commentary. Preferred language: 'Supports coordination', 'Enables accountability', 'Neutral infrastructure'. Avoid: 'Regulates', 'Controls', 'Ensures compliance'. Max 280 characters each. Example context: policy debates, coordination challenges, legitimacy discussions."
```

#### Prompt #13: Daily Trends
**Current:**
```
"Search and summarize today..."
```

**Updated:**
```
[Prompt #13] Governance Trend Monitoring: "Search for recent developments (last 24-48h) in AI governance, institutional coordination, legitimacy discussions, and cross-organization AI safety efforts. FILTER OUT: pure technical research, product launches, funding news (unless governance-relevant), hype-driven content. OUTPUT: Top 5 governance-relevant items with: (1) Topic/title, (2) 2-3 sentence summary, (3) Governance angle (why it matters for coordination/legitimacy), (4) Source URL. Enable Grok search tool."
```

#### Prompt #15: Reply Automation
**Current:**
```
"Generate a batch of 20 automated reply prompts for OpenClaw to use on AI threads..."
```

**Updated:**
```
[Prompt #15] Governance Reply Framework: "Generate 15 institutional reply templates for AI governance discussions. Each template should: (1) Add governance perspective (not technical), (2) Maintain calm, institutional tone, (3) Avoid promotional language or claims, (4) Focus on coordination/legitimacy themes. Include placeholders for: [TOPIC], [AUTHOR], [SPECIFIC_POINT]. Max 280 characters. Example topics: emergency coordination, institutional trust, pre-crisis preparation, neutral oversight."
```

#### Prompt #18: Performance Feedback
**Current:**
```
"Based on last week..."
```

**Updated:**
```
[Prompt #18] Message Clarity Review: "Analyze last week's Twitter content (posts, replies, engagement). Evaluate: (1) Tone alignment with institutional restraint (calm, non-promotional), (2) Language compliance (preferred vs avoided terms), (3) Message clarity (governance perspective vs technical commentary), (4) Engagement quality (adding value vs noise). Focus on institutional credibility, not virality metrics. Suggest 3-5 improvements for next week."
```

### Prompts to DEPRECATE

Add ❌ prefix and "DEPRECATED" note to these:

- **Prompt #2:** "Advanced Post Ideas with Visuals" → ❌ DEPRECATED (product-focused, not governance)
- **Prompt #11:** "Virality Optimization" → ❌ DEPRECATED (conflicts with institutional restraint)
- **Prompt #12:** "Collaboration Ideas" → ❌ DEPRECATED (premature for institutional formation phase)
- **Prompt #16:** "Scheduling Content" → ❌ DEPRECATED (replaced by pre-approved posts system)
- **Prompt #19:** "Long-Term Scaling" → ❌ DEPRECATED (growth metrics focus, not institutional legitimacy)

### New Prompt to ADD

```
[Prompt #20] Governance-First Content Check: "Review this proposed tweet/thread and evaluate governance alignment. Check: (1) Does it maintain institutional restraint? (2) Does it avoid promotional language? (3) Does it use preferred language ('supports coordination' vs 'regulates')? (4) Does it focus on governance perspective vs technical details? (5) Is tone calm, institutional, non-hype? Output: APPROVED / NEEDS REVISION with specific feedback. Include rewritten version if needed."
```

---

## 2. Alygn Central Hub

**Page ID:** `2f933487-4af6-819f-a5c5-f32ae95088f1`  
**URL:** https://www.notion.so/Intention-Alliance-Central-Hub-2f9334874af6819fa5c5f32ae95088f1

### Updates Required

#### Page Title
**Current:** "Intention Alliance - Central Hub"  
**Action:** **MUST UPDATE to "Alygn - Central Hub"**
**Reason:** "Intention Alliance" name is deprecated. Only use "Alygn" going forward (all contexts).

#### About Section
**Current:** May contain old technology-focused messaging  
**Replace with:**
```
# About Alygn

Alygn is an independent AI governance institution focused on making accountability, oversight, and coordination workable for advanced AI systems operating at global scale.

**Core Purpose:** Support coordination across AI developers, operators, and public institutions without centralizing control, asserting authority, or advancing a policy agenda.

**Value Proposition:** Governance legitimacy, not technology.

**Core Principles:**
- Governance-first, not technology-first
- Clear separation between governance, oversight, and system operation
- Independent review and auditability
- Emergency coordination without standing control
- Neutrality across labs, operators, and jurisdictions

**Design Philosophy:** Restraint, credibility, and durability — not speed, hype, or visibility.

**Key Institutional Truths:**
- Legitimacy is infrastructure
- Governance can't be retrofitted at frontier scale
- Coordination failure is the real systemic AI risk
- Emergency response that doesn't exist before crisis rarely works during one
- Trust is harder to scale than technology
```

#### Boilerplate / Mission Statement
**Current:** Unknown (check page)  
**Replace with content from:** `$HOME/Documents/alygn-context-update/01 Alygn - Boiler Plate.txt`

---

## 3. Reference Documents (in Central Hub)

### "Humanizing Technology - Protocol Overview"
**Page ID:** `2f933487-4af6-8158-91a6-c98893b5024c`  
**Action:** ARCHIVE or DEPRECATE  
**Reason:** Technology-focused, conflicts with governance-first positioning  
**Alternative:** Create new "Governance Infrastructure Overview" page

### "Context Engineering - Technical Framework"
**Page ID:** `2f933487-4af6-81af-b946-c57b61ae2c02`  
**Action:** ARCHIVE or reframe as "Governance Framework"  
**Reason:** Technical focus, should be governance infrastructure focus  
**If keeping:** Reframe all technical language to governance context

---

## 4. Organizations TODO Lists - Weekly Progress Database

**Database ID:** `2fe33487-4af6-8137-868e-e14fd068948c`  
**URL:** https://www.notion.so/2fe334874af68137868ee14fd068948c

### Update Project Property Values

Ensure "Project" field for Alygn entries uses consistent terminology:
- **REQUIRED:** "ALYGN" (all caps) or "Alygn" (capitalized)
- **NEVER USE:** "Intention Alliance" (name fully deprecated, do not use in any context)

### Weekly Entry Template

When logging ALYGN work, use governance-first framing:

**Good examples:**
- "Refined institutional messaging for Twitter automation"
- "Updated decision engine to focus on governance perspective"
- "Implemented pre-approved posts system for consistent institutional voice"

**Avoid:**
- "Optimized content for engagement"
- "Built AI safety discussion templates"
- "Improved virality tactics"

---

## 5. New Notion Pages to CREATE (Optional)

### Communications Guardrails
Create a dedicated page with content from:  
`$HOME/Documents/alygn-context-update/00 Alygn - Public Institutional Overview & Communications Guardrails.pdf`

**Key sections:**
- What Alygn Is / Is Not
- Core Institutional Design Principles
- How Alygn Thinks About AI Risk
- Public Communications Guidance
- Language Guardrails
- Platform Tone Guidance

### Pre-Approved Posts Archive
Create a database or page archiving all 100 pre-approved posts with:
- Post ID
- Category (Institutional Truths, Reframes, etc.)
- Text
- Posted status
- Date posted
- Tweet URL

**Sync with:** `scripts/alygn/pre-approved-posts.json`

---

## Implementation Timeline

### Phase 1 (Today)
- [ ] Review this document with Andler
- [ ] Approve changes
- [ ] Identify any additional pages requiring updates

### Phase 2 (This Week)
- [ ] Update Twitter prompts (#1, #4, #13, #15, #18)
- [ ] Deprecate obsolete prompts (#2, #11, #12, #16, #19)
- [ ] Add new prompt #20 (Governance-First Content Check)
- [ ] Update Alygn Central Hub "About" section

### Phase 3 (Next Week)
- [ ] Archive old reference documents
- [ ] Create Communications Guardrails page (optional)
- [ ] Create Pre-Approved Posts Archive (optional)
- [ ] Update Weekly Progress entries retroactively

---

## Access & Credentials

**Notion API Key:** `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`  
**Version:** 2022-06-28

**Key Page IDs:**
- Twitter Prompts: `2fc334874af681889a5fd95a1fa1dd72`
- Alygn Central Hub: `2f933487-4af6-819f-a5c5-f32ae95088f1`
- Weekly Progress DB: `2fe33487-4af6-8137-868e-e14fd068948c`

---

## Validation Checklist

After updates, verify:
- [ ] All Twitter prompts reflect governance-first tone
- [ ] No promotional/hype language in prompts
- [ ] Preferred language terms used consistently
- [ ] Deprecated prompts clearly marked
- [ ] Central Hub reflects institutional positioning
- [ ] Reference documents aligned or archived
- [ ] Weekly entries use governance framing

---

_Document created: 2026-02-10 by Wobblus_  
_Ready for review and implementation approval_
