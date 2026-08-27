/**
 * Dignity Verifier Dashboard — Reports
 *
 * Client component: fetches the latest eval suite metrics from /api/eval
 * and renders accuracy/FPR/FNR/latency stat cards, a 4×4 confusion matrix
 * (expected × actual verdicts), and per-category accuracy bars. When no
 * eval run exists yet, shows an informative empty state.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { VerdictBadge } from "@/components/verdict-badge";
import { EmptyState } from "@/components/empty-state";
import { type EvalApiResponse, type EvalReport } from "@/lib/eval-types";

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatLatency(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(0)} ms`;
}

function ConfusionMatrix({ report }: { report: EvalReport }) {
  const matrix = report.confusionMatrix;
  if (!matrix) return null;

  const { expected, actual, counts } = matrix;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              Expected ↓ / Actual →
            </th>
            {actual.map((verdict) => (
              <th key={verdict} className="px-3 py-2 text-center">
                <VerdictBadge verdict={verdict} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {expected.map((expectedVerdict, rowIndex) => (
            <tr key={expectedVerdict}>
              <td className="px-3 py-2">
                <VerdictBadge verdict={expectedVerdict} />
              </td>
              {actual.map((actualVerdict, colIndex) => {
                const isDiagonal = rowIndex === colIndex;
                const count = counts[rowIndex]?.[colIndex] ?? 0;
                return (
                  <td
                    key={actualVerdict}
                    className={`px-3 py-2 text-center font-mono text-base font-semibold ${
                      isDiagonal
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-slate-900 text-slate-300"
                    }`}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerCategoryBars({ report }: { report: EvalReport }) {
  const categories = report.perCategory;
  if (categories.length === 0) return null;

  return (
    <div className="space-y-4">
      {categories.map((metric) => (
        <div key={metric.category}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-200">{metric.category}</span>
            <span className="text-xs text-slate-400">
              {metric.count}/{metric.total} · {formatPercent(metric.accuracyPct)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500/70"
              style={{ width: `${metric.accuracyPct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
      <div className="h-40 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
    </div>
  );
}

export function ReportsPage() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/eval");
      const json = (await response.json()) as EvalApiResponse;
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load eval report");
        return;
      }
      setReport(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load eval report");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const hasRun = report?.runId !== null && report?.runId !== undefined;

  return (
    <PageShell active="/reports">
      <PageHeader
        eyebrow="Module 4 · Reports"
        title="Reports"
        description="Eval suite metrics: accuracy, false positive/negative rates, latency, and the expected-vs-actual confusion matrix."
      />

      <div className="mb-6 flex items-center justify-end">
        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={isLoading}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            isLoading
              ? "cursor-not-allowed bg-slate-700/40 text-slate-400"
              : "bg-slate-800 text-slate-200 hover:bg-slate-700"
          }`}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      ) : isLoading ? (
        <ReportsSkeleton />
      ) : !hasRun ? (
        <EmptyState
          title="No eval runs yet"
          description="Run the eval suite to generate reports. Accuracy, confusion matrix, and per-category breakdowns will appear here once the first run completes."
        />
      ) : (
        <div className="space-y-6">
          {/* ─── Stat cards ─────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Accuracy"
              value={formatPercent(report?.accuracy ?? null)}
              accent="emerald"
            />
            <StatCard
              label="False Positive Rate"
              value={formatPercent(report?.fpr ?? null)}
              accent="rose"
            />
            <StatCard
              label="False Negative Rate"
              value={formatPercent(report?.fnr ?? null)}
              accent="amber"
            />
            <StatCard
              label="Latency p95"
              value={formatLatency(report?.latencyP95Ms ?? null)}
              accent="sky"
            />
          </div>

          {/* ─── Confusion matrix ───────────────────────────── */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Confusion Matrix
            </h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <ConfusionMatrix report={report as EvalReport} />
            </div>
          </section>

          {/* ─── Per-category accuracy ──────────────────────── */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Per-Category Accuracy
            </h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <PerCategoryBars report={report as EvalReport} />
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}

export default ReportsPage;
