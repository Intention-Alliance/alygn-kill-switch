/**
 * Dignity Verifier Dashboard — Eval API
 *
 * GET /api/eval
 * Returns the latest eval suite metrics. The eval runner does not exist
 * yet, so this returns an empty/null report shape. It will be wired to
 * real data once the eval runner lands.
 */

import { NextResponse } from "next/server";
import type { EvalApiResponse, EvalReport } from "@/lib/eval-types";

function emptyReport(): EvalReport {
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

export function GET() {
  const body: EvalApiResponse = {
    data: emptyReport(),
    error: null,
    success: true,
  };
  return NextResponse.json(body);
}
