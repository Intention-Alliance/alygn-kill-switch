-- 002-indices.sql — Dignity Verifier metadata indices
-- Adds indices for the common query patterns:
--   * list training runs by date (newest first)
--   * list augmentation runs by date (newest first)
--   * filter training runs by eval accuracy (for reporting/trends)

CREATE INDEX IF NOT EXISTS idx_training_runs_date
  ON training_runs (date DESC);

CREATE INDEX IF NOT EXISTS idx_training_runs_eval_accuracy
  ON training_runs (eval_accuracy DESC);

CREATE INDEX IF NOT EXISTS idx_augmentation_runs_date
  ON augmentation_runs (date DESC);
