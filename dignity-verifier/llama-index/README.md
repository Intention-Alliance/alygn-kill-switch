# LlamaIndex Augmentation

Semantic dataset augmentation using LlamaIndex + local embeddings. Owned by
**Keridz** (pipeline).

## Files

| File | Purpose |
|------|---------|
| `augment.py` | Augmentation pipeline (index → retrieve → paraphrase → verify → dedupe) |
| `index.py` | Index management (build/refresh the semantic index) |
| `config.yaml` | Augmentation params (top-k, similarity threshold, teacher model) |

## Flow

1. **Index** — build a vector index over the seed dataset using
   `nomic-embed-text-v2-moe` (local, F16, 512 context).
2. **Retrieve** — for each seed example, fetch top-5 semantically similar
   examples.
3. **Paraphrase** — the mediator model (`glm-5.3-flash:cloud`) generates
   paraphrases + variations.
4. **Verify** — each candidate is checked against the mediator's verdict.
   Divergence **quarantines** the candidate for human review — it does **not**
   reject it. The human verdict is authoritative; the mediator's disagreement is
   a flag, never a veto.
5. **Dedupe** — cosine >0.92 = duplicate → drop.

## Mediator model

> **Not a trainer.** This model proposes labels and paraphrases; it never owns
> ground truth. The human is the trainer. See the parent README's
> "Who trains — the AI mediator policy".

- **Primary:** `glm-5.3-flash:cloud` (allowed cloud model)
- **Fallback:** `glm-5.2:cloud`
- Must be an **allowed cloud model** per AGENTS.md ACP pre-flight.
- **Optional:** the whole augment stage can be disabled and the pipeline run
  seed → train. Nothing about training requires the mediator.

## Mediator provenance

Accepted augmented records carry a `teacher` field naming the model that
produced them (e.g. `"glm-5.3-flash:cloud"`). Records **without** a `teacher`
field predate this convention and were produced by the earlier
`deepseek-v4-flash:cloud` era — absence of the field means deepseek.

## Output

Writes to `dataset/augmented/augmented.jsonl` (gitignored).

## Git policy

`augment.py`, `index.py`, `config.yaml` — **committed**. Generated augmented
dataset — **gitignored**.
