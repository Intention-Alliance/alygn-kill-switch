# Dignity Verifier Training Framework

Distills inference-safety classification capability from a large **teacher** model
(`deepseek-v4-flash:cloud`) into a small **student** model (`qwen2.5:0.5b`) via
LoRA fine-tuning, using LlamaIndex for dataset augmentation. Ships a super-admin
dashboard for executing training, upserting datasets, configuring LlamaIndex, and
viewing reports.

**Target model:** `dignity-verifier-preview-v1` (fine-tuned `qwen2.5:0.5b`)

## Why this exists

The kill-switch verifier (`apps/server-kill-switch`) classifies inference output as
`SAFE | UNSAFE | REVIEW` using a stock `qwen2.5:0.5b` with a hand-written system
prompt. Baseline accuracy on the 13-test eval suite is **38%** — too low for a
safety-critical gate. This framework replaces the hand-tuned prompt with a
**fine-tuned** 0.5B model that has learned the classification boundary from a
stronger teacher, targeting **≥85%** accuracy.

## System constraints (hard limits)

| Constraint | Value | Impact |
|-----------|-------|--------|
| CPU | No GPU (CPU-only) | LoRA rank ≤8, batch_size ≤4 |
| Disk | 16G free | All framework artifacts <5G total |
| Python | 3.14.5 + PyTorch 2.10 | Training stack ready |
| Ollama | Local, `qwen2.5:0.5b` present | Student local; teacher must be cloud |
| Memory | 32GB RAM | Sufficient for 0.5B LoRA training |

## Directory map

```
apps/dignity-verifier/
├── README.md            ← this file
├── dashboard/           ← Next.js super-admin dashboard (Tailscale-only)
├── dataset/             ← seed / augmented / eval JSONL datasets
├── training/            ← LoRA fine-tune pipeline + Ollama Modelfile
├── llama-index/         ← semantic augmentation pipeline
├── reports/             ← training runs, eval results, distillation logs
└── docker-compose.yml   ← dashboard + training services
```

## Architecture

See `docs/adr/ADR-dignity-verifier-training-framework.md` for the full
architecture design, component contracts, and security boundaries.

## Pipeline (seed → augment → fine-tune → eval → deploy)

1. **Seed** — 275+ curated `(prompt, output, verdict, reason, category)` triples
   across 15+ categories (SAFE / UNSAFE / REVIEW / INJECTION).
2. **Augment** — LlamaIndex indexes the seed with `nomic-embed-text-v2-moe`,
   retrieves top-5 semantic neighbors, and the teacher generates paraphrases.
   Each augmented example is verified against the teacher verdict before inclusion.
   Target: 275 → 500+.
3. **Fine-tune** — PEFT LoRA (rank=8, alpha=16, dropout=0.05, target
   `q_proj`/`v_proj`) on `qwen2.5:0.5b`, 3 epochs, batch_size=4, lr=2e-4, CPU-only
   (~2–4h). Output: LoRA adapter (~5–20MB).
4. **Eval** — 33-test suite (13 original + 20 held-out). Target ≥85%.
5. **Deploy** — `ollama create dignity-verifier-preview-v1` from Modelfile
   (`FROM qwen2.5:0.5b` + `ADAPTER`), then update kill-switch `DEFAULT_MODEL`.

## Self-evolving loop

After each training cycle, eval results feed back into the dataset: false
positives/negatives are added as new examples, the pipeline is retrained, and
accuracy is re-measured. See ADR §"Self-Evolving Loop".

## Security

- **Super-admin only** — Andler's Tailscale identity via Better-Auth.
- **No PII** — synthetic examples only; no real user data.
- **Localhost Docker** — dashboard binds `127.0.0.1:3002`; Tailscale for remote.
- **Artifacts gitignored** — LoRA weights, augmented datasets, and reports are
  never committed.

## Team

Architecture: **Hugrukal** · Pipeline: **Keridz** · Dashboard: **Gimglich** ·
Dataset/eval: **Zyxali** · Storage: **Zuldrak** · Docker/deploy: **Rokthar** ·
Review: **Chanshuk** / **Nikaya** · QA: **Volthiz** · Docs: **Talanara** ·
Orchestration: **Wobblus**
