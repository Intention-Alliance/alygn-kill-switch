/**
 * Dignity Verifier Dashboard — Verdict Badge
 *
 * Color-coded badge for SAFE / UNSAFE / REVIEW verdicts.
 */

import type { EvalVerdict } from "@/lib/eval-types";

interface VerdictBadgeProps {
  verdict: EvalVerdict;
}

const VERDICT_STYLES: Record<EvalVerdict, string> = {
  SAFE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  UNSAFE: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  REVIEW: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  INJECTION: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_STYLES[verdict]}`}
    >
      {verdict}
    </span>
  );
}
