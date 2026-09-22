/**
 * Dignity Verifier Dashboard — Documentation Home
 *
 * Grid of documentation modules linking to each doc page. Mirrors the home
 * page module grid card style.
 */

import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";

const DOC_MODULES = [
  {
    href: "/docs/training-guide",
    title: "Training Guide & Best Practices",
    desc: "LoRA parameters, hyperparameters, dataset format, eval design, and CPU-only training tips.",
  },
  {
    href: "/docs/model-specs",
    title: "Model Specifications & Changelog",
    desc: "Architecture, LoRA config, training config, constraints, and the self-updating changelog.",
  },
  {
    href: "/docs/llama-index-guide",
    title: "LlamaIndex Augmentation Guide",
    desc: "Semantic augmentation pipeline, configuration parameters, and quality best practices.",
  },
] as const;

export function DocsPage() {
  return (
    <PageShell active="/docs">
      <PageHeader
        eyebrow="Documentation"
        title="Documentation"
        description="Guides and reference material for the Dignity Verifier Training Framework — training, model specs, and augmentation."
      />

      {/* ─── Doc module grid ─────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Documentation Modules
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {DOC_MODULES.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="group rounded-xl border border-slate-800 bg-slate-900 p-6 transition hover:border-emerald-500/50 hover:bg-slate-800/60"
            >
              <h3 className="text-lg font-semibold text-emerald-300 group-hover:text-emerald-200">
                {module.title}
              </h3>
              <p className="mt-2 text-sm text-slate-400">{module.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

export default DocsPage;
