# ALYGN Twitter Automation - Prompt Update Plan

## Context Update (Feb 10, 2026)

### What Changed

**OLD Identity (Pre-Feb 10):**

- SOS Protocol / Existential Risk Management
- Technology-forward, safety-focused
- Growth/virality tactics
- Content optimization for engagement

**NEW Identity (Feb 10, 2026):**

- Independent AI governance institution
- Governance-first, not technology-first
- Institutional restraint, calm tone
- Coordination infrastructure
- Neutrality, legitimacy, preparedness

### Core Messaging Shifts

| Old Messaging            | New Messaging                     |
| ------------------------ | --------------------------------- |
| "Ensures compliance"     | "Supports coordination"           |
| "Regulates AI systems"   | "Enables accountability"          |
| "Oversees directly"      | "Provides neutral infrastructure" |
| "Controls" / "Authority" | "Independence" / "Restraint"      |
| Crisis-oriented          | Pre-crisis preparation            |
| Technology solutions     | Governance legitimacy             |

### Communications Guardrails

**✅ Safe to Share:**

- Alygn's purpose, principles, institutional framing
- General AI governance challenges
- Coordination, legitimacy, preparedness
- Non-specific updates ("Alygn is publicly forming")

**🚫 NOT Safe to Share:**

- Financial details, investor names
- Governance mechanics, enforcement processes
- Board structure, internal systems
- Timelines, commitments, claims of authority

### Tone Requirements

- Calm, institutional, restrained, non-promotional
- Thought leadership, not announcements
- No numbers, no claims, no hype
- Short, principle-driven posts
- Focus on "why Alygn should exist" not "how Alygn works"

---

## Pre-Approved Posts Strategy

**100 sequential posts** (one per day)

- Tracking: `scripts/alygn/pre-approved-posts.json`
- Categories:
  - Institutional truths (1-10)
  - Reframes (11-20)
  - Process & systems thinking (21-30)
  - Legitimacy & neutrality (31-40)
  - Meta-presence / Alygn-aligned (41-50)
  - Institutional reality statements (51-60)
  - Reframes (61-65)
  - Systems & failure dynamics (66-70)
  - Legitimacy & institutional design (71-75)
  - Coordination & incentives (76-80)
  - Preparedness vs reaction (81-85)
  - Neutrality, restraint, scope (86-90)
  - Meta-institutional observations (91-95)
  - Closing reflections (96-100)

**Integration strategy:**

- Daily cron posts ONE pre-approved post (sequential order)
- Track which posts have been used in JSON
- Mark as posted with date/tweet_id
- Reset counter after 100 (or create variation system)

---

## Prompts to Update

### Priority 1: Core Content Generation

**Prompt #1 (Generating Post Ideas)**

- OLD: "Generate 10 engaging thread ideas on AI alignment and safety..."
- NEW: Should NOT generate ideas - use pre-approved posts instead
- **Action:** Deprecate OR repurpose for rare custom content (special events)

**Prompt #13 (Daily Trends)**

- OLD: "Search and summarize today..."
- NEW: Focus on governance/coordination news, institutional developments
- Keep search enabled, but filter for governance topics only
- **Action:** Rewrite to focus on institutional AI governance developments

**Prompt #18 (Performance Feedback)**

- OLD: "Based on last week..."
- NEW: Focus on message clarity and institutional positioning
- Less about engagement metrics, more about message alignment
- **Action:** Rewrite to emphasize institutional credibility vs. virality

### Priority 2: Engagement Strategy

**Prompt #4 (General Reply Starters)**

- OLD: "Craft 15 versatile reply templates..."
- NEW: Institutional commentary, not promotional replies
- Focus: Adding governance perspective to ongoing discussions
- **Action:** Rewrite for calm, institutional commentary templates

**Prompt #15 (Reply Automation)**

- OLD: "Generate a batch of 20 automated reply prompts..."
- NEW: Should align with institutional tone
- Avoid hype, avoid claims, avoid selling
- **Action:** Rewrite with restraint and credibility focus

**Decision Engine (twitter-discovery/decision-engine.js)**

- Currently: "AGI safety, alignment, existential risk management"
- NEW: "AI governance, coordination, institutional legitimacy"
- **Action:** Update inline prompt to reflect governance-first mission

### Priority 3: Deprecate/Remove

**Remove these prompts (not aligned with new identity):**

- Prompt #2: "Advanced Post Ideas with Visuals" (product-focused)
- Prompt #11: "Virality Optimization" (hype-driven, against restraint principle)
- Prompt #12: "Collaboration Ideas" (premature for institutional formation phase)
- Prompt #16: "Scheduling Content" (use pre-approved posts instead)
- Prompt #19: "Long-Term Scaling" (growth metrics, not institutional legitimacy)

**Keep but deprioritize:**

- Prompt #7: "Identifying Key Accounts" (useful for research, not engagement)
- Prompt #8: "Community Mapping" (useful for understanding landscape)
- Prompt #17: "Analytics Review" (useful for operational tracking)

---

## Implementation Steps

### Step 1: Update Decision Engine ✅

```javascript
// File: scripts/alygn/twitter-discovery/decision-engine.js
// Line ~38: Update evaluatePost() prompt

OLD:
"You are @aialygn, ALYGN's Twitter account focused on AGI safety, alignment, and existential risk management."

NEW:
"You are @aialygn, ALYGN's official account. ALYGN is an independent AI governance institution focused on coordination, legitimacy, and preparedness.

Core principles:
- Governance-first, not technology-first
- Institutional restraint and neutrality
- Coordination infrastructure, not control
- Pre-crisis preparation, not reactive regulation

Tone: Calm, institutional, restrained, non-promotional."
```

### Step 2: Create Pre-Approved Post Integration Script ✅

```javascript
// File: scripts/alygn/post-pre-approved.js
// Purpose: Post next sequential pre-approved post
// Updates tracking JSON with posted status
```

### Step 3: Update Notion Twitter Prompts Page

- Log into Notion
- Navigate to "Twitter/X Growth Strategy" page
- Mark deprecated prompts with ❌
- Rewrite Priority 1 & 2 prompts
- Add new prompt: "Post Pre-Approved Content"

### Step 4: Update Cron Jobs

- Modify daily 11 AM cron to use pre-approved posts
- Keep discovery system (reactive engagement) as-is
- Update VC outreach messaging (separate task)

### Step 5: Update MEMORY.md ✅

- Document new Alygn identity
- Link to context update documents
- Archive old messaging approach

---

## New Prompt Templates

### Template: Institutional Commentary Reply

```
You are @aialygn, ALYGN's official account. ALYGN is an independent AI governance institution.

Mission: Support coordination across AI developers, operators, and public institutions without centralizing control or asserting authority.

Given this post: [POST_CONTENT]

Write a brief, institutional commentary (1-2 sentences) that:
- Adds governance perspective (not technical analysis)
- Maintains calm, restrained tone
- Avoids claims of authority or control
- Focuses on coordination, legitimacy, or preparedness themes

Preferred language:
- "Supports coordination" / "Enables accountability"
- "Neutral infrastructure" / "Independent review"

Avoid:
- "Ensures compliance" / "Regulates" / "Controls"
- Hype, numbers, promotional language
- Claims about what ALYGN "will" do

Output: Single reply text (under 280 characters)
```

### Template: Daily Trends (Governance Focus)

```
You are researching for @aialygn, ALYGN's official account.

ALYGN is an independent AI governance institution focused on coordination, legitimacy, and preparedness for advanced AI systems at global scale.

Search for recent developments (last 24-48h) in:
- AI governance discussions (policy, regulation, coordination)
- Institutional AI safety developments
- Cross-organization AI coordination efforts
- Emergency preparedness for AI incidents
- AI legitimacy and trust discussions

Filter OUT:
- Pure technical AI research (unless governance implications)
- Product launches, funding announcements (unless governance relevant)
- Hype-driven AI news

Output format:
1. **Topic:** [brief title]
   **Summary:** [2-3 sentences]
   **Governance angle:** [why this matters for coordination/legitimacy]
   **Source:** [URL]

Limit: Top 5 most governance-relevant items
```

---

## Testing Checklist

- [ ] Update decision-engine.js prompt
- [ ] Create post-pre-approved.js script
- [ ] Test posting pre-approved post #1
- [ ] Verify tracking JSON updates correctly
- [ ] Update Notion prompts (Priority 1 first)
- [ ] Test Prompt #13 (Daily Trends) with new governance focus
- [ ] Update cron job to use pre-approved posts
- [ ] Verify end-to-end workflow (discovery → decision → execution)
- [ ] Update MEMORY.md with new context ✅
- [ ] Document all changes in daily memory file

---

## Success Criteria

1. **Tone alignment:** All automated content reflects institutional restraint
2. **Pre-approved posts:** Sequential posting system working correctly
3. **Discovery system:** Evaluates posts through governance lens (not just AI safety)
4. **No hype:** Zero promotional language, no claims of authority
5. **Credibility:** Content reads like institutional thought leadership

---

_Created: 2026-02-10 by Wobblus_
_Status: DRAFT - Awaiting approval before implementation_
