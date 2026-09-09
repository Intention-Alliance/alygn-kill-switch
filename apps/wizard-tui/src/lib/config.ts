/**
 * WizardConfig — zod schema + load/validate (WS-C wizard-tui lib).
 *
 * Pure logic — no clack imports. The schema mirrors spec §3 and the
 * defaults are safe for a fresh single-host install.
 */

import { readFile } from 'node:fs/promises'
import { homedir, hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

export const thresholdsSchema = z
	.object({
		malformedThreshold: z.number().int().positive().default(100),
		detectionWindowUs: z.number().int().positive().default(1_000_000),
		gridThreatGbps: z.number().positive().default(10),
		gridThreatWindowUs: z.number().int().positive().default(1_000_000),
	})
	.default({})

export const wizardConfigSchema = z
	.object({
		orgName: z.string().min(1).default('ALYGN'),
		adminEmail: z.string().email().default('admin@alygn.com'),
		adminPassword: z.string().min(16).optional(),
		motherUrl: z.string().url().default('http://localhost:3000'),
		machineId: z
			.string()
			.min(1)
			.default(`machine-${hostname().split('.')[0] ?? 'local'}`),
		machineName: z
			.string()
			.min(1)
			.default(hostname().split('.')[0] ?? 'local-machine'),
		machineHostname: z.string().min(1).default(hostname()),
		redisUrl: z.string().min(1).default('redis://localhost:6379'),
		webauthnRpId: z.string().min(1).default(hostname()),
		webauthnOrigin: z.string().url().default('http://localhost:3001'),
		ollamaBaseUrl: z.string().url().default('http://localhost:11434'),
		thresholds: thresholdsSchema,
		zones: z.array(z.string().min(1)).default(['default']),
		installDir: z.string().min(1).default(join(homedir(), 'alygn')),
		serviceUser: z.string().min(1).default(userInfo().username),
		licenseAccepted: z.boolean().default(false),
		verifyEnabled: z.boolean().default(false),
		verifyModel: z.string().min(1).default('qwen2.5:0.5b'),
	})
	.strict()

export type WizardConfig = z.infer<typeof wizardConfigSchema>

/**
 * Validate an unknown value against the schema. Throws a ZodError with
 * readable messages on failure (spec §5: "throws with readable errors").
 */
export function validateConfig(cfg: unknown): WizardConfig {
	return wizardConfigSchema.parse(cfg)
}

/**
 * Load config from a JSON file (non-interactive replay) or return the
 * schema defaults. When `configPath` is given the file must exist and
 * parse as valid JSON; `interactive` only controls whether a missing
 * file is tolerated (interactive flows start from defaults).
 */
export async function loadConfig(opts: {
	configPath?: string
	interactive: boolean
}): Promise<WizardConfig> {
	if (opts.configPath) {
		const raw = await readFile(opts.configPath, 'utf8')
		let parsed: unknown
		try {
			parsed = JSON.parse(raw)
		} catch (err) {
			throw new Error(
				`Config file ${opts.configPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
		return validateConfig(parsed)
	}

	if (!opts.interactive) {
		throw new Error(
			'No config path provided and interactive mode is disabled — pass --config <path>.',
		)
	}

	return validateConfig({})
}
