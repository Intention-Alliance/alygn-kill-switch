/**
 * Dignity Verifier Dashboard — LlamaIndex Config
 *
 * Semantic dataset augmentation configuration. UI-only for Phase 1: the
 * "Run Augmentation" action requires the LlamaIndex backend.
 */

"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

interface AugmentationParams {
  augmentationCount: number;
  teacherTemperature: number;
  similarityThreshold: number;
  topK: number;
}

const DEFAULT_PARAMS: AugmentationParams = {
  augmentationCount: 3,
  teacherTemperature: 0.7,
  similarityThreshold: 0.92,
  topK: 5,
};

export function LlamaIndexPage() {
  const [params, setParams] = useState<AugmentationParams>(DEFAULT_PARAMS);

  const updateParam = (key: keyof AugmentationParams, value: string) => {
    setParams((current) => ({ ...current, [key]: value }));
  };

  return (
    <PageShell active="/llama-index">
      <PageHeader
        eyebrow="Module 3 · Augmentation"
        title="LlamaIndex Config"
        description="Configure semantic dataset augmentation: index the seed set, retrieve similar examples, and paraphrase with the teacher model."
      />

      {/* ─── Augmentation parameters ─────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Augmentation Parameters
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">
                Augmentations per example
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={params.augmentationCount}
                onChange={(event) => updateParam("augmentationCount", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">
                Teacher temperature
              </span>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={params.teacherTemperature}
                onChange={(event) => updateParam("teacherTemperature", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">
                Similarity threshold (dedupe)
              </span>
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={params.similarityThreshold}
                onChange={(event) => updateParam("similarityThreshold", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">Top-K retrieval</span>
              <input
                type="number"
                min={1}
                max={20}
                value={params.topK}
                onChange={(event) => updateParam("topK", event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              disabled
              title="Requires LlamaIndex backend"
              className="cursor-not-allowed rounded-md bg-emerald-600/40 px-5 py-2.5 text-sm font-semibold text-emerald-200/60"
            >
              Run Augmentation
            </button>
            <p className="text-xs text-slate-500">
              Requires LlamaIndex backend — the augmentation pipeline is not yet
              wired to this dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Pipeline flow ───────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Pipeline Flow
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { step: "1 · Index", desc: "Build a vector index over the seed set using nomic-embed-text-v2-moe." },
            { step: "2 · Retrieve", desc: "Fetch top-K semantically similar examples for each seed example." },
            { step: "3 · Paraphrase", desc: "Teacher model generates paraphrases + variations." },
            { step: "4 · Verify & Dedupe", desc: "Check verdicts against teacher; drop cosine >0.92 duplicates." },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm font-semibold text-emerald-300">{item.step}</p>
              <p className="mt-2 text-xs text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Augmented dataset stats ─────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Augmented Dataset
        </h2>
        <EmptyState
          title="No augmented examples yet"
          description="Running augmentation will generate paraphrased variations of the seed set (target 500+ total) and write them to dataset/augmented/augmented.jsonl. Stats will appear here once the backend produces output."
        />
      </section>
    </PageShell>
  );
}

export default LlamaIndexPage;
