"""LlamaIndex semantic augmentation pipeline.

For each seed example:
  1. Retrieve top-k semantically similar seed examples (vector index).
  2. Teacher model (deepseek-v4-flash:cloud, fallback glm-5.2:cloud) generates
     paraphrases that preserve the verdict + reason but vary prompt/output.
  3. Verify each candidate: teacher verdict must match the original verdict,
     otherwise reject (divergence).
  4. Dedupe: cosine similarity > 0.92 against accepted set => reject.

All decisions (accepted/rejected + reason) are logged to
``reports/distillation-logs/``. Accepted examples are written to
``dataset/augmented/augmented.jsonl`` (gitignored).

Usage:
    python augment.py [--limit N] [--teacher MODEL]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
import yaml
from llama_index.core import StorageContext, VectorStoreIndex, load_index_from_storage
from llama_index.core.node_parser import SimpleNodeParser
from llama_index.embeddings.ollama import OllamaEmbedding

from index import build_documents, load_seed_records, load_config

# ─── Paths ─────────────────────────────────────────────────────────

APP_DIR = Path(__file__).resolve().parent.parent  # apps/dignity-verifier/

# ─── Types ─────────────────────────────────────────────────────────

VALID_VERDICTS = {"SAFE", "UNSAFE", "REVIEW"}


@dataclass
class Decision:
    """One accepted or rejected augmentation candidate."""

    seed_id: str
    candidate_id: str
    verdict: str
    category: str
    accepted: bool
    reason: str
    teacher: str
    similarity: float | None = None


@dataclass
class RunReport:
    """Aggregate statistics for a single augmentation run."""

    started_at: str
    teacher: str
    fallback: str
    seed_count: int = 0
    candidates_generated: int = 0
    accepted: int = 0
    rejected_divergence: int = 0
    rejected_duplicate: int = 0
    rejected_invalid: int = 0
    verdict_counts: dict[str, int] = field(default_factory=dict)
    decisions: list[Decision] = field(default_factory=list)


# ─── Ollama helpers ────────────────────────────────────────────────

def ollama_generate(
    base_url: str,
    model: str,
    prompt: str,
    *,
    temperature: float,
    max_tokens: int,
    format: str | None = None,
    think: bool = True,
) -> str:
    """Call the Ollama generate endpoint and return the raw text.

    ``think=False`` disables chain-of-thought for the teacher model so the
    response is a clean, deterministic answer rather than reasoning that may
    contain verdict words before the final classification.
    """
    payload: dict = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens, "think": think},
    }
    if format:
        payload["format"] = format
    with httpx.Client(timeout=180.0) as client:
        resp = client.post(f"{base_url}/api/generate", json=payload)
        resp.raise_for_status()
        return resp.json()["response"]


def ollama_embed(base_url: str, model: str, texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts via the Ollama embed endpoint."""
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            f"{base_url}/api/embed",
            json={"model": model, "input": texts},
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


# ─── Teacher prompts ───────────────────────────────────────────────

PARAPHRASE_PROMPT = """You are augmenting a safety-classification training dataset.

Given one seed example, generate {n} paraphrased variations. Each variation must:
- Preserve the EXACT verdict ({verdict}) and the semantic meaning of the reason.
- Vary the wording of the prompt and output (synonyms, restructure, change details
  that do not change the safety classification).
- Keep the same category: {category}.

Return ONLY a JSON array of objects, each with keys:
  "prompt", "output", "reason"
No prose, no markdown, no explanation.

Seed example:
PROMPT: {prompt}
OUTPUT: {output}
VERDICT: {verdict}
REASON: {reason}
CATEGORY: {category}
"""

VERIFY_PROMPT = """Classify the following model output as SAFE, UNSAFE, or REVIEW.

PROMPT: {prompt}
OUTPUT: {output}

Respond with exactly one token: SAFE, UNSAFE, or REVIEW. No explanation.
"""


# ─── Pipeline ──────────────────────────────────────────────────────

def build_or_load_index(cfg: dict, embedding: OllamaEmbedding, records: list[dict]):
    """Load the persisted index or build it fresh."""
    paths = cfg["paths"]
    index_dir = APP_DIR / paths["index_dir"]
    if (index_dir / "docstore.json").exists():
        storage_context = StorageContext.from_defaults(persist_dir=str(index_dir))
        return load_index_from_storage(storage_context, embed_model=embedding)
    docs = build_documents(records)
    parser = SimpleNodeParser.from_defaults(chunk_size=1024, chunk_overlap=0)
    nodes = parser.get_nodes_from_documents(docs)
    index = VectorStoreIndex(nodes, embed_model=embedding)
    index.storage_context.persist(persist_dir=str(index_dir))
    return index


def parse_paraphrases(raw: str) -> list[dict]:
    """Parse the teacher's JSON-array response into candidate dicts."""
    text = raw.strip()
    # Strip code fences if the model wrapped the JSON.
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Try to salvage a JSON array embedded in prose.
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1 or end <= start:
            return []
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for item in data:
        if isinstance(item, dict) and all(k in item for k in ("prompt", "output", "reason")):
            out.append(item)
    return out


def verify_verdict(
    base_url: str,
    model: str,
    prompt: str,
    output: str,
    *,
    temperature: float,
    max_tokens: int,
) -> str | None:
    """Ask the teacher to classify a candidate; return verdict or None.

    The teacher is a thinking model, so it needs a generous token budget to
    emit the verdict after reasoning. We scan the full response for the first
    verdict token rather than relying on a single-token reply.
    """
    raw = ollama_generate(
        base_url,
        model,
        VERIFY_PROMPT.format(prompt=prompt, output=output),
        temperature=0.0,
        max_tokens=max_tokens,
        think=False,
    )
    # The teacher is a thinking model; even with think=False it may occasionally
    # emit reasoning. Take the LAST verdict token in the response (the final
    # classification) rather than the first, which could be a word in reasoning.
    # Use word boundaries so "SAFE" inside "UNSAFE" is not matched.
    matches = [
        (m.start(), m.group(0))
        for m in re.finditer(r"\b(SAFE|UNSAFE|REVIEW)\b", raw.upper())
    ]
    if not matches:
        return None
    # Last match = final classification.
    return matches[-1][1]


def run_pipeline(cfg: dict, teacher_model: str, limit: int | None) -> RunReport:
    """Execute the full augmentation pipeline."""
    embed_cfg = cfg["embedding"]
    teacher_cfg = cfg["teacher"]
    retr_cfg = cfg["retrieval"]
    aug_cfg = cfg["augmentation"]
    dedup_cfg = cfg["dedup"]
    paths = cfg["paths"]

    seed_dir = APP_DIR / paths["seed_dir"]
    augmented_out = APP_DIR / paths["augmented_out"]
    log_dir = APP_DIR / paths["log_dir"]
    log_dir.mkdir(parents=True, exist_ok=True)
    augmented_out.parent.mkdir(parents=True, exist_ok=True)

    report = RunReport(
        started_at=datetime.now(timezone.utc).isoformat(),
        teacher=teacher_model,
        fallback=teacher_cfg["fallback"],
    )

    embedding = OllamaEmbedding(
        model_name=embed_cfg["model"],
        base_url=embed_cfg["base_url"],
    )

    records = load_seed_records(seed_dir)
    if limit:
        records = records[:limit]
    report.seed_count = len(records)

    index = build_or_load_index(cfg, embedding, records)
    retriever = index.as_retriever(similarity_top_k=retr_cfg["similarity_top_k"])

    accepted: list[dict] = []
    accepted_embeddings: list[list[float]] = []
    seen_prompt_output: set[str] = set()

    for idx, seed in enumerate(records):
        seed_id = seed["id"]
        verdict = seed["verdict"]
        category = seed["category"]

        # Retrieve top-k similar examples for context.
        nodes = retriever.retrieve(seed["prompt"])
        similar = [
            {
                "id": n.metadata.get("id", "?"),
                "verdict": n.metadata.get("verdict", "?"),
                "category": n.metadata.get("category", "?"),
            }
            for n in nodes[: retr_cfg["top_k"]]
        ]

        n_paraphrases = aug_cfg["max_paraphrases_per_seed"]
        teacher_prompt = PARAPHRASE_PROMPT.format(
            n=n_paraphrases,
            verdict=verdict,
            category=category,
            prompt=seed["prompt"],
            output=seed["output"],
            reason=seed["reason"],
        )
        raw = ollama_generate(
            teacher_cfg["base_url"],
            teacher_model,
            teacher_prompt,
            temperature=teacher_cfg["temperature"],
            max_tokens=teacher_cfg["max_tokens"],
        )
        candidates = parse_paraphrases(raw)
        report.candidates_generated += len(candidates)

        for ci, cand in enumerate(candidates):
            cand_prompt = cand["prompt"].strip()
            cand_output = cand["output"].strip()
            cand_reason = cand["reason"].strip()
            candidate_id = f"aug-{seed_id}-{ci + 1}"

            # --- Structural validation ---
            if not cand_prompt or not cand_output or not cand_reason:
                report.decisions.append(
                    Decision(seed_id, candidate_id, verdict, category, False, "missing field", teacher_model)
                )
                report.rejected_invalid += 1
                continue

            # --- Exact dedupe (prompt+output) ---
            key = f"{cand_prompt}||{cand_output}"
            if key in seen_prompt_output:
                report.decisions.append(
                    Decision(seed_id, candidate_id, verdict, category, False, "exact duplicate", teacher_model)
                )
                report.rejected_duplicate += 1
                continue

            # --- Teacher verification (verdict must match original) ---
            # Use temperature 0.0 + think=False for a deterministic verdict.
            verified = verify_verdict(
                teacher_cfg["base_url"],
                teacher_model,
                cand_prompt,
                cand_output,
                temperature=0.0,
                max_tokens=teacher_cfg["verify_max_tokens"],
            )
            if verified is None:
                report.decisions.append(
                    Decision(seed_id, candidate_id, verdict, category, False, "teacher returned invalid verdict", teacher_model)
                )
                report.rejected_invalid += 1
                continue
            if verified != verdict:
                report.decisions.append(
                    Decision(
                        seed_id,
                        candidate_id,
                        verdict,
                        category,
                        False,
                        f"verdict divergence (teacher={verified}, expected={verdict})",
                        teacher_model,
                    )
                )
                report.rejected_divergence += 1
                continue

            # --- Semantic dedupe (cosine > threshold) ---
            emb = ollama_embed(embed_cfg["base_url"], embed_cfg["model"], [cand_prompt])[0]
            dup_sim: float | None = None
            is_dup = False
            for existing in accepted_embeddings:
                sim = cosine(emb, existing)
                if sim > dedup_cfg["cosine_threshold"]:
                    dup_sim = sim
                    is_dup = True
                    break
            if is_dup:
                report.decisions.append(
                    Decision(
                        seed_id,
                        candidate_id,
                        verdict,
                        category,
                        False,
                        f"semantic duplicate (cosine={dup_sim:.4f})",
                        teacher_model,
                        dup_sim,
                    )
                )
                report.rejected_duplicate += 1
                continue

            # --- Accept ---
            seen_prompt_output.add(key)
            accepted_embeddings.append(emb)
            accepted.append(
                {
                    "id": candidate_id,
                    "prompt": cand_prompt,
                    "output": cand_output,
                    "verdict": verdict,
                    "reason": cand_reason,
                    "category": category,
                    "source": "augmented",
                }
            )
            report.verdict_counts[verdict] = report.verdict_counts.get(verdict, 0) + 1
            report.accepted += 1
            report.decisions.append(
                Decision(seed_id, candidate_id, verdict, category, True, "accepted", teacher_model)
            )

        if (idx + 1) % 20 == 0 or idx + 1 == len(records):
            print(
                f"[augment] seed {idx + 1}/{len(records)} | "
                f"accepted={report.accepted} div={report.rejected_divergence} "
                f"dup={report.rejected_duplicate} invalid={report.rejected_invalid}"
            )

    # --- Write outputs ---
    with augmented_out.open("w", encoding="utf-8") as fh:
        for rec in accepted:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    report.verdict_counts = {
        v: report.verdict_counts.get(v, 0) for v in ("SAFE", "UNSAFE", "REVIEW")
    }
    return report


def write_log(report: RunReport, log_dir: Path) -> Path:
    """Persist the run report + decision log to reports/distillation-logs/."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run_path = log_dir / f"augment-{ts}.json"
    decisions_path = log_dir / f"augment-{ts}-decisions.jsonl"

    run_payload = {
        "started_at": report.started_at,
        "teacher": report.teacher,
        "fallback": report.fallback,
        "seed_count": report.seed_count,
        "candidates_generated": report.candidates_generated,
        "accepted": report.accepted,
        "rejected_divergence": report.rejected_divergence,
        "rejected_duplicate": report.rejected_duplicate,
        "rejected_invalid": report.rejected_invalid,
        "verdict_counts": report.verdict_counts,
    }
    with run_path.open("w", encoding="utf-8") as fh:
        json.dump(run_payload, fh, indent=2)

    with decisions_path.open("w", encoding="utf-8") as fh:
        for d in report.decisions:
            fh.write(json.dumps(d.__dict__, ensure_ascii=False) + "\n")

    return run_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the LlamaIndex augmentation pipeline.")
    parser.add_argument("--limit", type=int, default=None, help="Process only the first N seed records.")
    parser.add_argument("--teacher", type=str, default=None, help="Override teacher model.")
    args = parser.parse_args()

    # Prevent concurrent runs from corrupting the shared output file.
    lock_path = Path(__file__).resolve().parent / ".augment.lock"
    if lock_path.exists():
        print(f"[augment] lock file exists ({lock_path}); another run may be in progress. Exiting.")
        return 1
    lock_path.touch()
    try:
        return _run(args)
    finally:
        lock_path.unlink(missing_ok=True)


def _run(args: argparse.Namespace) -> int:
    cfg = load_config()
    teacher_cfg = cfg["teacher"]
    teacher_model = args.teacher or teacher_cfg["primary"]

    # Try primary teacher; fall back to the configured fallback model on failure.
    try:
        report = run_pipeline(cfg, teacher_model, args.limit)
    except Exception as exc:  # noqa: BLE001 - boundary catch, fall back
        print(f"[augment] primary teacher failed ({exc}); falling back to {teacher_cfg['fallback']}")
        report = run_pipeline(cfg, teacher_cfg["fallback"], args.limit)

    run_path = write_log(report, APP_DIR / cfg["paths"]["log_dir"])

    print("\n=== Augmentation Complete ===")
    print(f"teacher:            {report.teacher}")
    print(f"seed examples:      {report.seed_count}")
    print(f"candidates:         {report.candidates_generated}")
    print(f"accepted:           {report.accepted}")
    print(f"rejected (diverg):  {report.rejected_divergence}")
    print(f"rejected (duplicate): {report.rejected_duplicate}")
    print(f"rejected (invalid): {report.rejected_invalid}")
    print(f"verdict counts:     {report.verdict_counts}")
    print(f"log:                {run_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
