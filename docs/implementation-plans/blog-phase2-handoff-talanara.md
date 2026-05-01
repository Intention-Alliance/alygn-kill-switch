# Blog Content Pipeline — Phase 2 Handoff: Hugrukal → Talanara

> **From:** Hugrukal 📐 (Software Architect)  
> **To:** Talanara 📝 (Documentation & Knowledge Specialist)  
> **Date:** 2026-04-30  
> **ADR Reference:** [`blog-content-pipeline-ADR.md`](./blog-content-pipeline-ADR.md)  
> **Impl Plan:** [`blog-content-pipeline-impl-plan.md`](./blog-content-pipeline-impl-plan.md)  
> **EPIC:** [GitHub Issue #53](https://github.com/AndlerRL/andler-landing/issues/53)

---

## 1. Review Summary

I audited the full state of the Blog Content Pipeline against the ADR and three-phase implementation plan.

**Bottom line:** Phase 1 is functionally complete (Notion DB + assets exist), Phase 2 has zero automation code written, and there's a structural disconnect between the ADR's Phase 2 definition and the GitHub issues currently filed.

---

## 2. Phase 1 — Current State

### ✅ Done

| Item | Detail |
|------|--------|
| **Notion Database** | Created with all 14 properties. DB ID: `35133487-4af6-811e-aaae-e1a69fbcfaea`. Parent: ALYGN - Central Hub. |
| **Article Sync** | 2 articles (`ai-safety-hardware-evolution.md`, `zero-trust-ai-infrastructure-tutorial.md`) synced from local markdown → Notion. Origin = "Local", Status = "Draft" (initial). |
| **API Connectivity** | Notion API key configured (`ntn_137...`). Read/write cycle verified. |
| **Asset Directories** | `assets/thumbnails/`, `assets/covers/`, `assets/portraits/`, `assets/infographics/`, `assets/diagrams/` all exist. |
| **Assets Generated** | Both articles have thumbnails (1200×630), covers (1920×1080), and portraits. Generated via `image-generate` tool (ad-hoc, not scripted). |
| **GitHub EPIC** | Issue #53 created with full architecture + acceptance criteria. |
| **Impl Plan Doc** | `blog-content-pipeline-impl-plan.md` authored by Talanara — comprehensive and well-structured. |

### ⚠️ Gaps

| Gap | Impact |
|-----|--------|
| **`published/` directory missing** | `docs/developer-advocate/blog/published/` was specified in Phase 1 Task 1.3 but does not exist. Step 7 (Final Assembly) has no output target. |
| **`notion-sync.js` belongs to Alygn** | The existing `scripts/system/notion-sync.js` is the Alygn memory sync, not a blog pipeline tool. The ADR references `notion-sync` skill, but no blog-specific sync script exists. |
| **Phase 1 checklist not marked** | Implementation plan has checkboxes `[x]` but they appear optimistic — asset generation was done ad-hoc by Gimglich, not through an automated pipeline script. |
| **Article 1 marked "Ready" prematurely** | Per `memory/2026-04-29.md`, Article 1 status went to "Ready" — but Beautiful Prose gate and SEO steps haven't run yet. This skips gates. |

---

## 3. Phase 2 — Current State

### What EXISTS

| Item | Status | Notes |
|------|--------|-------|
| **GitHub Issues #39-43** | All OPEN | These are the *GitHub-side* Phase 2 issues (CI/CD, tooling, content features). None have been started. |
| **Beautiful Prose Skill** | ✅ Available | `~/.agents/skills/beautiful-prose/SKILL.md` — 191 lines, complete with all 4 primary checks and style contract. Ready to use. |
| **`image-generate` tool** | ✅ Available | OpenClaw native tool. Used successfully for ad-hoc asset generation on Apr 29. |
| **`image` analysis tool** | ✅ Available | OpenClaw native tool for visual review. Can assess images against brand checklist. |
| **`llm-task` tool** | ✅ Available | OpenClaw native tool for structured LLM calls. |

### What's MISSING (per ADR Phase 2)

| Task | Status | Detail |
|------|--------|--------|
| **2.1 Asset Generation automation** | ❌ Not implemented | Assets were generated manually. No pipeline script that: queries Notion → extracts title/thesis → calls `image-generate` → saves to correct paths. |
| **2.2 Beautiful Prose integration** | ❌ Not implemented | No script feeds article content through Beautiful Prose contract. No lint report generation. No auto-fix logic. No Notion Status update on pass/fail. |
| **2.3 Asset Review gate** | ❌ Not implemented | No visual brand checklist automation. No prompt refinement on fail. No 3-retry loop. No human escalation trigger. |
| **2.4 Error handling/logging** | ❌ Not implemented | No structured error format being written anywhere. No retry logic. No failure mode handlers. |

### ⚡ Critical Architectural Issue

The GitHub issues #39-43 labeled `phase-2` are for **andler-landing site CI/CD automation** (deploy triggers, preview deployments, TOC component, CLI flags, search engine ping). These are *orthogonal* to the ADR's Phase 2 definition (assets + quality gates).

**The ADR defines Phase 2 as:** Pipeline core — asset generation, Beautiful Prose gate, asset review gate.  
**GitHub issues #39-43 cover:** Site infrastructure — deploy workflows, preview URLs, TOC component.

These are two different things. The pipeline Phase 2 (ADR) has no corresponding GitHub issues at all.

---

## 4. Phase 3 — Current State

| Task | Status |
|------|--------|
| **3.1 SEO Enhancement** | ❌ Not implemented |
| **3.2 Final Assembly** | ❌ Not implemented |
| **3.3 Cron scheduling** | ❌ Not implemented |
| **3.4 Runbook** | ❌ Not written |
| **GitHub Issues #44-52** | All OPEN |

---

## 5. GitHub Issues Landscape

### EPIC
- **#53** `[EPIC] Blog Content Pipeline` — OPEN, well-documented, 0 comments, no assignee

### Phase 2 (GitHub — CI/CD Automation)
| # | Title | Priority | Status |
|---|-------|----------|--------|
| 39 | Search engine ping on deploy | P2 | OPEN |
| 40 | Draft preview deployment | P1 | OPEN |
| 41 | Enhance create-blog-post.ts CLI | P1 | OPEN |
| 42 | Blog-specific deploy workflow trigger | P1 | OPEN |
| 43 | Table of contents for blog posts | P2 | OPEN |

### Phase 3 (GitHub — Polish + Distribution)
| # | Title | Priority | Status |
|---|-------|----------|--------|
| 44 | MDX sync pipeline | P2 | OPEN |
| 45 | Set up blog database | P2 | OPEN |
| 46 | Webhook integration | P2 | OPEN |
| 47 | Scheduling (future publish dates) | P2 | OPEN |
| 48 | Related posts algorithm | P2 | OPEN |
| 49 | Blog analytics (Vercel) | P2 | OPEN |
| 50 | Dev.to cross-post | P3 | OPEN |
| 51 | Social sharing (X/Twitter) | P3 | OPEN |
| 52 | Blog performance optimization | P2 | OPEN |

### Missing GitHub Issues (ADR Phase 2 Pipeline)
No issues exist for the actual pipeline work:
- Pipeline asset generation automation
- Beautiful Prose quality gate integration
- Asset review gate (visual brand checklist)
- Pipeline orchestration script
- Error logging to memory files
- Retry logic for failed assets

---

## 6. File System Audit

```
docs/developer-advocate/
├── assets/
│   ├── covers/          ✅ 2 cover PNGs (1-1.6MB each)
│   ├── diagrams/        ✅ Empty dir (future use)
│   ├── infographics/    ✅ Empty dir (future use)
│   ├── portraits/       ✅ 2 portrait PNGs (0.6-1.9MB)
│   └── thumbnails/      ✅ 2 thumb PNGs (141-227KB)
├── blog/
│   ├── ai-safety-hardware-evolution.md          ✅ 17.5KB
│   ├── zero-trust-ai-infrastructure-tutorial.md ✅ 12.4KB
│   └── published/       ❌ MISSING — must be created
├── social/              ✅ Existing, unrelated
└── 30-day-content-rollout-plan.md  ✅ 13.3KB

docs/implementation-plans/
├── blog-content-pipeline-ADR.md       ✅ 404 lines
└── blog-content-pipeline-impl-plan.md ✅ Comprehensive

scripts/system/
└── notion-sync.js       ⚠️  Alygn memory sync, NOT blog pipeline
```

---

## 7. Architecture Recommendations

### 7.1 Reconcile the Phase Disconnect

The ADR defines a sequential pipeline with 9 steps across 3 phases. The GitHub issues #39-52 describe *site infrastructure* work, not pipeline work. These are complementary but distinct.

**Recommendation:** Create a new set of GitHub issues specifically for the pipeline automation work (Steps 3-7 of the ADR). The existing issues #39-52 should be re-labeled or grouped as "Site Infrastructure" to avoid confusion.

### 7.2 Prioritize Beautiful Prose Integration

This is the highest-value gate. The Beautiful Prose skill exists and is well-defined. Integrating it as an `llm-task` call with the prose contract as system prompt is a single-script task.

**Approach:**
1. Single script: `scripts/blog-pipeline/lint-content.mjs`
2. Reads article from Notion (Content field) or local markdown
3. Feeds through `llm-task` with Beautiful Prose contract + structured output schema
4. Returns lint report, auto-applies unambiguous fixes
5. Updates Notion Status to "Review" if human intervention needed
6. Logs all violations to `memory/YYYY-MM-DD.md`

### 7.3 Keep Asset Generation Simple

The `image-generate` tool already works. Don't over-engineer the automation. A thin wrapper script that:
1. Takes article title + thesis + output path
2. Calls `image-generate` with the brand prompt template
3. Saves to the correct path
4. Validates dimensions

### 7.4 Create the `published/` Directory Now

This is a trivial gap that blocks Step 7 (Final Assembly). Create it immediately.

### 7.5 Article Status Requires Rollback

Article 1 (`ai-safety-hardware-evolution`) is marked "Ready" in Notion but has never passed the Beautiful Prose gate or SEO enhancement. It should be "Draft" until those gates execute.

### 7.6 Consider Lobster for Pipeline Orchestration

The ADR describes a sequential state machine with quality gates. The `lobster` tool (mentioned in AGENTS.md → TOOLS.md) is purpose-built for this pattern. A single Lobster pipeline file could encode all steps with gate enforcement.

---

## 8. For Talanara — Action Items

### GitHub Issues to Create

- [ ] `[PIPELINE][P0] Implement asset generation automation script` — Wrapper for `image-generate` with prompt template + path conventions
- [ ] `[PIPELINE][P0] Integrate Beautiful Prose quality gate` — Lint script with 4 primary checks + style contract enforcement
- [ ] `[PIPELINE][P0] Build asset review gate with visual brand checklist` — Image analysis + prompt refinement + 3-retry loop
- [ ] `[PIPELINE][P1] Implement pipeline orchestration script` — Sequential runner that chains Steps 1-7
- [ ] `[PIPELINE][P1] Implement error logging to memory files` — Structured format, all failure modes covered
- [ ] `[PIPELINE][P2] SEO enhancement pipeline (Step 6)` — llm-task with meta title/desc/keywords schema
- [ ] `[PIPELINE][P2] Final assembly script (Step 7)` — YAML frontmatter + asset embedding + published/ output
- [ ] `[PIPELINE][P2] Pipeline runbook` — Human override scenarios, error recovery steps

### GitHub Issues to Update

- [ ] **#53 (EPIC):** Add comments clarifying the Phase 2 gap — pipeline automation vs. site infrastructure
- [ ] **#39-43:** Consider re-labeling or grouping under "Site Infrastructure" milestone instead of conflating with pipeline Phase 2
- [ ] **#44:** The "MDX sync pipeline" (#44) partially overlaps with Step 7 (Final Assembly). Clarify scope.

### Documentation to Refresh

- [ ] **`blog-content-pipeline-impl-plan.md`:** Update Phase 1 checkboxes to reflect actual state (ad-hoc vs. automated). Mark `published/` directory as pending. Remove premature "Ready" status.
- [ ] **`blog-content-pipeline-ADR.md`:** No changes needed — the architecture is sound.
- [ ] **`memory/2026-04-30.md`:** Create daily log with Phase 2 review findings.
- [ ] **`README.md`** (workspace): May need blog pipeline section added.

### Immediate Fixes

- [ ] Create `docs/developer-advocate/blog/published/` directory
- [ ] Roll back Article 1 Notion Status from "Ready" → "Draft" (gates not yet executed)
- [ ] Verify Article 2 Notion Status is also "Draft" (not prematurely advanced)

---

## 9. Reference Index

| Document | Path | Relevance |
|----------|------|-----------|
| ADR | `docs/implementation-plans/blog-content-pipeline-ADR.md` | Architecture decisions + workflow diagram |
| Implementation Plan | `docs/implementation-plans/blog-content-pipeline-impl-plan.md` | 3-phase rollout with task breakdown |
| Beautiful Prose Skill | `~/.agents/skills/beautiful-prose/SKILL.md` | Style contract for Step 4 quality gate |
| EPIC Issue | GitHub #53 in andler-landing | Central tracking with acceptance criteria |
| Phase 1 Memory | `memory/2026-04-29.md` | What was done on Apr 29 |
| Notion DB | ID `35133487-4af6-811e-aaae-e1a69fbcfaea` | 14-property blog pipeline database |
| existing notion sync | `scripts/system/notion-sync.js` | Alygn memory sync (not blog pipeline) |

---

*Authored: 2026-04-30*  
*Author: Hugrukal (Software Architect)*  
*For: Talanara (Documentation & Knowledge Specialist)*
