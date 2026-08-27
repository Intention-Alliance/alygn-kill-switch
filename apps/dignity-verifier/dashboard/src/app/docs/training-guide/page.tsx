/**
 * Dignity Verifier Dashboard — Training Guide & Best Practices
 *
 * Comprehensive guide for AI model training: LoRA parameters, training
 * hyperparameters, dataset design, eval suite, CPU-only best practices, the
 * self-evolving loop, common pitfalls, and a glossary.
 */

import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { DocSection } from "@/components/doc-section";
import { DocTable } from "@/components/doc-table";
import { DocCodeBlock } from "@/components/doc-code-block";

/* ─── LoRA parameters (deep dive) ─────────────────────────────── */

const LORA_PARAMS = [
  {
    param: "rank (r)",
    desc: "The rank of the low-rank matrices injected into the base weights. Controls the number of trainable parameters.",
    recommended: "8 (sweet spot for 0.5B on CPU)",
    tradeoff:
      "Lower rank (4) = fewer params, faster, less expressive. Higher rank (16-32) = more capacity but overfitting risk and larger adapter.",
  },
  {
    param: "alpha",
    desc: "Scaling factor applied to the LoRA update. The effective scaling is alpha/rank.",
    recommended: "2× rank (alpha=16 for rank=8)",
    tradeoff:
      "Too high = adapter dominates the base model; too low = adapter has no effect. Keep alpha ≈ 2× rank as a starting point.",
  },
  {
    param: "dropout",
    desc: "Dropout applied to the LoRA layers during training. Regularizes the adapter.",
    recommended: "0.05–0.1",
    tradeoff:
      "Prevents overfitting on small datasets. Higher dropout improves generalization but can slow convergence.",
  },
  {
    param: "target_modules",
    desc: "Which linear projection layers receive LoRA adapters (q_proj, v_proj, k_proj, o_proj, gate_proj, up_proj, down_proj).",
    recommended: "q_proj + v_proj (minimal effective set)",
    tradeoff:
      "Adding k_proj + o_proj improves quality at ~2× parameter cost. More modules = more capacity but more memory and slower training.",
  },
] as const;

/* ─── Training hyperparameters (deep dive) ────────────────────── */

const HYPERPARAMS = [
  {
    param: "epochs",
    desc: "Number of full passes over the training set.",
    recommended: "3 (small datasets), 1–2 (larger)",
    tradeoff:
      "Monitor eval accuracy between epochs — stop early if it plateaus or drops. More epochs risk overfitting on small data.",
  },
  {
    param: "batch_size",
    desc: "Number of examples per optimization step.",
    recommended: "4 (CPU cap)",
    tradeoff:
      "Smaller batch = noisier gradients but fits in memory. Use gradient accumulation steps=4 to simulate batch_size=16.",
  },
  {
    param: "learning rate",
    desc: "Step size for weight updates.",
    recommended: "2e-4 for LoRA",
    tradeoff:
      "LoRA uses a higher LR than full fine-tuning because adapter params are fewer. Warmup ramps from 0 over the first 10% of steps.",
  },
  {
    param: "warmup",
    desc: "Linear ramp-up of the learning rate over the first N steps.",
    recommended: "10% of steps",
    tradeoff: "Prevents early instability. Reduce on very short runs.",
  },
  {
    param: "weight decay",
    desc: "L2 regularization on weights to discourage overfitting.",
    recommended: "0.01–0.1",
    tradeoff: "Higher decay regularizes more but can hurt convergence if too aggressive.",
  },
  {
    param: "max_seq_length",
    desc: "Token cap for (prompt + output + verdict) inputs.",
    recommended: "512",
    tradeoff:
      "512 fits the prompt, output, and verdict for this use case. Longer = more context but slower and more memory.",
  },
] as const;

/* ─── Dataset design (deep dive) ──────────────────────────────── */

const DATASET_FIELDS = [
  { field: "id", type: "string", desc: "Unique identifier for the example (e.g. seed-0001)." },
  { field: "prompt", type: "string", desc: "The user/system prompt that produced the output." },
  { field: "output", type: "string", desc: "The AI inference output being classified." },
  { field: "verdict", type: "SAFE | UNSAFE | REVIEW", desc: "Ground-truth classification label." },
  { field: "reason", type: "string", desc: "Human-readable justification for the verdict." },
  { field: "category", type: "string", desc: "Taxonomy subcategory (e.g. unsafe/phishing)." },
  { field: "source", type: "string", desc: "Provenance: seed, augmented, or eval." },
] as const;

const CATEGORY_TAXONOMY = [
  { group: "SAFE", subcategories: "SAFE-factual, SAFE-code, SAFE-conversational", desc: "Outputs that are safe and appropriate to pass through." },
  { group: "UNSAFE", subcategories: "UNSAFE-phishing, UNSAFE-hate, UNSAFE-drugs, UNSAFE-weapons, UNSAFE-malware, UNSAFE-self-harm, UNSAFE-CSAM-adjacent, UNSAFE-fraud", desc: "Outputs that must be blocked by the kill-switch." },
  { group: "REVIEW", subcategories: "REVIEW-political, REVIEW-ethics, REVIEW-subjective-advice", desc: "Outputs that need human review before release." },
  { group: "INJECTION", subcategories: "INJECTION-role-override, INJECTION-format-manipulation", desc: "Attempts to manipulate the model or extract system instructions." },
] as const;

/* ─── CPU-only training tips (deep dive) ──────────────────────── */

const CPU_TIPS = [
  {
    title: "Why CPU is viable for 0.5B LoRA",
    desc: "Only the q_proj + v_proj adapters are trained (~2-4M trainable params), not the full 500M model. The base weights stay frozen, so CPU can handle the small gradient computation.",
  },
  {
    title: "Gradient accumulation",
    desc: "Simulate larger batch sizes without memory cost by accumulating gradients over several small batches before each update.",
  },
  {
    title: "Mixed precision",
    desc: "Use torch.bfloat16 if the CPU supports it (AMD EPYC, Intel Xeon); otherwise fall back to fp32. bf16 reduces memory and speeds up training.",
  },
  {
    title: "Expected training time",
    desc: "~2-4h for 3 epochs on 270 examples with rank=8, batch_size=4 on CPU.",
  },
  {
    title: "Memory budget",
    desc: "0.5B model in fp32 ≈ 2GB RAM; adapter + optimizer state ≈ 500MB; total < 3GB.",
  },
  {
    title: "Disk budget",
    desc: "Base model ≈ 1GB, adapter ≈ 20MB, augmented dataset ≈ 5MB; total < 2GB.",
  },
] as const;

/* ─── Self-evolving loop (deep dive) ──────────────────────────── */

const EVOLUTION_STEPS = [
  { step: "1", desc: "Train on the current dataset, then evaluate on the held-out suite." },
  { step: "2", desc: "Analyze false positives and false negatives, categorizing them by error type." },
  { step: "3", desc: "Add misclassified examples as new seed data with correct verdicts." },
  { step: "4", desc: "Re-augment via LlamaIndex, then retrain and re-evaluate." },
  { step: "5", desc: "Repeat until accuracy ≥85% (or plateau after 3 cycles)." },
] as const;

/* ─── Common pitfalls ─────────────────────────────────────────── */

const PITFALLS = [
  {
    title: "Overfitting",
    problem: "Eval accuracy drops after epoch 2 as the model memorizes the small dataset.",
    fix: "Reduce epochs or increase dropout.",
  },
  {
    title: "Class imbalance",
    problem: "The model predicts the majority class, ignoring minority verdicts.",
    fix: "Balance the dataset or use class weights in the loss.",
  },
  {
    title: "Teacher-student disagreement",
    problem: "An augmented example has a different verdict than the teacher.",
    fix: "Reject it — never include contradictory labels.",
  },
  {
    title: "Cold start",
    problem: "First inference after model load is slow (~5-10s).",
    fix: "Warm up with a dummy request after loading.",
  },
  {
    title: "Prompt injection in training data",
    problem: "Injection examples could teach the model to be exploitable.",
    fix: "Carefully curate injection examples so they teach detection, not exploitation.",
  },
] as const;

/* ─── Glossary (training guide) ───────────────────────────────── */

const GLOSSARY_TERMS = [
  { term: "LoRA", def: "Low-Rank Adaptation — parameter-efficient fine-tuning that trains small low-rank matrices on a frozen base model." },
  { term: "PEFT", def: "Parameter-Efficient Fine-Tuning — techniques that adapt large models by training only a small subset of parameters." },
  { term: "Adapter", def: "The small trainable weights added on top of a frozen base model; only the adapter is updated during fine-tuning." },
  { term: "Rank", def: "The rank of the LoRA matrices; controls the number of trainable parameters." },
  { term: "Alpha", def: "Scaling factor for the LoRA update; effective scaling is alpha/rank." },
  { term: "Dropout", def: "Regularization that randomly zeroes activations to prevent overfitting." },
  { term: "target_modules", def: "Which linear layers receive LoRA adapters (q_proj, v_proj, k_proj, o_proj, etc.)." },
  { term: "Epochs", def: "Number of complete passes over the training dataset." },
  { term: "batch_size", def: "Number of examples processed per optimization step." },
  { term: "Learning rate", def: "Step size for weight updates during training." },
  { term: "Warmup", def: "Linear ramp-up of the learning rate over the first N steps." },
  { term: "Weight decay", def: "L2 regularization on weights to discourage overfitting." },
  { term: "Gradient accumulation", def: "Accumulating gradients over several small batches to simulate a larger batch size." },
  { term: "Mixed precision", def: "Using lower-precision formats (e.g. bf16) to reduce memory and speed up training." },
  { term: "fp32", def: "32-bit floating point — the standard precision for model weights." },
  { term: "bf16", def: "Brain float 16 — a reduced-precision format that speeds up training on supported CPUs." },
  { term: "Teacher model", def: "A large model (deepseek-v4-flash:cloud) that generates labels and paraphrases for the student." },
  { term: "Student model", def: "The smaller model (qwen2.5:0.5b) being fine-tuned to learn from the teacher." },
  { term: "Distillation", def: "Training a smaller model to reproduce the behavior of a larger teacher model." },
  { term: "Inference", def: "Running a trained model on new input to produce a prediction." },
  { term: "Verdict", def: "The classification label (SAFE, UNSAFE, or REVIEW) assigned to an AI output." },
  { term: "SAFE / UNSAFE / REVIEW", def: "The three verdict classes: safe to pass, must block, or needs human review." },
  { term: "INJECTION", def: "A category for prompt-injection, jailbreak, or system-leak attempts." },
  { term: "Eval suite", def: "A held-out set of examples used to measure model accuracy." },
  { term: "Confusion matrix", def: "A table of correct/incorrect predictions per class used to analyze classifier errors." },
  { term: "Cosine similarity", def: "A measure of vector similarity used to detect near-duplicates and retrieve similar examples." },
  { term: "Embedding", def: "A dense vector representation of text capturing semantic meaning." },
  { term: "nomic-embed-text", def: "The local embedding model used for retrieval and deduplication." },
  { term: "JSONL", def: "JSON Lines — a text format where each line is a self-contained JSON object." },
  { term: "Fine-tuning", def: "Continuing to train a pre-trained model on a task-specific dataset." },
  { term: "Base model", def: "The pre-trained model (qwen2.5:0.5b) that is frozen and adapted via LoRA." },
  { term: "Adapter weights", def: "The trained LoRA matrices saved after fine-tuning (~5-20MB)." },
  { term: "safetensors", def: "A safe serialization format for storing model tensors." },
] as const;

/* ─── References ──────────────────────────────────────────────── */

const REFERENCES = [
  { label: "PEFT library documentation", href: "https://huggingface.co/docs/peft" },
  { label: "LoRA paper (Hu et al. 2021)", href: "https://arxiv.org/abs/2106.09685" },
  { label: "HuggingFace TrainingArguments docs", href: "https://huggingface.co/docs/transformers/main_classes/trainer" },
  { label: "PyTorch optimizer docs", href: "https://pytorch.org/docs/stable/optim.html" },
  { label: "HuggingFace Datasets docs", href: "https://huggingface.co/docs/datasets" },
  { label: "JSONL specification", href: "https://jsonlines.org/" },
  { label: "PyTorch CPU training guide", href: "https://pytorch.org/tutorials/beginner/blitz/cifar10_tutorial.html" },
  { label: "PEFT performance docs", href: "https://huggingface.co/docs/peft/developer_guides/performance" },
] as const;

export function TrainingGuidePage() {
  return (
    <PageShell active="/docs">
      <PageHeader
        eyebrow="Docs · Training"
        title="Training Guide & Best Practices"
        description="A comprehensive, self-contained guide to LoRA fine-tuning the dignity verifier: parameters, hyperparameters, dataset design, eval, CPU-only best practices, the self-evolving loop, and common pitfalls."
      />

      {/* ─── LoRA parameters ─────────────────────────────────── */}
      <DocSection
        number="1"
        title="LoRA Parameters (Deep Dive)"
        lead="How to configure LoRA for the CPU-constrained 0.5B student model. Each parameter controls a specific tradeoff between capacity, speed, and overfitting risk."
      >
        <DocTable
          headers={["Parameter", "What it controls", "Recommended", "Tradeoffs"]}
          rows={LORA_PARAMS.map((p) => [p.param, p.desc, p.recommended, p.tradeoff])}
        />
        <p className="text-sm text-slate-400">
          For a 0.5B model on CPU, <span className="font-semibold text-emerald-300">rank 8</span> is
          the sweet spot: enough capacity to learn the classification boundary without the memory
          and overfitting cost of higher ranks. Keep <span className="font-semibold text-emerald-300">alpha = 2× rank</span>{" "}
          so the adapter contributes meaningfully without dominating the base model.
        </p>
      </DocSection>

      {/* ─── Training hyperparameters ────────────────────────── */}
      <DocSection
        number="2"
        title="Training Hyperparameters (Deep Dive)"
        lead="Hyperparameters control the optimization dynamics. These values are tuned for small datasets and CPU-only training."
      >
        <DocTable
          headers={["Hyperparameter", "What it does", "Recommended", "Notes"]}
          rows={HYPERPARAMS.map((p) => [p.param, p.desc, p.recommended, p.tradeoff])}
        />
        <p className="text-sm text-slate-400">
          LoRA uses a higher learning rate (<span className="font-semibold text-emerald-300">2e-4</span>) than
          full fine-tuning because the adapter has far fewer parameters to update. Always warm up the
          learning rate over the first ~10% of steps to avoid early instability.
        </p>
      </DocSection>

      {/* ─── Dataset design ──────────────────────────────────── */}
      <DocSection
        number="3"
        title="Dataset Design (Deep Dive)"
        lead="The dataset is the single most important input to the fine-tune. Quality, balance, and coverage matter more than raw size."
      >
        <h3 className="text-base font-semibold text-slate-200">JSONL schema</h3>
        <p className="text-sm text-slate-400">
          Each line is a JSON object with the following schema:
        </p>
        <DocTable
          headers={["Field", "Type", "Description"]}
          rows={DATASET_FIELDS.map((f) => [f.field, f.type, f.desc])}
        />
        <DocCodeBlock
          label="example.jsonl"
          code={`{"id":"seed-0001","prompt":"Explain how to make a budget","output":"Track income and expenses monthly.","verdict":"SAFE","reason":"Benign financial advice","category":"SAFE-factual","source":"seed"}`}
        />

        <h3 className="text-base font-semibold text-slate-200">Category taxonomy</h3>
        <DocTable
          headers={["Group", "Subcategories", "Description"]}
          rows={CATEGORY_TAXONOMY.map((c) => [c.group, c.subcategories, c.desc])}
        />

        <h3 className="text-base font-semibold text-slate-200">Eval suite design</h3>
        <p className="text-sm text-slate-400">
          Hold out a disjoint set of <span className="font-semibold text-slate-200">33 cases</span>{" "}
          (13 original + 20 held-out) that the model never sees during training. Target accuracy is{" "}
          <span className="font-semibold text-emerald-300">≥85%</span>. After each run, build a{" "}
          <span className="font-semibold text-slate-200">confusion matrix</span> to see which classes
          are confused (e.g. REVIEW vs UNSAFE) and add targeted examples to fix those errors.
        </p>

        <h3 className="text-base font-semibold text-slate-200">Deduplication</h3>
        <p className="text-sm text-slate-400">
          Drop examples with <span className="font-semibold text-slate-200">cosine similarity &gt; 0.92</span>{" "}
          to avoid redundant training signal. Embeddings come from{" "}
          <span className="font-mono text-emerald-300">nomic-embed-text-v2-moe</span>.
        </p>

        <h3 className="text-base font-semibold text-slate-200">Class balance</h3>
        <p className="text-sm text-slate-400">
          Target roughly <span className="font-semibold text-slate-200">40% SAFE, 40% UNSAFE, 15% REVIEW, 5% INJECTION</span>{" "}
          to mirror the real-world distribution while keeping enough examples of each class for the
          model to learn the boundary.
        </p>
      </DocSection>

      {/* ─── CPU-only training tips ──────────────────────────── */}
      <DocSection
        number="4"
        title="CPU-Only Training Tips (Deep Dive)"
        lead="Why CPU training is viable for this workload, and how to make it efficient."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {CPU_TIPS.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-emerald-300">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </DocSection>

      {/* ─── Self-evolving loop ──────────────────────────────── */}
      <DocSection
        number="5"
        title="Self-Evolving Loop (Deep Dive)"
        lead="The framework closes the loop between evaluation and training data, continuously improving accuracy."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EVOLUTION_STEPS.map((item) => (
            <div key={item.step} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm font-semibold text-emerald-300">Step {item.step}</p>
              <p className="mt-2 text-xs text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">
          Repeat the loop until accuracy reaches <span className="font-semibold text-emerald-300">≥85%</span>{" "}
          or plateaus after 3 cycles. This mirrors self-improving ML systems and DPO/RLHF feedback
          loops, where model errors become the next round of training data.
        </p>
      </DocSection>

      {/* ─── Common pitfalls ─────────────────────────────────── */}
      <DocSection
        number="6"
        title="Common Pitfalls"
        lead="Known failure modes and how to avoid them."
      >
        <DocTable
          headers={["Pitfall", "Problem", "Fix"]}
          rows={PITFALLS.map((p) => [p.title, p.problem, p.fix])}
        />
      </DocSection>

      {/* ─── Glossary ────────────────────────────────────────── */}
      <DocSection
        number="7"
        title="Glossary"
        lead="Key terms used throughout this guide. See the full glossary for the complete framework vocabulary."
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          {GLOSSARY_TERMS.map((item) => (
            <div key={item.term} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <dt className="font-mono text-sm font-semibold text-emerald-300">{item.term}</dt>
              <dd className="mt-1 text-sm text-slate-400">{item.def}</dd>
            </div>
          ))}
        </dl>
      </DocSection>

      {/* ─── References ──────────────────────────────────────── */}
      <DocSection number="8" title="References">
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

export default TrainingGuidePage;
