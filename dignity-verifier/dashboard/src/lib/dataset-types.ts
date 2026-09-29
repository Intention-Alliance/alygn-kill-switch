/**
 * Dignity Verifier Dashboard — Dataset types & constants
 *
 * Pure types and constants shared between client and server. No Node
 * built-ins here so this module is safe to import from client components.
 */

export const VERDICTS = ["SAFE", "UNSAFE", "REVIEW"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CATEGORY_GROUPS = ["safe", "unsafe", "review", "injection"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export interface DatasetExample {
  id: string;
  prompt: string;
  output: string;
  verdict: Verdict;
  reason: string;
  category: string;
  source: string;
}

export interface DatasetStats {
  total: number;
  byVerdict: Record<Verdict, number>;
  byCategory: Record<string, number>;
  byGroup: Record<CategoryGroup, number>;
}

export interface DatasetQuery {
  category?: CategoryGroup | "all";
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DatasetPage {
  examples: DatasetExample[];
  total: number;
  offset: number;
  limit: number;
  stats: DatasetStats;
}
