/**
 * Dignity Verifier Dashboard — Dataset Manager
 *
 * Client component: table view of seed examples with category filter,
 * search, pagination, and a JSONL upload (UI-only preview).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { VerdictBadge } from "@/components/verdict-badge";
import { EmptyState } from "@/components/empty-state";
import {
  CATEGORY_GROUPS,
  type CategoryGroup,
  type DatasetExample,
  type DatasetStats,
} from "@/lib/dataset-types";

const PAGE_SIZE = 50;

interface DatasetApiResponse {
  data: {
    examples: DatasetExample[];
    total: number;
    offset: number;
    limit: number;
    stats: DatasetStats;
  } | null;
  error: string | null;
  success: boolean;
}

interface UploadedRow {
  id: string;
  prompt: string;
  output: string;
  verdict: string;
  category: string;
  reason?: string;
}

const CATEGORY_LABELS: Record<CategoryGroup | "all", string> = {
  all: "All",
  safe: "Safe",
  unsafe: "Unsafe",
  review: "Review",
  injection: "Injection",
};

export function DatasetPage() {
  const [category, setCategory] = useState<CategoryGroup | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [examples, setExamples] = useState<DatasetExample[]>([]);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadedRows, setUploadedRows] = useState<UploadedRow[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Debounce search input (300ms) to avoid hammering the API per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category,
        search: debouncedSearch,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const response = await fetch(`/api/dataset?${params.toString()}`);
      const json = (await response.json()) as DatasetApiResponse;
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load dataset");
        return;
      }
      setExamples(json.data.examples);
      setStats(json.data.stats);
      setTotal(json.data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dataset");
    } finally {
      setIsLoading(false);
    }
  }, [category, debouncedSearch, offset]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleCategoryChange = (next: CategoryGroup | "all") => {
    setCategory(next);
    setOffset(0);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  const handlePrevPage = () => setOffset((current) => Math.max(0, current - PAGE_SIZE));
  const handleNextPage = () => setOffset((current) => current + PAGE_SIZE);

  const handleFileUpload = (file: File) => {
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const rows: UploadedRow[] = [];
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof parsed.prompt === "string" && typeof parsed.output === "string") {
            rows.push({
              id: `upload-${rows.length}`,
              prompt: parsed.prompt,
              output: parsed.output,
              verdict: typeof parsed.verdict === "string" ? parsed.verdict : "REVIEW",
              category: typeof parsed.category === "string" ? parsed.category : "unknown",
              reason: typeof parsed.reason === "string" ? parsed.reason : "",
            });
          }
        } catch {
          // Skip malformed lines; report count below.
        }
      }
      if (rows.length === 0) {
        setUploadError("No valid JSONL rows found in the selected file.");
        setUploadedRows([]);
        return;
      }
      setUploadedRows(rows);
    };
    reader.onerror = () => setUploadError("Failed to read the selected file.");
    reader.readAsText(file);
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <PageShell active="/dataset">
      <PageHeader
        eyebrow="Module 1 · Dataset"
        title="Dataset Manager"
        description="Browse the hand-curated seed dataset. Filter by category, search, and preview JSONL uploads."
      />

      {/* ─── Stats bar ───────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats?.total ?? "—"} accent="emerald" />
        <StatCard label="Safe" value={stats?.byVerdict.SAFE ?? "—"} accent="emerald" />
        <StatCard label="Unsafe" value={stats?.byVerdict.UNSAFE ?? "—"} accent="rose" />
        <StatCard label="Review" value={stats?.byVerdict.REVIEW ?? "—"} accent="amber" />
      </div>

      {/* ─── Controls ────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", ...CATEGORY_GROUPS] as const).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => handleCategoryChange(group)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                category === group
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {CATEGORY_LABELS[group]}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search prompt, output, category…"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none sm:w-72"
        />
      </div>

      {/* ─── Upload (UI-only preview) ────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Upload JSONL</h3>
            <p className="mt-1 text-xs text-slate-500">
              Preview a JSONL file locally. Persistence requires the Phase 2
              backend.
            </p>
          </div>
          <label className="cursor-pointer rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20">
            Choose file
            <input
              type="file"
              accept=".jsonl,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </label>
        </div>
        {uploadError ? (
          <p className="mt-3 text-sm text-rose-300">{uploadError}</p>
        ) : null}
        {uploadedRows.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs text-slate-400">
              Previewing {uploadedRows.length} row{uploadedRows.length === 1 ? "" : "s"} from
              uploaded file:
            </p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-800 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Prompt</th>
                    <th className="px-3 py-2">Verdict</th>
                    <th className="px-3 py-2">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {uploadedRows.slice(0, 10).map((row) => (
                    <tr key={row.id} className="bg-slate-900">
                      <td className="max-w-md truncate px-3 py-2 text-slate-300">
                        {row.prompt}
                      </td>
                      <td className="px-3 py-2">
                        <VerdictBadge verdict={normalizeVerdict(row.verdict)} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">
                        {row.category}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* ─── Table ───────────────────────────────────────────── */}
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
          Loading dataset…
        </div>
      ) : examples.length === 0 ? (
        <EmptyState
          title="No examples match"
          description={
            search.length > 0
              ? `No seed examples match "${search}" in the ${CATEGORY_LABELS[category]} category. Try a different search or clear the filter.`
              : `No seed examples in the ${CATEGORY_LABELS[category]} category yet.`
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Prompt</th>
                  <th className="px-4 py-3">Verdict</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900">
                {examples.map((example) => (
                  <tr key={example.id} className="align-top transition hover:bg-slate-800/40">
                    <td className="max-w-md px-4 py-3">
                      <p className="text-slate-200">{example.prompt}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {example.output}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <VerdictBadge verdict={example.verdict} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {example.category}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-500">
                      {example.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Pagination ─────────────────────────────────── */}
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-400">
            <span>
              Showing {pageStart}–{pageEnd} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={offset === 0}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs transition enabled:hover:border-slate-600 enabled:hover:text-slate-200 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={pageEnd >= total}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs transition enabled:hover:border-slate-600 enabled:hover:text-slate-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function normalizeVerdict(value: string): "SAFE" | "UNSAFE" | "REVIEW" {
  const upper = value.toUpperCase();
  if (upper === "SAFE") return "SAFE";
  if (upper === "UNSAFE") return "UNSAFE";
  return "REVIEW";
}

export default DatasetPage;
