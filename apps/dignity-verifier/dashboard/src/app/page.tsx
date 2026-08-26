/**
 * Dignity Verifier Dashboard — Home
 *
 * Super-admin landing page. Scaffold only — Gimglich builds the full UI.
 * Shows the framework status and links to the four modules.
 */

import Link from "next/link";

const modules = [
  { href: "/dataset", title: "Dataset Manager", desc: "View, add, edit, delete examples; upload JSONL." },
  { href: "/training", title: "Training Executor", desc: "Start/stop LoRA fine-tune runs, view progress + logs." },
  { href: "/llama-index", title: "LlamaIndex Config", desc: "Augmentation params, teacher model selection, run augmentation." },
  { href: "/reports", title: "Reports", desc: "Training run history, eval results, accuracy charts, distillation logs." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <header className="mb-12">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-emerald-400">
            Super-Admin · Tailscale Only
          </p>
          <h1 className="text-4xl font-bold">Dignity Verifier Training Framework</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            Distill inference-safety classification from a teacher model into a 0.5B
            student model via LoRA fine-tuning. Target model:{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-300">
              dignity-verifier-preview-v1
            </code>
            .
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group rounded-xl border border-slate-800 bg-slate-900 p-6 transition hover:border-emerald-500/50 hover:bg-slate-800/60"
            >
              <h2 className="text-lg font-semibold text-emerald-300 group-hover:text-emerald-200">
                {m.title}
              </h2>
              <p className="mt-2 text-sm text-slate-400">{m.desc}</p>
            </Link>
          ))}
        </div>

        <footer className="mt-16 border-t border-slate-800 pt-6 text-xs text-slate-500">
          Scaffold only — full UI under construction. Access restricted to Andler&apos;s
          Tailscale identity via Better-Auth + WebAuthn.
        </footer>
      </div>
    </main>
  );
}
