---
name: alygn-vc-outreach
description: VC outreach sub-skill for Alygn. Delegates execution to alygn-outreach parent skill with --type=vc configuration. Handles VC-specific edge cases, decision thresholds, and personalization.
metadata:
  openclaw:
    emoji: "💼"
    parent_skill: alygn-outreach
    skill_type: sub-skill
    entity_type: vc
    requires:
      bins: [node, bun, bash]
      env:
        - X_API_KEY
        - X_API_SECRET
        - X_ACCESS_TOKEN
        - X_ACCESS_SECRET
        - GROK_API_KEY
        - SUPABASE_URL
        - SUPABASE_SERVICE_KEY
        - PERPLEXITY_API_KEY
        - BRAVE_API_KEY
        - ZEROBOUNCE_API_KEY
        - SMARTLEAD_API_KEY
        - SMTP_SERVER
        - SMTP_PORT
        - SMTP_USER
        - SMTP_PASS
        - NOTION_KEY
        - NOTION_VC_DB_ID
      os: [linux, darwin]
    delegates_to: alygn-outreach
    delegate_command: "bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc"
    lobster: ".lobster/alygn-vc-outreach.lobster"
---

# Alygn VC Outreach Skill

**Purpose:** Venture Capital outreach automation for Alygn's fundraising. Delegates all execution to the unified `alygn-outreach` parent skill with VC-specific configuration.

**Status:** Production Ready

**Target:** 100+ AI-focused VCs with governance-first personalized outreach

**Parent Skill:** [alygn-outreach](../alygn-outreach/SKILL.md)

---

## ⚠️ DELEGATION NOTICE

This is a **configuration sub-skill**. All pipeline execution delegates to the unified parent skill.

**DO NOT** implement outreach logic, pipeline stages, or sending mechanisms here. Use the parent skill for all execution.

### Delegate Command
```bash
# All actions route through alygn-outreach with --type=vc
bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc [action] [options]
```

### Parent Skill Location
```
$HOME/.agents/skills/alygn-outreach/
├── SKILL.md              # Master documentation
├── bin/alygn-outreach.ts # Unified CLI entry point
├── src/
│   ├── core/Pipeline.ts  # Orchestrator
│   ├── entities/         # VCEntity, MunicipalEntity
│   └── strategies/       # VC-specific strategies
└── .lobster/             # No lobster here — use sub-skill lobster
```

---

## VC-Specific Decision Framework

The parent skill provides the base decision framework. This sub-skill defines **VC-specific thresholds**.

### Risk Levels (VC Context)

| Level | Threshold | Action Required | Examples |
|-------|-----------|-----------------|----------|
| **Low** | ≤5 entities, routine ops | Execute autonomously | Reply tracking, DB updates, validation checks |
| **Medium** | 6-10 entities, personalization | Present recommendation | Email variant selection, priority ranking, subject line choice |
| **High** | >10 entities, new strategy | ALWAYS confirm before execute | New batch sends, new region activation, template changes |

### VC-Specific Rules

1. **Precision over volume** — Only target VCs with relevance score ≥7/10
2. **Personal email mandate** — Generic emails (hello@, info@) MUST be researched for partner names
3. **Institutional tone** — Governance-first, calm, non-promotional
4. **Two-filter system** — Both `--draft-status=Approved` AND `--email-send-to=id1,id2` required for sends

---

## VC-Specific Edge Cases

### 1. No Direct Partner Email Found

**Trigger:** Entity has only generic email (info@, contact@, hello@)

**Fallback Chain (handled by parent skill):**
```
1. DIRECT EMAIL     → firstname@domain.com (ideal)
2. GENERIC EMAIL    → info@ with partner name in subject
3. CONTACT FORM     → Browser automation fills website form
4. LINKEDIN MESSAGE → Direct message to partner
5. MANUAL OUTREACH  → Post instructions to Discord #annotations
```

**Sub-skill override:** Research partner names on LinkedIn before adding to database.

### 2. ZeroBounce Validation Failure

**Trigger:** Email validation returns `invalid`, `do_not_mail`, or `role_based`

**Protocol:**
- Mark Draft Status = "Not Sent" in Notion
- Update Status = "Invalid email"
- Add detailed Notes with suggested partner emails
- Rotate to next Approved VC
- Schedule deep research for next cycle

**Never bypass validation** — protects sender reputation.

### 3. Duplicate Prevention

**Trigger:** VC already contacted in previous wave

**Protocol:**
- Query Notion API for `Status: Contacted|Sent`
- Check wave-state.json for completed entities
- Build exclusion list before each discovery phase
- Log deduplication in `/tmp/alygn-dedup/exclude-vcs.txt`

### 4. Rate Limiting

**Trigger:** Smartlead/SMTP rate limit hit

**Protocol:**
- Max 3 emails per run
- Max 30 emails per inbox per day
- 1-minute delay between sends
- Exponential backoff on 429 errors

### 5. CC Failure

**Trigger:** Tania CC fails but primary send succeeds

**Protocol:**
- Log CC failure with full error details
- Continue primary send (don't block)
- Retry CC separately within 1 hour
- Mark as "CC_failed" in tracker for audit

---

## Parameters & Defaults

| Parameter | VC Default | Description |
|-----------|------------|-------------|
| `--type` | `vc` | Fixed by sub-skill |
| `--region` | `null` | VCs are global, no region filter |
| `--variant` | `governance` | Email variant: governance, institutional |
| `--limit` | `5` | Default batch size per run |
| `--rate-limit` | `3` | Max emails per send phase |
| `--validator` | `zerobounce` | Email validation service |
| `--cc` | `tanialeaidm@gmail.com` | Always CC Tania |
| `--language` | `en` | English for VC outreach |

---

## Lobster Protocol

```bash
# Run VC outreach campaign
lobster run .lobster/alygn-vc-outreach.lobster
```

### Lobster Phases

| Phase | Command | Description |
|-------|---------|-------------|
| Phase 0 | `sync-vcs-to-notion.ts` | Sync existing VCs to Notion |
| Phase 1 | `alygn-outreach.ts --type=vc --action=discover` | Discover new VCs |
| Phase 2 | `alygn-outreach.ts --type=vc --action=validate` | Validate emails |
| Phase 2.5 | Notion API query | Build exclusion list |
| Phase 3 | `alygn-outreach.ts --type=vc --action=research` | Research VCs |
| Phase 4 | `alygn-outreach.ts --type=vc --action=personalize` | Generate drafts |
| Phase 5 | Human review | Approve/reject in Notion |
| Phase 6 | `alygn-outreach.ts --type=vc --action=send` | Send approved |
| Phase 7 | `alygn-outreach.ts --type=vc --action=verify` | Verify sends |

---

## Notion Schema (VC Tracker)

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `Name` | Title | — | VC firm name |
| `Status` | Select | discovered, validated, researched, personalized, sent, contacted, replied, meeting | Pipeline stage |
| `Draft Status` | Select | Not drafted, Drafted, Approved, Rejected, Sent | Approval workflow |
| `Email` | Email | — | Validated partner email |
| `Type` | Select | vc | Fixed value |
| `Relevance Score` | Number | 0-10 | AI governance alignment |
| `Notes` | Rich Text | — | Research notes, personalization hooks |

---

## Quick Reference

### Discovery
```bash
bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=vc --action=discover --limit=5 --dry-run
```

### Full Pipeline (Dry Run)
```bash
USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=vc --action=pipeline --limit=5 --dry-run
```

### Send Approved (Production)
```bash
bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
  --type=vc --action=send \
  --draft-status=Approved \
  --email-send-to=entity-id-1,entity-id-2 \
  --cc=tanialeaidm@gmail.com \
  --rate-limit=3 \
  --dedup=true
```

---

## References

- **Parent Skill:** `skills/alygn-outreach/SKILL.md`
- **Lobster:** `.lobster/alygn-vc-outreach.lobster`
- **Scripts:** `$HOME/.agents/skills/alygn-outreach/src/`
- **CLI:** `$HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts`
- **Notion DB:** [VC Outreach Tracker](https://notion.so/2fc334874af681829013d127ce6778b6)
- **Discord:** #alygn-vc-outreach-plan (`1471206314435809431`)

---

**Created:** 2026-03-01
**Updated:** 2026-04-23 (delegation pattern, parent skill reference)
**Status:** Production Ready
