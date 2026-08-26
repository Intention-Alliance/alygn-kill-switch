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
3. **Paraphrase** — teacher model (`deepseek-v4-flash:cloud`) generates
   paraphrases + variations.
4. **Verify** — each augmented example is checked against the teacher's verdict;
   divergence → reject.
5. **Dedupe** — cosine >0.92 = duplicate → drop.

## Teacher model

- **Primary:** `deepseek-v4-flash:cloud` (allowed cloud model)
- **Fallback:** `glm-5.2:cloud`
- Must be an **allowed cloud model** per AGENTS.md ACP pre-flight.

## Output

Writes to `dataset/augmented/augmented.jsonl` (gitignored).

## Git policy

`augment.py`, `index.py`, `config.yaml` — **committed**. Generated augmented
dataset — **gitignored**.
