/**
 * Dignity Verifier Dashboard — LlamaIndex Config
 *
 * Semantic dataset augmentation + calibration, wired to the Phase 2
 * backend. "Run Augmentation" POSTs to /api/augment/run and "Run
 * Calibration" POSTs to /api/calibrate/run, then both poll
 * GET /api/runs/[id] until terminal. Each action is disabled while its
 * own run type is active.
 */

"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RunProgress } from "@/components/run-progress";
import { RunsHistory } from "@/components/runs-history";
import { useRun } from "@/lib/use-run";
import { AUGMENT_VERDICTS, type AugmentVerdict } from "@/lib/run-types";

const DEFAULT_TEACHER = "glm-5.3-flash:cloud";

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
  const [augmentTeacher, setAugmentTeacher] = useState(DEFAULT_TEACHER);
  const [augmentVerdict, setAugmentVerdict] = useState<AugmentVerdict>("SAFE");
  const [calibrateTeacher, setCalibrateTeacher] = useState(DEFAULT_TEACHER);
  const [augmentRefresh, setAugmentRefresh] = useState(0);
  const [calibrateRefresh, setCalibrateRefresh] = useState(0);

  const augment = useRun({ startUrl: "/api/augment/run" });
  const calibrate = useRun({ startUrl: "/api/calibrate/run" });

  const updateParam = (key: keyof AugmentationParams, value: string) => {
    setParams((current) => ({ ...current, [key]: value }));
  };

  const handleRunAugmentation = async () => {
    await augment.start({ teacher: augmentTeacher, verdict: augmentVerdict });
    setAugmentRefresh((value) => value + 1);
  };

  const handleRunCalibration = async () => {
    await calibrate.start({ teacher: calibrateTeacher });
    setCalibrateRefresh((value) => value + 1);
  };

  const augmentDisabled = augment.isActive || augment.isStarting;
  const calibrateDisabled = calibrate.isActive || calibrate.isStarting;

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
        </div>
      </section>

      {/* ─── Run Augmentation ────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Run Augmentation
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">Teacher model</span>
              <input
                type="text"
                value={augmentTeacher}
                onChange={(event) => setAugmentTeacher(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">Verdict to augment</span>
              <select
                value={augmentVerdict}
                onChange={(event) => setAugmentVerdict(event.target.value as AugmentVerdict)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
              >
                {AUGMENT_VERDICTS.map((verdict) => (
                  <option key={verdict} value={verdict}>
                    {verdict}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              disabled={augmentDisabled}
              onClick={() => void handleRunAugmentation()}
              className={`rounded-md px-5 py-2.5 text-sm font-semibold transition ${
                augmentDisabled
                  ? "cursor-not-allowed bg-emerald-600/40 text-emerald-200/60"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
              }`}
            >
              {augment.isStarting
                ? "Starting…"
                : augment.isActive
                  ? "Augmenting…"
                  : "Run Augmentation"}
            </button>
            <p className="text-xs text-slate-500">
              Generates paraphrased variations of the seed set via the teacher model.
            </p>
          </div>

          {augment.error ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              {augment.error}
            </div>
          ) : null}
        </div>
      </section>

      {/* ─── Run Calibration ─────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Run Calibration
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <label className="block max-w-sm">
            <span className="mb-1.5 block text-sm text-slate-400">Teacher model</span>
            <input
              type="text"
              value={calibrateTeacher}
              onChange={(event) => setCalibrateTeacher(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
            />
          </label>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              disabled={calibrateDisabled}
              onClick={() => void handleRunCalibration()}
              className={`rounded-md px-5 py-2.5 text-sm font-semibold transition ${
                calibrateDisabled
                  ? "cursor-not-allowed bg-emerald-600/40 text-emerald-200/60"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
              }`}
            >
              {calibrate.isStarting
                ? "Starting…"
                : calibrate.isActive
                  ? "Calibrating…"
                  : "Run Calibration"}
            </button>
            <p className="text-xs text-slate-500">
              Calibrates the teacher model&apos;s verdict thresholds on the seed set.
            </p>
          </div>

          {calibrate.error ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              {calibrate.error}
            </div>
          ) : null}
        </div>
      </section>

      {/* ─── Augmentation progress ───────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Augmentation Progress
        </h2>
        <RunProgress run={augment.run} label="Augmentation run" />
      </section>

      {/* ─── Calibration progress ────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Calibration Progress
        </h2>
        <RunProgress run={calibrate.run} label="Calibration run" />
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
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Augmented Dataset
        </h2>
        <EmptyState
          title="No augmented examples yet"
          description="Running augmentation will generate paraphrased variations of the seed set (target 500+ total) and write them to dataset/augmented/augmented.jsonl. Stats will appear here once the backend produces output."
        />
      </section>

      {/* ─── Recent runs ─────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recent Augmentation Runs
        </h2>
        <RunsHistory type="augment" refreshKey={augmentRefresh} />
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recent Calibration Runs
        </h2>
        <RunsHistory type="calibrate" refreshKey={calibrateRefresh} />
      </section>
    </PageShell>
  );
}

export default LlamaIndexPage;
