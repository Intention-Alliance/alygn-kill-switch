/**
 * Dignity Verifier Dashboard — Doc Section
 *
 * Consistent section wrapper for documentation pages: numbered heading,
 * optional lead paragraph, and children content.
 */

import type { ReactNode } from "react";

interface DocSectionProps {
  number?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}

export function DocSection({ number, title, lead, children }: DocSectionProps) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-semibold text-slate-100">
        {number ? (
          <span className="mr-2 font-mono text-sm text-emerald-400">{number}</span>
        ) : null}
        {title}
      </h2>
      {lead ? <p className="mb-4 max-w-3xl text-sm text-slate-400">{lead}</p> : null}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
