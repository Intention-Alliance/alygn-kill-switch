/**
 * Dignity Verifier Dashboard — Stat Card
 *
 * Displays a single metric with label, value, and optional accent color.
 */

import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "emerald" | "amber" | "rose" | "sky" | "slate";
}

const ACCENT_CLASSES: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  sky: "text-sky-300",
  slate: "text-slate-100",
};

export function StatCard({ label, value, hint, accent = "slate" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-bold ${ACCENT_CLASSES[accent]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
