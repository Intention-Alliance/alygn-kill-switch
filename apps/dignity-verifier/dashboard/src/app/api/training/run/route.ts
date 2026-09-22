/**
 * Dignity Verifier Dashboard — Training run trigger
 *
 * POST /api/training/run
 * Body: { dryRun?: boolean }
 * → 200 { success: true, data: { runId } }
 * → 409 { success: false, error } when a training run is already in flight.
 * Requires an authenticated super-admin session (401 otherwise).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guard";
import { enqueueRun } from "@/lib/job-runner";
import { buildTrainingCommand } from "@/lib/run-commands";

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_BODY", message: "Invalid request body" },
      },
      { status: 400 },
    );
  }

  const outcome = await enqueueRun(
    "training",
    { dryRun: parsed.dryRun },
    buildTrainingCommand({ dryRun: parsed.dryRun }),
  );

  if (!outcome.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RUN_IN_PROGRESS",
          message: "A training run is already in progress",
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, data: { runId: outcome.runId } });
}
