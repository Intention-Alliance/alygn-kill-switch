/**
 * Dignity Verifier Dashboard — Calibrate run trigger
 *
 * POST /api/calibrate/run
 * Body: { teacher?: string, sample?: number }
 * → 200 { success: true, data: { runId } }
 * → 409 { success: false, error } when a calibrate run is already in flight.
 * Requires an authenticated super-admin session (401 otherwise).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guard";
import { enqueueRun } from "@/lib/job-runner";
import { buildCalibrateCommand, validateTeacher } from "@/lib/run-commands";

const bodySchema = z.object({
  teacher: z.string().optional(),
  sample: z.number().int().positive().optional(),
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

  if (parsed.teacher !== undefined && validateTeacher(parsed.teacher) === null) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_TEACHER",
          message: "Teacher model is not on the allowlist",
        },
      },
      { status: 400 },
    );
  }

  const params = {
    teacher: parsed.teacher,
    sample: parsed.sample,
  };

  const outcome = await enqueueRun(
    "calibrate",
    params,
    buildCalibrateCommand(params),
  );

  if (!outcome.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RUN_IN_PROGRESS",
          message: "A calibrate run is already in progress",
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, data: { runId: outcome.runId } });
}
