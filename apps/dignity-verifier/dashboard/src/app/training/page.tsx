/**
 * Dignity Verifier Dashboard — Training Executor
 *
 * LoRA fine-tune configuration and run management, wired to the Phase 2
 * backend. "Start Training" POSTs to /api/training/run (with an optional
 * dry-run flag), then polls GET /api/runs/[id] until the run reaches a
 * terminal status. The button is disabled while a training run is active.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { RunProgress } from "@/components/run-progress";
import { RunsHistory } from "@/components/runs-history";
import { useRun } from "@/lib/use-run";
import { type RunRecord, type RunsListResponse, isTerminalRunStatus } from "@/lib/run-types";

const MODEL_CONFIG = [
  { label: "Teacher", value: "glm-5.3-flash:cloud" },
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
  const [dryRun, setDryRun] = useState(false);
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const { run, isActive, isStarting, error, start } = useRun({
    startUrl: "/api/training/run",
    alreadyActive,
  });

  const updateParam = (key: keyof TrainingParams, value: string) => {
    setParams((current) => ({ ...current, [key]: value }));
  };

  // On load, check whether a training run is already active so we can
  // disable the button until it finishes.
  const checkActive = useCallback(async () => {
    try {
      const response = await fetch("/api/runs?type=training&limit=20");
      const json = (await response.json()) as RunsListResponse;
      if (!response.ok || !json.success || !json.data) return;
      const active = json.data.runs.some(
        (item: RunRecord) => !isTerminalRunStatus(item.status)
      );
      setAlreadyActive(active);
    } catch {
      // Non-fatal — the button will still work; the backend returns 409
      // if a run is already active.
    }
  }, []);

  useEffect(() => {
    void checkActive();
  }, [checkActive]);

  const handleStart = async () => {
    await start({ dryRun });
    setHistoryRefresh((value) => value + 1);
  };

  const buttonDisabled = alreadyActive || isActive || isStarting;

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

          {/* ─── Dry-run toggle ─────────────────────────────── */}
          <label className="mt-6 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/50"
            />
            <span className="text-sm text-slate-300">Dry run</span>
            <span className="text-xs text-slate-500">
              Validate the pipeline without persisting a full training run.
            </span>
          </label>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              disabled={buttonDisabled}
              onClick={() => void handleStart()}
              className={`rounded-md px-5 py-2.5 text-sm font-semibold transition ${
                buttonDisabled
                  ? "cursor-not-allowed bg-emerald-600/40 text-emerald-200/60"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
              }`}
            >
              {isStarting
                ? "Starting…"
                : isActive
                  ? "Training…"
                  : alreadyActive
                    ? "Training in progress"
                    : "Start Training"}
            </button>
            <p className="text-xs text-slate-500">
              {alreadyActive
                ? "A training run is already active — wait for it to finish."
                : "Starts a LoRA fine-tune session on the Phase 2 backend."}
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      {/* ─── Progress ────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Training Progress
        </h2>
        <RunProgress run={run} label="Current run" />
      </section>

      {/* ─── Recent runs ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recent Runs
        </h2>
        <RunsHistory type="training" refreshKey={historyRefresh} />
      </section>
    </PageShell>
  );
}

export default TrainingPage;
