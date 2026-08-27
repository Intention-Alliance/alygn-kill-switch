/**
 * Dignity Verifier Dashboard — Reports
 *
 * Training run history, eval results, and accuracy trends. Phase 1 shows
 * informative empty states — data populates once the Phase 2 backend
 * persists runs and eval results.
 */

import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export function ReportsPage() {
  return (
    <PageShell active="/reports">
      <PageHeader
        eyebrow="Module 4 · Reports"
        title="Reports"
        description="Training run history, eval results, and accuracy trends for the dignity verifier."
      />

      {/* ─── Training run history ────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Training Run History
        </h2>
        <EmptyState
          title="No runs yet"
          description="Completed training runs will be listed here with their status, hyperparameters, dataset size, and eval accuracy. The Phase 2 backend will persist run history to the dashboard database."
        />
      </section>

      {/* ─── Eval results ────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Eval Results
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40">
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">Eval accuracy chart</p>
              <p className="mt-1 text-xs text-slate-500">
                Pass/fail per eval suite (33 cases) will render here after the
                first training run.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Accuracy trend ──────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Accuracy Trend
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40">
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">Accuracy over runs</p>
              <p className="mt-1 text-xs text-slate-500">
                Track how the student model improves across successive fine-tune
                runs once eval results are recorded.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

export default ReportsPage;
