/**
 * Dignity Verifier Dashboard — Site Header / Navigation
 *
 * Shared top navigation for all dashboard pages. Highlights the active
 * module. Server component (no client state needed).
 */

import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/dataset", label: "Dataset" },
  { href: "/training", label: "Training" },
  { href: "/llama-index", label: "LlamaIndex" },
  { href: "/reports", label: "Reports" },
  { href: "/docs", label: "Docs" },
] as const;

interface SiteHeaderProps {
  active: string;
}

export function SiteHeader({ active }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-sm font-bold text-emerald-400">
            DV
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-100">
            Dignity Verifier
          </span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV_LINKS.map((link) => {
            const isActive = link.href === active;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
