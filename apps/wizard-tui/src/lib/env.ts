/**
 * .env writer + secret generation (WS-C wizard-tui lib).
 *
 * Pure logic — no clack imports. Writes the target .env with mode 0600,
 * never echoes values, and merges output from the repo's
 * generate-secrets.sh (idempotent: existing keys are left untouched).
 */

import { execFile } from 'node:child_process'
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { WizardConfig } from './config'

const execFileAsync = promisify(execFile)

/** Path to the repo's generate-secrets.sh (relative to this file). */
const GENERATE_SECRETS_SCRIPT = resolve(
	import.meta.dir,
	'../../../../apps/server-kill-switch/scripts/security/generate-secrets.sh',
)

/** Server env block (spec §4) — values only, never logged. */
function serverEnvLines(config: WizardConfig): string[] {
	const lines = [
		'KILL_SWITCH_ENV=production',
		'KILL_SWITCH_PORT=3000',
		`BETTER_AUTH_URL=${config.motherUrl}`,
		`ADMIN_EMAIL=${config.adminEmail}`,
		`REDIS_URL=${config.redisUrl}`,
		`WEBAUTHN_RP_ID=${config.webauthnRpId}`,
		`WEBAUTHN_ORIGIN=${config.webauthnOrigin}`,
		`ALYGN_MACHINE_HOSTNAME=${config.machineHostname}`,
		`ALYGN_MACHINE_NAME=${config.machineName}`,
		`KILL_SWITCH_DISCOVERY_OLLAMA_BASE_URL=${config.ollamaBaseUrl}`,
		`KILL_SWITCH_VERIFIER_BASE_URL=${config.ollamaBaseUrl}`,
		`KILL_SWITCH_VERIFIER_MODEL=${config.verifyModel}`,
		`KILL_SWITCH_VERIFY_ENABLED=${config.verifyEnabled ? 'true' : 'false'}`,
		'KILL_SWITCH_VERIFY_MODE=async',
	]
	// The admin password the user configured IS the dashboard login token
	// (spec §3: adminPassword → KILL_SWITCH_AUTH_TOKEN). When absent,
	// generate-secrets.sh fills it with a random value.
	if (config.adminPassword) {
		lines.push(`KILL_SWITCH_AUTH_TOKEN=${config.adminPassword}`)
	}
	return lines
}

/** Agent env block (spec §4) — values only, never logged. */
function agentEnvLines(config: WizardConfig): string[] {
	return [
		`ALYGN_MOTHER_URL=${config.motherUrl}`,
		// ALYGN_AGENT_API_KEY is filled from KILL_SWITCH_API_KEY after
		// generate-secrets.sh runs (see writeEnvFile).
		'ALYGN_AGENT_API_KEY=',
		`ALYGN_MACHINE_ID=${config.machineId}`,
		`ALYGN_MACHINE_NAME=${config.machineName}`,
		`ALYGN_MACHINE_HOSTNAME=${config.machineHostname}`,
		'ALYGN_HEARTBEAT_INTERVAL_MS=30000',
		`OLLAMA_BASE_URL=${config.ollamaBaseUrl}`,
		// The interceptor listens on the client-facing port (11434) and
		// forwards to the real Ollama on OLLAMA_BASE_URL (11435 by default).
		'OLLAMA_INTERCEPT_PORT=11434',
		'LOG_LEVEL=info',
	]
}

/** Parse every KEY=value pair in a .env file into a map. */
function parseEnvMap(envText: string): Map<string, string> {
	const map = new Map<string, string>()
	for (const line of envText.split('\n')) {
		const match = line.match(/^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		const key = match?.[1]
		const value = match?.[2]
		if (key === undefined || value === undefined) continue
		map.set(key, value.trim().replace(/^["']|["']$/g, ''))
	}
	return map
}

/**
 * Write the full .env (server + agent blocks) to `target` with mode 0600.
 * Existing keys are always preserved — both keys that overlap the generated
 * layout (existing value wins) and keys outside it (e.g. secrets written by
 * generate-secrets.sh) are carried over verbatim. Never overwrite a live
 * secret.
 *
 * Returns the path and the resulting file mode.
 */
export async function writeEnvFile(
	config: WizardConfig,
	target: string,
): Promise<{ path: string; mode: number }> {
	const targetPath = resolve(target)
	await mkdir(dirname(targetPath), { recursive: true })

	let existing = ''
	try {
		existing = await readFile(targetPath, 'utf8')
	} catch {
		// Fresh file — nothing to preserve.
	}
	const existingMap = parseEnvMap(existing)

	const lines = [...serverEnvLines(config), ...agentEnvLines(config)]
	const merged: string[] = []
	const seen = new Set<string>()

	for (const line of lines) {
		const key = line.split('=')[0] ?? ''
		seen.add(key)
		const current = existingMap.get(key)
		if (current !== undefined) {
			// Preserve the existing value (e.g. a secret from generate-secrets.sh).
			merged.push(`${key}=${current}`)
		} else {
			merged.push(line)
		}
	}

	// Carry over any existing keys outside the generated layout (the six
	// secrets from generate-secrets.sh, user-added vars, …) verbatim.
	for (const [key, value] of existingMap) {
		if (!seen.has(key)) {
			merged.push(`${key}=${value}`)
			seen.add(key)
		}
	}

	// ALYGN_AGENT_API_KEY mirrors KILL_SWITCH_API_KEY (spec §4).
	const apiKey = existingMap.get('KILL_SWITCH_API_KEY')
	if (apiKey) {
		const idx = merged.findIndex((l) => l.startsWith('ALYGN_AGENT_API_KEY='))
		if (idx >= 0) merged[idx] = `ALYGN_AGENT_API_KEY=${apiKey}`
	}

	await writeFile(targetPath, `${merged.join('\n')}\n`, { mode: 0o600 })
	await chmod(targetPath, 0o600)

	const mode = (await stat(targetPath)).mode & 0o777
	return { path: targetPath, mode }
}

/**
 * Run the repo's generate-secrets.sh against `targetEnv` and merge the
 * generated keys into the file. The script is idempotent — it only appends
 * missing keys. Returns which keys were generated vs skipped (names only,
 * never values).
 */
export async function generateSecrets(
	targetEnv: string,
): Promise<{ generated: string[]; skipped: string[] }> {
	const targetPath = resolve(targetEnv)
	await mkdir(dirname(targetPath), { recursive: true })

	const { stdout } = await execFileAsync('bash', [GENERATE_SECRETS_SCRIPT, targetPath])

	const generated: string[] = []
	const skipped: string[] = []
	for (const line of stdout.split('\n')) {
		const match = line.match(/^(ADD|SKIP)\s+([A-Z_]+)/)
		if (match?.[2]) {
			;(match[1] === 'ADD' ? generated : skipped).push(match[2])
		}
	}

	return { generated, skipped }
}
