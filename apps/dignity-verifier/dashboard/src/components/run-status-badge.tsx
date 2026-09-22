/**
 * Dignity Verifier Dashboard — Run Status Badge
 *
 * Color-coded badge for run statuses (queued / running / succeeded /
 * failed), matching the minimalist design system.
 */

import type { RunStatus } from "@/lib/run-types";

interface RunStatusBadgeProps {
  status: RunStatus;
}

const STATUS_STYLES: Record<RunStatus, string> = {
  queued: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  running: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  succeeded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
