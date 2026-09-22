/**
 * Dignity Verifier Dashboard — LlamaIndex Augmentation Guide
 *
 * Explains how LlamaIndex performs semantic augmentation in this framework:
 * pipeline flow, configuration parameters, and quality best practices.
 */

import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { DocSection } from "@/components/doc-section";
import { DocTable } from "@/components/doc-table";

const PIPELINE_STEPS = [
  {
    step: "1 · Index",
    desc: "Build a vector index over the seed set using nomic-embed-text-v2-moe embeddings.",
  },
  {
    step: "2 · Retrieve",
    desc: "Fetch top-K semantically similar examples for each seed example.",
  },
  {
    step: "3 · Paraphrase",
    desc: "The teacher model (deepseek-v4-flash:cloud) generates paraphrases and variations.",
  },
  {
    step: "4 · Verify",
    desc: "Check each generated verdict against the teacher; reject low-confidence labels.",
  },
  {
    step: "5 · Dedupe",
    desc: "Drop examples with cosine similarity > 0.92 to avoid redundant training signal.",
  },
] as const;

const CONFIG_PARAMS = [
  {
    param: "top-k",
    desc: "Number of similar seed examples retrieved per query.",
    recommended: "5",
    notes: "Higher top-k gives more context but can pull in off-topic neighbors.",
  },
  {
    param: "similarity threshold",
    desc: "Cosine threshold above which two examples are considered duplicates.",
    recommended: "0.92",
    notes: "Lower threshold keeps more diversity; higher threshold removes more near-duplicates.",
  },
  {
    param: "teacher model",
    desc: "The model used to generate paraphrases and verify verdicts.",
    recommended: "deepseek-v4-flash:cloud",
    notes: "Must be a cloud model; the student is local qwen2.5:0.5b.",
  },
  {
    param: "temperature",
    desc: "Sampling temperature for the teacher during paraphrase generation.",
    recommended: "0.7",
    notes: "Lower = more deterministic; higher = more diverse but riskier paraphrases.",
  },
] as const;

const BEST_PRACTICES = [
  {
    title: "Verify every verdict",
    desc: "Never trust a generated label blindly — confirm each augmented example's verdict against the teacher before inclusion.",
  },
  {
    title: "Reject low-confidence output",
    desc: "Discard paraphrases where the teacher is uncertain or the label contradicts the seed example.",
  },
  {
    title: "Keep provenance",
    desc: "Tag every augmented example with its source (seed id + teacher) so you can trace and audit the dataset.",
  },
  {
    title: "Balance augmentation",
    desc: "Augment minority classes more aggressively to keep the final dataset balanced across verdicts.",
  },
  {
    title: "Deduplicate aggressively",
    desc: "Paraphrases can drift toward near-duplicates; enforce the cosine > 0.92 threshold to keep signal diverse.",
  },
] as const;

export function LlamaIndexGuidePage() {
  return (
    <PageShell active="/docs">
      <PageHeader
        eyebrow="Docs · Augmentation"
        title="LlamaIndex Augmentation Guide"
        description="How semantic augmentation works in this framework, its configuration, and best practices for quality."
      />

      {/* ─── What LlamaIndex does ────────────────────────────── */}
      <DocSection
        number="1"
        title="What LlamaIndex does here"
        lead="LlamaIndex provides the semantic augmentation layer: it indexes the seed dataset and generates diverse paraphrases to grow the training set."
      >
        <p className="text-sm text-slate-400">
          The framework uses LlamaIndex to turn the hand-curated seed set (~270 examples) into a
          larger, more diverse training set (target 500+). By retrieving semantically similar
          examples and paraphrasing them with the teacher model, augmentation adds coverage of the
          classification boundary without hand-writing every example.
        </p>
      </DocSection>

      {/* ─── Pipeline flow ───────────────────────────────────── */}
      <DocSection number="2" title="Pipeline Flow">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.map((item) => (
            <div key={item.step} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm font-semibold text-emerald-300">{item.step}</p>
              <p className="mt-2 text-xs text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </DocSection>

      {/* ─── Configuration parameters ────────────────────────── */}
      <DocSection number="3" title="Configuration Parameters">
        <DocTable
          headers={["Parameter", "What it does", "Recommended", "Notes"]}
          rows={CONFIG_PARAMS.map((p) => [p.param, p.desc, p.recommended, p.notes])}
        />
      </DocSection>

      {/* ─── Best practices ──────────────────────────────────── */}
      <DocSection number="4" title="Best Practices for Augmentation Quality">
        <div className="grid gap-4 sm:grid-cols-2">
          {BEST_PRACTICES.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-emerald-300">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </DocSection>
    </PageShell>
  );
}

export default LlamaIndexGuidePage;
