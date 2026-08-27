/**
 * Dignity Verifier Dashboard — Eval report reader
 *
 * Reads the NEWEST eval-results report.json produced by the eval runner
 * (`bun apps/dignity-verifier/eval/run-eval.ts`) and maps it to the
 * dashboard EvalReport shape. Returns null when no artifact exists yet.
 *
 * The eval runner writes to <DIGNITY_EVAL_DIR>/eval-results/<runId>/report.json
 * (default repo-relative: apps/dignity-verifier/eval/eval-results/).
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { EvalReport } from "./eval-types";

/**
 * Resolve the eval-results directory at call time so DIGNITY_EVAL_DIR env
 * overrides are honored per-call (not frozen at module load). Falls back to
 * the repo-relative default when the env var is unset.
 */
function evalResultsDir(): string {
  const fromEnv = process.env.DIGNITY_EVAL_DIR;
  const base =
    fromEnv && fromEnv.trim().length > 0
      ? fromEnv.trim()
      : path.resolve(process.cwd(), "..", "..", "..", "apps/dignity-verifier/eval");
  return path.join(base, "eval-results");
}

/**
 * The empty eval report shape, returned by GET /api/eval when no eval-results
 * artifact exists yet. Shared so the route and verification scripts agree on
 * the empty shape.
 */
export function emptyReport(): EvalReport {
  return {
    runId: null,
    accuracy: null,
    fpr: null,
    fnr: null,
    confusionMatrix: null,
    perCategory: [],
    latencyP95Ms: null,
    generatedAt: null,
  };
}

interface RawReport {
  runId?: string | null;
  accuracy?: number | null;
  fpr?: number | null;
  fnr?: number | null;
  confusionMatrix?: EvalReport["confusionMatrix"];
  perCategory?: EvalReport["perCategory"];
  latencyP95Ms?: number | null;
  generatedAt?: string | null;
}

/**
 * Read the newest eval report.json. Returns null when no report exists.
 */
export async function readNewestEvalReport(): Promise<EvalReport | null> {
  const resultsDir = evalResultsDir();
  let entries;
  try {
    entries = await readdir(resultsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const runDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const runDir of runDirs) {
    const reportPath = path.join(resultsDir, runDir, "report.json");
    try {
      const text = await readFile(reportPath, "utf-8");
      const raw = JSON.parse(text) as RawReport;
      return mapReport(raw);
    } catch {
      // Skip malformed / unreadable reports and try the next run dir.
      continue;
    }
  }

  return null;
}

/** Map a raw report.json to the dashboard EvalReport shape. */
function mapReport(raw: RawReport): EvalReport {
  return {
    runId: raw.runId ?? null,
    accuracy: raw.accuracy ?? null,
    fpr: raw.fpr ?? null,
    fnr: raw.fnr ?? null,
    confusionMatrix: raw.confusionMatrix ?? null,
    perCategory: raw.perCategory ?? [],
    latencyP95Ms: raw.latencyP95Ms ?? null,
    generatedAt: raw.generatedAt ?? null,
  };
}
