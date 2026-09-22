/**
 * Dignity Verifier Dashboard — Training Executor
 *
 * LoRA fine-tune configuration and run management. UI-only for Phase 1:
 * the "Start Training" action requires the Phase 2 backend.
 */

"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

const MODEL_CONFIG = [
  { label: "Teacher", value: "deepseek-v4-flash:cloud" },
  { label: "Student (base)", value: "qwen2.5:0.5b" },
  { label: "Embedding", value: "nomic-embed-text-v2-moe:latest" },
  { label: "Target", value: "dignity-verification-v0.1-preview" },
] as const;

interface TrainingParams {
  epochs: number;
  batchSize: number;
  learningRate: string;
  loraRank: number;
}

const DEFAULT_PARAMS: TrainingParams = {
  epochs: 3,
  batchSize: 4,
  learningRate: "2e-4",
  loraRank: 8,
};

export function TrainingPage() {
  const [params, setParams] = useState<TrainingParams>(DEFAULT_PARAMS);

  const updateParam = (key: keyof TrainingParams, value: string) => {
    setParams((current) => ({ ...current, [key]: value }));
  };

  return (
    <PageShell active="/training">
      <PageHeader
        eyebrow="Module 2 · Training"
        title="Training Executor"
        description="Configure and run LoRA fine-tune sessions that distill the teacher model into the 0.5B student."
      />

      {/* ─── Model config ────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Model Configuration
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODEL_CONFIG.map((model) => (
            <div
              key={model.label}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {model.label}
              </p>
              <p className="mt-2 break-all font-mono text-sm text-emerald-300">
                {model.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Training parameters ─────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Training Parameters
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">Epochs</span>
              <input
                type="number"
                min={1}
                max={20}
                value={params.epochs}
                onChange={(event) => updateParam("epochs", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">Batch Size</span>
              <input
                type="number"
                min={1}
                max={8}
                value={params.batchSize}
                onChange={(event) => updateParam("batchSize", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">Learning Rate</span>
              <input
                type="text"
                value={params.learningRate}
                onChange={(event) => updateParam("learningRate", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">LoRA Rank</span>
              <input
                type="number"
                min={1}
                max={16}
                value={params.loraRank}
                onChange={(event) => updateParam("loraRank", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              disabled
              title="Requires Phase 2 backend"
              className="cursor-not-allowed rounded-md bg-emerald-600/40 px-5 py-2.5 text-sm font-semibold text-emerald-200/60"
            >
              Start Training
            </button>
            <p className="text-xs text-slate-500">
              Requires Phase 2 backend — the training pipeline is not yet wired
              to this dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Progress placeholder ────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Training Progress
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-400">Current run</span>
            <span className="text-slate-500">Idle</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-0 rounded-full bg-emerald-500" />
          </div>
          <pre className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-500">
{`# No active training run.
# Log output will stream here once the Phase 2 backend is connected.
# Expected: ~2–4h on CPU, adapter output ~5–20MB.`}
          </pre>
        </div>
      </section>

      {/* ─── Recent runs ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recent Runs
        </h2>
        <EmptyState
          title="No training runs yet"
          description="Once you start a training run, it will appear here with its status, hyperparameters, and eval accuracy. The Phase 2 backend will persist run history."
        />
      </section>
    </PageShell>
  );
}

export default TrainingPage;
