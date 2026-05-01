# ADR-2026-04-29: Blog Content Pipeline for andler.dev

## Status

**Proposed**

---

## Context

Andler runs multiple startups; his personal brand (andler.dev) is a high-leverage channel for attracting talent, investors, and clients. The blog targets developers, founders, technical decision-makers, and investors. Content quality must be consistent, on-brand, and produced at a sustainable cadence.

Current state: blog posts exist as markdown in `docs/developer-advocate/blog/` and as social derivative content in `docs/developer-advocate/social/`. Asset generation has been ad-hoc. There is no single source of truth for article state (draft, ready, published). There is no standardized quality gate. SEO metadata is inconsistent or missing.

This ADR defines a content pipeline architecture that:
1. Centralizes state in Notion (single source of truth).
2. Enforces content quality via the Beautiful Prose skill rules.
3. Generates visual assets with a brand-locked aesthetic.
4. Produces production-ready markdown + SEO metadata + OG images.
5. Leaves the actual publishing step as a future integration (no site API yet).

---

## Decision

Implement a **sequential, state-machine-driven pipeline** with the following properties:

- **Notion as the single source of truth** for article metadata and content.
- **Local markdown as a secondary input** (imported, not authoritative).
- **Asset generation triggered by state transitions**, not by content creation alone.
- **Quality gates at every stage**; a failure blocks downstream steps.
- **Skills/tools invoked per step**, not as a monolithic workflow.
- **No external publication automation** until a site publishing API is defined.

---

## Consequences

### Positive

- Single source of truth eliminates drift between local files and publication state.
- Quality gates prevent off-brand or poorly structured content from reaching the blog.
- Reusable asset generation rules enforce visual consistency across all posts.
- Pipeline is inspectable: each step produces artifacts that can be reviewed.

### Negative

- Notion dependency introduces a network call at every pipeline run.
- Sequential design limits throughput; parallel execution would require state-machine concurrency logic.
- Asset generation is non-deterministic and may require human retry loops.
- Pipeline does not yet include actual publication; human copy-paste or future API integration required.

---

## 1. Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BLOG CONTENT PIPELINE                                │
│                    (Sequential State Machine)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │   START     │                                                            │
│  │  (Cron /    │                                                            │
│  │  Manual)    │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 1         │    │  SKILL: notion-sync                             │  │
│  │  DISCOVERY      │───▶│  QUERY: Status = "Ready" OR "Draft"             │  │
│  │                 │    │  OUTPUT: Article list with metadata             │  │
│  └─────────────────┘    └─────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼ (per article)                                                     │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 2         │    │  SKILL: filesystem-context                      │  │
│  │  CONTENT AUDIT  │───▶│  CHECK: local markdown exists?                  │  │
│  │                 │    │  ACTION: Notion wins; archive local if diverged │  │
│  └─────────────────┘    └─────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 3         │    │  SKILL: image-generate                          │  │
│  │  ASSET CHECK    │───▶│  CHECK: Thumbnail + Cover present?              │  │
│  │                 │    │  GENERATE: Title + thesis + brand aesthetic       │  │
│  │  [GATE: Asset   │    │  OUTPUT: 1200x630 thumbnail, hero cover         │  │
│  │   Quality]      │    │                                                 │  │
│  └─────────────────┘    └─────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 4         │    │  SKILL: beautiful-prose                         │  │
│  │  CONTENT        │───▶│  RULES:                                         │  │
│  │  QUALITY REVIEW │    │  - Single thesis, no drift                      │  │
│  │                 │    │  - Fix dyslexia gaps (missing words)            │  │
│  │  [GATE: Prose   │    │  - Simplify complex wording                     │  │
│  │   Compliance]   │    │  - Soften opinion attacks                       │  │
│  └─────────────────┘    │  - No em dashes, no filler transitions          │  │
│         │               │  - No meta commentary                           │  │
│         ▼               └─────────────────────────────────────────────────┘  │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 5         │    │  SKILL: image-generate (review)                   │  │
│  │  ASSET REVIEW   │───▶│  CHECK: Monochrome? Clean lines? High contrast?  │  │
│  │                 │    │  REF: Vercel, Linear, Infobae aesthetics        │  │
│  │  [GATE: Visual  │    │  ACTION: Reject + regenerate if failed          │  │
│  │   Brand Match]  │    │                                                 │  │
│  └─────────────────┘    └─────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 6         │    │  SKILL: enhance-prompt / llm-task                │  │
│  │  SEO ENHANCEMENT│───▶│  GENERATE:                                      │  │
│  │                 │    │  - Meta title (≤60 chars)                       │  │
│  │  [GATE: SEO     │    │  - Meta description (≤160 chars)                │  │
│  │   Completeness] │    │  - Keywords (5-8 terms)                         │  │
│  └─────────────────┘    │  - OG image prompt for dynamic generation       │  │
│         │               └─────────────────────────────────────────────────┘  │
│         ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 7         │    │  TOOL: write / edit                             │  │
│  │  FINAL ASSEMBLY │───▶│  OUTPUT: Production-ready markdown with:      │  │
│  │                 │    │  - Embedded assets at correct positions         │  │
│  │                 │    │  - SEO metadata block (YAML frontmatter)        │  │
│  │                 │    │  - Category + tags list                         │  │
│  └─────────────────┘    └─────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 8         │    │  TOOL: message (future)                         │  │
│  │  PUBLISH        │───▶│  ACTION: Send to andler.dev CMS (future API)    │  │
│  │  (Future)       │    │  CURRENT: Human copies markdown to site         │  │
│  └─────────────────┘    └─────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  STEP 9         │    │  SKILL: notion-sync                             │  │
│  │  UPDATE NOTION  │───▶│  ACTION: Mark Status = "Published"              │  │
│  │                 │    │  - Set Publish Date                             │  │
│  │                 │    │  - Set URL if available                           │  │
│  └─────────────────┘    └─────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐                                                            │
│  │    END      │                                                            │
│  └─────────────┘                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model: Notion Schema

### Database: "Blog Content Pipeline"

| Property | Type | Options / Format | Required | Description |
|----------|------|------------------|----------|-------------|
| **Title** | Title | Free text | Yes | Article headline |
| **Status** | Select | Draft / Review / Ready / Published / Archived | Yes | Pipeline state |
| **Content** | Rich Text | Markdown | Yes | Full article body |
| **Thumbnail** | Files & Media | Image (1200x630) | Yes | Featured image for OpenGraph |
| **Cover** | Files & Media | Image (hero ratio) | Yes | Article header image |
| **Tags** | Multi-select | Free text | No | Content taxonomy (e.g., AI Infrastructure, DevOps) |
| **Category** | Select | Opinionated / Build Log / Deep Dive / Tutorial | Yes | Content archetype |
| **Origin** | Select | Notion / Local / External | Yes | Source provenance |
| **SEO Title** | Rich Text | ≤60 chars | No | `<title>` tag content |
| **SEO Description** | Rich Text | ≤160 chars | No | Meta description |
| **SEO Keywords** | Rich Text | Comma-separated | No | `<meta name="keywords">` |
| **Publish Date** | Date | ISO 8601 | No | Date of publication |
| **Last Modified** | Date | Auto (Notion) | Auto | Last edit timestamp |
| **URL** | URL | Full URL | No | Canonical published URL |
| **Assets** | Rich Text | JSON array | No | `[{"type":"infographic","path":"..."},...]` |

### Status State Machine

```
Draft → Review → Ready → Published
  ↑       ↓       ↓
  └───────┴───────┘  (can revert to Draft from any state)

Archived is terminal (manual only).
```

**Transitions triggered by pipeline steps:**
- `Draft` → `Review`: After Step 2 (Content Audit) completes without divergence issues.
- `Review` → `Ready`: After Steps 3-7 (Asset, Content, SEO) pass all gates.
- `Ready` → `Published`: After Step 8 (Publish) succeeds and Step 9 updates Notion.

---

## 3. Decision Log

| # | Decision | Rationale | Trade-off |
|---|----------|-----------|-----------|
| 1 | Notion as source of truth | Already configured (API key, workspaces). Centralizes metadata + content. Human-reviewable UI. | Network latency; rate limits (3 req/sec). |
| 2 | Local markdown secondary | Enables offline drafting. Git history for content. | Must reconcile diverged versions; Notion wins. |
| 3 | Sequential execution | Quality gates require previous output. Asset review needs content context. Simpler to debug. | Throughput limited to serial speed. |
| 4 | Image-generate for all assets | Brand aesthetic is non-negotiable. Manual asset creation is inconsistent. | Generation is non-deterministic; retry loops needed. |
| 5 | Beautiful Prose as quality gate | Andler's specific gaps (topic drift, dyslexia, opinion attacks) require explicit linting. | Adds latency; may require human override for edge cases. |
| 6 | No auto-publication yet | andler.dev lacks a programmatic publishing API. | Human copy-paste step remains. |
| 7 | JSON array for Assets | Flexible schema for future asset types (GIFs, diagrams, video). | No Notion-native relation; stored as text blob. |
| 8 | 1200x630 thumbnail | OpenGraph standard dimension. Maximizes social share rendering. | Must be generated at exact size. |

---

## 4. Integration Points

| Step | Skill / Tool | Invocation | Input | Output |
|------|--------------|------------|-------|--------|
| 1 | `notion-sync` | Notion API query | Database ID, Status filter | Article list with metadata |
| 2 | `filesystem-context` | Read local dir | `docs/developer-advocate/blog/` | Divergence report, archive action |
| 3 | `image-generate` | OpenClaw image tool | Title + thesis + brand aesthetic prompt | Thumbnail + Cover images |
| 4 | `beautiful-prose` | LLM task with style contract | Article markdown | Linted / rewritten markdown |
| 5 | `image-generate` (review) | OpenClaw image tool | Generated image + brand checklist | Pass / Fail + regen prompt |
| 6 | `enhance-prompt` / `llm-task` | LLM task with SEO schema | Article content + target keywords | SEO metadata block |
| 7 | `write` / `edit` | File system | Linted content + assets + SEO | Production markdown file |
| 8 | Future: site API | HTTP POST (TBD) | Production markdown | Published URL |
| 9 | `notion-sync` | Notion API patch | Article page ID | Updated Status, Date, URL |

### Tool-Specific Notes

**`image-generate` (Steps 3, 5):**
- Prompt must include brand descriptors: *"minimalist, monochrome, clean lines, bold high contrast, Infobae-inspired, data-driven infographic"*
- Output format: PNG
- Thumbnail size: 1200x630
- Cover size: 1920x1080 (scalable to article header)
- Max retries: 3 per asset before human escalation

**`beautiful-prose` (Step 4):**
- Enforce lint checklist from SKILL.md
- Specific checks for Andler's gaps:
  1. Single-thesis check: confirm all paragraphs support the opening argument
  2. Dyslexia gap scan: read aloud test for missing words
  3. Complexity audit: flag Latinate words without Anglo-Saxon equivalents
  4. Opinion attack filter: flag sentences that indirectly attack groups; suggest direct-but-neutral rephrase

**`enhance-prompt` / `llm-task` (Step 6):**
- Schema:
  ```json
  {
    "meta_title": "string (max 60 chars)",
    "meta_description": "string (max 160 chars)",
    "keywords": ["string"],
    "og_image_prompt": "string (description for dynamic OG image generation)"
  }
  ```
- Target audience: entrepreneurs seeking freelance/contract work, Costa Rica tech community

---

## 5. Error Handling

| Failure Mode | Detection | Response | Escalation |
|--------------|-----------|----------|------------|
| Notion API unavailable (Step 1) | HTTP timeout / 5xx | Abort pipeline; log to `memory/YYYY-MM-DD.md` | Human retry in 1h |
| Local markdown diverged (Step 2) | Content hash mismatch | Archive local; log divergence in Notion page comment | None (automatic) |
| Asset generation failed (Step 3) | image-generate returns error | Retry 3x with varied prompts; if still failing, mark Status = "Review" with blocker note | Human to retry manually |
| Asset quality fail (Step 5) | Visual brand checklist mismatch | Regenerate with refined prompt (add "more contrast", "cleaner lines"). Max 3 retries. | Human to accept/reject |
| Content quality fail (Step 4) | Beautiful Prose lint failures | Auto-fix if possible; if opinion attack or thesis drift detected, mark Status = "Review" with annotation | Human editor review |
| SEO generation fail (Step 6) | Schema validation error | Use fallback: first sentence as meta description; title truncated to 60 chars | None (degraded but usable) |
| Notion update fail (Step 9) | HTTP timeout / 5xx | Retry 3x; if still failing, log publish date locally and alert | Human to manually update |

### Error Logging Format

All errors written to `memory/YYYY-MM-DD.md` with structure:
```markdown
## Blog Pipeline Error — {timestamp}
- **Step:** {step number}
- **Article:** {Title}
- **Error:** {description}
- **Action taken:** {auto-response}
- **Requires human:** yes/no
```

---

## 6. Quality Gates (Checklist Per Step)

### Step 1: Discovery
- [ ] Notion API responds within 10s
- [ ] At least one article returned with Status = "Ready" or "Draft"
- [ ] All required fields (Title, Content, Category) are non-empty

### Step 2: Content Audit
- [ ] Local markdown scanned (if exists)
- [ ] Divergence resolved (Notion wins)
- [ ] Origin field updated correctly

### Step 3: Asset Check
- [ ] Thumbnail generated at 1200x630
- [ ] Cover generated at 1920x1080
- [ ] Both images are PNG format
- [ ] File sizes < 2MB each

### Step 4: Content Quality Review
- [ ] Single thesis confirmed (all paragraphs support central argument)
- [ ] No em dashes (`--`)
- [ ] No filler transitions ("At its core", "In today's world", etc.)
- [ ] No therapeutic/validating language
- [ ] No meta commentary ("In this essay", "Here are the key takeaways")
- [ ] No "It's not X, it's Y" constructions
- [ ] Sentence length varies (no 5+ consecutive similar-length sentences)
- [ ] Opinion attacks softened (indirect group attacks rephrased)
- [ ] Dyslexia gaps checked (read-aloud flow test)
- [ ] Complex wording simplified where context breaks

### Step 5: Asset Review
- [ ] Monochrome or near-monochrome palette
- [ ] Clean lines, minimal ornament
- [ ] High contrast (accessible WCAG AA minimum)
- [ ] Data-driven if infographic (numbers, charts, flows)
- [ ] No decorative noise
- [ ] Matches Vercel/Linear/Infobae visual density

### Step 6: SEO Enhancement
- [ ] Meta title ≤ 60 characters
- [ ] Meta description ≤ 160 characters
- [ ] 5-8 keywords extracted
- [ ] OG image prompt generated
- [ ] Target audience keywords present (freelance, Costa Rica, etc.)

### Step 7: Final Assembly
- [ ] YAML frontmatter complete (title, date, tags, category, seo)
- [ ] Assets embedded at correct markdown positions
- [ ] All relative paths resolve
- [ ] File saved to `docs/developer-advocate/blog/published/{slug}.md`

### Step 8: Publish (Future)
- [ ] Markdown uploaded to CMS
- [ ] Canonical URL returned
- [ ] URL logged back to Notion

### Step 9: Update Notion
- [ ] Status = "Published"
- [ ] Publish Date set
- [ ] URL field populated (if available)
- [ ] Last Modified auto-updated by Notion

---

## 7. File & Directory Structure

```
workspace/
├── docs/
│   ├── developer-advocate/
│   │   ├── blog/
│   │   │   ├── ai-safety-hardware-evolution.md          # Example draft
│   │   │   ├── zero-trust-ai-infrastructure-tutorial.md # Example draft
│   │   │   └── published/                               # Output directory
│   │   │       └── 2026-04-29-article-slug.md           # Production-ready
│   │   ├── assets/
│   │   │   ├── infographics/                            # Generated diagrams
│   │   │   ├── portraits/                               # Hero covers
│   │   │   └── thumbnails/                              # OG thumbnails
│   │   └── social/                                      # Derivative content
│   └── implementation-plans/
│       └── blog-content-pipeline-ADR.md                 # This document
├── memory/
│   └── 2026-04-29.md                                   # Pipeline error logs
└── skills/
    └── blog-pipeline/                                   # Future: pipeline skill
        └── SKILL.md                                     # Encapsulated workflow
```

---

## 8. Execution Triggers

| Trigger | Frequency | Action |
|---------|-----------|--------|
| Heartbeat | Every 6 hours | Run Steps 1-2; check for Ready articles |
| Manual | On demand | Full pipeline run for specific article |
| Cron | Daily at 09:00 CST | Full pipeline for all Ready articles |
| Asset regen | On demand | Re-run Steps 3, 5 for failed assets |

---

## 9. Future Enhancements (Post-MVP)

1. **Dynamic OG Images**: Generate OG images at publish time using `image-generate` with article title + brand template.
2. **Auto-Publication**: Integrate andler.dev CMS API (when available) to replace Step 8 human step.
3. **Parallel Asset Generation**: Run thumbnail + cover + optional diagrams concurrently.
4. **A/B Title Testing**: Generate 2-3 title variants; Notion field for tracking CTR.
5. **Content Calendar**: Extend Notion database with "Scheduled Date" for editorial planning.
6. **Cross-Platform Derivatives**: Auto-generate LinkedIn/X thread derivatives from blog content (using existing social/ pipeline).

---

## References

- Beautiful Prose Skill: `~/.agents/skills/beautiful-prose/SKILL.md`
- Notion Integration: `docs/notion-integration-complete.md`
- Notion Database Schema: `docs/notion-database-schema.md`
- Existing Blog Content: `docs/developer-advocate/blog/`
- 30-Day Rollout Plan: `docs/developer-advocate/30-day-content-rollout-plan.md`

---

*Authored: 2026-04-29*
*Author: Hugrukal (Software Architect)*
*Status: Proposed — pending Wobblus/Andler approval*
