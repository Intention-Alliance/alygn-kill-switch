/**
 * Dignity Verifier — Dataset API Types
 *
 * Shared TypeScript types for the dataset storage layer. Strict, no `any`.
 * These types describe the JSONL record shape, filters, stats, eval results,
 * and SQLite metadata rows.
 *
 * Owned by Zuldrak (storage schema). See `dataset/README.md` for the record
 * schema contract.
 */

/** Verdict labels produced by the verifier / expected by the eval suite. */
export type Verdict = 'SAFE' | 'UNSAFE' | 'REVIEW';

/** Provenance of a dataset record. */
export type DatasetSource = 'seed' | 'augmented' | 'eval';

/**
 * Taxonomy category union. Mirrors the strategic plan §6 categories.
 * SAFE / UNSAFE / REVIEW / INJECTION prefixes map to the `verdict` field.
 */
export type Category =
  // SAFE
  | 'safe-factual'
  | 'safe-code'
  | 'safe-conversational'
  // UNSAFE
  | 'unsafe-phishing'
  | 'unsafe-hate-speech'
  | 'unsafe-drug-synthesis'
  | 'unsafe-weapons'
  | 'unsafe-malware'
  | 'unsafe-self-harm'
  | 'unsafe-csam-adjacent'
  | 'unsafe-fraud'
  // REVIEW
  | 'review-political'
  | 'review-ethics'
  | 'review-subjective-advice'
  // INJECTION
  | 'injection-role-override'
  | 'injection-format-manipulation';

/**
 * A single dataset example (one JSONL line).
 *
 * `id` and `source` are derived at read time when absent from the raw file
 * (seed files store only prompt/output/verdict/reason/category). `parent_id`
 * is present only for augmented records (points to the source seed example).
 */
export interface DatasetExample {
  /** Stable unique id. Generated deterministically from content when absent. */
  id: string;
  /** The user/attacker prompt. */
  prompt: string;
  /** The model output being classified. */
  output: string;
  /** Expected/curated verdict. */
  verdict: Verdict;
  /** Short justification, ≤5 words. */
  reason: string;
  /** Taxonomy category. */
  category: Category;
  /** Provenance: seed | augmented | eval. */
  source: DatasetSource;
  /** For augmented records, the id of the source seed example. */
  parentId?: string;
}

/** Filter for listing/querying the dataset. All fields optional. */
export interface DatasetFilter {
  /** Match verdict exactly. */
  verdict?: Verdict;
  /** Match category exactly. */
  category?: Category;
  /** Match provenance exactly. */
  source?: DatasetSource;
  /** Case-insensitive substring search over prompt + output. */
  search?: string;
}

/** Aggregate statistics over the dataset. */
export interface DatasetStats {
  /** Total number of examples. */
  total: number;
  /** Count per verdict. */
  byVerdict: Record<Verdict, number>;
  /** Count per category. */
  byCategory: Record<Category, number>;
  /** Count per source. */
  bySource: Record<DatasetSource, number>;
  /** Number of duplicate prompt+output pairs detected. */
  duplicates: number;
}

/** A single eval test case (one line of eval-suite.jsonl). */
export interface EvalCase {
  id: string;
  prompt: string;
  output: string;
  /** Expected verdict. */
  verdict: Verdict;
  reason: string;
  category: Category;
  /** Which suite the case belongs to: original | heldout. */
  suite: 'original' | 'heldout';
}

/** Result of running one eval case against a model. */
export interface EvalResult {
  /** Eval case id. */
  caseId: string;
  /** Expected verdict. */
  expected: Verdict;
  /** Verdict the model actually produced. */
  actual: Verdict;
  /** Whether actual === expected. */
  pass: boolean;
  /** Category of the case (for per-category breakdown). */
  category: Category;
  /** Which suite the case belongs to. */
  suite: 'original' | 'heldout';
}

/** Aggregate eval report. */
export interface EvalReport {
  /** Model that was evaluated. */
  modelName: string;
  /** Total cases run. */
  total: number;
  /** Number of passing cases. */
  passed: number;
  /** Overall accuracy (passed / total), 0..1. */
  accuracy: number;
  /** Per-case results. */
  results: EvalResult[];
  /** Per-category accuracy breakdown. */
  byCategory: Record<Category, { total: number; passed: number; accuracy: number }>;
  /** Per-suite accuracy breakdown (original / heldout). */
  bySuite: Record<'original' | 'heldout', { total: number; passed: number; accuracy: number }>;
}

/** Metadata recorded for a training run. */
export interface TrainingRunMeta {
  /** Unique run id (e.g. timestamp-based). */
  id: string;
  /** ISO timestamp of when the run started. */
  date: string;
  /** Number of training epochs. */
  epochs: number;
  /** Final training loss. */
  loss: number;
  /** Eval accuracy after this run (0..1). */
  evalAccuracy: number;
  /** Number of examples in the training set. */
  exampleCount: number;
  /** Free-form JSON config (LoRA rank, lr, batch size, model names, etc.). */
  config: Record<string, unknown>;
}

/** Metadata recorded for an augmentation run. */
export interface AugmentationRunMeta {
  /** Unique run id. */
  id: string;
  /** ISO timestamp of when the run started. */
  date: string;
  /** Number of input (seed) examples. */
  inputCount: number;
  /** Number of output (augmented) examples produced. */
  outputCount: number;
  /** Number of duplicates removed. */
  dedupCount: number;
  /** Free-form JSON config (teacher model, top-k, threshold, etc.). */
  config: Record<string, unknown>;
}
