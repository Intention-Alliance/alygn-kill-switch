#!/usr/bin/env bun
/**
 * Wizard TUI — CLI entry (WS-C).
 *
 * Modes (spec §8):
 *   wizard                      interactive flow (preflight → configure → install → verify → handoff)
 *   wizard --config <path>      non-interactive replay from JSON
 *   wizard --dry-run            preflight + config validation only, no writes
 *   wizard uninstall [--purge]  stop/disable/remove units (+ delete .env/data)
 *
 * Exit codes: 0 ok · 1 preflight fail · 2 config invalid · 3 install fail · 4 verify fail
 */

import { cancel, intro, log, outro } from '@clack/prompts'
import { loadConfig } from './lib/config'
import { uninstall } from './lib/uninstaller'
import { runConfigure } from './steps/configure'
import { runHandoff } from './steps/handoff'
import { runInstall } from './steps/install'
import { runPreflight } from './steps/preflight'
import { runVerify } from './steps/verify'

interface CliArgs {
	configPath?: string
	dryRun: boolean
	uninstallMode: boolean
	purge: boolean
}

/** Parse argv into a typed options object. */
function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { dryRun: false, uninstallMode: false, purge: false }

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--config') {
			const value = argv[i + 1]
			if (!value || value.startsWith('--')) {
				throw new Error('--config requires a file path')
			}
			args.configPath = value
			i++
		} else if (arg === '--dry-run') {
			args.dryRun = true
		} else if (arg === 'uninstall') {
			args.uninstallMode = true
		} else if (arg === '--purge') {
			args.purge = true
		} else if (arg === '--yes') {
			// Accepted for compatibility (spec §8) — non-interactive flows
			// already skip prompts when --config is present.
		} else if (arg === '--help' || arg === '-h') {
			printHelp()
			process.exit(0)
		} else {
			throw new Error(`Unknown argument: ${arg}`)
		}
	}

	return args
}

/** Print usage. */
function printHelp(): void {
	console.log(`Alygn Kill Switch — install wizard

Usage:
  wizard [--config <path>] [--dry-run] [--yes]
  wizard uninstall [--purge]

Modes:
  --config <path>   non-interactive replay from a JSON config file
  --dry-run         preflight + config validation only (no writes)
  --yes             accept defaults in non-interactive flows
  uninstall         stop/disable/remove systemd units
  --purge           (with uninstall) also delete .env files and data dir

Exit codes: 0 ok · 1 preflight fail · 2 config invalid · 3 install fail · 4 verify fail`)
}

/** Non-interactive replay from a config file. */
async function runNonInteractive(args: CliArgs): Promise<void> {
	if (!args.configPath) {
		throw new Error('Non-interactive mode requires --config <path>.')
	}

	const config = await loadConfig({ configPath: args.configPath, interactive: false })
	log.success(`Loaded config from ${args.configPath}`)

	if (!config.licenseAccepted) {
		throw new Error('licenseAccepted must be true in the config file.')
	}

	await runPreflight()
	if (args.dryRun) {
		log.success('Dry run complete — no changes were made.')
		return
	}

	await runInstall(config)
	await runVerify(config)
	runHandoff(config)
}

/** Interactive flow. */
async function runInteractive(args: CliArgs): Promise<void> {
	await runPreflight()

	if (args.dryRun) {
		log.success('Dry run complete — no changes were made.')
		return
	}

	const config = await runConfigure()
	await runInstall(config)
	await runVerify(config)
	runHandoff(config)
}

/** Uninstall mode. */
async function runUninstall(args: CliArgs): Promise<void> {
	const config = await loadConfig({
		configPath: args.configPath,
		interactive: true,
	})
	const result = await uninstall(config, { purge: args.purge })
	log.success(`Uninstalled: ${result.units.join(', ')} (purge=${result.envDeleted ? 'yes' : 'no'})`)
	const removed: string[] = []
	if (result.envDeleted) removed.push('.env')
	if (result.dataDeleted) removed.push('data dir')
	if (removed.length > 0) {
		log.message(`Removed: ${removed.join(', ')}`)
	}
}

/** Main entry. */
async function main(): Promise<void> {
	intro('Alygn Kill Switch — install wizard')

	let args: CliArgs
	try {
		args = parseArgs(process.argv.slice(2))
	} catch (err) {
		cancel(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	try {
		if (args.uninstallMode) {
			await runUninstall(args)
		} else if (args.configPath) {
			await runNonInteractive(args)
		} else {
			await runInteractive(args)
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		log.error(message)
		cancel('Wizard failed.')
		process.exit(2)
	}

	outro('Done.')
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
