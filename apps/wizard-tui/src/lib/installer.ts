/**
 * Install orchestration (WS-C wizard-tui lib).
 *
 * Pure logic — no clack imports. Order: env → secrets → units → drizzle
 * migrations → start (spec §5). Each phase is independently callable so
 * the clack steps can surface progress per phase.
 */

import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { WizardConfig } from './config'
import { generateSecrets, writeEnvFile } from './env'
import { type InstallResult, installServices } from './services'

const execFileAsync = promisify(execFile)

export interface MigrationResult {
	ok: boolean
	output: string
}

/**
 * Run drizzle migrations for the kill-switch server (drizzle-kit migrate).
 * Runs in the server app directory so drizzle.config.ts resolves.
 */
export async function runMigrations(config: WizardConfig): Promise<MigrationResult> {
	const installDir = resolve(config.installDir)
	const serverDir = join(installDir, 'apps/server-kill-switch')

	try {
		const { stdout, stderr } = await execFileAsync('bun', ['run', 'db:migrate'], {
			cwd: serverDir,
			timeout: 120_000,
		})
		return { ok: true, output: `${stdout}\n${stderr}`.trim() }
	} catch (err) {
		const message = err instanceof Error ? err.message : 'drizzle migration failed'
		return { ok: false, output: message }
	}
}

/**
 * Full install: write .env (0600) → generate secrets → install systemd
 * units → run drizzle migrations → start services.
 *
 * Returns the install result plus the .env path and migration outcome so
 * the caller can report precisely what happened.
 */
export async function install(
	config: WizardConfig,
): Promise<InstallResult & { envPath: string; migrations: MigrationResult }> {
	const envPath = join(resolve(config.installDir), '.env')

	// 1. env — write the full layout first (0600, preserves existing secrets).
	await writeEnvFile(config, envPath)

	// 2. secrets — generate any missing keys (idempotent), then re-write so
	//    ALYGN_AGENT_API_KEY mirrors the generated KILL_SWITCH_API_KEY.
	await generateSecrets(envPath)
	await writeEnvFile(config, envPath)

	// 3. units — write + enable + start.
	const services = await installServices(config)

	// 4. migrations — drizzle-kit migrate against the install dir.
	const migrations = await runMigrations(config)

	return { ...services, envPath, migrations }
}
