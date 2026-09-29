/**
 * Dignity Verifier Dashboard — Run Progress
 *
 * Displays the status of an active (or last-completed) run: a status
 * badge, a progress bar while running, and a scrollable monospace
 * logTail. Reused across the training and llama-index pages.
 */

import { RunStatusBadge } from "@/components/run-status-badge";
import { type RunRecord, isTerminalRunStatus } from "@/lib/run-types";

interface RunProgressProps {
  run: RunRecord | null;
  /** Label for the "current run" row, e.g. "Training run". */
  label: string;
}

const IDLE_HINT = "# No active run.\n# Log output will stream here once a run is started.";

export function RunProgress({ run, label }: RunProgressProps) {
  const isActive = run !== null && !isTerminalRunStatus(run.status);
  const progressWidth = isActive ? "w-1/3" : run?.status === "succeeded" ? "w-full" : "w-0";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        {run ? (
          <RunStatusBadge status={run.status} />
        ) : (
          <span className="text-slate-500">Idle</span>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full bg-emerald-500 transition-all ${progressWidth}`}
        />
      </div>
      <pre className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-400">
        {run?.logTail ? run.logTail : IDLE_HINT}
      </pre>
    </div>
  );
}
