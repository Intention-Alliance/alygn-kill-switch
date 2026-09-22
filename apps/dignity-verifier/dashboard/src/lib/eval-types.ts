/**
 * Dignity Verifier Dashboard — Eval report types
 *
 * Types for the eval suite metrics and confusion matrix. Pure types and
 * constants shared between the /api/eval route and the /reports page.
 * No Node built-ins here so this module is safe to import from client
 * components.
 */

export const EVAL_VERDICTS = ["SAFE", "UNSAFE", "REVIEW", "INJECTION"] as const;
export type EvalVerdict = (typeof EVAL_VERDICTS)[number];

export interface ConfusionMatrix {
  /** Rows are expected verdicts, columns are actual verdicts. */
  expected: EvalVerdict[];
  actual: EvalVerdict[];
  /** counts[expectedIndex][actualIndex] */
  counts: number[][];
}

export interface PerCategoryMetric {
  category: string;
  count: number;
  total: number;
  /** Percentage of the category's cases that were correct (0–100). */
  accuracyPct: number;
}

export interface EvalReport {
  runId: string | null;
  accuracy: number | null;
  fpr: number | null;
  fnr: number | null;
  confusionMatrix: ConfusionMatrix | null;
  perCategory: PerCategoryMetric[];
  latencyP95Ms: number | null;
  generatedAt: string | null;
}

export interface EvalApiResponse {
  data: EvalReport | null;
  error: string | null;
  success: boolean;
}
