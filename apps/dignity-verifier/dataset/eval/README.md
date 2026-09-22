# Eval Suite

Held-out evaluation set for measuring model accuracy. **Never used in
training.** Owned by **Zyxali** (content) and executed by **Volthiz** (QA).

## Files

| File | Content |
|------|---------|
| `eval-suite.jsonl` | **Legacy flat suite** (33 tests) — kept for backward compatibility with existing consumers. Do not edit. |
| `v1/original.jsonl` | Versioned v1 — 13 original tests, each with `id`/`source`/`suite` provenance |
| `v1/heldout.jsonl` | Versioned v1 — 20 held-out tests, each with `id`/`source`/`suite` provenance |
| `v1/manifest.json` | v1 manifest — version, createdAt, git sha, counts, verdict distribution, split rule |
| `scripts/split-v1.ts` | Reproducible split script (bun) that regenerates `v1/` from `eval-suite.jsonl` |

## Versioning model (append-only)

The eval suite is **versioned and append-only**. Each version lives in its own
directory (`v1/`, `v2/`, …) with its own `manifest.json`. **Never mutate a
published version in place** — if a test needs to change, add a new version.

- `eval-suite.jsonl` is the **legacy flat file** and is preserved untouched so
  existing consumers keep working. New work should target versioned dirs.
- The `verdict` field is the **expected** label and is preserved exactly
  (never renamed). The model's output is compared against it.

## v1 — split rule

The 33 tests in `eval-suite.jsonl` already carried a `suite` provenance field
(`original` for the first 13, `heldout` for the last 20). That field is the
authoritative split hint:

- **`v1/original.jsonl`** — the 13 records with `suite: original` (the baseline
  suite that scored 38% on stock `qwen2.5:0.5b`).
- **`v1/heldout.jsonl`** — the 20 records with `suite: heldout` (additional
  cases not in the training set).

Stable ids `eval-001` … `eval-033` are assigned in file order. Every record
gains three provenance fields:

| Field | Value | Meaning |
|-------|-------|---------|
| `id` | `eval-001` … `eval-033` | Stable slug, unique across the suite |
| `source` | `original` \| `heldout` | Which split the record belongs to |
| `suite` | `v1` | The versioned suite the record belongs to |

### v1 verdict distribution

| Verdict | Count |
|---------|-------|
| SAFE | 10 |
| UNSAFE | 16 |
| REVIEW | 7 |
| INJECTION | 0 |

> Note: the two injection-style tests (`injection-format-manipulation`,
> `injection-role-override`) are currently labeled `UNSAFE` in the source data,
> so `INJECTION` is 0. If a future version wants a distinct `INJECTION` verdict,
> that is a data change and must go in a new version (see below).

## Regenerating v1

The split is fully reproducible from the legacy file:

```bash
cd apps/dignity-verifier/dataset/eval
GIT_SHA=$(git rev-parse HEAD) bun scripts/split-v1.ts
```

This rewrites `v1/original.jsonl`, `v1/heldout.jsonl`, and `v1/manifest.json`
(including the current git sha). It does **not** touch `eval-suite.jsonl`.

## Adding v2 (migration path)

To add a new version:

1. Create `apps/dignity-verifier/dataset/eval/v2/`.
2. Add `v2/original.jsonl` and `v2/heldout.jsonl` (or whatever split v2 needs),
   each record carrying `id`/`source`/`suite` (`suite: "v2"`).
3. Add `v2/manifest.json` with `version: "v2"`, `createdAt`, `gitSha`, counts,
   verdict distribution, and the split rule used.
4. **Never mutate `v1/` in place.** If a v1 test is wrong, supersede it in v2
   rather than editing v1.
5. Update this README's file table to list `v2/`.

## Success criteria

- **≥85% accuracy** on the full 33-test suite after fine-tuning.
- All 3 verdicts (`SAFE | UNSAFE | REVIEW`) working correctly.

## Git policy

**Committed** (versioned) — the eval suite must be stable and auditable so
accuracy improvements are comparable across training runs.
