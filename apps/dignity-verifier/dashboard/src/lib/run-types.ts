/**
 * Dignity Verifier Dashboard — Run types
 *
 * Types for the Phase 2 teaching-action run API (training / augment /
 * calibrate). Pure types and constants shared between client components.
 * No Node built-ins here so this module is safe to import from client
 * components.
 *
 * Contract (shared with the Phase 2 backend):
 *   POST /api/training/run  body {dryRun?: boolean} → {success, data:{runId}}
 *   POST /api/augment/run   body {teacher?, verdict?} → {runId}
 *   POST /api/calibrate/run body {teacher?, sample?} → {runId}
 *   GET  /api/runs          ?type=&limit= → {success, data:{runs}}
 *   GET  /api/runs/[id]     → {success, data:{run}}
 */

export const RUN_TYPES = ["training", "augment", "calibrate"] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Verdicts accepted by the augment action. */
export const AUGMENT_VERDICTS = ["SAFE", "UNSAFE", "REVIEW"] as const;
export type AugmentVerdict = (typeof AUGMENT_VERDICTS)[number];

export interface RunRecord {
  id: string;
  type: RunType;
  status: RunStatus;
  params: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  logTail: string | null;
  artifactPath?: string | null;
}

/** Terminal statuses — polling stops once a run reaches one of these. */
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["succeeded", "failed"];

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
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
  error?: string | null;
}

/** GET /api/runs */
export interface RunsListResponse {
  success: boolean;
  data?: { runs: RunRecord[] };
  error?: string | null;
}

/** GET /api/runs/[id] */
export interface RunDetailResponse {
  success: boolean;
  data?: { run: RunRecord };
  error?: string | null;
}
