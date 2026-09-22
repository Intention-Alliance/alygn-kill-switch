/**
 * Dignity Verifier Dashboard — Page Shell
 *
 * Wraps page content with the site header and consistent max-width layout.
 */

import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";

interface PageShellProps {
  active: string;
  children: ReactNode;
}

export function PageShell({ active, children }: PageShellProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader active={active} />
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </main>
  );
}
