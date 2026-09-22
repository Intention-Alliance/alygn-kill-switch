/**
 * Dignity Verifier Dashboard — Runs list
 *
 * GET /api/runs?type=training|augment|calibrate&limit=20
 * → 200 { success: true, data: { runs: [...] } }
 * Requires an authenticated super-admin session (401 otherwise).
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { listRuns } from "@/lib/job-runner";
import { RUN_TYPES, type RunType } from "@/lib/run-types";

function parseType(value: string | null): RunType | undefined {
  if (!value) return undefined;
  if (RUN_TYPES.includes(value as RunType)) {
    return value as RunType;
  }
  return undefined;
}

function parseLimit(value: string | null): number {
  if (!value) return 20;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 20;
  return parsed;
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const type = parseType(url.searchParams.get("type"));
  const limit = parseLimit(url.searchParams.get("limit"));

  const runs = await listRuns(type, limit);
  return NextResponse.json({ success: true, data: { runs } });
}
