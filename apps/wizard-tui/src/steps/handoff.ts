/**
 * Handoff step (WS-C wizard-tui steps).
 *
 * Epic 1.4: after verification, hands off to the dashboard so the admin
 * can register a WebAuthn security key (the human-signature kill
 * authorization, ADR-136). Also prints the uninstall/rollback path.
 */

import { log, note } from '@clack/prompts'
import type { WizardConfig } from '../lib/config'

/** Render the handoff screen. */
export function runHandoff(config: WizardConfig): void {
	const base = config.motherUrl.replace(/\/$/, '')

	// The admin password the user configured IS the dashboard login token
	// (KILL_SWITCH_AUTH_TOKEN). When none was configured, generate-secrets.sh
	// wrote a random token into the install .env — point the admin at it.
	const signInLine = config.adminPassword
		? '2. Sign in with the admin email + password you configured.'
		: `2. Sign in with the admin email + the KILL_SWITCH_AUTH_TOKEN value in ${config.installDir}/.env.`

	note(
		[
			'1. Open the dashboard:',
			`   ${base}`,
			'',
			signInLine,
			'',
			'3. Register a WebAuthn security key (passkey) — this is the',
			'   human-signature required for kill/stop actions (ADR-136).',
			'',
			'4. The agent heartbeat is already flowing. The machine appears',
			'   as NEW_MACHINE — approve it in the dashboard to complete',
			'   onboarding (no auto-admission, ADR-135).',
		].join('\n'),
		'Next steps — dashboard handoff',
	)

	log.message(`Rollback: run \`wizard uninstall\` (add --purge to also delete .env and data).`)
	log.success('Installation complete. Welcome to the grid. 🎯')
}
