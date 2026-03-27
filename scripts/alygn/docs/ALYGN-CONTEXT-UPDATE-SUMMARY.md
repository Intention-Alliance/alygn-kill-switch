# ALYGN Context Update - Implementation Summary

**Date:** February 10, 2026  
**Status:** In Progress

## 🚨 CRITICAL: Name Policy

**"Intention Alliance" is FULLY DEPRECATED.**

- Only use "Alygn" in ALL contexts (no exceptions)
- Remove ALL references from Notion, templates, documentation, outreach
- Update page titles, database entries, email templates
- This policy effective immediately, applies for at least 2 semesters

## 🎯 Overview

Major identity shift for Alygn from technology-focused AI platform to **independent AI governance institution**. This impacts all messaging, automation, and outreach systems.

---

## ✅ Completed Tasks

### 1. Pre-Approved Posts Tracking System

- **File:** `scripts/alygn/pre-approved-posts.json`
- **Status:** ✅ Created with all 100 posts
- **Features:**
  - Sequential posting (one per day)
  - Tracking fields: `posted`, `date_posted`, `tweet_id`
  - Progress tracking and metadata

### 2. Pre-Approved Post Automation Script

- **File:** `scripts/alygn/post-pre-approved.js`
- **Status:** ✅ Created and ready for testing
- **Features:**
  - Post next unposted content
  - Update tracking JSON automatically
  - Show status/progress
  - Reset function (admin only)
  - WhatsApp notifications

### 3. Decision Engine Prompt Update

- **File:** `scripts/alygn/twitter-discovery/decision-engine.js`
- **Status:** ✅ Updated
- **Changes:**
  - OLD: "AGI safety, alignment, existential risk management"
  - NEW: "Independent AI governance institution focused on coordination, legitimacy, preparedness"
  - Added institutional tone guidelines
  - Updated language guardrails

### 4. MEMORY.md Update

- **File:** `MEMORY.md`
- **Status:** ✅ Updated with full Alygn context
- **Added:**
  - Core identity and principles
  - Communications guardrails
  - Pre-approved posts strategy
  - Language use guidelines

### 5. Implementation Plan Document

- **File:** `scripts/alygn/PROMPT-UPDATE-PLAN.md`
- **Status:** ✅ Created
- **Contents:**
  - Complete analysis of old vs new messaging
  - Prompt-by-prompt update requirements
  - Implementation steps and testing checklist

---

## ⚠️ Pending Tasks

### Priority 1: Critical Updates

#### Twitter Automation Prompts (Notion)

- **Location:** Notion "Twitter/X Growth Strategy" page
- **Page ID:** `2fc334874af681889a5fd95a1fa1dd72`
- **Action Required:** Update/deprecate prompts

**Prompts to UPDATE:**

- Prompt #1: "Generating Post Ideas" → Deprecate (use pre-approved posts)
- Prompt #4: "General Reply Starters" → Rewrite for institutional commentary
- Prompt #13: "Daily Trends" → Focus on governance developments only
- Prompt #15: "Reply Automation" → Align with institutional restraint
- Prompt #18: "Performance Feedback" → Focus on message clarity vs virality

**Prompts to DEPRECATE:**

- Prompt #2: "Advanced Post Ideas with Visuals" (product-focused)
- Prompt #11: "Virality Optimization" (against restraint principle)
- Prompt #12: "Collaboration Ideas" (premature)
- Prompt #16: "Scheduling Content" (replaced by pre-approved posts)
- Prompt #19: "Long-Term Scaling" (growth metrics focus)

**New Prompt Needed:**

- Prompt #20: "Post Pre-Approved Content" (use `post-pre-approved.js`)

#### VC Email Template Rewrite

- **Location:** `scripts/alygn/vc-outreach/`
- **Files to Update:**
  - `vc-outreach-email-template.js` (HTML generator)
  - `vc-outreach-email-template.py` (Python sender)
  - `send-email-test.js` (test script)

**Current Issues:**

- ❌ Subject: "Building the Next Generation of AI Systems"
- ❌ Headline: "Humanizing Technology at Scale"
- ❌ Content: "Enterprise AI Infrastructure", "Context Engine", "Intention Marketplace"
- ❌ Tone: Product-focused, technology-first
- ❌ LinkedIn URL: `linkedin.com/company/alygn` (in 2 files)
- ❌ References to "Intention Marketplace" in Python template

**Required Changes:**

- ✅ Subject: "AI Governance Infrastructure" or "Coordination Before Crisis"
- ✅ Headline: "Independent AI Governance Institution"
- ✅ Content: Governance-first, coordination, legitimacy, preparedness
- ✅ Tone: Calm, institutional, restrained
- ✅ Company name: "Alygn" ONLY (never "Intention Alliance")
- ✅ Remove LinkedIn URL or update to Alygn profile (if exists)
- ✅ Remove "Intention Marketplace" references

### Priority 2: Integration

#### Cron Job Updates

- **Current:** Daily 11 AM runs `twitter-master-automation.js`
- **Required:** Integrate pre-approved posts into workflow
- **Action:**
  1. Modify cron to call `post-pre-approved.js` first
  2. Then run discovery system (reactive engagement)
  3. Report combined summary to WhatsApp

#### Notion Document Updates

- **Alygn Central Hub:** Update boilerplate text
  - Page ID: `2f933487-4af6-819f-a5c5-f32ae95088f1`
  - Current: May still have old messaging
  - Required: Governance-first positioning
- **Context Engineering Document:** Archive or reframe
  - Page ID: `2f933487-4af6-81af-b946-c57b61ae2c02`
  - Current: Technical framework focus
  - Required: Either remove or reframe as governance infrastructure

### Priority 3: Testing & Validation

#### Test Pre-Approved Post System

```bash
# Status check
node scripts/alygn/post-pre-approved.js --status

# Test posting (will need X API implementation)
node scripts/alygn/post-pre-approved.js
```

#### Test Updated Decision Engine

```bash
# Run discovery workflow with new governance focus
cd scripts/alygn/twitter-discovery
node decision-engine.js
```

#### Validate Tone Alignment

- Review all automated content for institutional restraint
- Ensure no promotional language, hype, or claims
- Verify governance perspective vs technical commentary

---

## 📋 Implementation Checklist

### Immediate (Today)

- [ ] Review this summary with Andler
- [ ] Approve prompt update strategy
- [ ] Decide on VC email template rewrite approach
- [ ] Test pre-approved post script (manual posting for now)

### This Week

- [ ] Implement X API posting in `post-pre-approved.js`
- [ ] Update Notion Twitter prompts (Priority 1 list)
- [ ] Rewrite VC email templates (governance-first)
- [ ] Update cron job to use pre-approved posts
- [ ] Test end-to-end workflow (discovery + pre-approved)

### Next Week

- [ ] Update Alygn Central Hub in Notion
- [ ] Archive/reframe technical documents in Notion
- [ ] Monitor automated content for tone alignment
- [ ] Create variation system for post #101+ (after 100 days)

---

## 🔑 Key Reference Documents

**Source Materials:**

- `$HOME/Documents/alygn-context-update/00 Alygn - Public Institutional Overview & Communications Guardrails.pdf`
- `$HOME/Documents/alygn-context-update/01 Alygn - Boiler Plate.pdf`
- `$HOME/Documents/alygn-context-update/02 Alygn Pre Approved Posts.pdf`

**Implementation Docs:**

- `scripts/alygn/PROMPT-UPDATE-PLAN.md` (detailed prompt analysis)
- `scripts/alygn/pre-approved-posts.json` (tracking file)
- `scripts/alygn/post-pre-approved.js` (automation script)

**Updated Files:**

- `MEMORY.md` (new Alygn context section)
- `scripts/alygn/twitter-discovery/decision-engine.js` (governance-first prompt)

---

## 🎨 New Messaging Framework

### Core Identity

> Alygn is an independent AI governance institution focused on making accountability, oversight, and coordination workable for advanced AI systems operating at global scale.

### Value Proposition

> Governance legitimacy, not technology.

### Core Principles

1. Governance-first, not technology-first
2. Institutional restraint and neutrality
3. Coordination infrastructure, not control
4. Pre-crisis preparation, not reactive regulation

### Key Institutional Truths

- Legitimacy is infrastructure
- Governance can't be retrofitted at frontier scale
- Coordination failure is the real systemic AI risk
- Trust is harder to scale than technology

### Language Guidelines

**✅ USE:**

- "Supports coordination"
- "Enables accountability"
- "Provides neutral governance infrastructure"
- "Independent and non-operational"

**❌ AVOID:**

- "Ensures compliance"
- "Regulates"
- "Controls"
- "Oversees systems directly"

### Tone

- Calm
- Institutional
- Restrained
- Non-promotional

---

## 🚨 Critical Reminders

**Communications Guardrails:**

- ✅ Safe: Purpose, principles, institutional framing, general governance commentary
- 🚫 NOT safe: Financial details, investor names, governance mechanics, timelines, claims of authority

**Operational Security:**

- Maintain strict project context isolation (Alygn vs Bitcash vs personal)
- External team members see ONLY their project context
- Never mention other projects or parallel ventures

**Quality Bar:**

- All content must reflect institutional restraint
- Zero promotional language, no hype, no claims
- Focus on "why Alygn should exist" not "how Alygn works"
- Thought leadership, not announcements

---

## 📊 Success Metrics

1. **Tone consistency:** 100% of automated content reflects institutional restraint
2. **Pre-approved posts:** Sequential posting system operational
3. **Discovery system:** Evaluates posts through governance lens
4. **VC outreach:** Email templates align with governance-first positioning
5. **Notion alignment:** All documentation reflects new identity

---

## 🤝 Next Steps

**For Andler:**

1. Review and approve this implementation plan
2. Provide feedback on priority order
3. Approve VC email template rewrite approach
4. Decide on Notion update timing

**For Wobblus:**

1. Await approval on prompt updates
2. Create VC email template (governance variant)
3. Test pre-approved post system
4. Prepare Notion update document with exact changes

---

_Document created: 2026-02-10 by Wobblus_  
_Last updated: 2026-02-10 21:25 CST_
