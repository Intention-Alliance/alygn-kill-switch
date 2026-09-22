"""Build and refresh the semantic vector index over the seed dataset.

Uses LlamaIndex's ``VectorStoreIndex`` with the local ``nomic-embed-text-v2-moe``
embedding model (768-dim, F16). The index is persisted to ``.index/`` (gitignored)
so ``augment.py`` can reuse it across runs.

Usage:
    python index.py [--rebuild]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from llama_index.core import Document, StorageContext, VectorStoreIndex, load_index_from_storage
from llama_index.core.node_parser import SimpleNodeParser
from llama_index.embeddings.ollama import OllamaEmbedding

# ─── Paths ─────────────────────────────────────────────────────────

APP_DIR = Path(__file__).resolve().parent.parent  # apps/dignity-verifier/
CONFIG_PATH = Path(__file__).resolve().parent / "config.yaml"


def load_config() -> dict:
    """Load config.yaml relative to the app root."""
    with CONFIG_PATH.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def load_seed_records(seed_dir: Path) -> list[dict]:
    """Load all seed JSONL records into a flat list."""
    records: list[dict] = []
    for path in sorted(seed_dir.glob("*.jsonl")):
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def build_documents(records: list[dict]) -> list[Document]:
    """Wrap seed records as LlamaIndex documents keyed by id."""
    docs: list[Document] = []
    for rec in records:
        text = (
            f"prompt: {rec['prompt']}\n"
            f"output: {rec['output']}\n"
            f"verdict: {rec['verdict']}\n"
            f"reason: {rec['reason']}\n"
            f"category: {rec['category']}"
        )
        docs.append(
            Document(
                text=text,
                metadata={
                    "id": rec["id"],
                    "verdict": rec["verdict"],
                    "category": rec["category"],
                    "source": rec["source"],
                },
            )
        )
    return docs


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the seed semantic index.")
    parser.add_argument("--rebuild", action="store_true", help="Force a full rebuild.")
    args = parser.parse_args()

    cfg = load_config()
    embed_cfg = cfg["embedding"]
    paths = cfg["paths"]

    seed_dir = APP_DIR / paths["seed_dir"]
    index_dir = APP_DIR / paths["index_dir"]
    index_dir.mkdir(parents=True, exist_ok=True)

    embedding = OllamaEmbedding(
        model_name=embed_cfg["model"],
        base_url=embed_cfg["base_url"],
    )

    records = load_seed_records(seed_dir)
    print(f"[index] loaded {len(records)} seed records")

    if not args.rebuild and (index_dir / "docstore.json").exists():
        print(f"[index] loading existing index from {index_dir}")
        storage_context = StorageContext.from_defaults(persist_dir=str(index_dir))
        index = load_index_from_storage(storage_context, embed_model=embedding)
    else:
        print(f"[index] building index over {len(records)} documents")
        docs = build_documents(records)
        parser = SimpleNodeParser.from_defaults(chunk_size=1024, chunk_overlap=0)
        nodes = parser.get_nodes_from_documents(docs)
        index = VectorStoreIndex(nodes, embed_model=embedding)
        index.storage_context.persist(persist_dir=str(index_dir))
        print(f"[index] persisted {len(nodes)} nodes to {index_dir}")

    print(f"[index] index ready ({len(index.ref_doc_info)} documents)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
