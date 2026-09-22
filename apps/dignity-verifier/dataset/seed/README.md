# Seed Dataset

> ## ⚠️ STATUS: DRAFT — NOT YET CURATED, NOT YET HUMAN-VERIFIED
>
> The `.jsonl` files in this directory are **machine-drafted starting points**,
> not the reviewed ground truth. Every record carries `source: "draft-generated"`
> so nothing downstream can mistake them for the curated set.
>
> **What still has to happen before these are training truth:**
>
> 1. **Zyxali reviews and edits** each record — the curation this README
>    describes. Drafts are meant to make that editing, not replace it.
> 2. **Human verification** — a human must confirm each verdict. The mediator
>    model (`glm-5.3-flash:cloud`) may cross-check, but its agreement is
>    **advisory** and its disagreement is a **flag, not a rejection**. This has
>    **not** been run.
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

**The human verdict is authoritative.** The mediator model
(`glm-5.3-flash:cloud`) may cross-check a record, but its disagreement is a
**flag for human review** — never a rejection, and never an override.

- `human-verified` — a human reviewed and confirmed the verdict. **Authoritative.**
- `ai-verified` — the mediator agreed, but no human has reviewed it yet. Advisory only.
- `disputed` — the mediator disagreed. Routes to the human review queue; the
  record is **not** deleted.

A record may only enter the **eval suite** if it is human-authored *and*
human-verified. An AI-generated measuring instrument would measure the AI
against itself.

### Minimum per-class counts

Gate these **before** training starts, not after:

- **≥30 per class for training.** Below this the class is not a class. REVIEW
  sits at 4/612 today; inverse-sqrt weighting gives it 8.43×, which means 4
examples carry the gradient weight of ~8 SAFE examples each. That is not
compensation, it is 4 points dominating the loss.
- **≥20 per class for eval.** Per-class recall at n=7 has roughly a ±18pp 95%
  confidence interval — you cannot tell a good classifier from a bad one. Any
  per-class metric below n=20 is noise presented as a number; suppress it
  rather than print it.
- **If a class cannot reach the floor**, the honest option is to drop it from
  the trained taxonomy and handle it as a post-hoc abstain band on a binary
  head — not to train a third class on 4 examples.

## Record schema

Base shape (see `../README.md`): `(id, prompt, output, verdict, reason, category, source)`.

Provenance is **load-bearing** and cannot be expressed by `source` alone —
`source` says where a record came from, not who is accountable for its label.

### The authority fields

| field | values | meaning |
|-------|--------|---------|
| `authored_by` | `human:<name>` \| `ai:draft-generated` | who wrote the record |
| `verified_by` | `human:<name>` \| `ai:<model>` \| `null` | who confirmed the verdict |
| `verification_status` | `human-verified` \| `ai-verified` \| `unverified` \| `disputed` | the trust state |

### The audit fields (never authoritative)

| field | values | meaning |
|-------|--------|---------|
| `ai_verdict` | `SAFE` \| `UNSAFE` \| `REVIEW` \| `null` | what the mediator said — **audit only** |
| `ai_verdict_agreement` | `true` \| `false` \| `null` | did it agree with the human |
| `mediated_by` | model id \| `null` | which model produced/checked it |
| `review_state` | `accepted` \| `flagged` \| `pending_review` | queue position for flagged records |

**No consumer may read `ai_verdict` as truth.** It exists so a reviewer can see
*why* a record was flagged, not so a pipeline can use it as a label. The
`ai_verdict` / `verified_by` split is what makes the human/AI boundary auditable
rather than merely documented.

`source` keeps its existing values (`seed`, `draft-generated`, `augmented`) and
describes origin only.

### Trust tiers (what a reviewer can rely on)

| tier | authored | verified | usable for |
|------|----------|----------|------------|
| **gold** | human | human | train **and** eval |
| **silver** | human | ai | train (spot-check) |
| **silver** | ai | human | train — the human-in-the-loop path |
| **bronze** | ai | ai | train only, **never eval** |
| — | any | `disputed` | **quarantine** — human adjudicates |

**Hard rule:** the eval suite must be **gold** — human-authored *and*
human-verified. No AI-drafted or AI-verified record may enter the held-out set.
The eval is the measuring instrument; an AI-generated instrument measures the AI
against itself.

**Promotion is explicit.** `draft-generated` is never silently promoted to
`seed`. Promotion is a human act that rewrites `authored_by`, `verified_by`,
and `source` together.

The current files are all `draft-generated` / `unverified`.

### Legacy records

The 270 pre-migration records (70 SAFE + 110 UNSAFE + 60 REVIEW + 30 INJECTION)
carried no `id` field; `migrate-add-id-source.ts` backfilled deterministic ids
(`seed-<file>-<NNN>`) and `source: "seed"`. They predate this provenance
convention, so they carry no `authored_by` / `verified_by`. Treat them as
**unverified** until a human confirms them — do not infer human authorship from
their presence in the repo.

## Git policy

**Local-only — deliberately not committed.**

`.gitignore` excludes `apps/dignity-verifier/dataset/seed/*.jsonl` (see PR #87,
"keep seed datasets out of the repo"). Only this README is tracked. The datasets
are delivered on deployment and backed up by the local `deploy.sh` to
`.seeds-backup/` before it resets the working tree.

An earlier revision of this section said "Committed" and described the files as
durable ground truth. That contradicted both the `.gitignore` and PR #87, and it
was wrong — corrected here so the policy has one answer.
