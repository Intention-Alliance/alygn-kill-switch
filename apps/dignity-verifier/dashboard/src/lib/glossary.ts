/**
 * Dignity Verifier Dashboard — Glossary
 *
 * Shared glossary data for the dignity verifier training framework, organized
 * by category. Used by the `/docs/glossary` page and referenced across the
 * documentation pages.
 */

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface GlossaryCategory {
  id: string;
  title: string;
  description: string;
  terms: readonly GlossaryTerm[];
}

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  {
    id: "ml-ai",
    title: "ML / AI Terms",
    description: "Core machine-learning and fine-tuning concepts used across the framework.",
    terms: [
      {
        term: "LoRA",
        definition:
          "Low-Rank Adaptation. A parameter-efficient fine-tuning method that injects small trainable low-rank matrices into a frozen base model, drastically reducing the number of trainable parameters.",
      },
      {
        term: "PEFT",
        definition:
          "Parameter-Efficient Fine-Tuning. A family of techniques (including LoRA) that adapt large models by training only a small subset of parameters rather than the full model.",
      },
      {
        term: "Adapter",
        definition:
          "The small set of trainable weights (e.g. LoRA matrices) added on top of a frozen base model. Only the adapter is updated during fine-tuning.",
      },
      {
        term: "Fine-tuning",
        definition:
          "Continuing to train a pre-trained model on a task-specific dataset so it learns a specialized behavior, such as safety classification.",
      },
      {
        term: "Distillation",
        definition:
          "Training a smaller 'student' model to reproduce the behavior of a larger 'teacher' model, transferring knowledge from the teacher's labels or outputs.",
      },
      {
        term: "Inference",
        definition:
          "Running a trained model on new input to produce a prediction — here, classifying an AI output as SAFE, UNSAFE, or REVIEW.",
      },
      {
        term: "Teacher model",
        definition:
          "A large, capable model (e.g. deepseek-v4-flash:cloud) that generates labels and paraphrases used to train the smaller student model.",
      },
      {
        term: "Student model",
        definition:
          "The smaller model being fine-tuned (e.g. qwen2.5:0.5b) to learn the classification boundary from the teacher's outputs.",
      },
      {
        term: "Epochs",
        definition:
          "The number of complete passes over the training dataset. More epochs can improve fit but risk overfitting.",
      },
      {
        term: "Batch size",
        definition:
          "The number of training examples processed per optimization step. Smaller batches fit in less memory but produce noisier gradients.",
      },
      {
        term: "Learning rate",
        definition:
          "The step size for weight updates during training. Too high destabilizes training; too low converges slowly.",
      },
      {
        term: "Gradient accumulation",
        definition:
          "Accumulating gradients over several small batches before applying an update, simulating a larger batch size without extra memory cost.",
      },
      {
        term: "Mixed precision",
        definition:
          "Using lower-precision formats (e.g. bf16) for some tensors to reduce memory and speed up training while keeping fp32 for critical updates.",
      },
      {
        term: "Overfitting",
        definition:
          "When a model memorizes the training data instead of learning general patterns, performing well on training but poorly on unseen data.",
      },
      {
        term: "Underfitting",
        definition:
          "When a model is too simple or undertrained to capture the patterns in the data, performing poorly on both training and eval.",
      },
      {
        term: "Confusion matrix",
        definition:
          "A table showing correct and incorrect predictions per class (true/false positives and negatives), used to analyze where a classifier errs.",
      },
      {
        term: "Cosine similarity",
        definition:
          "A measure of how similar two vectors are (range -1 to 1). Used here to detect near-duplicate examples and retrieve semantically similar ones.",
      },
      {
        term: "Embedding",
        definition:
          "A dense vector representation of text that captures semantic meaning, enabling similarity comparison and retrieval.",
      },
      {
        term: "Vector index",
        definition:
          "A data structure that stores embeddings and supports fast similarity search, used by LlamaIndex for semantic retrieval.",
      },
    ],
  },
  {
    id: "model",
    title: "Model Terms",
    description: "The specific models, artifacts, and tooling in the dignity verifier stack.",
    terms: [
      {
        term: "Qwen2.5",
        definition:
          "A family of open-weight decoder-only transformer models by Alibaba. The 0.5B variant is used as the local student base model.",
      },
      {
        term: "qwen2.5:0.5b",
        definition:
          "The Ollama tag for the 0.5B-parameter Qwen2.5 model, used as the local student base model for the verifier.",
      },
      {
        term: "deepseek-v4-flash",
        definition:
          "A large cloud-hosted model used as the teacher. It generates verdicts and paraphrases for distillation. Referenced as deepseek-v4-flash:cloud.",
      },
      {
        term: "nomic-embed-text-v2-moe",
        definition:
          "A local embedding model used for semantic retrieval and deduplication. Produces 768-dimensional embeddings with a 512-token context.",
      },
      {
        term: "dignity-verification-v0.1-preview",
        definition:
          "The name of the fine-tuned verifier model produced by LoRA distillation of the student onto the teacher's labels.",
      },
      {
        term: "Base model",
        definition:
          "The pre-trained model (qwen2.5:0.5b) that is frozen and adapted via LoRA. It provides general language understanding.",
      },
      {
        term: "Adapter weights",
        definition:
          "The trained LoRA matrices saved after fine-tuning. They are small (~5-20MB) and applied on top of the base model at inference.",
      },
      {
        term: "safetensors",
        definition:
          "A safe serialization format for storing model tensors. Adapter weights are exported as .safetensors files.",
      },
      {
        term: "Modelfile",
        definition:
          "An Ollama configuration file that defines how to build a model, including the base model and any LoRA adapter to apply.",
      },
      {
        term: "Ollama",
        definition:
          "A local model runtime that serves models and applies LoRA adapters via Modelfiles. Used to run the verifier on CPU.",
      },
    ],
  },
  {
    id: "safety",
    title: "Safety Terms",
    description: "The classification labels and safety-gate concepts central to the verifier.",
    terms: [
      {
        term: "SAFE",
        definition:
          "A verdict meaning the AI output is benign and appropriate to pass through to the end user.",
      },
      {
        term: "UNSAFE",
        definition:
          "A verdict meaning the AI output is harmful, dangerous, or otherwise must be blocked by the kill-switch.",
      },
      {
        term: "REVIEW",
        definition:
          "A verdict meaning the output is ambiguous, borderline, or sensitive and needs human review before release.",
      },
      {
        term: "INJECTION",
        definition:
          "A category for prompt-injection, jailbreak, or system-leak attempts that try to manipulate the model or extract instructions.",
      },
      {
        term: "Verdict",
        definition:
          "The classification label (SAFE, UNSAFE, or REVIEW) the verifier assigns to an AI output, optionally with a reason.",
      },
      {
        term: "Kill-switch",
        definition:
          "The safety gate that blocks harmful AI output before it reaches end users. The verifier model powers this gate.",
      },
      {
        term: "Verifier",
        definition:
          "The model that inspects AI inference output and decides whether it is safe to release. Synonymous with the dignity verifier.",
      },
      {
        term: "Inference gate",
        definition:
          "The checkpoint in the inference pipeline where the verifier classifies output before it is delivered.",
      },
      {
        term: "Safety-critical",
        definition:
          "Describing a system whose failure could cause harm. The verifier is safety-critical because a miss lets unsafe output through.",
      },
      {
        term: "Fail-open",
        definition:
          "A failure mode where the gate allows output through when the verifier errors. Risky for safety but avoids blocking legitimate traffic.",
      },
      {
        term: "Fail-closed",
        definition:
          "A failure mode where the gate blocks output when the verifier errors. Safer but can block legitimate traffic.",
      },
    ],
  },
  {
    id: "data",
    title: "Data Terms",
    description: "Dataset formats, provenance, and evaluation concepts.",
    terms: [
      {
        term: "JSONL",
        definition:
          "JSON Lines — a text format where each line is a self-contained JSON object. Used for the training dataset.",
      },
      {
        term: "Seed dataset",
        definition:
          "The hand-curated, high-confidence set of ~270 examples that form the ground truth for the classification boundary.",
      },
      {
        term: "Augmented dataset",
        definition:
          "The expanded training set produced by paraphrasing seed examples with the teacher model, targeting 500+ examples.",
      },
      {
        term: "Eval suite",
        definition:
          "A held-out set of examples (33 cases: 13 original + 20 held-out) used to measure model accuracy. Target ≥85%.",
      },
      {
        term: "Held-out",
        definition:
          "Examples the model never sees during training, reserved for evaluation to measure true generalization.",
      },
      {
        term: "Deduplication",
        definition:
          "Removing near-duplicate examples (cosine similarity > 0.92) to keep the training signal diverse.",
      },
      {
        term: "Class imbalance",
        definition:
          "When one verdict dominates the dataset, biasing the model toward predicting the majority class.",
      },
      {
        term: "Provenance",
        definition:
          "The origin of an example (seed, augmented, or eval), tracked so the dataset can be audited and traced.",
      },
    ],
  },
  {
    id: "infrastructure",
    title: "Infrastructure Terms",
    description: "The systems and services that host and connect the verifier framework.",
    terms: [
      {
        term: "LlamaIndex",
        definition:
          "A data framework for building retrieval and augmentation pipelines. Used here for semantic augmentation of the seed dataset.",
      },
      {
        term: "Redis pubsub",
        definition:
          "A publish/subscribe messaging pattern over Redis, used for real-time event distribution in the dashboard.",
      },
      {
        term: "WebSocket",
        definition:
          "A persistent, bidirectional connection for real-time updates, such as streaming audit events to the dashboard.",
      },
      {
        term: "Docker",
        definition:
          "A containerization platform used to deploy the dashboard and services in isolated, reproducible environments.",
      },
      {
        term: "Tailscale",
        definition:
          "A zero-config VPN that securely connects the dashboard and services across machines.",
      },
      {
        term: "Better-Auth",
        definition:
          "An authentication library used to secure the dashboard, supporting session-based auth.",
      },
      {
        term: "WebAuthn",
        definition:
          "A web standard for passwordless authentication using hardware security keys or biometrics.",
      },
    ],
  },
];

/**
 * Flatten all glossary terms across categories into a single list.
 * Useful for search or for rendering a combined index.
 */
export function getAllGlossaryTerms(): readonly GlossaryTerm[] {
  return GLOSSARY_CATEGORIES.flatMap((category) => category.terms);
}
