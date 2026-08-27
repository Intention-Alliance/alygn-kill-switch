# Dignity Verifier — LoRA Fine-Tuning Pipeline (WS-3)

Fine-tunes `Qwen/Qwen2.5-0.5B` (Ollama tag `qwen2.5:0.5b`) into
`dignity-verification-v0.1-preview` — a SAFE / UNSAFE / REVIEW / INJECTION
classifier for the kill-switch safety gate — via PEFT LoRA on **CPU only**.

This is the WS-3 workstream of the Dignity Training Pipeline plan
(`docs/plans/dignity-training-pipeline-plan-2026-08-26.md`).

## Files

| File | Purpose |
|------|---------|
| `train.py` | LoRA fine-tune script (PEFT + PyTorch, CPU) |
| `config.yaml` | Training hyperparameters + class-weight scheme |
| `requirements.txt` | Python deps (torch CPU, transformers, peft, mlflow) |
| `modelfile` | Ollama Modelfile (`FROM qwen2.5:0.5b` + `ADAPTER`) |
| `README.md` | This file |

## Class-weighted loss (Andler-direct delta)

The REVIEW class is severely underrepresented in the augmented dataset
(4/612 at this base). To prevent the model from collapsing REVIEW into the
majority classes, training uses a **class-weighted cross-entropy loss**.

**Weights are computed dynamically** from the actual dataset distribution at
training start — never hardcoded. They are logged to stdout and MLflow params
at startup.

### Default scheme: inverse-square-root frequency

```
weight_c = (1 / sqrt(freq_c)) / mean(1 / sqrt(freq_c))
```

Normalized so the mean weight across samples == 1 (loss scale stays
comparable to unweighted training). This is **gentler than pure inverse
frequency**, which would over-boost rare classes.

Computed weights on the current 612-set (UNSAFE=411, SAFE=197, REVIEW=4):

| Verdict | Count | freq | inverse-sqrt weight | pure-inverse weight |
|---------|-------|------|--------------------:|--------------------:|
| UNSAFE  | 411   | 0.672 | 0.83 | 0.50 |
| SAFE    | 197   | 0.322 | 1.20 | 1.04 |
| REVIEW  | 4     | 0.007 | **8.43** | **51.0** |

Inverse-sqrt boosts REVIEW ~10x vs UNSAFE (gentle); pure inverse would boost
it ~100x (aggressive, risks overfitting the 4 examples). Inverse-sqrt is the
default for this reason.

### Switching schemes

Edit `config.yaml`:

```yaml
class_weight:
  scheme: "inverse_sqrt"   # or "inverse" for pure inverse frequency
```

## Setup (Python 3.12+, CPU)

```bash
cd apps/dignity-verifier/training
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv/bin/python -r requirements.txt
```

> The base model (`Qwen/Qwen2.5-0.5B`, ~1GB) is downloaded from HuggingFace
> on first run and cached in `~/.cache/huggingface/`.

## Dry-run (proves the loop)

```bash
.venv/bin/python train.py --dry-run
```

Trains on a deterministic 24-example subset for 1 epoch. Verified 2026-08-27:

- **Loss curve:** 5.36 → 5.19 → 6.39 → 6.13 (mean 6.13)
- **Wall-clock:** ~34s (incl. model load + MLflow)
- **Peak RSS:** ~4.9 GB (fits the 10 Gi available)
- **Adapter:** `lora-weights/adapter_model.safetensors` (2.07 MB)
- **MLflow:** run logged; model registered as
  `dignity-verification-v0.1-preview` (version 1)

## Full run (gated on rebalanced dataset)

**Do NOT run full training yet.** The rebalanced dataset (REVIEW augmented
with the new teacher, from the parallel WS-2 task) must land first. When it
does, run:

```bash
cd apps/dignity-verifier/training
.venv/bin/python train.py
```

### Expected full-run wall-clock (CPU, 4 cores)

- Dry-run: ~7.5s per batch-step (batch=4), ~30s per optimizer step (grad_accum=4).
- Full run: 612+ examples → ~153 batch-steps/epoch → ~38 optimizer steps/epoch.
- 3 epochs → ~114 optimizer steps → **~55–70 min** (well within the 2–4h budget).
- If the rebalanced dataset grows to ~800 examples, expect ~75–90 min.

### Memory footprint

Peak RSS ~4.9 GB (base model fp32 ~2GB + activations/gradients + MLflow
serialization). Host has 10 Gi available — fits comfortably.

### Output

- Adapter: `lora-weights/adapter_model.safetensors` (~2 MB, gitignored)
- MLflow: `training/reports/mlflow.db` (SQLite) + registered model
  `dignity-verification-v0.1-preview`

## Deploy to Ollama

```bash
cd apps/dignity-verifier/training
ollama create dignity-verification-v0.1-preview -f modelfile
```

The Modelfile references `./lora-weights/adapter_model.safetensors` (the PEFT
output filename).

## Eval integration (WS-1 runner)

After training, the model plugs into the WS-1 eval runner:

```bash
cd apps/dignity-verifier
bun eval/run-eval.ts --model dignity-verification-v0.1-preview
```

The runner loads the deployed Ollama model, runs the 33-test suite
(`dataset/eval/eval-suite.jsonl`), and writes accuracy / per-category /
confusion-matrix metrics to `reports/eval-results/` and the dashboard.

> The eval runner (`eval/run-eval.ts`) is owned by the WS-1/WS-4 workstream
> and is not part of this WS-3 commit. The `--model <name>` contract above is
> the integration point: the trained model name is
> `dignity-verification-v0.1-preview`.

## Git policy

- **Committed:** `train.py`, `config.yaml`, `requirements.txt`, `modelfile`,
  `README.md`, `.gitignore` updates.
- **Gitignored:** `.venv/`, `lora-weights/`, `checkpoints/`, `reports/mlflow.db`,
  and the generated `dataset/augmented/*.jsonl`.

## Disk budget

torch CPU + deps ~0.6G, base model cache ~1G, adapter ~2MB. Total well under
the <5G framework budget.
