# OpenUI Org-Knowledge Fine-Tuning Loop

> **Part of ADR-141 (Phase 5 — Portal & Knowledge).**
> This document describes how organizational knowledge feeds OpenUI
> fine-tuning. No runtime code is required — this is a documentation-only
> workstream.

## Overview

OpenUI is the AI-assisted UI generation tool used to scaffold and iterate on
the ALYGN Regulator dashboard. To make OpenUI's output match the organization's
design language and domain conventions, we feed it a curated corpus of
**organizational knowledge** — design tokens, component conventions, domain
vocabulary, and architectural constraints — and periodically fine-tune on that
corpus.

The loop is:

```
┌────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────┐
│ Org Knowledge│ → │ Corpus Curation │ → │ Fine-Tune / Prompt│ → │ Generated UI  │
│ (docs, code) │   │ (chunk + label) │   │ (OpenUI)         │   │ (dashboard)   │
└────────────┘   └──────────────────┘   └──────────────────┘   └──────────────┘
       ▲                                                              │
       └─────────────────── Feedback loop (new patterns) ─────────────┘
```

## 1. Knowledge Sources

The organizational knowledge corpus is assembled from these sources in the
repository:

| Source | Path | What it contributes |
|--------|------|---------------------|
| Design tokens | `apps/web-regulator/app/globals.css` | OKLCH color palette, `--radius`, Figtree font, dark mode |
| Component conventions | `apps/web-regulator/components/ui/*` | shadcn/ui primitives, Radix patterns |
| Design system spec | `docs/plans/UI-ALIGNMENT-PLAN.md` | Visual spec, layout architecture |
| Domain vocabulary | `docs/KILL-SWITCH-SYSTEM-DESIGN.md` | Kill-switch states, flags, machines, audit |
| API contracts | `docs/architecture/*.md` | Endpoint shapes, RBAC, settings |
| ADRs | `docs/architecture/ADR-*.md` | Architectural decisions & rationale |
| Code style | `apps/web-regulator/lib/*`, `components/*` | Naming, TypeScript props, RORO patterns |

## 2. Corpus Curation

Before fine-tuning, the raw knowledge is curated into a clean corpus:

1. **Chunk** — split documents into focused units (per-section or per-ADR).
2. **Label** — tag each chunk with its domain (e.g. `design-token`,
   `component`, `domain-vocab`, `api-contract`, `rbac`).
3. **Deduplicate** — remove overlapping content (e.g. settings RBAC appears in
   both `settings-api.md` and `ADR-141`).
4. **Normalize** — strip timestamps, author names, and ephemeral status lines
   that would add noise.
5. **Version** — tag each chunk with the commit/date it was extracted from so
   the corpus is reproducible.

## 3. Fine-Tuning / Prompting

Two complementary approaches are used:

### 3.1 Prompt-time grounding (default)

For most generation tasks, the curated corpus is injected into the OpenUI
prompt as **grounding context** (retrieval-augmented generation). This requires
no model weights change and is the fastest path to on-brand output.

### 3.2 Fine-tuning (periodic)

When a stable corpus snapshot exists (e.g. after a design-system change or a
new ADR), a fine-tuning run is triggered:

- **Base model:** the OpenUI default generation model.
- **Training data:** the curated, labeled corpus formatted as
  instruction→output pairs (e.g. "Generate a settings page with RBAC" →
  the reference implementation).
- **Validation:** hold out a subset of pages (e.g. kill-switch, flags) and
  verify the fine-tuned model reproduces the design system (colors, radius,
  typography, responsive breakpoints).

## 4. Feedback Loop

New patterns discovered during dashboard development (new components, new
domain terms, new RBAC rules) are fed back into the corpus so the next
fine-tuning run captures them. This keeps the loop current.

## 5. Operational Notes

- **No runtime code** — this loop is a build-time / authoring-time concern.
- **Corpus location** — the curated corpus is stored alongside the docs
  (e.g. `docs/architecture/` and `docs/plans/`); a generated snapshot can be
  produced on demand.
- **Trigger** — run a fine-tuning pass after any design-system change, new
  ADR, or new component library addition.

## References

- `docs/architecture/ADR-141-portal-knowledge.md` — parent ADR.
- `docs/plans/UI-ALIGNMENT-PLAN.md` — design system spec.
- `apps/web-regulator/app/globals.css` — design tokens.
- `apps/web-regulator/components/ui/*` — component conventions.
