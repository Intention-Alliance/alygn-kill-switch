-- 001-init.sql — Dignity Verifier metadata tables
-- Creates the training_runs and augmentation_runs tables.
-- Metadata only; dataset content lives in JSONL files.

-- Training run metadata
CREATE TABLE IF NOT EXISTS training_runs (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,                -- ISO timestamp of run start
  epochs        INTEGER NOT NULL,
  loss          REAL NOT NULL,
  eval_accuracy REAL NOT NULL,                -- 0..1
  example_count INTEGER NOT NULL,
  config        TEXT NOT NULL DEFAULT '{}'    -- JSON config (LoRA rank, lr, models)
);

-- Augmentation run metadata
CREATE TABLE IF NOT EXISTS augmentation_runs (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,                 -- ISO timestamp of run start
  input_count  INTEGER NOT NULL,
  output_count INTEGER NOT NULL,
  dedup_count  INTEGER NOT NULL,
  config       TEXT NOT NULL DEFAULT '{}'     -- JSON config (teacher, top-k, threshold)
);
