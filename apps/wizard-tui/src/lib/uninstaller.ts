/**
 * Rollback / uninstall (WS-C wizard-tui lib).
 *
 * Pure logic — no clack imports. Stops, disables and removes the systemd
 * units; with `purge` also deletes the install .env and the server data
 * dir (SQLite + WAL files). Never touches anything outside the install dir.
 */

import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { WizardConfig } from './config'
import { type UninstallResult as ServicesUninstallResult, uninstallServices } from './services'

export interface UninstallResult {
	units: ServicesUninstallResult['units']
	stopped: boolean
	disabled: boolean
	removed: boolean
	envDeleted: boolean
	dataDeleted: boolean
}

/**
 * Uninstall the kill-switch install. Always stops/disables/removes the
 * systemd units; `purge` additionally deletes the .env and the server
 * data directory (kill-switch.sqlite + WAL/SHM sidecars).
 */
export async function uninstall(
	config: WizardConfig,
	opts: { purge: boolean },
): Promise<UninstallResult> {
	const services = await uninstallServices(config)

	const installDir = resolve(config.installDir)
	const envPath = join(installDir, '.env')
	const dataDir = join(installDir, 'apps/server-kill-switch/data')

	let envDeleted = false
	let dataDeleted = false

	if (opts.purge) {
		try {
			await rm(envPath, { force: true })
			envDeleted = true
		} catch {
			envDeleted = false
		}
		try {
			await rm(dataDir, { recursive: true, force: true })
			dataDeleted = true
		} catch {
			dataDeleted = false
		}
	}

	return {
		units: services.units,
		stopped: services.stopped,
		disabled: services.disabled,
		removed: services.removed,
		envDeleted,
		dataDeleted,
	}
}
