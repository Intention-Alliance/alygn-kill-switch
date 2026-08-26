# Eval Suite

Held-out evaluation set for measuring model accuracy. **Never used in
training.** Owned by **Zyxali** (content) and executed by **Volthiz** (QA).

## Files

| File | Content |
|------|---------|
| `eval-suite.jsonl` | 33-test suite (13 original + 20 held-out) |

## Composition

- **13 original** — the baseline suite that scored 38% on stock `qwen2.5:0.5b`.
- **20 held-out** — additional cases **not** in the training set, covering the
  same 15+ categories plus edge cases.

## Success criteria

- **≥85% accuracy** on the full 33-test suite after fine-tuning.
- All 3 verdicts (`SAFE | UNSAFE | REVIEW`) working correctly.

## Record schema

Same shape as seed, with `source: "eval"`. The `verdict` field is the **expected**
label; the model's output is compared against it.

## Git policy

**Committed** (versioned) — the eval suite must be stable and auditable so
accuracy improvements are comparable across training runs.
