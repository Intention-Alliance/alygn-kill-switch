/**
 * Dignity Verifier Dashboard — Teaching-pipeline command builders
 *
 * Builds the argv arrays (never a shell string) for the augment / calibrate /
 * training subprocesses, and resolves their working directories.
 *
 * The ML venv lives in the ML worktree, NOT in this dashboard worktree, so
 * every directory is overridable via env:
 *   DIGNITY_LLAMA_INDEX_DIR  — augment/calibrate cwd (default repo-relative)
 *   DIGNITY_TRAINING_DIR     — training cwd (default repo-relative)
 *   DIGNITY_EVAL_DIR         — eval runner cwd (default repo-relative)
 *
 * Teacher model names are validated against an allowlist before they are
 * ever placed in an argv array.
 */

import path from "node:path";
import type { RunParams } from "./run-types";

// ─── Repo-relative path resolution ───────────────────────────────────────

/** Resolve the repo root (3 levels up from apps/dignity-verifier/dashboard). */
function repoRoot(): string {
  return path.resolve(process.cwd(), "..", "..", "..");
}

/**
 * Resolve a teaching-pipeline working directory.
 *   1. Explicit env override (Docker / ML worktree).
 *   2. Repo-relative default.
 */
function resolveDir(envName: string, repoRelative: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return path.join(repoRoot(), repoRelative);
}

export const LLAMA_INDEX_DIR = resolveDir(
  "DIGNITY_LLAMA_INDEX_DIR",
  "apps/dignity-verifier/llama-index",
);
export const TRAINING_DIR = resolveDir(
  "DIGNITY_TRAINING_DIR",
  "apps/dignity-verifier/training",
);
export const EVAL_DIR = resolveDir(
  "DIGNITY_EVAL_DIR",
  "apps/dignity-verifier/eval",
);

// ─── Teacher model allowlist ─────────────────────────────────────────────

/**
 * Allowed teacher model names. Teaching actions trigger expensive local
 * model runs, so we never pass an arbitrary string to the subprocess.
 * Extend this list deliberately as new teachers are approved.
 */
const ALLOWED_TEACHERS = new Set<string>([
  "glm-5.3-flash:cloud",
  "glm-5.2:cloud",
  "qwen2.5:0.5B",
  "qwen2.5:7B",
  "deepseek-v4-flash:cloud",
]);

/**
 * Validate a teacher model name against the allowlist.
 * Returns the normalized name, or null if not allowed.
 */
export function validateTeacher(teacher: string | undefined): string | null {
  if (!teacher || teacher.trim().length === 0) return null;
  const normalized = teacher.trim();
  return ALLOWED_TEACHERS.has(normalized) ? normalized : null;
}

// ─── Command builders ────────────────────────────────────────────────────

export interface BuiltCommand {
  /** argv array — never a shell string. */
  args: string[];
  cwd: string;
}

/** Build the augment subprocess command. */
export function buildAugmentCommand(params: RunParams): BuiltCommand {
  const args = [".venv/bin/python", "-u", "augment.py"];
  const teacher = validateTeacher(params.teacher);
  if (teacher) {
    args.push("--teacher", teacher);
  }
  if (params.verdict) {
    args.push("--verdict", params.verdict);
  }
  return { args, cwd: LLAMA_INDEX_DIR };
}

/** Build the calibrate subprocess command. */
export function buildCalibrateCommand(params: RunParams): BuiltCommand {
  const args = [".venv/bin/python", "-u", "calibrate.py"];
  const teacher = validateTeacher(params.teacher);
  if (teacher) {
    args.push("--teacher", teacher);
  }
  // The calibrate script samples REVIEW seeds via --review (and non-REVIEW
  // via --other). The contract exposes a single `sample` count; map it to
  // --review (the primary REVIEW sample size).
  if (params.sample !== undefined && params.sample > 0) {
    args.push("--review", String(params.sample));
  }
  return { args, cwd: LLAMA_INDEX_DIR };
}

/** Build the training subprocess command. */
export function buildTrainingCommand(params: RunParams): BuiltCommand {
  const args = ["python3", "train.py"];
  if (params.dryRun) {
    args.push("--dry-run");
  }
  return { args, cwd: TRAINING_DIR };
}

/** Build the eval runner subprocess command (used by the smoke test). */
export function buildEvalCommand(): BuiltCommand {
  return { args: ["bun", "run-eval.ts", "--set", "original", "--limit", "1"], cwd: EVAL_DIR };
}
