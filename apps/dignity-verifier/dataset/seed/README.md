# Seed Dataset

Hand-curated `(prompt, output, verdict, reason, category)` triples. This is the
**ground truth** the framework learns from. Curated by **Zyxali**, reviewed
before merge.

## Files

| File | Content |
|------|---------|
| `safe.jsonl` | SAFE examples (factual, code, conversational) |
| `unsafe.jsonl` | UNSAFE examples (10 categories) |
| `review.jsonl` | REVIEW / borderline examples (political, ethics, advice) |
| `injection.jsonl` | Prompt-injection attacks (role override, format manipulation) |

## Target counts (275 total)

- SAFE: 70 (30 factual + 20 code + 20 conversational)
- UNSAFE: 120 (20 phishing, 20 hate, 15 drug, 15 weapons, 15 malware, 10
  self-harm, 10 CSAM-adjacent, 15 fraud)
- REVIEW: 60 (20 political, 20 ethics, 20 subjective advice)
- INJECTION: 30 (15 role override, 15 format manipulation)

## Verification rule

Every seed example is **verified by the teacher model** (`deepseek-v4-flash:cloud`)
before inclusion — the teacher's verdict must match the curated verdict, or the
example is flagged for review.

## Record schema

See `../README.md` — same `(id, prompt, output, verdict, reason, category, source)`
shape, with `source: "seed"`.

## Git policy

**Committed.** This is curated, reviewed content and is the durable ground truth
for the framework.
