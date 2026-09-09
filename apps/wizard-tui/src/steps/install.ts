/**
 * Install step (WS-C wizard-tui steps).
 *
 * Runs the install pipeline (env → secrets → units → migrate → start)
 * with a spinner, then reports the result. Secrets are never printed.
 */

import { log, note, spinner } from '@clack/prompts'
import type { WizardConfig } from '../lib/config'
import { install } from '../lib/installer'

/** Run the full install with progress feedback. */
export async function runInstall(config: WizardConfig): Promise<void> {
	const spin = spinner()
	spin.start('Writing environment files…')
	try {
		const result = await install(config)
		spin.stop('Services installed and started.')

		note(
			[
				`units:      ${result.units.join(', ')}`,
				`enabled:    ${result.enabled ? 'yes' : 'no'}`,
				`started:    ${result.started ? 'yes' : 'no'}`,
				`installDir: ${config.installDir}`,
			].join('\n'),
			'Install result',
		)
	} catch (err) {
		spin.stop('Install failed.')
		const message = err instanceof Error ? err.message : String(err)
		log.error(`Install failed: ${message}`)
		log.message('Run `wizard uninstall` to roll back, then fix and retry.')
		process.exit(3)
	}
}
