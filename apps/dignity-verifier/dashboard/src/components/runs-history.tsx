/**
 * Dignity Verifier Dashboard — Runs History
 *
 * Compact list of the latest runs for a given run type, fetched from
 * GET /api/runs?type=&limit=20. Renders type, status badge, started /
 * finished timestamps, and exit code. Reused across the training and
 * llama-index pages.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { RunStatusBadge } from "@/components/run-status-badge";
import { type RunRecord, type RunType, type RunsListResponse } from "@/lib/run-types";

interface RunsHistoryProps {
  type: RunType;
  /** Bump to force a refetch (e.g. after starting a new run). */
  refreshKey?: number;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatExitCode(exitCode: number | null): string {
  return exitCode === null ? "—" : String(exitCode);
}

export function RunsHistory({ type, refreshKey = 0 }: RunsHistoryProps) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/runs?type=${type}&limit=20`);
      const json = (await response.json()) as RunsListResponse;
      if (!response.ok || !json.success || !json.data) {
        setError(json.error?.message ?? "Failed to load run history.");
        return;
      }
      setRuns(json.data.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run history.");
    }
  }, [type]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns, refreshKey]);

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        {error}
      </div>
    );
  }

  if (runs === null) {
    return (
      <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
    );
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        title={`No ${type} runs yet`}
        description={`Once you start a ${type} run, it will appear here with its status, timestamps, and exit code.`}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3">Finished</th>
            <th className="px-4 py-3">Exit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {runs.map((run) => (
            <tr key={run.id} className="text-slate-300">
              <td className="px-4 py-3 font-mono text-xs text-emerald-300">{run.type}</td>
              <td className="px-4 py-3">
                <RunStatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-400">
                {formatTimestamp(run.startedAt)}
              </td>
              <td className="px-4 py-3 text-xs text-slate-400">
                {formatTimestamp(run.finishedAt)}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">
                {formatExitCode(run.exitCode)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
