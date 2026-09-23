/**
 * Dignity Verifier Dashboard — Home
 *
 * Super-admin landing page. Shows framework status (model config, dataset
 * stats, system health) and links to the four modules.
 */

import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getDatasetStats } from "@/lib/dataset";

const MODULES = [
  {
    href: "/dataset",
    title: "Dataset Manager",
    desc: "View, add, edit, delete examples; upload JSONL.",
  },
  {
    href: "/training",
    title: "Training Executor",
    desc: "Start/stop LoRA fine-tune runs, view progress + logs.",
  },
  {
    href: "/llama-index",
    title: "LlamaIndex Config",
    desc: "Augmentation params, teacher model selection, run augmentation.",
  },
  {
    href: "/reports",
    title: "Reports",
    desc: "Training run history, eval results, accuracy charts, distillation logs.",
  },
] as const;

const MODEL_CONFIG = [
  { label: "Teacher", value: "deepseek-v4-flash:cloud", note: "Allowed cloud model" },
  { label: "Student", value: "qwen2.5:0.5b", note: "LoRA fine-tune target" },
  { label: "Embedding", value: "nomic-embed-text-v2-moe:latest", note: "Local, F16" },
  { label: "Target", value: "dignity-verification-v0.1-preview", note: "Output model" },
] as const;

export default async function HomePage() {
  const stats = await getDatasetStats();

  return (
    <PageShell active="/">
      <PageHeader
        eyebrow="Super-Admin · Tailscale Only"
        title="Dignity Verifier Training Framework"
        description="Distill inference-safety classification from a teacher model into a 0.5B student model via LoRA fine-tuning."
      />

      {/* ─── Framework status ─────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Framework Status
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
              <p className="mt-1 text-xs text-slate-500">{model.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Dataset stats ────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Dataset
          </h2>
          <Link
            href="/dataset"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            Manage →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Examples" value={stats.total} accent="emerald" />
          <StatCard label="Safe" value={stats.byVerdict.SAFE} accent="emerald" />
          <StatCard label="Unsafe" value={stats.byVerdict.UNSAFE} accent="rose" />
          <StatCard label="Review" value={stats.byVerdict.REVIEW} accent="amber" />
        </div>
      </section>

      {/* ─── Training + health ────────────────────────────────── */}
      <section className="mb-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Last Training Run
          </h2>
          <p className="mt-3 text-sm text-slate-400">
            No training runs yet. The training executor is a Phase 2 backend —
            once wired, run history and progress will appear here.
          </p>
          <Link
            href="/training"
            className="mt-4 inline-block text-sm text-emerald-400 hover:text-emerald-300"
          >
            Open Training Executor →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              System Health
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Operational
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Dashboard serving on Tailscale-only. Auth via Better-Auth +
            WebAuthn. Dataset loaded from seed JSONL.
          </p>
        </div>
      </section>

      {/* ─── Module grid ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Modules
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {MODULES.map((module) => (
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
