# ADR: Dignity Verifier Training Framework

## Status

**Proposed** — 2026-08-26

## Context

The ALYGN kill-switch verifier (`apps/server-kill-switch`) classifies inference
output as `SAFE | UNSAFE | REVIEW` using a stock `qwen2.5:0.5b` model driven by a
hand-written system prompt (see ADR-2026-08-23). Baseline accuracy on the 13-test
eval suite is **38%** — too low for a safety-critical gate. The hand-tuned prompt
approach has hit its ceiling: a 0.5B model cannot reliably separate the full
taxonomy of unsafe content from benign content using few-shot prompting alone.

We need a **training framework** that distills classification capability from a
large **teacher** model into a fine-tuned **student** model, so the verifier
learns the decision boundary instead of being prompted toward it. The framework
must be CPU-only, disk-constrained (<5G artifacts), and operated by a super-admin
through a Tailscale-only dashboard.

## Decision

We build a **Dignity Verifier Training Framework** at
`apps/dignity-verifier/` that distills inference-safety classification from a
cloud teacher into a local 0.5B student via LoRA fine-tuning, with LlamaIndex
semantic augmentation and a super-admin dashboard. The pipeline is
**seed → augment → fine-tune → eval → deploy**, and it is **self-evolving**:
eval results feed back into the dataset for the next cycle.

### Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│  Super-Admin Dashboard (Next.js, Tailscale-only)             │
│  apps/dignity-verifier/dashboard · 127.0.0.1:3002            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Dataset  │ │ Training │ │ LlamaIdx │ │ Reports  │        │
│  │ Manager  │ │ Executor │ │ Config   │ │ Viewer   │        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       │  /api/* rewrites (HTTP) │             │              │
│       └────────────┴────────────┴─────────────┘              │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP (127.0.0.1:3003)
┌───────────────────────────▼──────────────────────────────────┐
│  Training Framework Core (Python + PyTorch)                    │
│  ┌───────────┐  ┌───────────┐  ┌────────────────┐             │
│  │ Seed      │  │ LlamaIndex│  │ LoRA Fine-Tune │             │
│  │ Dataset   │─▶│ Augment   │─▶│ (PEFT + Torch) │             │
│  │ (JSONL)   │  │ (Expand)  │  │                │             │
│  └───────────┘  └───────────┘  └───────┬────────┘             │
│                                        ▼                      │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Ollama Modelfile → dignity-verification-v0.1-preview           │  │
│  │ (FROM qwen2.5:0.5b + LoRA adapter)                       │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Components and boundaries:**

1. **Dashboard** (Next.js, `apps/dignity-verifier/dashboard`) — thin client.
   Renders dataset manager, training executor, LlamaIndex config, and reports
   viewer. It does **not** run training or augmentation; it calls the core over
   HTTP via `/api/*` rewrites. Super-admin auth via Better-Auth (Tailscale
   identity). Binds `127.0.0.1:3002`.

2. **Training Framework Core** (Python + PyTorch, `apps/dignity-verifier/`) —
   the authoritative engine. Owns the seed/augmented/eval datasets, runs
   LlamaIndex augmentation, executes LoRA fine-tuning, and creates the Ollama
   model. Exposes an HTTP API on `127.0.0.1:3003` for the dashboard. Runs
   CPU-only.

3. **Ollama** (external) — hosts the student base model (`qwen2.5:0.5b`), the
   embedding model (`nomic-embed-text-v2-moe`), and the created
   `dignity-verification-v0.1-preview`. The teacher (`deepseek-v4-flash:cloud`) is
   reached through Ollama's cloud routing.

**Data flow:** Dashboard issues commands → Core reads seed dataset → LlamaIndex
augments (embedding + teacher paraphrase) → LoRA fine-tunes student → Ollama
creates model → eval suite measures accuracy → results written to `reports/` →
dashboard displays → false positives/negatives become new seed examples →
retrain.

### Model selection rationale

| Role | Model | Why |
|------|-------|-----|
| **Teacher** | `deepseek-v4-flash:cloud` (304B, FP8) | Strong enough to reliably classify the full taxonomy; cloud-hosted so no local resource cost. Fallback `glm-5.2:cloud`. Must be an **allowed cloud model** per AGENTS.md ACP pre-flight. |
| **Student** | `qwen2.5:0.5b` (494M, Q4_K_M) | Already deployed in the kill-switch; <500ms on CPU; the exact model we need to improve. |
| **Embedding** | `nomic-embed-text-v2-moe:latest` (475M, F16) | Local, batch embedding avoids API cost; already installed. |

**Teacher choice rationale:** `deepseek-v4-flash:cloud` is the smallest allowed
cloud model that reliably separates the taxonomy. The 1.65T pro model is overkill
for classification and wastes tokens. No local model >0.5B is reliable enough as a
teacher (`qwen3-vl:2b` is vision-tuned, not ideal for text classification).

**Student choice rationale:** We are not choosing a new model — we are improving
the one already in production. Distilling the teacher's boundary into the existing
0.5B verifier keeps the kill-switch fast (<500ms) and CPU-only while raising
accuracy from 38% toward ≥85%.

**Embedding choice rationale:** Embedding generation is batch (not real-time), so
a local model avoids per-call API cost while keeping augmentation fully offline.

### Training pipeline design

**Step 1 — Seed dataset.** 275+ curated `(prompt, output, verdict, reason,
category)` triples across 15+ categories (SAFE / UNSAFE / REVIEW / INJECTION).
Each example is verified by the teacher before inclusion.

**Step 2 — LlamaIndex augmentation.** Index the seed with
`nomic-embed-text-v2-moe`; for each example retrieve top-5 semantic neighbors;
teacher generates paraphrases; each augmented example is verified against the
teacher verdict; dedupe by cosine >0.92. Target: 275 → 500+.

**Step 3 — LoRA fine-tune.** PEFT + PyTorch 2.10 on `qwen2.5:0.5b`. LoRA
rank=8, alpha=16, dropout=0.05, target `["q_proj","v_proj"]`. 3 epochs,
batch_size=4, lr=2e-4, CPU-only (~2–4h). Output: adapter (~5–20MB).

**Step 4 — Ollama model creation.** Modelfile `FROM qwen2.5:0.5b` +
`ADAPTER ./lora-weights.safetensors` → `ollama create
dignity-verification-v0.1-preview`. Run the 33-test eval suite.

**Step 5 — Deploy + verify.** If accuracy ≥85%, update kill-switch
`DEFAULT_MODEL` to `dignity-verification-v0.1-preview`, rebuild the kill-switch
container, run the Dignity Test suite. If <85%, iterate.

### Dashboard architecture

- **Stack:** Next.js (App Router, standalone output) — same as `apps/web-regulator`.
- **Access:** Tailscale-only, super-admin (Andler's Tailscale identity via
  Better-Auth). No self-signup.
- **Port:** `127.0.0.1:3002` in Docker (localhost only; Tailscale for remote).
- **Pages:** `/` (home), `/dataset` (manager), `/training` (executor),
  `/llama-index` (config), `/reports` (viewer).
- **API:** thin client; `/api/*` rewrites proxy to the Training Core
  (`127.0.0.1:3003`), mirroring web-regulator's proxy pattern.
- **Security headers:** CSP + X-Frame-Options DENY + nosniff, copied from
  `apps/web-regulator/next.config.ts`.

### Directory structure

Confirmed the strategic plan's structure, with minor refinements (added
`dashboard/src/` sub-READMEs, `reports/` subdirectories, and a
`docker-compose.yml` at the framework root):

```
apps/dignity-verifier/
├── README.md
├── docker-compose.yml          # dashboard + core services
├── dashboard/                  # Next.js super-admin dashboard
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app/                # layout, page, dataset, training, llama-index, reports
│       ├── components/
│       └── lib/                # api-client, auth-client, types
├── dataset/
│   ├── seed/                   # safe/unsafe/review/injection JSONL (committed)
│   ├── augmented/              # LlamaIndex output (gitignored)
│   └── eval/                   # 33-test eval suite (committed)
├── training/
│   ├── train.py
│   ├── modelfile
│   ├── config.yaml
│   └── requirements.txt
├── llama-index/
│   ├── augment.py
│   ├── index.py
│   └── config.yaml
└── reports/                    # gitignored
    ├── training-runs/
    ├── eval-results/
    └── distillation-logs/
```

**Refinements vs. the plan:** (1) added `docker-compose.yml` at the framework
root to co-locate dashboard + core; (2) split `reports/` into the three
subdirectories the plan listed as files; (3) added `dashboard/src/` READMEs for
the App Router structure; (4) clarified git policy per directory (seed/eval
committed; augmented/reports/adapter gitignored).

### Security boundaries

- **No PII.** Training data is synthetic only — no real user data, no real
  inference outputs. The framework never ingests production traffic.
- **Super-admin only.** Dashboard auth via Better-Auth with Andler's Tailscale
  identity; every API route enforces the admin allowlist.
- **Localhost Docker.** Dashboard binds `127.0.0.1:3002`; core binds
  `127.0.0.1:3003`. Tailscale provides remote access; no public exposure.
- **Artifacts gitignored.** LoRA weights, augmented datasets, and reports are
  never committed. Seed + eval (curated ground truth) are committed.
- **Teacher via existing credentials.** Uses existing Ollama cloud credentials;
  no new API keys.
- **Disk budget.** All framework artifacts (adapter + base-model cache +
  augmented dataset) stay <5G per the constraint.

### Self-evolving loop

The framework is designed to iterate continuously:

1. **Eval** — after each training cycle, run the 33-test suite; record
   per-category accuracy and confusion in `reports/eval-results/`.
2. **Dataset amends** — false positives/negatives from eval become new seed
   examples (curated by Zyxali). New attack vectors are added to the taxonomy.
3. **Retrain** — re-run augment → fine-tune → eval with the amended dataset.
4. **Weekly** — Zyxali reviews false positives/negatives → dataset amends.
5. **Monthly** — full eval suite + accuracy report.

The loop is **recursive**: each cycle's eval output is the next cycle's dataset
input. The ≥85% target is the gate for deploy; below it, the loop continues.

## Component contracts

### 1. Dataset manager ↔ Training executor

The dataset manager (dashboard) writes/reads dataset records; the training
executor (core) consumes them.

- **Dataset record** (JSONL line):
  `{ id, prompt, output, verdict, reason, category, source, parent_id? }`
  - `verdict` ∈ `SAFE | UNSAFE | REVIEW`
  - `source` ∈ `seed | augmented | eval`
  - `parent_id` present only for augmented (points to source seed example)
- **Contract:** The executor reads a **merged** dataset (seed + augmented) as
  input to fine-tuning. The manager guarantees: every record has a valid
  `verdict` and `category`; no PII; `id` unique. The executor guarantees: it
  never mutates seed records in place (writes augmented to `augmented/`).

### 2. LlamaIndex augmenter ↔ Dataset storage

- **Input:** seed dataset (committed JSONL) + embedding model
  (`nomic-embed-text-v2-moe`).
- **Output:** `dataset/augmented/augmented.jsonl` (gitignored), each record with
  `source: "augmented"` and `parent_id`.
- **Contract:** augmenter reads seed, writes augmented. It must verify each
  augmented example against the teacher verdict (divergence → reject) and dedupe
  by cosine >0.92. Storage layer (Zuldrak) provides indexed retrieval + dedup;
  augmenter consumes it.

### 3. Dashboard ↔ Training pipeline (API routes)

The dashboard proxies `/api/*` to the core (`127.0.0.1:3003`). Core endpoints:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/dataset` | GET/POST/PUT/DELETE | CRUD dataset records; upload JSONL |
| `/api/training/start` | POST | Start a training run (seed→augment→fine-tune) |
| `/api/training/stop` | POST | Stop a running training run |
| `/api/training/status` | GET | Progress + logs of active run |
| `/api/llama-index/config` | GET/PUT | Augmentation params, teacher model |
| `/api/llama-index/run` | POST | Trigger augmentation |
| `/api/reports/training-runs` | GET | Training run history |
| `/api/reports/eval-results` | GET | Eval results + accuracy |
| `/api/reports/distillation-logs` | GET | Distillation/verification logs |

**Contract:** All routes require super-admin auth (Better-Auth session). The
core is the source of truth; the dashboard is a read/write client. Long-running
operations (training, augmentation) return a run `id` immediately and expose
status via `/api/training/status` (polling or SSE).

### 4. Ollama model creation ↔ LoRA adapter output

- **Input:** LoRA adapter weights (`training/lora-weights.safetensors`) +
  Modelfile template.
- **Output:** `dignity-verification-v0.1-preview` model in Ollama.
- **Contract:** `train.py` writes the adapter to a known path. The Modelfile is
  `FROM qwen2.5:0.5b` + `ADAPTER ./lora-weights.safetensors`. `ollama create
  dignity-verification-v0.1-preview -f modelfile` produces the model. The eval runner
  then calls the model via Ollama's OpenAI-compatible API and compares verdicts
  against the eval suite's expected labels.

## Consequences

### Positive

1. **Accuracy gain** — fine-tuning replaces hand-prompting, targeting ≥85% vs.
   the current 38% baseline.
2. **Fast, CPU-only verifier** — the improved model stays 0.5B, <500ms, no GPU.
3. **Self-evolving** — the framework continuously improves from eval feedback.
4. **Reuses existing patterns** — dashboard mirrors web-regulator; verifier
   integration mirrors the kill-switch ADR.
5. **No new credentials** — teacher uses existing Ollama cloud auth.

### Negative

1. **Training time** — CPU-only LoRA takes ~2–4h per cycle; iteration is slow.
2. **Teacher dependency** — augmentation and seed verification depend on the
   cloud teacher being available (fallback `glm-5.2:cloud`).
3. **Disk pressure** — base-model cache + adapter + augmented dataset must stay
   <5G; requires active cleanup between cycles.
4. **Distillation ceiling** — a 0.5B student cannot fully match a 304B teacher;
   ≥85% is achievable but 100% is not.

### Neutral

1. **New operational surface** — the framework adds a dashboard + core service
   to the stack; both are Tailscale-only and localhost-bound.
2. **Dataset is synthetic** — no real data, so the model may not generalize to
   production traffic without periodic re-curation.

## Alternatives considered

### Rejected: Keep the hand-written system prompt (no fine-tuning)

**Why rejected:** The 38% baseline proves prompting a 0.5B model cannot
reliably separate the taxonomy. Fine-tuning is the only path to ≥85% on this
model size.

### Rejected: A larger student model (7B+)

**Why rejected:** A 7B+ model cannot run on CPU in <500ms and would require GPU
resources. The whole point is a fast, CPU-only verifier; 0.5B is the constraint.

### Rejected: Local teacher model

**Why rejected:** No local model >0.5B is reliable enough as a teacher
(`qwen3-vl:2b` is vision-tuned). Cloud teacher is required for distillation
quality.

### Rejected: Full fine-tuning (not LoRA)

**Why rejected:** Full fine-tuning of 0.5B on CPU is slow and produces a large
artifact. LoRA (rank ≤8) is parameter-efficient, fast on CPU, and produces a
~5–20MB adapter that plugs into Ollama via `ADAPTER`.

### Rejected: Separate training microservice with its own auth

**Why rejected:** The dashboard already handles super-admin auth; the core is a
localhost-bound backend, not a public service. Keeping auth in the dashboard
and the core as a thin HTTP backend reduces surface.

## References

- [Strategic Plan](./../dignity-verifier-training-framework-strategic-plan.md) — the plan this ADR implements
- [ADR-2026-08-23](./ADR-2026-08-23-kill-switch-inference-verification.md) — kill-switch verifier (the consumer of the trained model)
- `apps/web-regulator/` — dashboard pattern (Next.js standalone, Better-Auth, proxy rewrites)
- `apps/server-kill-switch/` — verifier integration + Docker pattern
- `apps/dignity-verifier/` — this framework's scaffold
