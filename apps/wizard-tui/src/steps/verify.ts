/**
 * First-run verification step (WS-C wizard-tui steps).
 *
 * Epic 1.4: probes API status, redis, machines, audit log and a live
 * heartbeat, then renders the report. Exit code 4 when verification
 * fails (spec §8).
 */

import { log, note, spinner } from '@clack/prompts'
import type { WizardConfig } from '../lib/config'
import { type VerificationReport, verifyInstall } from '../lib/verifier'

/** Render a single check line with a status icon. */
function checkLine(label: string, ok: boolean, detail = ''): string {
	const icon = ok ? '✅' : '❌'
	return `${icon} ${label}${detail ? ` — ${detail}` : ''}`
}

/** Run the verification pass and render the report. */
export async function runVerify(config: WizardConfig): Promise<VerificationReport> {
	const spin = spinner()
	spin.start('Verifying installation…')
	const report = await verifyInstall(config)
	spin.stop('Verification complete.')

	const lines = [
		checkLine(
			'API health',
			report.api.ok,
			report.api.status ? `HTTP ${report.api.status}` : 'unreachable',
		),
		checkLine('Redis', report.redis.ok),
		checkLine(
			'Machine registry',
			report.machines.length > 0,
			`${report.machines.length} machine(s)`,
		),
		checkLine('Audit log', report.auditLog.ok),
	]

	if (report.heartbeat) {
		lines.push(
			checkLine(
				'Heartbeat',
				report.heartbeat.agentRegistered === true,
				`state=${report.heartbeat.state ?? 'unknown'} registered=${report.heartbeat.agentRegistered ?? false}`,
			),
		)
	} else {
		lines.push(
			'⚠️ Heartbeat — mother unreachable or API key missing (expected before admin approval)',
		)
	}

	note(lines.join('\n'), 'First-run verification')

	const ok = report.api.ok && report.redis.ok && report.machines.length > 0 && report.auditLog.ok

	if (ok) {
		log.success('Installation verified.')
	} else {
		log.warn('Some checks failed — see the report above.')
		log.message(
			'The machine may still be pending admin approval on the mother (NEW_MACHINE → confirm).',
		)
		process.exitCode = 4
	}

	return report
}
