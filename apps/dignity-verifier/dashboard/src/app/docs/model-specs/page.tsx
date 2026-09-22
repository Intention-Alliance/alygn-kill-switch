/**
 * Dignity Verifier Dashboard — Model Specifications & Changelog
 *
 * Living document describing the model and its changelog. The changelog is
 * read server-side from `docs/changelog.json` and rendered newest-first.
 */

import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { DocSection } from "@/components/doc-section";
import { DocTable } from "@/components/doc-table";
import { DocCodeBlock } from "@/components/doc-code-block";
import { getChangelog } from "@/lib/changelog";

const MODEL_OVERVIEW = [
  { label: "Model name", value: "dignity-verification-v0.1-preview" },
  { label: "Base model", value: "qwen2.5:0.5b" },
  { label: "Training method", value: "LoRA fine-tuning (PEFT)" },
  { label: "Target", value: "inference-safety classification (SAFE/UNSAFE/REVIEW)" },
  { label: "Use case", value: "kill-switch verifier model" },
] as const;

const SPECS = [
  { label: "Architecture", value: "Qwen2.5 0.5B parameters, decoder-only transformer" },
  { label: "LoRA config", value: "rank=8, alpha=16, dropout=0.05, target=q_proj+v_proj" },
  { label: "Training config", value: "3 epochs, batch_size=4, lr=2e-4, CPU-only" },
  { label: "Input", value: "(prompt, output) pair + system prompt" },
  { label: "Output", value: "verdict label + reason string" },
  { label: "Constraints", value: "no GPU, <5G disk, <4h training time" },
] as const;

const LEARNINGS = [
  {
    title: "Training objective",
    desc: "Classifying AI inference output as SAFE, UNSAFE, or REVIEW for the kill-switch safety gate.",
  },
  {
    title: "Current state",
    desc: "Scaffold phase — no training runs executed yet (baseline 38% accuracy with stock model + hand-written prompt).",
  },
  {
    title: "Training goal",
    desc: "Replace the hand-tuned prompt with a fine-tuned 0.5B model that has learned the classification boundary from a stronger teacher (deepseek-v4-flash:cloud).",
  },
  {
    title: "Key insight",
    desc: "Baseline accuracy of 38% is too low for a safety-critical gate; target is ≥85% via LoRA distillation.",
  },
] as const;

export async function ModelSpecsPage() {
  const changelog = await getChangelog();

  return (
    <PageShell active="/docs">
      <PageHeader
        eyebrow="Docs · Model"
        title="Model Specifications & Changelog"
        description="A living document describing the dignity verifier model, its configuration, and the self-updating changelog."
      />

      {/* ─── Model overview ──────────────────────────────────── */}
      <DocSection number="1" title="Model Overview">
        <DocTable
          headers={["Property", "Value"]}
          rows={MODEL_OVERVIEW.map((m) => [m.label, m.value])}
        />
      </DocSection>

      {/* ─── Specifications ──────────────────────────────────── */}
      <DocSection number="2" title="Specifications">
        <DocTable
          headers={["Aspect", "Specification"]}
          rows={SPECS.map((s) => [s.label, s.value])}
        />
      </DocSection>

      {/* ─── Changelog ───────────────────────────────────────── */}
      <DocSection
        number="3"
        title="Changelog"
        lead="Newest first. This section is self-updating — see the note below."
      >
        {changelog.length === 0 ? (
          <p className="text-sm text-slate-400">
            No changelog entries found. Check that <code className="font-mono text-emerald-300">docs/changelog.json</code> exists.
          </p>
        ) : (
          <div className="space-y-4">
            {changelog.map((entry, index) => (
              <div
                key={`${entry.date}-${entry.title}-${index}`}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-300">
                    {entry.version}
                  </span>
                  <span className="font-mono text-xs text-slate-500">{entry.date}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-200">{entry.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{entry.description}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-slate-200">How to update</h3>
          <p className="mt-2 text-sm text-slate-400">
            New training runs should append an entry to{" "}
            <code className="font-mono text-emerald-300">docs/changelog.json</code>. The page reads
            this file server-side and renders entries in reverse chronological order automatically.
          </p>
          <DocCodeBlock
            label="docs/changelog.json"
            code={`{
  "version": "v0.1.0-preview",
  "date": "2026-08-26",
  "title": "Your entry title",
  "description": "What changed in this run or milestone."
}`}
          />
        </div>
      </DocSection>

      {/* ─── Model learnings ─────────────────────────────────── */}
      <DocSection number="4" title="Model Learnings Summary">
        <div className="grid gap-4 sm:grid-cols-2">
          {LEARNINGS.map((item) => (
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

export default ModelSpecsPage;
