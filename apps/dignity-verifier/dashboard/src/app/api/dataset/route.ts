/**
 * Dignity Verifier Dashboard — Dataset API
 *
 * GET /api/dataset?category=safe&search=...&limit=50&offset=0
 * Returns a paginated, filtered page of seed examples plus aggregate stats.
 */

import { NextResponse } from "next/server";
import { getDatasetPage } from "@/lib/dataset";
import { CATEGORY_GROUPS, type CategoryGroup } from "@/lib/dataset-types";

interface DatasetRouteParams {
  category?: string;
  search?: string;
  limit?: string;
  offset?: string;
}

function parseCategory(value: string | undefined): CategoryGroup | "all" {
  if (!value || value === "all") return "all";
  if (CATEGORY_GROUPS.includes(value as CategoryGroup)) {
    return value as CategoryGroup;
  }
  return "all";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params: DatasetRouteParams = {
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    };

    const page = await getDatasetPage({
      category: parseCategory(params.category),
      search: params.search ?? "",
      limit: parsePositiveInt(params.limit, 50),
      offset: parsePositiveInt(params.offset, 0),
    });

    return NextResponse.json({ data: page, error: null, success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dataset";
    return NextResponse.json(
      { data: null, error: message, success: false },
      { status: 500 }
    );
  }
}
