/**
 * Dignity Verifier Dashboard — Dataset Stats API
 *
 * GET /api/dataset/stats
 * Returns aggregate stats (total, per-verdict, per-category, per-group).
 */

import { NextResponse } from "next/server";
import { getDatasetStats } from "@/lib/dataset";

export async function GET() {
  try {
    const stats = await getDatasetStats();
    return NextResponse.json({ data: stats, error: null, success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dataset stats";
    return NextResponse.json(
      { data: null, error: message, success: false },
      { status: 500 }
    );
  }
}
