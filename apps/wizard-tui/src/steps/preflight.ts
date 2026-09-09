/**
 * Preflight step (WS-C wizard-tui steps).
 *
 * Runs system detection and renders the report with remediation hints.
 * Returns the report so the caller can decide whether to continue.
 */

import { cancel, log, note } from '@clack/prompts'
import { detectSystem, hasBlockingIssues, type SystemReport } from '../lib/system'

/** Render the preflight report and return it. */
export async function runPreflight(): Promise<SystemReport> {
	log.step('Detecting system…')
	const report = await detectSystem()

	note(
		[
			`OS:        ${report.os} ${report.kernel} (${report.arch})`,
			`systemd:   ${report.systemd ? 'yes' : 'NO — required'}`,
			`bun:       ${report.bun?.installed ? report.bun.version : 'NOT INSTALLED'}`,
			`redis:     ${report.redis?.installed ? (report.redis.running ? 'running' : 'installed, NOT running') : 'NOT INSTALLED'}`,
			`git:       ${report.git?.installed ? report.git.version : 'not found'}`,
			`ports:     3000 ${report.ports[3000]} · 3001 ${report.ports[3001]}`,
			`hardware:  ${report.hardware.cpu} · ${report.hardware.cores} cores · ${report.hardware.memMb} MB`,
		].join('\n'),
		'Preflight report',
	)

	if (report.issues.length === 0) {
		log.success('All preflight checks passed.')
		return report
	}

	for (const issue of report.issues) {
		const icon = issue.severity === 'error' ? '❌' : '⚠️'
		log.warn(`${icon} ${issue.message}`)
		log.message(`   → ${issue.remediation}`)
	}

	if (hasBlockingIssues(report)) {
		cancel('Preflight failed — fix the errors above and re-run the wizard.')
		process.exit(1)
	}

	return report
}
