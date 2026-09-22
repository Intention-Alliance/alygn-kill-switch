# Seed Dataset

> ## ⚠️ STATUS: DRAFT — NOT YET CURATED, NOT YET TEACHER-VERIFIED
>
> The `.jsonl` files in this directory are **machine-drafted starting points**,
> not the reviewed ground truth. Every record carries `source: "draft-generated"`
> so nothing downstream can mistake them for the curated set.
>
> **What still has to happen before these are training truth:**
>
> 1. **Zyxali reviews and edits** each record — the curation this README
>    describes. Drafts are meant to make that editing, not replace it.
> 2. **Teacher verification** — every record must be checked against
>    `glm-5.3-flash:cloud` and the verdict must match, or the record is flagged.
>    This has **not** been run.
> 3. **Semantic dedup** — `validate-schema.ts --dedup` (cosine > 0.92) needs
>    local Ollama and has **not** been run. Exact-duplicate and schema checks
>    have passed (280 records, 0 errors, 0 PII flags).
>
> Until 1–3 are done, treat this as a scaffold. Do not train on it as-is, and do
> not cite it as ground truth.
>
> **Safety note on UNSAFE outputs.** Harmful records name the pattern at the
> level of the existing eval suite and carry **no operational detail** — no
> reagent lists, dosages, code, or addresses. The classifier needs the request
> shape, not a working recipe.

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

## Target counts (280 total)

> The breakdown below sums to **280**, not the 275 this section used to claim.
> The per-category numbers are the authoritative ones and they are unchanged —
> the old total was simply mis-added (70 + 120 + 60 + 30 = 280). Corrected here
> rather than by trimming 5 real examples to fit a typo.

- SAFE: 70 (30 factual + 20 code + 20 conversational)
- UNSAFE: 120 (20 phishing, 20 hate, 15 drug, 15 weapons, 15 malware, 10
  self-harm, 10 CSAM-adjacent, 15 fraud)
- REVIEW: 60 (20 political, 20 ethics, 20 subjective advice)
- INJECTION: 30 (15 role override, 15 format manipulation)

## Verification rule

Every seed example is **verified by the teacher model** (`glm-5.3-flash:cloud`)
before inclusion — the teacher's verdict must match the curated verdict, or the
example is flagged for review.

## Record schema

See `../README.md` — same `(id, prompt, output, verdict, reason, category, source)`
shape.

`source` records provenance, and it is load-bearing:

| value | meaning |
|-------|---------|
| `seed` | Zyxali-curated, teacher-verified — the reviewed ground truth |
| `draft-generated` | machine-drafted scaffold, **not** reviewed or verified |

The current files are all `draft-generated`. A record should only become
`seed` once it has passed curation and teacher verification.

## Git policy

**Local-only — deliberately not committed.**

`.gitignore` excludes `apps/dignity-verifier/dataset/seed/*.jsonl` (see PR #87,
"keep seed datasets out of the repo"). Only this README is tracked. The datasets
are delivered on deployment and backed up by the local `deploy.sh` to
`.seeds-backup/` before it resets the working tree.

An earlier revision of this section said "Committed" and described the files as
durable ground truth. That contradicted both the `.gitignore` and PR #87, and it
was wrong — corrected here so the policy has one answer.
