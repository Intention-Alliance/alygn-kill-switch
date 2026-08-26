# Training Pipeline

LoRA fine-tuning of `qwen2.5:0.5b` into `dignity-verifier-preview-v1`. Owned by
**Keridz** (be-coder).

## Files

| File | Purpose |
|------|---------|
| `train.py` | LoRA fine-tune script (PEFT + PyTorch 2.10) |
| `modelfile` | Ollama Modelfile template (`FROM qwen2.5:0.5b` + `ADAPTER`) |
| `config.yaml` | Training hyperparameters |
| `requirements.txt` | Python deps (PEFT, torch, transformers, datasets) |

## LoRA config (CPU-constrained)

- **rank=8** (≤8 per constraint), **alpha=16**, **dropout=0.05**
- **target_modules:** `["q_proj", "v_proj"]`
- **Training:** 3 epochs, **batch_size=4** (≤4 per constraint), lr=2e-4
- **Expected:** ~2–4h on CPU, adapter output ~5–20MB

## Output

LoRA adapter weights (`lora-weights.safetensors`) → consumed by the Ollama
Modelfile to create `dignity-verifier-preview-v1`.

## Ollama model creation

```bash
ollama create dignity-verifier-preview-v1 -f modelfile
```

Modelfile: `FROM qwen2.5:0.5b` + `ADAPTER ./lora-weights.safetensors`.

## Git policy

- `train.py`, `modelfile`, `config.yaml`, `requirements.txt` — **committed**.
- LoRA weights and any downloaded base-model caches — **gitignored** (large,
  regenerated).

## Disk budget

Adapter (~20MB) + base model cache + augmented dataset must stay **<5G total**
per the framework constraint.
