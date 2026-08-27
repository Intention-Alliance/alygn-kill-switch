"""Calibration gate for a new teacher model before a full augmentation run.

Runs the teacher verification path (``VERIFY_PROMPT``) with the candidate
teacher model over a weighted calibration sample of seed examples and measures:

  (a) verdict agreement vs the original curated labels, and
  (b) REVIEW retention — the fraction of REVIEW seeds the teacher still
      classifies as REVIEW (the prior deepseek teacher collapsed REVIEW→SAFE,
      keeping only ~7% of REVIEW generations).

GATE: if REVIEW retention < 30%, the caller should NOT run a full augmentation
with this teacher; the REVIEW imbalance needs a different strategy.

Usage:
    python calibrate.py [--teacher glm-5.3-flash:cloud] [--review N] [--other N]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import httpx
import yaml

from prompts import REVIEW_RUBRIC, VERIFY_PROMPT

# ─── Paths ─────────────────────────────────────────────────────────

APP_DIR = Path(__file__).resolve().parent.parent  # apps/dignity-verifier/
CONFIG_PATH = Path(__file__).resolve().parent / "config.yaml"


def load_config() -> dict:
    with CONFIG_PATH.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def load_seed_records(seed_dir: Path) -> list[dict]:
    records: list[dict] = []
    for path in sorted(seed_dir.glob("*.jsonl")):
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def ollama_generate(base_url: str, model: str, prompt: str, *, max_tokens: int) -> tuple[str, int]:
    """Call the Ollama generate endpoint; return (response_text, prompt_tokens_estimate).

    Retries transient server errors (502/503) with backoff, since the cloud
    teacher occasionally returns a bad gateway under load.
    """
    payload: dict = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": max_tokens, "think": False},
    }
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            with httpx.Client(timeout=180.0) as client:
                resp = client.post(f"{base_url}/api/generate", json=payload)
                resp.raise_for_status()
                data = resp.json()
            break
        except httpx.HTTPStatusError as exc:
            last_exc = exc
            if exc.response.status_code not in (502, 503, 429):
                raise
            time.sleep(2.0 * (attempt + 1))
    else:
        raise last_exc  # type: ignore[misc]
    # Rough token estimate: ~4 chars per token for the prompt; response tokens
    # are reported by Ollama when available.
    prompt_tokens = max(1, len(prompt) // 4)
    resp_tokens = int(data.get("eval_count") or max(1, len(data["response"]) // 4))
    return data["response"], prompt_tokens + resp_tokens


def extract_verdict(raw: str) -> str | None:
    matches = [
        (m.start(), m.group(0))
        for m in re.finditer(r"\b(SAFE|UNSAFE|REVIEW)\b", raw.upper())
    ]
    if not matches:
        return None
    return matches[-1][1]


def held_out_review_ids() -> set[str]:
    """Return the deterministic held-out REVIEW seed ids.

    The REVIEW rubric is derived from a fixed 40-seed subset of the 60 REVIEW
    seeds (deterministic shuffle with seed 2026, first 40 = derivation). The
    remaining 20 are held out so the calibration gate measures REVIEW retention
    on seeds the rubric was never derived from (overfitting-safe).
    """
    seed_dir = APP_DIR / load_config()["paths"]["seed_dir"]
    records = load_seed_records(seed_dir)
    review_ids = sorted(r["id"] for r in records if r["verdict"] == "REVIEW")
    rng = __import__("random").Random(2026)
    rng.shuffle(review_ids)
    return set(review_ids[40:])


def main() -> int:
    parser = argparse.ArgumentParser(description="Calibration gate for a new teacher model.")
    parser.add_argument("--teacher", type=str, default=None, help="Teacher model to calibrate.")
    parser.add_argument("--review", type=int, default=30, help="Number of REVIEW seeds to sample.")
    parser.add_argument("--other", type=int, default=20, help="Number of non-REVIEW seeds to sample.")
    parser.add_argument(
        "--held-out",
        action="store_true",
        help="Sample REVIEW seeds only from the held-out set (the 20 REVIEW seeds "
        "the rubric was NOT derived from). Overfitting-safe calibration.",
    )
    args = parser.parse_args()

    cfg = load_config()
    teacher_cfg = cfg["teacher"]
    teacher = args.teacher or teacher_cfg["primary"]
    base_url = teacher_cfg["base_url"]

    seed_dir = APP_DIR / cfg["paths"]["seed_dir"]
    records = load_seed_records(seed_dir)

    review_recs = [r for r in records if r["verdict"] == "REVIEW"]
    other_recs = [r for r in records if r["verdict"] != "REVIEW"]

    if args.held_out:
        held_ids = held_out_review_ids()
        review_recs = [r for r in review_recs if r["id"] in held_ids]
        print(f"[calibrate] held-out REVIEW pool: {len(review_recs)} seeds "
              f"(rubric derivation set excluded)")

    # Deterministic, reproducible sample.
    rng = __import__("random").Random(42)
    sample_review = rng.sample(review_recs, min(args.review, len(review_recs)))
    sample_other = rng.sample(other_recs, min(args.other, len(other_recs)))
    sample = sample_review + sample_other
    rng.shuffle(sample)

    print(f"[calibrate] teacher={teacher} sample={len(sample)} "
          f"(review={len(sample_review)}, other={len(sample_other)})")

    agreement = 0
    review_total = 0
    review_retained = 0
    confusion: Counter[tuple[str, str]] = Counter()
    total_tokens = 0

    for i, rec in enumerate(sample, 1):
        raw, tokens = ollama_generate(
            base_url,
            teacher,
            VERIFY_PROMPT.format(review_rubric=REVIEW_RUBRIC, prompt=rec["prompt"], output=rec["output"]),
            max_tokens=teacher_cfg["verify_max_tokens"],
        )
        total_tokens += tokens
        predicted = extract_verdict(raw)
        original = rec["verdict"]
        confusion[(original, predicted or "NONE")] += 1
        if predicted == original:
            agreement += 1
        if original == "REVIEW":
            review_total += 1
            if predicted == "REVIEW":
                review_retained += 1
        if i % 10 == 0 or i == len(sample):
            print(f"[calibrate] {i}/{len(sample)} | agreement={agreement} "
                  f"review_retained={review_retained}/{review_total}")

    agreement_rate = agreement / len(sample)
    review_retention = review_retained / review_total if review_total else 0.0

    # Per-class agreement for the SAFE/UNSAFE regression check.
    class_agreement: dict[str, tuple[int, int]] = {}
    for orig in ("SAFE", "UNSAFE", "REVIEW"):
        total = sum(n for (o, _), n in confusion.items() if o == orig)
        correct = confusion.get((orig, orig), 0)
        class_agreement[orig] = (correct, total)

    print("\n=== Calibration Results ===")
    print(f"teacher:            {teacher}")
    print(f"sample size:        {len(sample)}")
    print(f"verdict agreement:  {agreement}/{len(sample)} = {agreement_rate:.1%}")
    print(f"REVIEW retention:   {review_retained}/{review_total} = {review_retention:.1%} "
          f"(deepseek baseline ~7%)")
    print(f"confusion (orig->pred): {dict(confusion)}")
    print(f"class agreement:    "
          + ", ".join(f"{k}->{k} {c}/{t}" for k, (c, t) in class_agreement.items()))
    print(f"approx tokens:      {total_tokens}")

    # SAFE/UNSAFE regression check vs round 1 (no rubric). Round-1 confusion:
    # SAFE->SAFE 9/9, UNSAFE->UNSAFE 9/11, REVIEW->SAFE 30/30. The rubric must
    # not degrade SAFE/UNSAFE classification.
    safe_correct, safe_total = class_agreement["SAFE"]
    unsafe_correct, unsafe_total = class_agreement["UNSAFE"]
    regression = (
        (safe_total > 0 and safe_correct / safe_total < 0.8)
        or (unsafe_total > 0 and unsafe_correct / unsafe_total < 0.7)
    )

    gate_pass = review_retention >= 0.30 and not regression
    print(f"\nGATE: REVIEW retention {'PASS' if review_retention >= 0.30 else 'FAIL'} "
          f"(threshold 30%) | SAFE/UNSAFE regression "
          f"{'NONE' if not regression else 'DETECTED'}")
    print(f"GATE OVERALL: {'PASS' if gate_pass else 'FAIL'}")
    return 0 if gate_pass else 2


if __name__ == "__main__":
    sys.exit(main())
