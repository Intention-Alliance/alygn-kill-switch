# Blog Content Pipeline — Implementation Plan

> **Status:** Draft  
> **ADR Reference:** [`blog-content-pipeline-ADR.md`](./blog-content-pipeline-ADR.md)  
> **GitHub Issue:** [EPIC] Blog Content Pipeline  
> **Target:** andler.dev blog  
> **Skill Dependencies:** `notion-sync`, `image-generate`, `beautiful-prose`, `enhance-prompt`

---

## Overview

Three-week phased rollout of the automated blog content pipeline. Each phase has concrete deliverables, owner suggestions, and verification steps. The pipeline is designed as a sequential state machine with quality gates — no downstream step executes if the current gate fails.

---

## Phase 1: Foundation — Notion Schema + Local Sync (Week 1)

### Objective
Establish Notion as the single source of truth for blog content. Sync existing local markdown. Verify all API touchpoints.

### Tasks

#### 1.1 Create Notion Database

**Database Name:** Blog Content Pipeline  
**Location:** Andler's Notion workspace (key: `ntn_137...`)

Create a Notion database with the following 14 properties:

| # | Property | Type | Options / Format | Required |
|---|----------|------|------------------|----------|
| 1 | Title | Title | Free text | Yes |
| 2 | Status | Select | Draft / Review / Ready / Published / Archived | Yes |
| 3 | Content | Rich Text | Markdown body | Yes |
| 4 | Thumbnail | Files & Media | Image (1200×630) | Yes |
| 5 | Cover | Files & Media | Image (1920×1080 hero) | Yes |
| 6 | Tags | Multi-select | Free text | No |
| 7 | Category | Select | Opinionated / Build Log / Deep Dive / Tutorial | Yes |
| 8 | Origin | Select | Notion / Local / External | Yes |
| 9 | SEO Title | Rich Text | ≤60 chars | No |
| 10 | SEO Description | Rich Text | ≤160 chars | No |
| 11 | SEO Keywords | Rich Text | Comma-separated | No |
| 12 | Publish Date | Date | ISO 8601 | No |
| 13 | Last Modified | Date | Auto (Notion managed) | Auto |
| 14 | URL | URL | Full canonical URL | No |

**Verification:**
- [x] Database created with all 14 properties
- [x] Status options match the state machine: Draft, Review, Ready, Published, Archived
- [x] Category options match: Opinionated, Build Log, Deep Dive, Tutorial
- [x] Origin options match: Notion, Local, External
- [x] Notion internal integration has write access to the database

#### 1.2 Sync Existing Local Articles to Notion

**Source directory:** `docs/developer-advocate/blog/`  
**Existing articles:**
- `ai-safety-hardware-evolution.md`
- `zero-trust-ai-infrastructure-tutorial.md`

**Process per article:**
1. Read local markdown file
2. Create a Notion page in the Blog Content Pipeline database
3. Set Title from first heading or filename
4. Set Content to full markdown body
5. Set Origin = "Local"
6. Set Status = "Draft" (initial state)
7. Infer Category from content analysis (heuristic or manual)
8. Set Last Modified to file mtime

**Verification:**
- [x] Both articles exist as Notion pages with all required fields populated
- [x] Content accurately rendered (markdown preserved)
- [x] Origin field correctly set to "Local"
- [x] Local files remain untouched (sync is additive, not destructive)

#### 1.3 Create Directory Structure for Assets

```
docs/developer-advocate/assets/
├── thumbnails/       # 1200×630 OG images
├── portraits/        # 1920×1080 hero covers
└── infographics/     # Future: data-driven inline assets

docs/developer-advocate/blog/
└── published/        # Production-ready assembled markdown
```

**Verification:**
- [x] All directories created
- [x] `.gitkeep` files in empty directories for version control
- [x] Paths documented in pipeline config

> **⚠️ 2026-04-30 Note:** `published/` directory was initially missed; created on 2026-04-30 after Hugrukal's Phase 2 audit.

#### 1.4 Verify Notion API Connectivity

**Actions:**
1. Query the Blog Content Pipeline database (GET all pages)
2. Create a test page with minimal fields
3. Update the test page Status field
4. Fetch the test page content (block children)
5. Delete the test page

**Expected:** All operations succeed within 10s. Authenticated session persists across calls.

**Verification:**
- [x] Query returns correct page count
- [x] Create/update/read/delete cycle completes without errors
- [x] Rate limits respected (3 req/sec max)
- [x] Error responses handled gracefully (logged, not silent)

### Phase 1 Deliverables
- [x] Notion database with 14 properties
- [x] 2 existing articles synced
- [x] Asset directory structure
- [x] API connectivity verified
- [x] Sync script or documented manual process

> **⚠️ Post-Audit Notes (2026-04-30):**
> - Asset generation was done **ad-hoc** by Gimglich calling `image-generate` directly, not through an automated pipeline script. Checkboxes above are marked based on functional completeness, not automation status.
> - Article 1 (`ai-safety-hardware-evolution`) was marked "Ready" in Notion but has **never passed** the Beautiful Prose gate (Step 4) or SEO enhancement (Step 6). This skips quality gates. Status should be "Draft" until gates execute.
> - `notion-sync.js` at `scripts/system/` is the Alygn memory sync, **not** a blog pipeline tool. No blog-specific sync script exists yet.
> - GitHub pipeline issues created: [#54](#54) through [#61](#61) under `phase-2-pipeline` label.

---

## Phase 2: Core Pipeline — Assets + Quality Gates (Week 2)

### Objective
Implement asset generation, Beautiful Prose quality gate, and visual brand review. The pipeline core — Steps 3, 4, 5 of the ADR workflow — must be functional.

### Tasks

#### 2.1 Implement Asset Generation (Step 3)

**Skill:** `image-generate` (OpenClaw native)

**Thumbnail Generation:**
- Dimensions: 1200×630 px
- Format: PNG
- Max file size: 2MB
- Prompt template:
  ```
  "Professional blog thumbnail for article '{title}'.
  Thesis: {thesis_sentence}.
  Style: {brand_aesthetic_descriptor}.
  Clean composition with visual breathing room for text overlay.
  No text in the image itself."
  ```
- Brand aesthetic descriptor: *"minimalist, monochrome, clean lines, bold high contrast, Infobae-inspired"*

**Cover Generation:**
- Dimensions: 1920×1080 px (hero)
- Format: PNG
- Max file size: 2MB
- Same brand prompt template, adjusted for hero banner composition

**Output path convention:**
- Thumbnail: `docs/developer-advocate/assets/thumbnails/{slug}-thumbnail.png`
- Cover: `docs/developer-advocate/assets/portraits/{slug}-cover.png`

**Verification:**
- [ ] Thumbnail generated at exact 1200×630 dimensions
- [ ] Cover generated at exact 1920×1080 dimensions
- [ ] Both in PNG format
- [ ] File sizes < 2MB each
- [ ] Prompt template parameterized (title, thesis injected dynamically)
- [ ] Output paths resolve correctly

#### 2.2 Integrate Beautiful Prose Quality Gate (Step 4)

**Skill:** `beautiful-prose` (`~/.agents/skills/beautiful-prose/SKILL.md`)

This is a **hard gate** — violations block progression to Steps 5-9.

**Four Primary Checks for Andler's Content:**

| Check | Detection Method | Auto-Fix? | Failure Action |
|-------|-----------------|-----------|----------------|
| **Single-thesis validation** | All paragraphs classified by relationship to opening argument | No | Flag for human; mark Status = "Review" |
| **Dyslexia gap scan** | Read-aloud flow test; missing articles/prepositions detected | Yes (insert missing word) | Flag if insertion changes meaning |
| **Complexity audit** | Latinate word detector → suggest Anglo-Saxon equivalents | Yes (replace if unambiguous) | Flag borderline cases |
| **Opinion attack filter** | Sentiment classifier on group references | No (rewrite needed) | Suggest direct-but-neutral rephrase; mark Status = "Review" |

**Style Contract Enforcement (from Beautiful Prose):**
- [ ] No em dashes (`--`)
- [ ] No filler transitions ("At its core", "In today's world", "Moreover")
- [ ] No therapeutic/validating language ("It's okay to...", "Remember that...")
- [ ] No meta commentary ("In this essay", "Here are the key takeaways")
- [ ] No "It's not X, it's Y" constructions
- [ ] Sentence length varies (no 5+ consecutive similar-length sentences)
- [ ] Verb-forward, concrete, image-bearing prose

**Implementation:**
1. Feed article markdown → LLM task with Beautiful Prose contract as system prompt
2. LLM returns: `{linter_report: [...violations], suggested_fixes: [...], pass: bool, requires_human: bool}`
3. If `pass === false` and `requires_human === true`: update Notion Status = "Review", annotate page with violations
4. If `pass === false` and `requires_human === false`: apply auto-fixes, re-lint, proceed if clean

**Verification:**
- [ ] All 4 primary checks fire on test content with known violations
- [ ] Auto-fix correctly inserts missing words without changing meaning
- [ ] Opinion attacks detected and flagged (not silently passed)
- [ ] Style contract violations caught (em dashes, filler transitions, meta commentary)
- [ ] Pass/fail result updates Notion Status correctly

#### 2.3 Build Asset Review Gate (Step 5)

**Goal:** Ensure generated images match Andler's visual brand. If they don't, regenerate with refined prompts.

**Brand Visual Checklist:**

| Criterion | Check | Fail Condition |
|-----------|-------|----------------|
| Palette | Monochrome or near-monochrome | >3 distinct color families |
| Lines | Clean, minimal ornament | Busy, decorative noise |
| Contrast | WCAG AA minimum | Text-like elements indistinguishable |
| Density | Vercel/Linear/Infobae reference | Cluttered, information overload |
| Data-driven | If infographic: numbers, charts, flows | Pure illustration with no data points |
| Professional | No whimsy, no clip-art aesthetic | Cartoonish or stock-photo feel |

**Implementation:**
1. After Step 3 generates images, run visual quality assessment (LLM image analysis via `image` tool)
2. Pass each image through the checklist
3. If fail: refine prompt (add "more contrast", "cleaner lines", "remove decorative elements") → regenerate
4. Max 3 retries per asset; if all fail, update Notion with blocker annotation and alert human

**Verification:**
- [ ] Generated images pass visual checklist
- [ ] Failed images correctly identified and flagged
- [ ] Prompt refinement produces measurably better images on retry
- [ ] Max retry limit enforced (no infinite loops)
- [ ] Human alert triggered after 3 failed retries

#### 2.4 Error Handling & Logging

All errors written to `memory/YYYY-MM-DD.md` with structured format:

```markdown
## Blog Pipeline Error — {ISO timestamp}
- **Step:** {step number}
- **Article:** {Title}
- **Error:** {description}
- **Action taken:** {auto-response}
- **Requires human:** yes/no
```

**Failure modes covered:**
- Notion API unavailable → abort, log, retry in 1h
- Asset generation failed → retry 3× with varied prompts
- Asset quality fail → refine prompt, retry 3×
- Content quality fail → auto-fix or flag for human
- Image dimensions wrong → regenerate with explicit size parameter

**Verification:**
- [ ] Error log format consistent
- [ ] All failure modes have defined responses
- [ ] Retry logic prevents infinite loops
- [ ] Human escalation path documented

### Phase 2 Deliverables
- [ ] Asset generation functional (thumbnail + cover at correct dimensions)
- [ ] Beautiful Prose quality gate integrated (4 primary checks + style contract)
- [ ] Asset review gate with visual brand checklist
- [ ] Retry logic (3 attempts per asset)
- [ ] Error logging to memory files

> **⚠️ Status (2026-04-30):** Zero Phase 2 implementation code written. Assets were generated ad-hoc but no pipeline scripts exist. GitHub issues #54-61 created to track the work.

---

## Phase 3: Polish + Automation (Week 3)

### Objective
Complete Steps 6-9: SEO, final assembly, cron scheduling, and runbook documentation.

### Tasks

#### 3.1 SEO Enhancement Pipeline (Step 6)

**Skills:** `enhance-prompt` / `llm-task`

**Output Schema:**
```json
{
  "meta_title": "string (max 60 chars)",
  "meta_description": "string (max 160 chars)",
  "keywords": ["string", "..."],
  "og_image_prompt": "string"
}
```

**Process:**
1. Feed article content + target audience context → LLM task with SEO schema
2. Validate: title ≤ 60 chars, description ≤ 160 chars, 5-8 keywords
3. OG image prompt describes a dynamic, text-included social card for later generation
4. Fallback on failure: first sentence as description, title truncated to 60 chars

**Target audience terms to weave in:**
- Freelance marketplace, Costa Rica tech, AI infrastructure, developer tools
- Remote work, decentralized systems, startup engineering

**Verification:**
- [ ] Meta title ≤ 60 characters
- [ ] Meta description ≤ 160 characters
- [ ] 5-8 keywords extracted and relevant
- [ ] OG image prompt describes brand-consistent social card
- [ ] Fallback handles schema validation failure gracefully
- [ ] SEO fields stored in Notion (SEO Title, SEO Description, SEO Keywords)

#### 3.2 Final Assembly (Step 7)

**Goal:** Produce production-ready markdown file with all metadata and embedded assets.

**Markdown Template:**
```markdown
---
title: "{meta_title}"
date: "{publish_date}"
tags: [{tag_list}]
category: "{category}"
seo_title: "{seo_title}"
seo_description: "{seo_description}"
seo_keywords: [{keyword_list}]
thumbnail: "{thumbnail_path}"
cover: "{cover_path}"
slug: "{slug}"
---

![Cover Image]({cover_path})

{content_body}

---
*Originally published: {publish_date}*
```

**Output path:** `docs/developer-advocate/blog/published/{date}-{slug}.md`

**Verification:**
- [ ] YAML frontmatter complete and valid
- [ ] All relative asset paths resolve
- [ ] Content body matches linted version from Step 4
- [ ] File saved to correct published/ directory
- [ ] Slug generated from title (lowercase, hyphenated, ≤60 chars)

#### 3.3 Automation Setup

**Daily Cron (09:00 CST):**
- Run full pipeline for all articles with Status = "Ready"
- Each article processed through Steps 3-9 sequentially
- Results logged per article

**Heartbeat Check (every ~6 hours):**
- Run Steps 1-2 only
- Check for newly Ready articles since last run
- Report findings to `memory/YYYY-MM-DD.md`

**Manual Trigger:**
- Support running full pipeline for a single article on demand
- Parameter: article Title or Notion page ID

**Verification:**
- [ ] Cron job scheduled and testable
- [ ] Heartbeat integration functional (discovery + audit only)
- [ ] Manual trigger documented with invocation example
- [ ] Idempotent: re-running pipeline on same article doesn't duplicate work

#### 3.4 Runbook: Human Override Scenarios

Create `docs/runbooks/blog-pipeline-runbook.md` covering:

1. **Asset rejection override:** How to approve a "rejected" image if the human prefers it
2. **Prose gate override:** How to bypass Beautiful Prose for an intentional style choice
3. **Notion reconciliation:** Steps when local markdown differs from Notion version
4. **Emergency pipeline stop:** How to halt all processing
5. **Manual publish path:** What to do when the pipeline produces output but site API is unavailable
6. **Regeneration trigger:** How to request fresh assets for a published article
7. **Error recovery:** Common failure modes and their manual resolution steps

**Verification:**
- [ ] Runbook covers all documented failure modes
- [ ] Each scenario has step-by-step instructions
- [ ] Commands/API calls copy-pasteable
- [ ] Contact escalation path defined

### Phase 3 Deliverables
- [ ] SEO metadata generated and validated
- [ ] Production markdown assembly (YAML frontmatter + assets)
- [ ] Cron job for daily pipeline runs
- [ ] Heartbeat integration for discovery checks
- [ ] Pipeline runbook with human override scenarios
- [ ] End-to-end test: draft → ready → published state transition

> **⚠️ Status (2026-04-30):** Not started. All Phase 3 work depends on Phase 2 pipeline scripts.

---

## Skill & Tool Dependencies

| Skill / Tool | Phase | Purpose | Status |
|--------------|-------|---------|--------|
| `notion-sync` | 1, 3 | Notion API read/write | ✅ Configured |
| `image-generate` | 2 | Thumbnail + cover generation | ✅ Available |
| `image` (analysis) | 2 | Visual brand review | ✅ Available |
| `beautiful-prose` | 2 | Content quality gate | ✅ Skill exists |
| `enhance-prompt` | 3 | SEO metadata generation | ✅ Skill exists |
| `llm-task` | 2, 3 | Structured LLM calls | ✅ Available |
| `filesystem-context` | 1, 2 | Local markdown audit | ✅ Skill exists |
| `write` / `edit` | 3 | Final assembly | ✅ Available |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pipeline completion rate | >95% of Ready articles reach Published | Daily cron logs |
| Asset generation success | >80% of images pass visual gate on first attempt | Asset review pass/fail ratio |
| Content quality pass rate | Lint violations reduced to 0 before assembly | Beautiful Prose lint report |
| SEO coverage | 100% of published articles have complete SEO metadata | YAML frontmatter validation |
| Human intervention rate | <20% of pipeline runs require human override | Error log analysis |
| Pipeline duration | <5 minutes per article (excluding human review waits) | Cron execution time |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Notion API rate limits (3 req/sec) | Pipeline slowdown | Batch Notion calls; cache where possible |
| Image generation non-deterministic | Asset quality varies | Prompt refinement loop; 3 retries max |
| Beautiful Prose overly strict | False positives on intentional style | Human override path; appeal mechanism |
| No publishing API | Manual copy-paste bottleneck | Produce final markdown regardless; API integration ready when available |
| Context switching delays | Pipeline stalls during review | Notion Status tracks exactly where each article is; resume from current state |

---

## References

- **ADR:** [`blog-content-pipeline-ADR.md`](./blog-content-pipeline-ADR.md)
- **Beautiful Prose Skill:** `~/.agents/skills/beautiful-prose/SKILL.md`
- **Existing Blog Content:** `docs/developer-advocate/blog/ai-safety-hardware-evolution.md`, `docs/developer-advocate/blog/zero-trust-ai-infrastructure-tutorial.md`
- **30-Day Rollout Plan:** `docs/developer-advocate/30-day-content-rollout-plan.md`
- **Notion Integration:** `docs/notion-integration-complete.md`

---

*Authored: 2026-04-29*  
*Author: Talanara (Documentation & Knowledge Specialist)*  
*Status: Draft — pending review*
