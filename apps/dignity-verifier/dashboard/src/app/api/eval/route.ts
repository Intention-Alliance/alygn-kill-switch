/**
 * Dignity Verifier Dashboard — Eval API
 *
 * GET /api/eval
 * Returns the latest eval suite metrics, read from the NEWEST eval-results
 * report.json produced by the eval runner
 * (`bun apps/dignity-verifier/eval/run-eval.ts`). Returns the empty report
 * shape when no artifact exists yet.
 */

import { NextResponse } from "next/server";
import type { EvalApiResponse } from "@/lib/eval-types";
import { emptyReport, readNewestEvalReport } from "@/lib/eval-report";

export async function GET() {
  const report = await readNewestEvalReport();

  const body: EvalApiResponse = {
    data: report ?? emptyReport(),
    error: null,
    success: true,
  };
  return NextResponse.json(body);
}
