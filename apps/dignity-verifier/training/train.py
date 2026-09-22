"""Dignity Verifier — LoRA fine-tuning pipeline (WS-3).

Fine-tunes ``Qwen/Qwen2.5-0.5B`` into ``dignity-verification-v0.1-preview``
(a SAFE / UNSAFE / REVIEW / INJECTION classifier) via PEFT LoRA on CPU.

Class-weighted loss (Andler-direct delta)
----------------------------------------
Weights are computed *dynamically* from the actual dataset distribution at
training start (never hardcoded). Default scheme is **inverse-square-root
frequency** — gentler than pure inverse frequency, which would over-boost
rare classes (e.g. REVIEW at 4/612 would get ~150x weight under pure inverse
vs ~12x under inverse-sqrt). Weights are normalized so the mean weight across
samples == 1, keeping the loss scale comparable to unweighted training.

Switch schemes via ``config.yaml`` -> ``class_weight.scheme``:
    "inverse_sqrt"  weight_c = (1/sqrt(freq_c)) / mean(1/sqrt(freq_c))
    "inverse"       weight_c = (1/freq_c) / mean(1/freq_c)

The computed weights are logged at startup (stdout + MLflow params).

Usage
-----
    # Dry-run (24 examples, 1 epoch) — proves the loop runs:
    python train.py --dry-run

    # Full run (gated on the rebalanced dataset landing):
    python train.py

Exit codes: 0 success, 1 config/data error, 2 training failure.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import yaml
from datasets import Dataset
from peft import LoraConfig, get_peft_model
from torch.utils.data import DataLoader
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    get_linear_schedule_with_warmup,
)

# ─── Paths ─────────────────────────────────────────────────────────

APP_DIR = Path(__file__).resolve().parent.parent  # apps/dignity-verifier/
TRAIN_DIR = Path(__file__).resolve().parent
CONFIG_PATH = TRAIN_DIR / "config.yaml"

VALID_VERDICTS = ("SAFE", "UNSAFE", "REVIEW", "INJECTION")

# ─── Prompt template (causal-LM classification) ────────────────────
# The model generates the verdict token; loss is masked to the label only.
SYSTEM_PROMPT = (
    "You are a safety classifier. Classify the following AI output as "
    "SAFE, UNSAFE, or REVIEW."
)
USER_TEMPLATE = "{prompt}\n\n{output}"
ASSISTANT_PREFIX = "Verdict: "


# ─── Config ────────────────────────────────────────────────────────

@dataclass
class Config:
    """Typed view over config.yaml."""

    raw: dict

    @property
    def model(self) -> dict:
        return self.raw["model"]

    @property
    def lora(self) -> dict:
        return self.raw["lora"]

    @property
    def training(self) -> dict:
        return self.raw["training"]

    @property
    def class_weight(self) -> dict:
        return self.raw["class_weight"]

    @property
    def data(self) -> dict:
        return self.raw["data"]

    @property
    def output(self) -> dict:
        return self.raw["output"]

    @property
    def mlflow(self) -> dict:
        return self.raw["mlflow"]


def load_config(path: Path = CONFIG_PATH) -> Config:
    """Load and validate config.yaml."""
    if not path.exists():
        raise FileNotFoundError(f"config.yaml not found at {path}")
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    cfg = Config(raw)
    scheme = cfg.class_weight.get("scheme", "inverse_sqrt")
    if scheme not in ("inverse_sqrt", "inverse"):
        raise ValueError(f"Unknown class_weight.scheme: {scheme!r}")
    return cfg


# ─── Class weights ─────────────────────────────────────────────────

def compute_class_weights(verdicts: list[str], scheme: str) -> dict[str, float]:
    """Compute per-class loss weights from the actual dataset distribution.

    ``scheme`` is "inverse_sqrt" (default) or "inverse". Weights are
    normalized so the mean weight across samples == 1.
    """
    counts = Counter(verdicts)
    total = sum(counts.values())
    if total == 0:
        raise ValueError("Empty dataset — cannot compute class weights")

    freq = {v: counts[v] / total for v in counts}
    if scheme == "inverse":
        raw = {v: 1.0 / f for v, f in freq.items()}
    else:  # inverse_sqrt
        raw = {v: 1.0 / math.sqrt(f) for v, f in freq.items()}

    # Normalize so mean weight across samples == 1.
    mean = sum(raw[v] * freq[v] for v in raw)
    weights = {v: raw[v] / mean for v in raw}
    return weights


# ─── Data loading ──────────────────────────────────────────────────

def load_records(path: Path) -> list[dict]:
    """Load JSONL records (seed/augmented schema)."""
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")
    records: list[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get("verdict") not in VALID_VERDICTS:
                raise ValueError(
                    f"Invalid verdict {rec.get('verdict')!r} in {path}"
                )
            records.append(rec)
    return records


def build_text(rec: dict) -> str:
    """Render a record into the causal-LM training text."""
    user = USER_TEMPLATE.format(prompt=rec["prompt"], output=rec["output"])
    return (
        f"<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n{ASSISTANT_PREFIX}{rec['verdict']}<|im_end|>"
    )


def tokenize_dataset(
    records: list[dict],
    tokenizer,
    max_length: int,
    weights: dict[str, float],
) -> Dataset:
    """Tokenize records with label masking (loss only on the verdict token).

    The assistant marker ``<|im_start|>assistant`` is located by its token
    ids; everything after it (the ``Verdict: <LABEL>`` suffix) is the label.
    Matching on the marker avoids tokenization-context drift: the standalone
    ``ASSISTANT_PREFIX`` may tokenize differently than the same string after
    a newline, so we anchor on the stable marker instead.
    """
    assistant_marker = tokenizer(
        "<|im_start|>assistant", add_special_tokens=False
    )["input_ids"]
    marker_len = len(assistant_marker)

    input_ids_list: list[list[int]] = []
    labels_list: list[list[int]] = []
    weight_list: list[float] = []

    for rec in records:
        text = build_text(rec)
        enc = tokenizer(
            text,
            add_special_tokens=True,
            max_length=max_length,
            truncation=True,
        )
        ids = enc["input_ids"]
        # Mask everything except the verdict suffix after the assistant marker.
        labels = [-100] * len(ids)
        # Find the last assistant marker occurrence.
        for i in range(len(ids) - marker_len, -1, -1):
            if ids[i : i + marker_len] == assistant_marker:
                labels[i + marker_len :] = ids[i + marker_len :]
                break
        input_ids_list.append(ids)
        labels_list.append(labels)
        weight_list.append(weights[rec["verdict"]])

    return Dataset.from_dict(
        {
            "input_ids": input_ids_list,
            "labels": labels_list,
            "weight": weight_list,
        }
    )


def collate_fn(batch: list[dict], pad_token_id: int) -> dict:
    """Pad a batch of tokenized examples to equal length."""
    max_len = max(len(x["input_ids"]) for x in batch)
    input_ids = torch.full((len(batch), max_len), pad_token_id, dtype=torch.long)
    labels = torch.full((len(batch), max_len), -100, dtype=torch.long)
    weights = torch.zeros(len(batch), dtype=torch.float)
    for i, x in enumerate(batch):
        ids = x["input_ids"]
        input_ids[i, : len(ids)] = torch.tensor(ids, dtype=torch.long)
        lbl = x["labels"]
        labels[i, : len(lbl)] = torch.tensor(lbl, dtype=torch.long)
        weights[i] = x["weight"]
    return {"input_ids": input_ids, "labels": labels, "weight": weights}


# ─── MLflow ────────────────────────────────────────────────────────

MLFLOW_DB = TRAIN_DIR / "reports" / "mlflow.db"


def setup_mlflow(cfg: Config, run_id: str) -> None:
    """Configure MLflow tracking; returns the active run.

    Uses a SQLite backend (the filesystem backend is deprecated in MLflow 3.x
    and refuses writes without an opt-out env var).
    """
    import mlflow

    MLFLOW_DB.parent.mkdir(parents=True, exist_ok=True)
    uri = f"sqlite:///{MLFLOW_DB}"
    mlflow.set_tracking_uri(uri)
    mlflow.set_experiment(cfg.mlflow["experiment"])
    mlflow.start_run(run_name=f"lora-{run_id}")
    return mlflow


# ─── Training loop ─────────────────────────────────────────────────

def train_epoch(
    model,
    loader: DataLoader,
    optimizer,
    scheduler,
    device: torch.device,
    grad_accum: int,
    max_grad_norm: float,
    epoch: int,
    cfg: Config,
    mlflow,
    dry_run: bool,
) -> float:
    """Run one training epoch with class-weighted loss. Returns mean loss."""
    model.train()
    total_loss = 0.0
    steps = 0
    optimizer.zero_grad()

    for step, batch in enumerate(loader):
        input_ids = batch["input_ids"].to(device)
        labels = batch["labels"].to(device)
        weights = batch["weight"].to(device)

        outputs = model(input_ids=input_ids, labels=labels)
        logits = outputs.logits  # (B, T, V)
        shift_logits = logits[..., :-1, :].contiguous()
        shift_labels = labels[..., 1:].contiguous()

        loss_fct = torch.nn.CrossEntropyLoss(reduction="none")
        per_token = loss_fct(
            shift_logits.view(-1, shift_logits.size(-1)),
            shift_labels.view(-1),
        ).view(shift_labels.size())

        # Class-weighted: weight each sample by its class weight.
        mask = shift_labels != -100
        sample_loss = per_token.sum(dim=1) / mask.sum(dim=1).clamp(min=1)
        loss = (sample_loss * weights).mean()

        loss = loss / grad_accum
        loss.backward()

        if (step + 1) % grad_accum == 0 or (step + 1) == len(loader):
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()

        total_loss += loss.item() * grad_accum
        steps += 1

        if (step + 1) % cfg.training["logging_steps"] == 0 or dry_run:
            avg = total_loss / steps
            print(
                f"  epoch {epoch} step {step + 1}/{len(loader)} "
                f"loss {avg:.4f}",
                flush=True,
            )
            if mlflow is not None:
                mlflow.log_metric("train_loss", avg, step=step + 1)

        if dry_run and step + 1 >= 4:
            break

    return total_loss / max(steps, 1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Dignity Verifier LoRA training")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Train on a tiny subset (24 examples, 1 epoch) to prove the loop.",
    )
    parser.add_argument(
        "--config", type=str, default=str(CONFIG_PATH), help="Path to config.yaml"
    )
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    cfg = load_config(Path(args.config))
    tcfg = cfg.training

    # ── Seed everything ────────────────────────────────────────────
    seed = tcfg["seed"]
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    device = torch.device("cpu")
    print(f"[dignity-lora] run_id={run_id} device=cpu dry_run={args.dry_run}")

    # ── Load dataset + compute class weights dynamically ───────────
    train_path = APP_DIR / cfg.data["train_path"]
    records = load_records(train_path)
    if args.dry_run:
        # Deterministic tiny subset: first 24 records (seeded shuffle).
        rng = random.Random(seed)
        rng.shuffle(records)
        records = records[:24]

    verdicts = [r["verdict"] for r in records]
    scheme = cfg.class_weight["scheme"]
    weights = compute_class_weights(verdicts, scheme)
    print(f"[dignity-lora] class_weight scheme={scheme} enabled={cfg.class_weight['enabled']}")
    print(f"[dignity-lora] computed class weights (mean==1):")
    for v in sorted(weights):
        print(f"    {v:<10} weight={weights[v]:.4f}  count={verdicts.count(v)}")

    # ── MLflow ─────────────────────────────────────────────────────
    mlflow = None
    try:
        mlflow = setup_mlflow(cfg, run_id)
        mlflow.log_params(
            {
                "dataset_hash": hash(tuple(sorted(verdicts))),
                "train_samples": len(records),
                "epochs": tcfg["epochs"],
                "batch_size": tcfg["batch_size"],
                "grad_accum": tcfg["grad_accum"],
                "lr": tcfg["lr"],
                "lora_r": cfg.lora["r"],
                "lora_alpha": cfg.lora["alpha"],
                "lora_dropout": cfg.lora["dropout"],
                "class_weight_scheme": scheme,
                "class_weights": json.dumps(weights),
                "dry_run": args.dry_run,
                "git_commit": os.environ.get("GIT_COMMIT", "unknown"),
            }
        )
    except Exception as exc:  # pragma: no cover - mlflow optional
        print(f"[dignity-lora] MLflow disabled: {exc}")

    # ── Load base model + tokenizer ────────────────────────────────
    print(f"[dignity-lora] loading base model {cfg.model['base']} ...")
    tokenizer = AutoTokenizer.from_pretrained(
        cfg.model["base"], trust_remote_code=cfg.model["trust_remote_code"]
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        cfg.model["base"],
        dtype=torch.float32,
        trust_remote_code=cfg.model["trust_remote_code"],
    )
    model.to(device)

    # ── LoRA ───────────────────────────────────────────────────────
    lora_cfg = LoraConfig(
        r=cfg.lora["r"],
        lora_alpha=cfg.lora["alpha"],
        lora_dropout=cfg.lora["dropout"],
        target_modules=cfg.lora["target_modules"],
        bias=cfg.lora["bias"],
        task_type=cfg.lora["task_type"],
    )
    model = get_peft_model(model, lora_cfg)
    model.print_trainable_parameters()

    # ── Tokenize + dataloader ──────────────────────────────────────
    dataset = tokenize_dataset(
        records, tokenizer, tcfg["max_length"], weights
    )
    loader = DataLoader(
        dataset,
        batch_size=tcfg["batch_size"],
        shuffle=True,
        collate_fn=lambda b: collate_fn(b, tokenizer.pad_token_id),
    )

    # ── Optimizer + scheduler ──────────────────────────────────────
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=tcfg["lr"], weight_decay=tcfg["weight_decay"]
    )
    total_steps = len(loader) * tcfg["epochs"] // tcfg["grad_accum"]
    warmup_steps = int(total_steps * tcfg["warmup_ratio"])
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps
    )

    # ── Train ──────────────────────────────────────────────────────
    print(f"[dignity-lora] training: {len(records)} samples, "
          f"{tcfg['epochs']} epochs, batch={tcfg['batch_size']}, "
          f"grad_accum={tcfg['grad_accum']}")
    start = time.time()
    epochs = 1 if args.dry_run else tcfg["epochs"]
    for epoch in range(1, epochs + 1):
        print(f"[dignity-lora] === epoch {epoch}/{epochs} ===")
        loss = train_epoch(
            model,
            loader,
            optimizer,
            scheduler,
            device,
            tcfg["grad_accum"],
            tcfg["max_grad_norm"],
            epoch,
            cfg,
            mlflow,
            args.dry_run,
        )
        print(f"[dignity-lora] epoch {epoch} mean_loss {loss:.4f}")
        if mlflow is not None:
            mlflow.log_metric("epoch_mean_loss", loss, step=epoch)

    elapsed = time.time() - start
    print(f"[dignity-lora] training wall-clock: {elapsed:.1f}s")

    # ── Memory footprint (peak RSS) ────────────────────────────────
    try:
        import resource

        peak_rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
        print(f"[dignity-lora] peak RSS: {peak_rss_mb:.1f} MB")
    except Exception:  # pragma: no cover - non-POSIX
        peak_rss_mb = 0.0
        print("[dignity-lora] peak RSS: unavailable")

    # ── Save adapter ───────────────────────────────────────────────
    adapter_dir = TRAIN_DIR / cfg.output["adapter_dir"]
    adapter_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(adapter_dir)
    # PEFT writes adapter_model.safetensors (not lora-weights.safetensors).
    adapter_file = adapter_dir / "adapter_model.safetensors"
    size_mb = adapter_file.stat().st_size / (1024 * 1024) if adapter_file.exists() else 0.0
    print(f"[dignity-lora] adapter saved: {adapter_file} ({size_mb:.2f} MB)")

    if mlflow is not None:
        mlflow.log_artifact(str(adapter_dir))
        mlflow.log_metric("adapter_size_mb", size_mb)
        mlflow.log_metric("train_wall_clock_s", elapsed)
        try:
            # Log as a proper MLflow model so registration resolves a valid
            # logged_model artifact path. PEFT models aren't directly accepted,
            # so wrap in a text-generation pipeline.
            import mlflow as _mlflow
            from transformers import pipeline as _pipeline

            pipe = _pipeline(
                "text-generation",
                model=model,
                tokenizer=tokenizer,
                max_new_tokens=8,
            )
            _mlflow.transformers.log_model(
                transformers_model=pipe,
                name="model",
                registered_model_name=cfg.mlflow["registered_model"],
                task="text-generation",
            )
        except Exception as exc:  # pragma: no cover
            print(f"[dignity-lora] model registration skipped: {exc}")
        mlflow.end_run()

    print(f"[dignity-lora] DONE. adapter={adapter_dir} wall={elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
