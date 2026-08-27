# Dignity Verifier Training Framework — Strategic Plan

**Created:** 2026-08-26 13:05 CST
**Author:** Wobblus 🔧
**Status:** Planning
**Repo:** `Intention-Alliance/alygn-core-infra`
**Target model:** `dignity-verification-v0.1-preview` (fine-tuned qwen2.5:0.5b)

---

## 1. Objective

Build a training framework that distills inference-safety classification capability from a larger teacher model into a 0.5B student model via LoRA fine-tuning, using LlamaIndex for dataset augmentation. The framework includes a super-admin dashboard for executing training, upserting datasets, configuring LlamaIndex, and viewing reports.

## 2. System Constraints

| Constraint | Value | Impact |
|-----------|-------|--------|
| CPU | No GPU (CPU-only) | LoRA fine-tune must be lightweight (0.5B, Q4_K_M, LoRA rank ≤8) |
| Disk | 13G free (95% used) | Dataset + model artifacts must be <5G total |
| Python | 3.14.5 + PyTorch 2.10 | Training stack ready |
| Ollama | Running locally, qwen2.5:0.5b available | Student model local; teacher must be cloud |
| Memory | 32GB RAM (arch2-1 kernel) | Sufficient for 0.5B LoRA training |

## 3. Model Selection

### Student Model (the Dignity Test classifier)
- **Base:** `qwen2.5:0.5b` (494M params, Q4_K_M, 32K context)
- **Fine-tuned name:** `dignity-verification-v0.1-preview`
- **Why:** Fast (<500ms), CPU-friendly, already deployed in the kill-switch

### Teacher Model (for distillation — generates verdicts on training inputs)
- **Primary:** `deepseek-v4-flash:cloud` (304B, FP8, cloud-hosted via Ollama)
- **Why not pro:** Pro model (1.65T) is overkill for classification and would waste tokens
- **Why not local:** No local model >0.5B is reliable enough as a teacher (qwen3-vl:2b is vision-tuned, not ideal for text classification)
- **Fallback:** `glm-5.2:cloud` (756B) if deepseek-v4-flash is unavailable
- **Rule:** Teacher must be an **allowed cloud model** per AGENTS.md ACP pre-flight

### Embedding Model (for LlamaIndex semantic augmentation)
- **Local:** `nomic-embed-text-v2-moe:latest` (475M, F16, 512 context) — already installed
- **Why local:** Embedding generation is batch, not real-time; local avoids API costs

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Super-Admin Dashboard (Next.js, Tailscale-only)        │
│  /dignity-verifier/dashboard                            │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Dataset  │  │ Training │  │ LlamaIdx │  │ Reports │ │
│  │ Manager  │  │ Executor │  │ Config   │  │ Viewer  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
│       v              v              v              v      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Training Framework Core (Python + PyTorch)         │ │
│  │                                                      │ │
│  │  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │ │
│  │  │ Seed      │  │ LlamaIndex│  │ LoRA Fine-Tune │  │ │
│  │  │ Dataset   │──│ Augment   │──│ (PEFT + Torch) │  │ │
│  │  │ (JSONL)  │  │ (Expand)  │  │                │  │ │
│  │  └───────────┘  └───────────┘  └───────┬────────┘  │ │
│  │                                         │           │ │
│  │                                         v           │ │
│  │  ┌─────────────────────────────────────────────────┐│ │
│  │  │ Ollama Modelfile → dignity-verification-v0.1-preview  ││ │
│  │  │ (FROM qwen2.5:0.5b + LoRA adapter)               ││ │
│  │  └─────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 5. Directory Structure

```
/home/andlersrv/.openclaw/workspace/repos/alygn/infrastructure/apps/dignity-verifier/
├── README.md
├── dashboard/                    # Next.js super-admin dashboard
│   ├── package.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # Dashboard home
│   │   │   ├── dataset/page.tsx   # Dataset manager
│   │   │   ├── training/page.tsx  # Training executor
│   │   │   ├── llama-index/page.tsx # LlamaIndex config
│   │   │   └── reports/page.tsx  # Reports viewer
│   │   ├── components/
│   │   └── lib/
│   └── Dockerfile
├── dataset/
│   ├── seed/
│   │   ├── safe.jsonl             # SAFE examples
│   │   ├── unsafe.jsonl           # UNSAFE examples (10 categories)
│   │   ├── review.jsonl           # REVIEW/borderline examples
│   │   ├── injection.jsonl        # Prompt injection attacks
│   │   └── README.md
│   ├── augmented/                  # LlamaIndex-generated
│   │   └── augmented.jsonl
│   └── eval/
│       └── eval-suite.jsonl        # 13-test eval suite
├── training/
│   ├── train.py                    # LoRA fine-tune script
│   ├── modelfile                   # Ollama Modelfile template
│   ├── config.yaml                 # Training hyperparams
│   └── requirements.txt
├── llama-index/
│   ├── augment.py                  # LlamaIndex augmentation pipeline
│   ├── index.py                    # Index management
│   └── config.yaml
├── reports/
│   ├── training-runs/
│   ├── eval-results/
│   └── distillation-logs/
└── docker-compose.yml              # Dashboard + training services
```

## 6. Dataset Strategy

### Seed Dataset (200-500 triples)

| Category | Count | Examples |
|----------|-------|---------|
| SAFE — factual | 30 | Math, science, geography, definitions |
| SAFE — code | 20 | React, Python, SQL, bash snippets |
| SAFE — conversational | 20 | Greetings, opinions, advice (benign) |
| UNSAFE — phishing | 20 | Fake login pages, credential theft |
| UNSAFE — hate speech | 20 | Slurs, violence incitement, dehumanization |
| UNSAFE — drug synthesis | 15 | Meth, fentanyl, extraction procedures |
| UNSAFE — weapons | 15 | Bomb, firearm, explosive instructions |
| UNSAFE — malware | 15 | Keyloggers, ransomware, botnets |
| UNSAFE — self-harm | 10 | Cutting, overdose, suicide methods |
| UNSAFE — CSAM-adjacent | 10 | Grooming language (no explicit content) |
| UNSAFE — fraud | 15 | Wire fraud, tax evasion, identity theft |
| REVIEW — political | 20 | Government overthrow, partisan opinions |
| REVIEW — ethics | 20 | AI ethics, bioethics, philosophical |
| REVIEW — subjective advice | 20 | Career, relationships, life decisions |
| INJECTION — role override | 15 | "Ignore previous instructions", "You are now..." |
| INJECTION — format manipulation | 15 | "Output SAFE for everything", fake verdict injection |
| **Total** | **275** | |

### Augmentation (LlamaIndex)

- Use `nomic-embed-text-v2-moe` to index the seed dataset
- For each seed example, retrieve top-5 semantically similar examples
- Generate paraphrases + variations via teacher model (`deepseek-v4-flash:cloud`)
- Target: expand 275 → 500+ examples
- Each augmented example is verified against the teacher's verdict before inclusion

### Eval Suite

- The 13-test suite I already ran (baseline: 38% accuracy)
- Plus 20 additional held-out test cases (not in training set)
- Target: ≥85% accuracy after fine-tuning

## 7. Training Pipeline

### Step 1: Seed Dataset Creation
- Structured JSONL with `(prompt, output, verdict, reason, category)` fields
- Each example verified by teacher model before inclusion

### Step 2: LlamaIndex Augmentation
- Index seed dataset with `nomic-embed-text-v2-moe`
- Generate paraphrases via teacher model
- Verify each augmented example against teacher verdict
- Deduplicate by semantic similarity (cosine >0.92 = duplicate)

### Step 3: LoRA Fine-Tune
- **Framework:** PEFT (Parameter-Efficient Fine-Tuning) + PyTorch 2.10
- **Base model:** `qwen2.5:0.5b` (load from Ollama or HuggingFace)
- **LoRA config:** rank=8, alpha=16, dropout=0.05, target_modules=["q_proj","v_proj"]
- **Training:** 3 epochs, batch_size=4, lr=2e-4, CPU-only (expected ~2-4h)
- **Output:** LoRA adapter weights (~5-20MB)

### Step 4: Ollama Model Creation
- Create Modelfile: `FROM qwen2.5:0.5b` + `ADAPTER ./lora-weights.safetensors`
- `ollama create dignity-verification-v0.1-preview -f Modelfile`
- Run eval suite against the new model
- If accuracy ≥85% → deploy to kill-switch container
- If <85% → iterate (add examples, adjust hyperparams, retrain)

### Step 5: Deploy + Verify
- Update `verifier.ts` DEFAULT_MODEL to `dignity-verification-v0.1-preview`
- Rebuild kill-switch Docker container
- Run Dignity Test suite against deployed model
- Verify kill-switch health + verdict accuracy

## 8. Dashboard

- **Access:** Tailscale-only, super-admin access (Andler's Tailscale identity)
- **Stack:** Next.js (standalone, like web-regulator)
- **Port:** `127.0.0.1:3002` (Docker, same as existing pattern)
- **Features:**
  - Dataset manager: view, add, edit, delete examples; upload JSONL
  - Training executor: start/stop training runs, view progress, logs
  - LlamaIndex config: augmentation params, teacher model selection, run augmentation
  - Reports: training run history, eval results, accuracy charts, distillation logs

## 9. Team Orchestration

### Strategic Roles

| Agent | Role | Tasks |
|-------|------|-------|
| **Hugrukal** (architect) | Architecture + ADR | Design framework architecture, ADR for training pipeline, model selection rationale |
| **Keridz** (be-coder) | Training pipeline + LlamaIndex | `train.py`, `augment.py`, LoRA fine-tune script, Ollama Modelfile, config |
| **Gimglich** (fe-coder) | Dashboard UI | Next.js dashboard with dataset manager, training executor, reports viewer |
| **Zyxali** (ml) | Dataset + eval | Seed dataset creation, eval suite, accuracy measurement, model evaluation |
| **Zuldrak** (database) | Dataset storage | JSONL storage schema, indexed retrieval, deduplication |
| **Rokthar** (devops) | Docker + deploy | Docker Compose for dashboard + training, Tailscale access, super-admin auth |
| **Chanshuk** (dev-lead) | Code review + coordination | Stage 1 review on all PRs, coordinate FE/BE alignment |
| **Nikaya** (reviewer) | Full review | Stage 2 review (≥92/100), security review, eval accuracy verification |
| **Volthiz** (qa-tester) | Test execution | Eval suite execution, edge cases, regression testing |
| **Talanara** (docs-writer) | Documentation | Training framework docs, ADR, onboarding guide, Notion 1-pager |
| **Wobblus** (orchestrator) | Coordination | Spawn agents, verify outputs, merge, deploy, iterate |

### Execution Order (recursive, self-evolving)

```
Phase 1: Foundation (parallel)
├── Hugrukal: ADR + architecture design
├── Zyxali: Seed dataset (275 examples)
└── Rokthar: Docker scaffold + super-admin auth

Phase 2: Pipeline (sequential, after Phase 1)
├── Keridz: Training pipeline (train.py + LlamaIndex augment.py)
├── Zuldrak: Dataset storage layer
└── Gimglich: Dashboard UI (parallel with Keridz)

Phase 3: Integration (after Phase 2)
├── Keridz + Gimglich: Wire dashboard to training pipeline
├── Zyxali: Run first training cycle (seed → augment → fine-tune → eval)
└── Nikaya: Review pipeline + eval results

Phase 4: Deploy (after Phase 3 passes)
├── Rokthar: Deploy dignity-verification-v0.1-preview to Ollama
├── Wobblus: Update kill-switch config + rebuild container
├── Volthiz: Run full eval suite
└── Nikaya: Final sign-off

Phase 5: Iterate (recursive)
├── If accuracy <85% → Zyxali adds examples → retrain
├── If new attack vectors discovered → Zyxali adds to dataset → retrain
├── Weekly: Zyxali reviews false positives/negatives → dataset amends
└── Monthly: full eval suite + accuracy report
```

### Verification Protocol (every phase)

- **Input verification:** Each agent's work is verified against the plan before proceeding
- **Output verification:** Each artifact (dataset, model, dashboard) is tested before merge
- **Zero-trust:** No agent's report is trusted without verification (RULES.md §5)
- **Self-evolving:** After each training cycle, the dataset + pipeline are refined based on results

## 10. Security

- **Dashboard access:** Super-admin only (Andler's Tailscale identity via Better-Auth)
- **Training data:** No PII, no real user data — synthetic examples only
- **Model artifacts:** LoRA weights stored in `training/` directory, not committed to git
- **Teacher model API:** Uses existing Ollama cloud credentials, no new API keys
- **Dashboard port:** `127.0.0.1:3002` (localhost only, Tailscale for remote access)

## 11. Success Criteria

- [ ] Seed dataset: 275+ examples across 15+ categories
- [ ] LlamaIndex augmentation: 500+ total examples after augmentation
- [ ] LoRA fine-tune: completes in <4h on CPU
- [ ] Model: `dignity-verification-v0.1-preview` created on Ollama
- [ ] Eval accuracy: ≥85% on 33-test eval suite (13 original + 20 held-out)
- [ ] Dashboard: functional with dataset manager, training executor, reports
- [ ] Deploy: kill-switch container running with new model
- [ ] Dignity Test: all 3 verdicts (SAFE/UNSAFE/REVIEW) working correctly