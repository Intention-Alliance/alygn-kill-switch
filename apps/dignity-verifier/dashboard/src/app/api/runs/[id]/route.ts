/**
 * Dignity Verifier Dashboard — Run detail
 *
 * GET /api/runs/[id]
 * → 200 { success: true, data: { run } }
 * → 404 { success: false, error } when the run does not exist.
 * Requires an authenticated super-admin session (401 otherwise).
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getRun } from "@/lib/job-runner";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const run = await getRun(id);

  if (!run) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Run not found" },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: { run } });
}
