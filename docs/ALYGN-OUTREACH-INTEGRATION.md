# Alygn Outreach System Integration Plan

> *Documenting the separation of concerns: Four distinct lobster files for VC, Municipal, X-Warmup, and X-Growth*

> **Last Updated:** 2026-03-24
> **Version:** 2.0 (Major: Separated concerns)
> **Status:** Implementation Phase

---

## ⚠️ CRITICAL: Separation of Concerns

### Why Separation Was Required

The original `alygn-campaign.lobster` mixed **VC outreach** and **Municipal outreach** in a single file. This created several problems:

1. **Different Databases**: VC uses Notion; Municipal uses Supabase
2. **Different Caution Levels**: Government accounts require more careful handling than VC firms
3. **Different Phases**: Municipal needs X-warmup prelude; VC goes direct to email
4. **Different Rates**: 3 VC emails/day vs 5 Municipal emails/day
5. **Different Handoff Patterns**: Municipal has X-warmup → Email pipeline; VC is standalone

### The Four Lobster Architecture

| File | Purpose | Database | Rate | Target |
|------|---------|----------|------|--------|
| `alygn-vc-outreach.lobster` | VC firm outreach | Notion | 3/day | Global VCs |
| `muni-outreach.lobster` | Municipal email | Supabase | 5/day | Costa Rica 82 cantones |
| `x-warmup.lobster` | Pre-email engagement | Supabase | 15 follows/day, 5 quotes/day | Municipal X accounts |
| `x-growth-daily.lobster` | Brand account growth | N/A | Platform limits | @aialygn account |

---

## Table of Contents

1. [Critical: Separation of Concerns](#%EF%B8%8F-critical-separation-of-concerns)
2. [Executive Summary](#executive-summary)
3. [System Architecture](#system-architecture)
4. [Lobster File Relationships](#lobster-file-relationships)
5. [Data Flow](#data-flow)
6. [Tone/Voice Matrix](#tonevoice-matrix)
7. [Rate Limits Reference](#rate-limits-reference)
8. [Fallback Procedures](#fallback-procedures)
9. [Success Metrics](#success-metrics)
10. [Migration Notes](#migration-notes)

---

## Executive Summary

### Three-Pronged Approach

The Alygn Outreach System implements a coordinated, multi-channel engagement strategy designed to warm up relationships before direct outreach. The system operates across three interconnected tracks:

| Track | Purpose | Target |
|-------|---------|--------|
| **X Warm-up** | Build familiarity before email | Municipal officials (Costa Rica) |
| **Email Outreach** | Direct value proposition | Municipal + VC targets |
| **VC Outreach** | Investor relationship building | Global VC firms |
| **X Growth** | Brand presence & thought leadership | Alygn brand account |

### Unified Skill Architecture

All outreach activities leverage a unified `alygn-vc-outreach` skill architecture that provides:

- **Consistent data management** across Supabase and Notion
- **Shared personalization engine** (Grok-powered research)
- **Centralized tracking** via Discord approvals and notifications
- **Modular phase-based execution** via Lobster files

### Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                     ALYGN OUTREACH SYSTEM                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Data Layer        Execution Layer       Notification      │
│   ───────────       ──────────────       ────────────       │
│   • Supabase        • Lobster files     • Discord           │
│   • Notion          • x-growth CLI      • SentEmailTracker  │
│   • SentEmailTracker                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Each component handles its domain:
- **Data Layer**: Stores contact info, statuses, and tracking data
- **Execution Layer**: Runs outreach phases and engagement logic
- **Notification Layer**: Manages approvals, alerts, and deduplication

---

## System Architecture

### The Four Lobster Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     ALYGN OUTREACH SYSTEM v2.0                           │
│                  (Separated Concerns - Four Lobsters)                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    MUNICIPAL OUTREACH                          │    │
│  │              Costa Rica 82 Cantones Pipeline                 │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                 │    │
│  │  ┌─────────────────┐        ┌─────────────────┐                │    │
│  │  │   X-Warmup      │        │   Municipal     │                │    │
│  │  │   Lobster       │───────▶│   Outreach      │                │    │
│  │  │                 │Handoff   │   Lobster       │                │    │
│  │  │ • Discovery     │        │                 │                │    │
│  │  │ • Follow        │        │ • Research      │                │    │
│  │  │ • Wait          │        │ • Validate      │                │    │
│  │  │ • Quote         │        │ • Personalize   │                │    │
│  │  │ • Handoff       │        │ • Review        │                │    │
│  │  └─────────────────┘        │ • Send          │                │    │
│  │                             │ • Verify        │                │    │
│  │                             └─────────────────┘                │    │
│  │                                         │                    │    │
│  │                              Supabase DB │                    │    │
│  │  ┌─────────────────────────────────────────┘                    │    │
│  │  │                                                               │    │
│  │  │  • 82 cantones data                                           │    │
│  │  │  • Warm-up status (warmed/quoted/ready_for_email)             │    │
│  │  │  • Sent email tracking                                        │    │
│  │  │  • Rate limit counters                                        │    │
│  │  └───────────────────────────────────────────────────────────────┘    │
│  │                                                                      │
│  │  ⚠️ 5 emails/day max                                                 │
│  │  ⚠️ More cautious (government accounts)                              │
│  │                                                                      │
│  └──────────────────────────────────────────────────────────────────────┘
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    VC OUTREACH (STANDALONE)                     │    │
│  │               Global VC Firms Pipeline                          │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────────┐│    │
│  │  │                alygn-vc-outreach.lobster                    ││    │
│  │  │                                                             ││    │
│  │  │  Phase 0: Discovery (Crunchbase)                             ││    │
│  │  │       ↓                                                     ││    │
│  │  │  Phase 1: Research (find emails)                             ││    │
│  │  │       ↓                                                     ││    │
│  │  │  Phase 2: Draft (personalized with Grok)                   ││    │
│  │  │       ↓                                                     ││    │
│  │  │  Phase 3: Review (Discord approval)                         ││    │
│  │  │       ↓                                                     ││    │
│  │  │  Phase 4: Send (CC support@alygn.fund)                    ││    │
│  │  │       ↓                                                     ││    │
│  │  │  Phases 5-7: Follow-ups                                    ││    │
│  │  │                                                             ││    │
│  │  └─────────────────────────────────────────────────────────────┘│    │
│  │                             │                                    │    │
│  │                        Notion DB │                              │    │
│  │  ┌──────────────────────────────┘                               │    │
│  │  │                                                               │    │
│  │  │  • 100+ VC contacts                                           │    │
│  │  │  • Phase tracking per contact                                   │    │
│  │  │  • Draft status and personalization                           │    │
│  │  │  • Meeting notes                                                │    │
│  │  └───────────────────────────────────────────────────────────────┘    │
│  │                                                                      │
│  │  ⚠️ 3 emails/day max                                                 │
│  │  ⚠️ No X-warmup needed (direct email OK)                            │    │
│  │                                                                      │
│  └──────────────────────────────────────────────────────────────────────┘
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   X GROWTH (STANDALONE)                        │    │
│  │                 @aialygn Brand Account                         │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────────┐│    │
│  │  │               x-growth-daily.lobster                      ││    │
│  │  │                                                             ││    │
│  │  │  • Content discovery (relevant topics)                    ││    │
│  │  │  • Content scheduling                                       ││    │
│  │  │  • Engagement with community                                ││    │
│  │  │  • Follower growth tracking                               ││    │
│  │  │                                                             ││    │
│  │  │  📌 NO DEPENDENCIES ON OTHER LOBSTERS                       ││    │
│  │  │  📌 Independent execution                                   ││    │
│  │  │  📌 Brand presence only                                     ││    │
│  │  └─────────────────────────────────────────────────────────────┘│    │
│  │                                                                      │
│  └──────────────────────────────────────────────────────────────────────┘
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Architecture Principles

1. **Phased Execution**: Each outreach track follows a defined phase progression with clear entry/exit criteria
2. **Data Consistency**: Single sources of truth for contact data (Supabase for municipal, Notion for VC)
3. **Rate Limit Compliance**: Built-in throttling prevents API abuse and account restrictions
4. **Human-in-the-Loop**: Critical actions (email sending) require Discord approval
5. **Failure Isolation**: Errors in one track don't cascade to others

---

## Lobster File Relationships

### File Dependency Graph (v2.0 - Separated)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SEPARATED LOBSTER ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         MUNICIPAL PIPELINE                              │
│                                                                         │
│   x-growth (discovery skill)                                            │
│        │                                                                │
│        ▼                                                                │
│   ┌───────────────────────────┐         ┌──────────────────────────┐ │
│   │   x-warmup.lobster        │         │   Supabase DB            │ │
│   │   ──────────────────      │◀───────▶│   ────────────           │ │
│   │   Phase 1: Discovery      │         │   • 82 cantones data     │ │
│   │   Phase 2: Follow         │         │   • Warm-up status       │ │
│   │   Phase 3: Wait           │         │   • ready_for_email      │ │
│   │   Phase 4: Quote          │         │   • Engagement metrics  │ │
│   │   Phase 5: Handoff        │────────▶│                          │ │
│   └───────────────────────────┘         └──────────────────────────┘ │
│              │                                        │                 │
│              │ "ready_for_email"                      │                 │
│              │ status trigger                        │                 │
│              ▼                                        │                 │
│   ┌───────────────────────────┐                       │                 │
│   │  muni-outreach.lobster    │                       │                 │
│   │  ─────────────────────    │                       │                 │
│   │  Phase 0: x-growth Scout  │ (discovery phase)      │                 │
│   │  Phase 1: Research        │                       │                 │
│   │  Phase 2: Validate          │                       │                 │
│   │  Phase 3: Personalize     │                       │                 │
│   │  Phase 4: Review          │                       │                 │
│   │  Phase 5: Send            │                       │                 │
│   │  Phase 6: Verify          │                       │                 │
│   └───────────────────────────┘                       │                 │
│              │                                         │                 │
│              │ Updates Supabase                        │                 │
│              ▼                                         │                 │
│   ┌───────────────────────────┐                       │                 │
│   │   SentEmailTracker        │                       │                 │
│   │   (global dedupe)         │                       │                 │
│   └───────────────────────────┘                       │                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           VC PIPELINE                                   │
│                                                                         │
│   ┌───────────────────────────┐         ┌──────────────────────────┐ │
│   │  alygn-vc-outreach.lobster│         │   Notion DB              │ │
│   │  ─────────────────────────│◀───────▶│   ───────────            │ │
│   │  Phase 0: Discovery       │         │   • VC contacts          │ │
│   │  Phase 1: Research        │         │   • Phase tracking       │ │
│   │  Phase 2: Draft           │         │   • Draft status         │ │
│   │  Phase 3: Approval        │         │   • Meeting notes        │ │
│   │  Phase 4: Send            │         │                          │ │
│   │  Phase 5: First F/U     │         │   ⚠️ SEPARATE DB         │ │
│   │  Phase 6: Second F/U    │         │      from Municipal      │ │
│   │  Phase 7: Final F/U     │         │                          │ │
│   └───────────────────────────┘         └──────────────────────────┘ │
│              │                                                          │
│              │ Uses SentEmailTracker                                    │
│              ▼                                                          │
│   ┌───────────────────────────┐                                         │
│   │   SentEmailTracker        │                                         │
│   │   (global dedupe)         │                                         │
│   └───────────────────────────┘                                         │
│                                                                         │
│   ⚠️ NO DEPENDENCIES ON MUNICIPAL OR X-WARMUP                          │
│   ⚠️ STANDALONE EXECUTION                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         X GROWTH PIPELINE                               │
│                                                                         │
│   ┌───────────────────────────┐                                         │
│   │  x-growth-daily.lobster   │                                         │
│   │  ─────────────────────    │                                         │
│   │  • Discovery            │                                         │
│   │  • Content creation     │                                         │
│   │  • Engagement           │                                         │
│   │  • Follower growth      │                                         │
│   └───────────────────────────┘                                         │
│                                                                         │
│   ⚠️ STANDALONE - No dependencies                                       │
│   ⚠️ Targets: @aialygn brand account                                    │
│   ⚠️ No interaction with other pipelines                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Relationship Details

#### x-warmup.lobster (Municipal Pre-Engagement)
| Aspect | Description |
|--------|-------------|
| **Purpose** | Warm up municipal officials via X engagement BEFORE email outreach |
| **Target** | Costa Rica municipal officials (from 82 cantones) |
| **Database** | Supabase |
| **Phases** | Discovery → Follow → Wait → Quote → Handoff |
| **Prelude** | `x-growth` discovery phase finds officials, outputs to `/tmp/x-growth-discovery.json` |
| **Outputs** | Updates Supabase with `ready_for_email` status |
| **Handoff** | Triggers `muni-outreach.lobster` when status = `ready_for_email` |
| **Rate Limits** | 15 follows/day, 5 quotes/day |
| **Note** | ⚠️ **MORE CAUTIOUS** - Government accounts need careful handling |

#### muni-outreach.lobster (Municipal Email Outreach)
| Aspect | Description |
|--------|-------------|
| **Purpose** | Execute email outreach to warmed-up municipal contacts |
| **Target** | Costa Rica 82 cantones (post X-warmup) |
| **Database** | Supabase |
| **Phases** | Scout → Research → Validate → Personalize → Review → Send → Verify |
| **Inputs** | Supabase contacts with `ready_for_email` status |
| **Uses** | SentEmailTracker for global deduplication |
| **Approval** | Discord notification for human review before sending |
| **Rate Limits** | 5 sends/day |
| **Focus** | TRAIGA Act implementation |
| **Note** | ⚠️ **REQUIRES X-WARMUP FIRST** - Never email without warming |

#### alygn-vc-outreach.lobster (VC Email Outreach)
| Aspect | Description |
|--------|-------------|
| **Purpose** | Execute VC firm email campaigns |
| **Target** | Global VC firms |
| **Database** | Notion |
| **Phases** | Discover → Research → Validate → Personalize → Review → Send → Verify |
| **Inputs** | Notion VC database |
| **Uses** | SentEmailTracker for global deduplication |
| **Approval** | Discord notification for human review before sending |
| **Rate Limits** | 3 sends/day |
| **Focus** | AI governance infrastructure |
| **Note** | ⚠️ **STANDALONE** - No X-warmup needed for VC outreach |

#### x-growth-daily.lobster (Brand Account Growth)
| Aspect | Description |
|--------|-------------|
| **Purpose** | Grow Alygn brand presence on X |
| **Mode** | Standalone execution, no dependencies |
| **Target** | @aialygn account growth |
| **Activities** | Content creation, engagement, follower growth |
| **Schedule** | Daily execution |
| **Note** | ⚠️ **COMPLETELY INDEPENDENT** - Not linked to other pipelines |

---

## Data Flow

### Data Stores Overview

| Store | Purpose | Contains |
|-------|---------|----------|
| **Supabase** | Municipal outreach data | 82 cantones, warm-up status, email tracking |
| **Notion** | VC outreach data | 100+ VC contacts, phase tracking, draft status |
| **SentEmailTracker** | Global deduplication | All sent emails across all campaigns |
| **Discord** | Approvals & notifications | Review requests, alerts, status updates |

### Municipal Data Flow (Supabase) - SEPARATED

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Import     │────▶│   Process    │────▶│   Store      │
│  82 cantones │     │  Normalize   │     │  Supabase    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 │
┌────────────────────────────────────────────────┼────────────────────────┐
│                                                │                        │
│  ┌──────────────────┐     ┌──────────────────┐│     ┌──────────────────┐│
│  │ x-warmup.lobster │────▶│   Status Update  │├────▶│ ready_for_email  ││
│  │ ──────────────── │     │   ─────────────  ││     │   ────────────   ││
│  │ • Phase 1        │     │ • warmed         ││     │ • eligible for   ││
│  │ • Phase 2        │     │ • quoted         ││     │   email outreach ││
│  │ • Phase 3        │     │ • ready_for_email││     │                  ││
│  │ • Phase 4        │     │                  ││     │                  ││
│  │ • Phase 5        │     │                  ││     │                  ││
│  └──────────────────┘     └──────────────────┘│     └──────────────────┘│
│              │                                 │              │         │
│              │ "ready_for_email"               │              │         │
│              │ triggers handoff                │              │         │
│              ▼                                 │              │         │
│  ┌───────────────────────────┐                 │              │         │
│  │  muni-outreach.lobster    │                 │              │         │
│  │  ─────────────────────    │─────────────────┘              │         │
│  │  • Query ready_for_email  │                                │         │
│  │  • Scout (x-growth)       │                                │         │
│  │  • Research               │                                │         │
│  │  • Validate               │                                │         │
│  │  • Personalize            │                                │         │
│  │  • Review                 │                                │         │
│  │  • Send                   │                                │         │
│  │  • Verify                 │                                │         │
│  └───────────────────────────┘                                │         │
│              │                                                │         │
│              │ Uses SentEmailTracker                          │         │
│              ▼                                                │         │
│  ┌───────────────────────────┐                                │         │
│  │   SentEmailTracker        │                                │         │
│  │   (global dedupe)         │                                │         │
│  └───────────────────────────┘                                │         │
│                                                                          │
│  ⚠️ SEPARATE from VC pipeline                                          │
│  ⚠️ Only reads Supabase (Notion untouched)                             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### VC Data Flow (Notion)

```
┌────────────────────────────────────────────────────────────────────┐
│                        NOTION DATABASE                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │   Phase 0   │  │   Phase 1   │  │   Phase 2   │  │ Phase 3  │ │
│  │  Discovery  │─▶│   Research  │─▶│   Drafting  │─▶│ Approval │ │
│  │  ─────────  │  │  ─────────  │  │  ─────────  │  │ ──────── │ │
│  │ • Crunchbase│  │• Find emails │  │• Grok pers. │  │• Discord │ │
│  │ • LinkedIn  │  │• Hunter.io  │  │• Template   │  │  review  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────┬─────┘ │
│                                                         │        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │        │
│  │  Phase 7    │  │  Phase 6    │  │  Phase 5    │◀────┘        │
│  │  Final F/U  │◀─│  2nd F/U    │◀─│  1st F/U    │               │
│  │  ─────────  │  │  ─────────  │  │  ─────────  │               │
│  │ • Close out │  │ • Send      │  │ • Send      │               │
│  │ • Archive   │  │ • Track     │  │ • Track     │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                    │
│  Phase 4: Send ◀───────────────────────────────────────────────────┤
│  ────────────                                                      │
│  • CC support@alygn.fund                                         │
│  • Rate limit: 3/day                                               │
│  • SentEmailTracker dedupe                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Global Deduplication (SentEmailTracker)

```
┌─────────────────────────────────────────────────────────┐
│              SentEmailTracker (Global)                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Purpose: Prevent duplicate emails across ALL campaigns │
│                                                         │
│  Checks before sending:                                 │
│  • Has this email been sent to this recipient?          │
│  • Was it sent from any campaign?                       │
│  • Is it within the cooldown period?                    │
│                                                         │
│  Data stored:                                           │
│  • recipient_email                                      │
│  • campaign_type (municipal | vc)                       │
│  • sent_timestamp                                       │
│  • message_id                                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Tone/Voice Matrix

Each outreach channel maintains a distinct voice optimized for its audience and context.

### Voice Guidelines by Channel

| Channel | Tone | Keywords | Examples |
|---------|------|----------|----------|
| **X Warm-up** | Institutional, collaborative | coordination, partnership, municipal innovation | *"coordination, not control"* |
| **VC Email** | Restrained, confident | trust, scale, fundamentals, sustainable | *"Trust is harder to scale than technology"* |
| **Municipal** | Supportive, implementation-focused | TRAIGA Act, resources, transparency, constituent | *"Free tools to comply with the TRAIGA Act"* |
| **X Growth** | Professional, thought leadership | digital governance, public sector innovation | *"The future of municipal transparency"* |

### Tone Application

#### X Warm-up (Municipal Officials)
```
Context: Building familiarity before email outreach
Approach: Engage as peer, show interest in their work
Examples:
✓ "Important work on municipal transparency. The TRAIGA Act implementation affects many cantones."
✓ "Coordination across municipalities could accelerate compliance timelines."
✗ "Buy our product!" (too salesy)
✗ "You need help with..." (presumptuous)

Goal: Recognition when email arrives → "Oh, I've seen them on X"
```

#### VC Email
```
Context: Cold outreach to investors
Approach: Restrained confidence, focus on traction
Examples:
✓ "We've built something that works. The question is scale."
✓ "Trust is harder to scale than technology. We're solving both."
✗ "We're the next unicorn!" (hype)
✗ "Please invest in us..." (desperate)

Goal: Pique interest for a conversation, not a check
```

#### Municipal Email
```
Context: Post-warmup outreach about TRAIGA Act
Approach: Supportive implementation partner
Examples:
✓ "We built these tools for cantones implementing the TRAIGA Act."
✓ "Free resources for municipal transparency compliance."
✗ "Revolutionary blockchain solution!" (jargon)
✗ "You must comply by..." (threatening)

Goal: Position as helpful resource, not vendor
```

#### X Growth (Alygn Account)
```
Context: Brand building and thought leadership
Approach: Professional insights on public sector innovation
Examples:
✓ "Municipal transparency isn't just compliance—it's constituent trust."
✓ "The cantones leading on digital governance share one trait..."
✗ "Check out our product!" (promotional)
✗ "Hot take: government is broken" (provocative)

Goal: Establish Alygn as expert voice in municipal innovation
```

---

## Rate Limits Reference

### Rate Limits by Lobster

| Lobster | Action | Daily Limit | Notes |
|---------|--------|-------------|-------|
| **x-warmup.lobster** | Follows | 15 accounts | Municipal officials only |
| **x-warmup.lobster** | Quote Tweets | 5 quotes | Build familiarity before email |
| **x-warmup.lobster** | Likes | ~100 | Soft limit, monitor for warnings |
| **muni-outreach.lobster** | Email Sends | 5/day | Post-warmup contacts only |
| **alygn-vc-outreach.lobster** | Email Sends | 3/day | Quality over quantity for VCs |
| **x-growth-daily.lobster** | X API | Platform limits | Brand account actions |

### Combined Daily Caps (v2.0 - Separated)

```
┌─────────────────────────────────────────────────────────┐
│              SEPARATED LOBSTER RATE LIMITS              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  X-Warmup (x-warmup.lobster):                          │
│  ├── Follows:       ████████████████░░░░  15/15        │
│  ├── Quotes:        █████░░░░░░░░░░░░░░░   5/5         │
│  └── Likes:         ░░░░░░░░░░░░░░░░░░░░  ~100        │
│                                                         │
│  Municipal Email (muni-outreach.lobster):              │
│  └── Sends:         █████░░░░░░░░░░░░░░░░░   5/5        │
│      (Requires X-warmup first!)                       │
│                                                         │
│  VC Email (alygn-vc-outreach.lobster):                 │
│  └── Sends:         ███░░░░░░░░░░░░░░░░░    3/3        │
│      (Standalone - no warmup needed)                    │
│                                                         │
│  TOTAL EMAILS (separate counters):                     │
│  ├── Municipal: 5 max/day                               │
│  └── VC:        3 max/day                               │
│                                                         │
│  ⚠️ Each lobster has its own rate limit tracking       │
│  ⚠️ No cross-contamination between pipelines           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Rate Limit Isolation

**Critical Rule:** Each lobster maintains its own rate limit counters:

- **x-warmup.lobster** → Supabase table: `x_rate_limits`
- **muni-outreach.lobster** → Supabase table: `email_rate_limits` (municipal)
- **alygn-vc-outreach.lobster** → Notion field: `daily_send_count`
- **x-growth-daily.lobster** → Platform API rate limits

This separation ensures:
- Hitting municipal email limits doesn't block VC sends
- X-warmup actions don't consume email quota
- Brand growth doesn't interfere with outreach

---

## Fallback Procedures

### Failure Scenarios and Responses

#### Scenario 1: Lobster Execution Failure

| Condition | Response |
|-----------|----------|
| **Trigger** | Lobster file fails to execute or crashes |
| **Immediate** | Log error to Discord with stack trace |
| **Fallback** | Execute manual script: `scripts/manual-[campaign].sh` |
| **Recovery** | Fix lobster bug, resume automated execution |

```bash
# Manual fallback script structure
#!/bin/bash
# scripts/manual-x-warmup.sh
# Usage: Run when x-warmup.lobster fails

echo "Running manual X warm-up fallback..."
# 1. Load pending contacts from Supabase
# 2. Execute x-growth CLI commands manually
# 3. Update statuses in Supabase
# 4. Log actions to Discord
```

#### Scenario 2: X API Failure

| Condition | Response |
|-----------|----------|
| **Trigger** | X API returns error (429, 5xx, auth failure) |
| **Immediate** | Pause execution, log error |
| **Backoff** | Wait 15 min, retry with exponential backoff |
| **Notify** | Discord alert: "X API issue, auto-retrying" |
| **Escalate** | After 3 failures, require manual intervention |

```
Backoff Schedule:
Attempt 1: Immediate
Attempt 2: 15 minutes
Attempt 3: 45 minutes
Attempt 4: 2 hours
Attempt 5+: Manual review required
```

#### Scenario 3: Email Bounce/Invalid Address

| Condition | Response |
|-----------|----------|
| **Trigger** | Email bounces (hard or soft) |
| **Action** | Mark address as `invalid` in source database |
| **Research** | Trigger email research workflow |
| **Alternative** | Look for alternative contact methods |
| **Notify** | Update campaign status in Discord |

```
Bounce Types:
• Hard bounce (permanent) → Mark invalid, stop sending
• Soft bounce (temporary) → Retry 2x, then mark invalid
• Block (spam filter) → Review content, adjust if needed
```

#### Scenario 4: Discord Notification Failure

| Condition | Response |
|-----------|----------|
| **Trigger** | Discord webhook fails |
| **Fallback** | Log to local file + console |
| **Retry** | Queue notifications for retry |
| **Critical** | For approval requests, pause until notification succeeds |

#### Scenario 5: Database Connection Failure

| Condition | Response |
|-----------|----------|
| **Trigger** | Supabase/Notion API unreachable |
| **Immediate** | Pause all outbound activities |
| **Retry** | Attempt reconnection every 5 minutes |
| **Fallback** | Cache pending operations locally |
| **Resume** | Replay cached operations on reconnection |

---

## Success Metrics

### Metric Categories

```
┌─────────────────────────────────────────────────────────┐
│              OUTREACH SUCCESS METRICS                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │   WARM-UP METRICS │  │   EMAIL METRICS   │          │
│  │   ──────────────  │  │   ──────────────  │          │
│  │  • Warmth score    │  │  • Open rate       │          │
│  │  • Follow-back rate│  │  • Reply rate      │          │
│  │  • Engagement rate │  │  • Meeting rate    │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │     VC METRICS    │  │   X GROWTH METRICS│          │
│  │    ────────────   │  │   ──────────────  │          │
│  │  • Meeting conv.   │  │  • Follower growth │          │
│  │  • Pipeline value  │  │  • Engagement rate │          │
│  │  • Response quality│  │  • Impressions     │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Detailed Metrics

#### Warm-up Metrics (Municipal)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Warmth Score** | > 0.6 | Composite: (follow-back + engagement + reply) / total actions |
| **Follow-back Rate** | > 20% | Municipal officials who follow back |
| **Quote Engagement** | > 10% | Quote tweets that receive likes/replies |
| **Email Readiness** | 100% | Contacts marked `ready_for_email` |

**Warmth Score Formula:**
```
warmth_score = (
  (follow_backs / total_follows) * 0.4 +
  (quote_engagements / total_quotes) * 0.4 +
  (replies_received / total_replies) * 0.2
)

Target: > 0.6 indicates warm relationship
```

#### Email Metrics

| Metric | Municipal Target | VC Target | Measurement |
|--------|------------------|-----------|-------------|
| **Open Rate** | > 40% | > 50% | Email tracking pixels |
| **Reply Rate** | > 15% | > 10% | Direct responses |
| **Meeting Rate** | N/A | > 5% | Calls scheduled |
| **Unsubscribe** | < 2% | N/A | Opt-outs |

#### VC-Specific Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **Meeting Conversion** | > 5% | Emails that result in meetings |
| **Pipeline Generated** | Track | Potential investment value |
| **Response Quality** | Score 1-5 | Relevance of responses |
| **Time to Response** | < 7 days | Days until first reply |

#### X Growth Metrics

| Metric | Target | Frequency |
|--------|--------|-----------|
| **Follower Growth** | +10%/month | Monthly tracking |
| **Engagement Rate** | > 3% | (likes + replies + RT) / impressions |
| **Impressions** | Track | Weekly reporting |
| **Click-through** | Track | Bio link clicks |

### Reporting Schedule

| Report | Frequency | Audience | Channel |
|--------|-----------|----------|---------|
| **Warm-up Status** | Daily | Internal | Discord |
| **Campaign Progress** | Weekly | Internal | Notion + Discord |
| **VC Pipeline** | Weekly | Leadership | Notion |
| **Full Metrics** | Monthly | Stakeholders | Document |

---

## Appendix

### Quick Reference: File Locations

```
$HOME/.openclaw/workspace/
├── skills/alygn-vc-outreach/
│   ├── SKILL.md
│   └── scripts/
│       ├── x-warmup.lobster
│       ├── alygn-campaign.lobster
│       └── x-growth-daily.lobster
├── docs/
│   └── ALYGN-OUTREACH-INTEGRATION.md (this file)
└── data/
    ├── supabase/ (municipal contacts)
    └── notion/ (VC contacts)
```

### Quick Reference: Commands

```bash
# Check warm-up status
alygn-vc-outreach status --municipal

# Check VC campaign status
alygn-vc-outreach status --vc

# Manual warm-up execution (fallback)
alygn-vc-outreach warmup --manual

# Campaign approval review
alygn-vc-outreach review --pending

# Generate metrics report
alygn-vc-outreach report --weekly
```

### Contact Escalation

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| **Lobster bugs** | Wobblus (Agent Lead) | 24 hours |
| **X API issues** | Andler | 4 hours |
| **Email deliverability** | Andler | 2 hours |
| **Content approval** | Andler | 1 hour |
| **Rate limit concerns** | Wobblus | 24 hours |

---

## Migration Notes

### From v1.0 (Mixed) to v2.0 (Separated)

#### What Changed

| Aspect | v1.0 (Old) | v2.0 (New) |
|--------|------------|------------|
| **VC + Municipal** | Combined in `alygn-campaign.lobster` | **Separated into two files** |
| **File Name** | `alygn-campaign.lobster` | `alygn-vc-outreach.lobster` (VC)<br>`muni-outreach.lobster` (Municipal) |
| **Database** | Both read Supabase + Notion | **Each reads only its DB** |
| **Rate Tracking** | Shared counters | **Separate counters per file** |
| **Phase Logic** | Conditional branching | **Single purpose per file** |

#### Migration Checklist

- [ ] Rename `alygn-campaign.lobster` → `alygn-vc-outreach.lobster`
- [ ] Remove municipal logic from VC file
- [ ] Create new `muni-outreach.lobster` for municipal only
- [ ] Update Supabase schema for `ready_for_email` handoff
- [ ] Verify x-warmup.lobster triggers muni-outreach correctly
- [ ] Test rate limit isolation (municipal hits shouldn't block VC)
- [ ] Update cron jobs to call correct files
- [ ] Verify Discord notifications include correct file names

#### Backwards Compatibility

⚠️ **Breaking Change:** Old references to `alygn-campaign.lobster` will fail.

Update any:
- Cron jobs
- Manual execution commands
- Documentation references
- Agent task prompts

---

## Document Information

| Attribute | Value |
|-----------|-------|
| **Version** | 2.0 |
| **Last Updated** | 2026-03-24 |
| **Owner** | Talanara (Documentation) |
| **Review Cycle** | Monthly |
| **Next Review** | 2025-04-24 |

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-03-24 | **MAJOR**: Separated VC and Municipal into distinct lobster files. Updated architecture diagrams, rate limits, and migration notes. |
| 1.0 | 2025-03-23 | Initial unified architecture documentation |

---

*Document compiled by Talanara 📝 | Knowledge synthesis complete*
