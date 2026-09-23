/**
 * Dignity Verifier Dashboard — Glossary
 *
 * Comprehensive glossary of all terms used across the dignity verifier
 * framework, organized by category. Pulls data from the shared glossary
 * module so terms stay consistent across documentation pages.
 */

import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { DocSection } from "@/components/doc-section";
import { GLOSSARY_CATEGORIES } from "@/lib/glossary";

export function GlossaryPage() {
  return (
    <PageShell active="/docs">
      <PageHeader
        eyebrow="Docs · Reference"
        title="Glossary"
        description="A comprehensive glossary of all terms used across the dignity verifier framework, organized by category."
      />

      {GLOSSARY_CATEGORIES.map((category, index) => (
        <DocSection
          key={category.id}
          number={String(index + 1)}
          title={category.title}
          lead={category.description}
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            {category.terms.map((item) => (
              <div key={item.term} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <dt className="font-mono text-sm font-semibold text-emerald-300">{item.term}</dt>
                <dd className="mt-1 text-sm text-slate-400">{item.definition}</dd>
              </div>
            ))}
          </dl>
        </DocSection>
      ))}
    </PageShell>
  );
}

export default GlossaryPage;
