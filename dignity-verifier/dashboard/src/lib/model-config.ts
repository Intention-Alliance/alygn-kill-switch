/**
 * Dignity Verifier — model configuration (single source of truth).
 *
 * The dashboard previously duplicated this list in two pages with values
 * that had already drifted apart (page.tsx still named the retired
 * deepseek teacher while training/page.tsx named glm). Keep every model
 * reference here so the two views cannot disagree again.
 *
 * The framework is deliberately plural:
 *   - several TEACHERS may be used (a primary plus fallbacks), because the
 *     allowed cloud models change over time and a run must be able to fall
 *     back without editing code;
 *   - several STUDENTS may be trained (different base checkpoints, sizes),
 *     so a run can target more than one distillation base;
 *   - MEDIATORS (judges) are separate from teachers: they do not generate
 *     training data, they adjudicate. A mediator cross-checks a curated
 *     verdict and its divergence is recorded, never auto-applied — the
 *     human verdict stands (human-as-trainer policy).
 *
 * Values mirror llama-index/config.yaml and training/config.yaml. If those
 * change, change this file with them.
 */

export interface ModelRef {
	/** Short label for the UI. */
	label: string
	/** Model id as passed to Ollama / the provider. */
	value: string
	/** One-line note explaining the role. */
	note: string
}

/** Models that generate training data (verdicts + paraphrases). */
export interface TeacherConfig {
	/** The model used unless a run overrides it. */
	primary: ModelRef
	/** Used when the primary is unavailable or rate-limited. */
	fallbacks: ModelRef[]
}

/** Base checkpoints that can be fine-tuned. */
export interface StudentConfig {
	/** Default distillation target. */
	primary: ModelRef
	/** Alternative bases a run may select. */
	alternatives: ModelRef[]
}

/** Models that adjudicate rather than generate. */
export interface MediatorConfig {
	/** The adjudicating model. */
	ref: ModelRef
	/**
	 * What the mediator is allowed to do. Kept explicit so the policy cannot
	 * drift: a mediator flags, it does not decide.
	 */
	policy: string
}

export const TEACHERS: TeacherConfig = {
	primary: {
		label: "Teacher",
		value: "glm-5.3-flash:cloud",
		note: "Allowed cloud model · generates verdicts + paraphrases",
	},
	fallbacks: [
		{
			label: "Teacher (fallback)",
			value: "glm-5.2:cloud",
			note: "Used when the primary is unavailable",
		},
		{
			label: "Teacher (legacy)",
			value: "deepseek-v4-flash:cloud",
			note: "Prior teacher · records without a teacher field came from it",
		},
	],
}

export const STUDENTS: StudentConfig = {
	primary: {
		label: "Student",
		value: "qwen2.5:0.5b",
		note: "LoRA fine-tune target · CPU-trainable",
	},
	alternatives: [
		{
			label: "Student (alt)",
			value: "qwen2.5:1.5b",
			note: "Larger base · more capacity, slower CPU training",
		},
	],
}

export const MEDIATORS: MediatorConfig[] = [
	{
		ref: {
			label: "Mediator (judge)",
			value: "glm-5.3-flash:cloud",
			note: "Cross-checks curated verdicts · advisory only",
		},
		policy:
			"A divergence between mediator and curated verdict is logged and counted, never applied. The human verdict is authoritative.",
	},
]

export const EMBEDDING: ModelRef = {
	label: "Embedding",
	value: "nomic-embed-text-v2-moe:latest",
	note: "Local · F16",
}

export const TARGET: ModelRef = {
	label: "Target",
	value: "dignity-verification-v0.1-preview",
	note: "Output model",
}

/**
 * Flat list for the home-page status grid: one entry per distinct role,
 * with alternatives shown alongside their primary.
 */
export const MODEL_OVERVIEW: ModelRef[] = [
	TEACHERS.primary,
	...TEACHERS.fallbacks,
	STUDENTS.primary,
	...STUDENTS.alternatives,
	...MEDIATORS.map((m) => m.ref),
	EMBEDDING,
	TARGET,
]
