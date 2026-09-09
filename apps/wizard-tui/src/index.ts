#!/usr/bin/env bun
/**
 * Alygn Kill Switch Wizard — CLI entry (WS-C).
 *
 * Skeleton owned by be-coder: arg parsing, mode dispatch, exit codes.
 * The interactive clack prompt flows live in steps/ (fe-coder) and are
 * loaded lazily so non-interactive modes work without them.
 *
 * CLI contract (spec §8):
 *   wizard [--config <path>] [--dry-run] [--yes] [uninstall [--purge]]
 *
 * Exit codes: 0 ok · 1 preflight fail · 2 config invalid · 3 install fail
 *             4 verify fail
 */

import { loadConfig, validateConfig, type WizardConfig } from './lib/config'
import { install } from './lib/installer'
import { detectSystem, hasBlockingIssues } from './lib/system'
import { uninstall } from './lib/uninstaller'
import { verifyInstall } from './lib/verifier'

/** Shape of the interactive flow modules (implemented by fe-coder). */
interface WizardSteps {
	runPreflight(): Promise<boolean>
	runConfigure(): Promise<unknown>
	runInstall(): Promise<boolean>
	runVerify(): Promise<boolean>
	runHandoff(): Promise<void>
}

interface CliArgs {
	configPath?: string
	dryRun: boolean
	yes: boolean
	command: 'install' | 'uninstall'
	purge: boolean
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		dryRun: false,
		yes: false,
		command: 'install',
		purge: false,
	}

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		switch (arg) {
			case '--config': {
				const value = argv[++i]
				if (!value) throw new Error('--config requires a path argument')
				args.configPath = value
				break
			}
			case '--dry-run':
				args.dryRun = true
				break
			case '--yes':
				args.yes = true
				break
			case 'uninstall':
				args.command = 'uninstall'
				break
			case '--purge':
				args.purge = true
				break
			default:
				throw new Error(`Unknown argument: ${arg}`)
		}
	}
	return args
}

/** Load the interactive flow modules (steps/) — fe-coder's layer. */
async function loadSteps(): Promise<WizardSteps> {
	const modulePath = new URL('./steps/index.ts', import.meta.url).pathname
	const mod = (await import(modulePath)) as unknown as WizardSteps
	return mod
}

async function runInteractive(args: CliArgs): Promise<number> {
	const steps = await loadSteps()

	const preflightOk = await steps.runPreflight()
	if (!preflightOk) return 1

	const config = await steps.runConfigure()
	if (config === null) return 2
	validateConfig(config)

	if (args.dryRun) {
		console.log('[wizard] --dry-run: preflight + config validated, no writes performed.')
		return 0
	}

	const installOk = await steps.runInstall()
	if (!installOk) return 3

	const verifyOk = await steps.runVerify()
	if (!verifyOk) return 4

	await steps.runHandoff()
	return 0
}

async function runNonInteractive(args: CliArgs): Promise<number> {
	// Preflight always runs first (exit 1 on blocking issues).
	const report = await detectSystem()
	if (hasBlockingIssues(report)) {
		for (const issue of report.issues) {
			console.error(`[preflight] ${issue.severity}: ${issue.message}`)
			console.error(`  → ${issue.remediation}`)
		}
		return 1
	}

	let config: WizardConfig
	try {
		config = await loadConfig({
			configPath: args.configPath,
			interactive: false,
		})
	} catch (err) {
		console.error(`[config] ${err instanceof Error ? err.message : String(err)}`)
		return 2
	}

	if (args.dryRun) {
		console.log('[wizard] --dry-run: preflight + config validated, no writes performed.')
		return 0
	}

	if (args.command === 'uninstall') {
		const result = await uninstall(config, { purge: args.purge })
		console.log(
			`[wizard] Uninstall complete: units=${result.units.join(', ')} stopped=${result.stopped} disabled=${result.disabled} removed=${result.removed} envDeleted=${result.envDeleted} dataDeleted=${result.dataDeleted}`,
		)
		return 0
	}

	const result = await install(config)
	if (!result.migrations.ok) {
		console.error(`[install] migrations failed: ${result.migrations.output}`)
		return 3
	}

	const verification = await verifyInstall(config)
	const ok = verification.api.ok && verification.redis.ok && verification.heartbeat !== null
	if (!ok) {
		console.error(
			'[verify] post-install verification failed:',
			JSON.stringify(verification, null, 2),
		)
		return 4
	}

	console.log('[wizard] Install verified:', JSON.stringify(verification, null, 2))
	return 0
}

async function main(): Promise<number> {
	const args = parseArgs(process.argv.slice(2))

	if (args.command === 'uninstall' && args.configPath === undefined) {
		console.error(
			'[wizard] uninstall requires --config <path> (non-interactive) or the interactive flow.',
		)
		return 2
	}

	if (args.configPath !== undefined || args.command === 'uninstall') {
		return runNonInteractive(args)
	}

	if (args.dryRun) {
		// --dry-run without a config: preflight + defaults only.
		const report = await detectSystem()
		if (hasBlockingIssues(report)) {
			for (const issue of report.issues) {
				console.error(`[preflight] ${issue.severity}: ${issue.message}`)
				console.error(`  → ${issue.remediation}`)
			}
			return 1
		}
		console.log('[wizard] --dry-run: preflight passed, no writes performed.')
		return 0
	}

	return runInteractive(args)
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(`[wizard] ${err instanceof Error ? err.message : String(err)}`)
		process.exit(2)
	})
