/**
 * Dignity Verifier Dashboard — Job-runner run types
 *
 * Shared types for the teaching-pipeline job runner (training / augment /
 * calibrate). Pure types only — safe to import from client components.
 */

export const RUN_TYPES = ["training", "augment", "calibrate"] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Trigger params for a teaching run. */
export interface RunParams {
  /** Teacher model name (augment / calibrate). */
  teacher?: string;
  /** Verdict filter (augment only): SAFE | UNSAFE | REVIEW. */
  verdict?: "SAFE" | "UNSAFE" | "REVIEW";
  /** Sample size (calibrate only). */
  sample?: number;
  /** Dry-run flag (training only). */
  dryRun?: boolean;
}

/** A persisted job-runner run record. */
export interface RunRecord {
  id: string;
  type: RunType;
  status: RunStatus;
  params: RunParams;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  /** Bounded log tail (≤100 lines). */
  logTail: string;
  artifactPath: string | null;
  createdAt: string;
  updatedAt: string;
}

/** List response payload. */
export interface RunListData {
  runs: RunRecord[];
}
