/**
 * systemd unit install/uninstall (WS-C wizard-tui lib).
 *
 * Pure logic — no clack imports. Renders the two units from the repo-root
 * templates (alygn-web-regulator.service / alygn-web-regulator-bun.service)
 * parameterized with User / WorkingDirectory / ExecStart / Environment,
 * installs them to /etc/systemd/system/, then enables + starts them.
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { WizardConfig } from './config'

const execFileAsync = promisify(execFile)

export const UNIT_DIR = '/etc/systemd/system'

export const UNITS = {
	server: 'alygn-web-regulator.service',
	agent: 'alygn-agent-plane.service',
} as const

export type UnitName = (typeof UNITS)[keyof typeof UNITS]

export interface InstallResult {
	units: string[]
	enabled: boolean
	started: boolean
}

export interface UninstallResult {
	units: string[]
	stopped: boolean
	disabled: boolean
	removed: boolean
}

/** Resolve the bun binary path (mise shims first, then PATH). */
async function resolveBunPath(): Promise<string> {
	const candidates = [
		join(process.env.HOME ?? '', '.local/share/mise/shims/bun'),
		'/usr/local/bin/bun',
		'/usr/bin/bun',
	]
	for (const candidate of candidates) {
		try {
			await execFileAsync(candidate, ['--version'])
			return candidate
		} catch {
			// try next
		}
	}
	return 'bun'
}

/** Render the kill-switch server unit (alygn-web-regulator.service). */
export function renderServerUnit(config: WizardConfig, bunPath: string): string {
	const installDir = resolve(config.installDir)
	const serverDir = join(installDir, 'apps/server-kill-switch')
	return `[Unit]
Description=ALYGN Web Regulator (Kill Switch)
After=network.target

[Service]
Type=simple
User=${config.serviceUser}
WorkingDirectory=${serverDir}
EnvironmentFile=${installDir}/.env
ExecStart=${bunPath} run src/index.ts
Restart=on-failure
Environment=NODE_ENV=production
Environment=KILL_SWITCH_BACKEND_URL=${config.motherUrl}

[Install]
WantedBy=multi-user.target
`
}

/** Render the agent-plane unit (alygn-agent-plane.service). */
export function renderAgentUnit(config: WizardConfig, bunPath: string): string {
	const installDir = resolve(config.installDir)
	const agentDir = join(installDir, 'apps/agent-plane')
	return `[Unit]
Description=ALYGN Agent Plane (heartbeat + interceptor)
After=network.target

[Service]
Type=simple
User=${config.serviceUser}
WorkingDirectory=${agentDir}
EnvironmentFile=${installDir}/.env
ExecStart=${bunPath} run src/index.ts
Restart=on-failure
Environment=NODE_ENV=production
Environment=ALYGN_MOTHER_URL=${config.motherUrl}

[Install]
WantedBy=multi-user.target
`
}

/** Render both units as a record keyed by unit filename. */
export function renderUnits(config: WizardConfig): Record<UnitName, string> {
	return {
		[UNITS.server]: renderServerUnit(config, 'bun'),
		[UNITS.agent]: renderAgentUnit(config, 'bun'),
	}
}

/** Write both unit files to /etc/systemd/system (root required). */
export async function writeUnitFiles(config: WizardConfig): Promise<UnitName[]> {
	const bunPath = await resolveBunPath()
	const units = {
		[UNITS.server]: renderServerUnit(config, bunPath),
		[UNITS.agent]: renderAgentUnit(config, bunPath),
	}

	await mkdir(UNIT_DIR, { recursive: true })
	for (const [name, body] of Object.entries(units)) {
		await writeFile(join(UNIT_DIR, name), body, { mode: 0o644 })
	}
	return [UNITS.server, UNITS.agent]
}

/** Run systemctl with a given verb for each unit. */
async function systemctl(verb: string, units: UnitName[]): Promise<boolean> {
	try {
		await execFileAsync('systemctl', [verb, ...units], { timeout: 30_000 })
		return true
	} catch {
		return false
	}
}

/**
 * Install services: write unit files, daemon-reload, enable + start.
 * Returns which units were written and whether enable/start succeeded.
 */
export async function installServices(config: WizardConfig): Promise<InstallResult> {
	const units = await writeUnitFiles(config)
	await systemctl('daemon-reload', [])
	const enabled = await systemctl('enable', units)
	const started = await systemctl('start', units)
	return { units, enabled, started }
}

/**
 * Uninstall services: stop, disable, remove unit files, daemon-reload.
 * Returns per-phase success flags.
 */
export async function uninstallServices(_config: WizardConfig): Promise<UninstallResult> {
	const units: UnitName[] = [UNITS.server, UNITS.agent]
	const stopped = await systemctl('stop', units)
	const disabled = await systemctl('disable', units)

	let removed = true
	for (const name of units) {
		try {
			await execFileAsync('rm', ['-f', join(UNIT_DIR, name)])
		} catch {
			removed = false
		}
	}
	await systemctl('daemon-reload', [])

	return { units, stopped, disabled, removed }
}

/** Read the repo-root server template unit (used by tests to assert parity). */
export async function readTemplateUnit(): Promise<string> {
	const templatePath = resolve(import.meta.dir, '../../../../alygn-web-regulator.service')
	return readFile(templatePath, 'utf8')
}
