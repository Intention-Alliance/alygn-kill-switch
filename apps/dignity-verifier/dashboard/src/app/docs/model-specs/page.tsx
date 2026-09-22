/**
 * Dignity Verifier Dashboard — Model Specifications & Changelog
 *
 * Living document describing the model and its changelog. The changelog is
 * read server-side from `docs/changelog.json` and rendered newest-first.
 * Includes full architecture, training pipeline, model learnings, changelog
 * format, and references.
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

/* ─── Architecture (deep dive) ────────────────────────────────── */

const ARCHITECTURE = [
  { label: "Parameters", value: "494M parameters" },
  { label: "Layers", value: "24 transformer layers" },
  { label: "Hidden size", value: "896" },
  { label: "Attention heads", value: "14" },
  { label: "Context length", value: "32K tokens" },
  { label: "Tokenizer", value: "BPE (Byte Pair Encoding), vocab size 151,646" },
  { label: "Architecture", value: "Decoder-only transformer with RoPE, SwiGLU activation, RMSNorm" },
] as const;

/* ─── Training pipeline (deep dive) ───────────────────────────── */

const PIPELINE = [
  { label: "Teacher model", value: "deepseek-v4-flash:cloud (~671B parameters, allowed cloud model)" },
  { label: "Student model", value: "qwen2.5:0.5b (local, 494M parameters)" },
  { label: "Distillation method", value: "Teacher generates verdicts for augmented examples; student learns from the teacher's labels." },
  { label: "LoRA adapter output", value: "~5-20MB safetensors file" },
  { label: "Ollama Modelfile", value: "FROM qwen2.5:0.5b + ADAPTER ./lora-weights.safetensors" },
] as const;

/* ─── Model learnings (deep dive) ─────────────────────────────── */

const LEARNINGS = [
  {
    title: "Training objective",
    desc: "Classifying AI inference output as SAFE, UNSAFE, or REVIEW for the kill-switch safety gate.",
  },
  {
    title: "Why it matters",
    desc: "The kill-switch is the last line of defense against harmful AI output — the verifier model must catch unsafe outputs before they reach end users.",
  },
  {
    title: "Current state",
    desc: "Scaffold phase — no training runs executed yet (baseline 38% accuracy with stock qwen2.5:0.5b + hand-written prompt).",
  },
  {
    title: "Training goal",
    desc: "Replace the hand-tuned prompt with a fine-tuned 0.5B model that has learned the classification boundary from a stronger teacher (deepseek-v4-flash:cloud).",
  },
  {
    title: "Expected outcome",
    desc: "≥85% accuracy on the 33-test eval suite, <500ms inference latency on CPU.",
  },
  {
    title: "Key insight",
    desc: "Baseline accuracy of 38% is too low for a safety-critical gate — the hand-written prompt doesn't capture the nuanced boundary between SAFE/UNSAFE/REVIEW.",
  },
] as const;

/* ─── References ──────────────────────────────────────────────── */

const REFERENCES = [
  { label: "Qwen2.5 technical report", href: "https://arxiv.org/abs/2412.15115" },
  { label: "LoRA paper (Hu et al. 2021)", href: "https://arxiv.org/abs/2106.09685" },
  { label: "PEFT library (HuggingFace)", href: "https://huggingface.co/docs/peft" },
  { label: "Ollama Modelfile documentation", href: "https://github.com/ollama/ollama/blob/main/docs/modelfile.md" },
] as const;

export async function ModelSpecsPage() {
  const changelog = await getChangelog();

  return (
    <PageShell active="/docs">
      <PageHeader
        eyebrow="Docs · Model"
        title="Model Specifications & Changelog"
        description="A living document describing the dignity verifier model, its architecture, training pipeline, learnings, and the self-updating changelog."
      />

      {/* ─── Model overview ──────────────────────────────────── */}
      <DocSection number="1" title="Model Overview">
        <DocTable
          headers={["Property", "Value"]}
          rows={MODEL_OVERVIEW.map((m) => [m.label, m.value])}
        />
      </DocSection>

      {/* ─── Architecture ────────────────────────────────────── */}
      <DocSection
        number="2"
        title="Architecture (Deep Dive)"
        lead="The student model is a small, efficient decoder-only transformer that runs comfortably on CPU."
      >
        <DocTable
          headers={["Aspect", "Specification"]}
          rows={ARCHITECTURE.map((a) => [a.label, a.value])}
        />
        <p className="text-sm text-slate-400">
          Qwen2.5 0.5B uses <span className="font-semibold text-emerald-300">RoPE</span> (Rotary
          Position Embedding) for positional encoding, <span className="font-semibold text-emerald-300">SwiGLU</span>{" "}
          activation in its feed-forward layers, and <span className="font-semibold text-emerald-300">RMSNorm</span>{" "}
          for normalization. Its 32K-token context is far more than this use case needs (512 tokens
          suffice), but the headroom is harmless.
        </p>
      </DocSection>

      {/* ─── Training pipeline ───────────────────────────────── */}
      <DocSection
        number="3"
        title="Training Pipeline (Deep Dive)"
        lead="How the student model is distilled from the teacher via LoRA."
      >
        <DocTable
          headers={["Component", "Specification"]}
          rows={PIPELINE.map((p) => [p.label, p.value])}
        />
        <DocCodeBlock
          label="Modelfile"
          code={`FROM qwen2.5:0.5b
ADAPTER ./lora-weights.safetensors`}
        />
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

      {/* ─── Changelog ───────────────────────────────────────── */}
      <DocSection
        number="5"
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
            After each training run, append a new entry to{" "}
            <code className="font-mono text-emerald-300">docs/changelog.json</code> with the version,
            date, description, and metrics (accuracy, loss, epoch). The page reads this file
            server-side and renders entries in reverse chronological order automatically.
          </p>
          <DocCodeBlock
            label="docs/changelog.json"
            code={`{
  "version": "v0.2.0",
  "date": "2026-08-27",
  "title": "First LoRA training run",
  "description": "Trained rank-8 LoRA on 500 augmented examples; eval accuracy 87%.",
  "metrics": {
    "accuracy": 0.87,
    "loss": 0.21,
    "epoch": 3
  }
}`}
          />
        </div>
      </DocSection>

      {/* ─── References ──────────────────────────────────────── */}
      <DocSection number="6" title="References">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
          {REFERENCES.map((ref) => (
            <li key={ref.href}>
              <a
                href={ref.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline transition hover:text-emerald-300"
              >
                {ref.label}
              </a>
            </li>
          ))}
        </ul>
      </DocSection>
    </PageShell>
  );
}

export default ModelSpecsPage;
