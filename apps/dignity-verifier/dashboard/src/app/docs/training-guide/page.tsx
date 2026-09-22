/**
 * Dignity Verifier Dashboard — Training Guide & Best Practices
 *
 * Comprehensive guide for AI model training: LoRA parameters, training
 * hyperparameters, dataset design, eval suite, and CPU-only best practices.
 */

import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { DocSection } from "@/components/doc-section";
import { DocTable } from "@/components/doc-table";
import { DocCodeBlock } from "@/components/doc-code-block";

const LORA_PARAMS = [
  {
    param: "rank",
    desc: "The rank of the low-rank matrices injected into the base weights. Higher rank = more trainable capacity but more parameters and slower training.",
    range: "4–16 (≤8 on CPU)",
    tradeoff: "Higher rank captures more task-specific signal but risks overfitting on small datasets and increases adapter size.",
  },
  {
    param: "alpha",
    desc: "Scaling factor applied to the LoRA update. Controls how strongly the adapter weights influence the base model output.",
    range: "8–32 (16 recommended)",
    tradeoff: "Higher alpha amplifies the adapter's effect; too high can destabilize training. Keep alpha ≈ 2× rank as a starting point.",
  },
  {
    param: "dropout",
    desc: "Dropout applied to the LoRA layers during training. Regularizes the adapter to prevent overfitting.",
    range: "0.0–0.1 (0.05 recommended)",
    tradeoff: "Higher dropout improves generalization but can slow convergence on small datasets.",
  },
  {
    param: "target modules",
    desc: "Which attention projection layers receive LoRA adapters (e.g. q_proj, v_proj).",
    range: "q_proj + v_proj (minimal)",
    tradeoff: "Targeting more modules (q/k/v/o) increases capacity but multiplies trainable parameters and memory use.",
  },
] as const;

const HYPERPARAMS = [
  {
    param: "epochs",
    desc: "Number of full passes over the training set.",
    recommended: "3",
    tuning: "Start at 3; increase if underfitting, decrease if eval accuracy plateaus or degrades.",
  },
  {
    param: "batch size",
    desc: "Number of examples per optimization step.",
    recommended: "4 (CPU cap)",
    tuning: "Keep ≤4 on CPU. Use gradient accumulation to simulate larger batches without extra memory.",
  },
  {
    param: "learning rate",
    desc: "Step size for weight updates.",
    recommended: "2e-4",
    tuning: "Lower (1e-4) for stability on small data; raise cautiously if training is too slow.",
  },
  {
    param: "warmup",
    desc: "Linear ramp-up of the learning rate over the first N steps.",
    recommended: "5–10% of steps",
    tuning: "Prevents early instability; reduce on very short runs.",
  },
  {
    param: "weight decay",
    desc: "L2 regularization on weights to discourage overfitting.",
    recommended: "0.01",
    tuning: "Increase slightly if overfitting; set to 0 if it hurts convergence.",
  },
] as const;

const DATA_PARAMS = [
  {
    param: "train/eval split",
    desc: "Proportion of examples held out for evaluation.",
    recommended: "80/20",
    tuning: "Keep eval set disjoint from training to measure true generalization.",
  },
  {
    param: "augmentation ratio",
    desc: "How many augmented paraphrases per seed example.",
    recommended: "3 per seed",
    tuning: "More augmentation adds diversity but risks introducing noise; verify each against the teacher.",
  },
  {
    param: "max sequence length",
    desc: "Token cap for (prompt + output) inputs.",
    recommended: "512–1024",
    tuning: "Longer sequences capture more context but increase memory and training time.",
  },
  {
    param: "packing",
    desc: "Concatenating multiple short examples into one sequence to reduce padding waste.",
    recommended: "On for CPU",
    tuning: "Improves throughput on CPU; ensure examples are separated by attention masks.",
  },
] as const;

const DATASET_FIELDS = [
  { field: "id", type: "string", desc: "Unique identifier for the example." },
  { field: "prompt", type: "string", desc: "The user/system prompt that produced the output." },
  { field: "output", type: "string", desc: "The AI inference output being classified." },
  { field: "verdict", type: "SAFE | UNSAFE | REVIEW", desc: "Ground-truth classification label." },
  { field: "reason", type: "string", desc: "Human-readable justification for the verdict." },
  { field: "category", type: "string", desc: "Taxonomy category (e.g. safe/general, unsafe/harmful)." },
  { field: "source", type: "string", desc: "Provenance: seed, augmented, or eval." },
] as const;

const CATEGORY_TAXONOMY = [
  { group: "SAFE", subcategories: "general, benign, helpful, factual", desc: "Outputs that are safe and appropriate to pass through." },
  { group: "UNSAFE", subcategories: "harmful, dangerous, illegal, toxic", desc: "Outputs that must be blocked by the kill-switch." },
  { group: "REVIEW", subcategories: "ambiguous, borderline, sensitive", desc: "Outputs that need human review before release." },
  { group: "INJECTION", subcategories: "prompt-injection, jailbreak, system-leak", desc: "Attempts to manipulate the model or extract system instructions." },
] as const;

const PITFALLS = [
  {
    title: "Class imbalance",
    problem: "If one verdict dominates the dataset, the model learns to always predict it.",
    fix: "Balance classes during sampling; oversample minority verdicts or weight the loss.",
  },
  {
    title: "Leakage between train and eval",
    problem: "Augmented paraphrases of a seed example appearing in the eval set inflate accuracy.",
    fix: "Deduplicate across splits; keep eval examples fully disjoint from training provenance.",
  },
  {
    title: "Overfitting on small data",
    problem: "The 0.5B model memorizes the ~270 seed examples instead of learning the boundary.",
    fix: "Use dropout, early stopping, and eval between epochs; rely on augmentation for diversity.",
  },
  {
    title: "Teacher noise",
    problem: "The teacher model occasionally mislabels augmented examples, poisoning training.",
    fix: "Verify every augmented verdict against the teacher; reject low-confidence or contradictory labels.",
  },
  {
    title: "CPU training too slow",
    problem: "Large batches or long sequences make CPU-only training impractical.",
    fix: "Small batch size, gradient accumulation, packing, and mixed precision (if available).",
  },
] as const;

export function TrainingGuidePage() {
  return (
    <PageShell active="/docs">
      <PageHeader
        eyebrow="Docs · Training"
        title="Training Guide & Best Practices"
        description="A comprehensive guide to LoRA fine-tuning the dignity verifier: parameters, hyperparameters, dataset design, eval, and CPU-only best practices."
      />

      {/* ─── Parameters ──────────────────────────────────────── */}
      <DocSection
        number="1"
        title="Parameters"
        lead="How to configure LoRA and training hyperparameters for the CPU-constrained 0.5B student model."
      >
        <h3 className="text-base font-semibold text-slate-200">LoRA parameters</h3>
        <DocTable
          headers={["Parameter", "What it does", "Recommended", "Tradeoffs"]}
          rows={LORA_PARAMS.map((p) => [p.param, p.desc, p.range, p.tradeoff])}
        />

        <h3 className="text-base font-semibold text-slate-200">Training hyperparameters</h3>
        <DocTable
          headers={["Hyperparameter", "What it does", "Recommended", "How to tune"]}
          rows={HYPERPARAMS.map((p) => [p.param, p.desc, p.recommended, p.tuning])}
        />

        <h3 className="text-base font-semibold text-slate-200">Data parameters</h3>
        <DocTable
          headers={["Parameter", "What it does", "Recommended", "Notes"]}
          rows={DATA_PARAMS.map((p) => [p.param, p.desc, p.recommended, p.tuning])}
        />
      </DocSection>

      {/* ─── Datasets ────────────────────────────────────────── */}
      <DocSection
        number="2"
        title="Datasets"
        lead="The dataset is the single most important input to the fine-tune. Quality and balance matter more than raw size."
      >
        <h3 className="text-base font-semibold text-slate-200">Dataset format (JSONL)</h3>
        <p className="text-sm text-slate-400">
          Each line is a JSON object with the following schema:
        </p>
        <DocTable
          headers={["Field", "Type", "Description"]}
          rows={DATASET_FIELDS.map((f) => [f.field, f.type, f.desc])}
        />
        <DocCodeBlock
          label="example.jsonl"
          code={`{"id":"seed-0001","prompt":"Explain how to make a budget","output":"Track income and expenses monthly.","verdict":"SAFE","reason":"Benign financial advice","category":"safe/general","source":"seed"}`}
        />

        <h3 className="text-base font-semibold text-slate-200">Category taxonomy</h3>
        <DocTable
          headers={["Group", "Subcategories", "Description"]}
          rows={CATEGORY_TAXONOMY.map((c) => [c.group, c.subcategories, c.desc])}
        />

        <h3 className="text-base font-semibold text-slate-200">Seed vs augmented data</h3>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-slate-200">Seed data</span> is hand-curated and
          high-confidence — the ground truth for the classification boundary.{" "}
          <span className="font-semibold text-slate-200">Augmented data</span> is generated by
          paraphrasing seed examples with the teacher model to add diversity. Seed examples are
          the source of truth; augmented examples must be verified against the teacher before
          inclusion.
        </p>

        <h3 className="text-base font-semibold text-slate-200">Eval suite design</h3>
        <p className="text-sm text-slate-400">
          Hold out a disjoint set of examples (33 cases: 13 original + 20 held-out) that the model
          never sees during training. Target accuracy is <span className="font-semibold text-emerald-300">≥85%</span>.
          The eval suite should cover all four categories and include edge cases that stress the
          classification boundary.
        </p>

        <h3 className="text-base font-semibold text-slate-200">Best practices</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
          <li>
            <span className="font-semibold text-slate-200">Deduplicate</span> — drop examples with
            cosine similarity &gt; 0.92 to avoid redundant training signal.
          </li>
          <li>
            <span className="font-semibold text-slate-200">Balance classes</span> — keep SAFE,
            UNSAFE, and REVIEW roughly balanced so the model doesn&apos;t bias toward the majority.
          </li>
          <li>
            <span className="font-semibold text-slate-200">Cover edge cases</span> — include
            borderline, ambiguous, and injection examples so the model learns the full boundary.
          </li>
        </ul>
      </DocSection>

      {/* ─── Best practices ──────────────────────────────────── */}
      <DocSection
        number="3"
        title="Best Practices"
        lead="Operational guidance for training on CPU, preventing overfitting, and running the self-evolving loop."
      >
        <h3 className="text-base font-semibold text-slate-200">CPU-only training tips</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
          <li>Use small batch sizes (≤4) to fit within CPU memory.</li>
          <li>Use gradient accumulation to simulate larger batches without extra memory.</li>
          <li>Enable mixed precision (bf16/fp16) if the CPU supports it to speed up training.</li>
          <li>Use sequence packing to reduce padding waste and improve throughput.</li>
        </ul>

        <h3 className="text-base font-semibold text-slate-200">Overfitting prevention</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
          <li>Apply LoRA dropout (0.05) to regularize the adapter.</li>
          <li>Use early stopping — halt when eval accuracy stops improving.</li>
          <li>Run evaluation between epochs to catch overfitting early.</li>
        </ul>

        <h3 className="text-base font-semibold text-slate-200">Teacher-student distillation quality control</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
          <li>
            <span className="font-semibold text-slate-200">Verdict verification</span> — every
            augmented example&apos;s verdict is checked against the teacher before inclusion.
          </li>
          <li>
            <span className="font-semibold text-slate-200">Rejection sampling</span> — discard
            low-confidence or contradictory teacher labels rather than training on noise.
          </li>
        </ul>

        <h3 className="text-base font-semibold text-slate-200">Self-evolving loop</h3>
        <p className="text-sm text-slate-400">
          After each training cycle, eval results feed back into the dataset: false positives and
          false negatives are added as new examples, the pipeline is retrained, and accuracy is
          re-measured. This closes the loop between evaluation and training data.
        </p>

        <h3 className="text-base font-semibold text-slate-200">Common pitfalls</h3>
        <DocTable
          headers={["Pitfall", "Problem", "Fix"]}
          rows={PITFALLS.map((p) => [p.title, p.problem, p.fix])}
        />
      </DocSection>
    </PageShell>
  );
}

export default TrainingGuidePage;
