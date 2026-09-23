/**
 * Dignity Verifier Dashboard — Empty State
 *
 * Informative empty state that explains what will populate the area,
 * rather than a bare "No data" message.
 */

import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center">
      {icon ? <div className="mb-4 text-slate-500">{icon}</div> : null}
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
