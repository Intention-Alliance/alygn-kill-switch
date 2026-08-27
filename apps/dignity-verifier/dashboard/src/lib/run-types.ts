/**
 * Dignity Verifier Dashboard — Job-runner run types
 *
 * Shared types for the teaching-pipeline job runner (training / augment /
 * calibrate). Pure types only — safe to import from client components.
 *
 * This file is the unified source of truth shared with the Phase 2 backend
 * (feat/dignity-dashboard-api). It mirrors the BE's RunRecord/RunParams
 * exactly (logTail is a non-null string — the DB column is NOT NULL
 * DEFAULT '') and adds FE-only helpers (terminal-status checks, augment
 * verdicts, request/response envelopes).
 *
 * Error envelope (BE contract): errors are objects, not strings —
 *   { code: string; message: string }
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

/* ─── FE-only additions ────────────────────────────────────────── */

/** Verdicts accepted by the augment action. */
export const AUGMENT_VERDICTS = ["SAFE", "UNSAFE", "REVIEW"] as const;
export type AugmentVerdict = (typeof AUGMENT_VERDICTS)[number];

/** Terminal statuses — polling stops once a run reaches one of these. */
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["succeeded", "failed"];

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

/** Error envelope returned by the BE on non-2xx responses. */
export interface RunError {
  code: string;
  message: string;
}

/** POST /api/training/run */
export interface TrainingRunRequest {
  dryRun?: boolean;
}

/** POST /api/augment/run */
export interface AugmentRunRequest {
  teacher?: string;
  verdict?: AugmentVerdict;
}

/** POST /api/calibrate/run */
export interface CalibrateRunRequest {
  teacher?: string;
  sample?: number;
}

/** Shared response envelope for run-start endpoints. */
export interface RunStartResponse {
  success: boolean;
  data?: { runId: string };
  error?: RunError | null;
}

/** GET /api/runs */
export interface RunsListResponse {
  success: boolean;
  data?: RunListData;
  error?: RunError | null;
}

/** GET /api/runs/[id] */
export interface RunDetailResponse {
  success: boolean;
  data?: { run: RunRecord };
  error?: RunError | null;
}
