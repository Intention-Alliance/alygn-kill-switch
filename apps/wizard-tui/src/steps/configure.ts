/**
 * Guided configuration step (WS-C wizard-tui steps).
 *
 * Interactive clack flow for Epic 1.2: org name (white-label), admin
 * credentials, thresholds (safe defaults), zones, redis connection, and
 * license acknowledgment. Returns a fully validated WizardConfig.
 *
 * Secrets are entered via the masked `password` prompt and are never
 * echoed to the terminal (spec §2 — "nunca echo al terminal").
 */

import { hostname } from 'node:os'
import { cancel, confirm, group, log, note, password, select, text } from '@clack/prompts'
import { validateConfig, type WizardConfig } from '../lib/config'

/** Default thresholds (safe defaults from shared-types SecurityThresholds). */
const DEFAULT_THRESHOLDS = {
	malformedThreshold: 100,
	detectionWindowUs: 1_000_000,
	gridThreatGbps: 10,
	gridThreatWindowUs: 1_000_000,
}

/**
 * Interactive guided configuration. Returns the merged config (defaults +
 * user answers). Throws on cancel (caller handles exit).
 */
export async function runConfigure(): Promise<WizardConfig> {
	const host = hostname().split('.')[0] ?? 'local-machine'

	const answers = await group(
		{
			orgName: () =>
				text({
					message: 'Organization name (white-label branding)?',
					placeholder: 'ALYGN',
					initialValue: 'ALYGN',
					validate: (v) => (v && v.trim().length > 0 ? undefined : 'Required'),
				}),
			adminEmail: () =>
				text({
					message: 'Admin email (dashboard login)?',
					placeholder: 'admin@alygn.com',
					initialValue: 'admin@alygn.com',
					validate: (v) =>
						v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Invalid email',
				}),
			adminPassword: () =>
				password({
					message: 'Admin password (min 16 chars — never echoed)',
					validate: (v) => (v && v.length >= 16 ? undefined : 'Must be at least 16 characters'),
				}),
			motherUrl: () =>
				text({
					message: 'Mother machine URL (kill-switch server)?',
					placeholder: 'http://localhost:3000',
					initialValue: 'http://localhost:3000',
					validate: (v) => {
						if (!v) return 'Required'
						try {
							new URL(v)
							return undefined
						} catch {
							return 'Must be a valid URL'
						}
					},
				}),
			machineId: () =>
				text({
					message: 'Machine ID (unique on the mother)?',
					placeholder: `machine-${host}`,
					initialValue: `machine-${host}`,
					validate: (v) => (v && v.trim().length > 0 ? undefined : 'Required'),
				}),
			machineName: () =>
				text({
					message: 'Machine name (human-readable)?',
					placeholder: host,
					initialValue: host,
					validate: (v) => (v && v.trim().length > 0 ? undefined : 'Required'),
				}),
			redisUrl: () =>
				text({
					message: 'Redis connection URL?',
					placeholder: 'redis://localhost:6379',
					initialValue: 'redis://localhost:6379',
					validate: (v) => (v && v.trim().length > 0 ? undefined : 'Required'),
				}),
			zones: () =>
				text({
					message: 'Deployment zones (comma-separated)?',
					placeholder: 'default',
					initialValue: 'default',
					validate: (v) => (v && v.trim().length > 0 ? undefined : 'Required'),
				}),
			thresholds: () =>
				select({
					message: 'Security thresholds?',
					options: [
						{
							value: 'default',
							label: 'Safe defaults (recommended)',
							hint: 'malformed 100 · window 1s · grid 10 Gbps',
						},
						{ value: 'custom', label: 'Custom values' },
					],
				}),
			verifyEnabled: () =>
				confirm({
					message: 'Enable inference verification (Ollama verifier)?',
					initialValue: false,
				}),
			licenseAccepted: () =>
				confirm({
					message: 'I acknowledge the ALYGN license and the kill-switch safety terms (see LICENSE)',
					initialValue: false,
				}),
		},
		{
			onCancel: () => {
				cancel('Configuration cancelled.')
				process.exit(130)
			},
		},
	)

	let thresholds = DEFAULT_THRESHOLDS
	if (answers.thresholds === 'custom') {
		const custom = await group(
			{
				malformedThreshold: () =>
					text({
						message: 'Malformed packet threshold?',
						initialValue: '100',
						validate: (v) =>
							v && Number.isInteger(Number(v)) && Number(v) > 0
								? undefined
								: 'Positive integer required',
					}),
				detectionWindowUs: () =>
					text({
						message: 'Detection window (µs)?',
						initialValue: '1000000',
						validate: (v) =>
							v && Number.isInteger(Number(v)) && Number(v) > 0
								? undefined
								: 'Positive integer required',
					}),
				gridThreatGbps: () =>
					text({
						message: 'Grid threat threshold (Gbps)?',
						initialValue: '10',
						validate: (v) => (v && Number(v) > 0 ? undefined : 'Positive number required'),
					}),
				gridThreatWindowUs: () =>
					text({
						message: 'Grid threat window (µs)?',
						initialValue: '1000000',
						validate: (v) =>
							v && Number.isInteger(Number(v)) && Number(v) > 0
								? undefined
								: 'Positive integer required',
					}),
			},
			{
				onCancel: () => {
					cancel('Configuration cancelled.')
					process.exit(130)
				},
			},
		)
		thresholds = {
			malformedThreshold: Number(custom.malformedThreshold),
			detectionWindowUs: Number(custom.detectionWindowUs),
			gridThreatGbps: Number(custom.gridThreatGbps),
			gridThreatWindowUs: Number(custom.gridThreatWindowUs),
		}
	}

	if (!answers.licenseAccepted) {
		cancel('License must be accepted to proceed.')
		process.exit(130)
	}

	const config = validateConfig({
		orgName: answers.orgName,
		adminEmail: answers.adminEmail,
		adminPassword: answers.adminPassword,
		motherUrl: answers.motherUrl,
		machineId: answers.machineId,
		machineName: answers.machineName,
		redisUrl: answers.redisUrl,
		zones: answers.zones
			.split(',')
			.map((z) => z.trim())
			.filter(Boolean),
		thresholds,
		verifyEnabled: answers.verifyEnabled,
	})

	note(
		[
			`org:        ${config.orgName}`,
			`admin:      ${config.adminEmail}`,
			`mother:     ${config.motherUrl}`,
			`machine:    ${config.machineId} (${config.machineName})`,
			`redis:      ${config.redisUrl}`,
			`zones:      ${config.zones.join(', ')}`,
			`verifier:   ${config.verifyEnabled ? `on (${config.verifyModel})` : 'off'}`,
		].join('\n'),
		'Configuration summary',
	)

	log.success('Configuration complete.')
	return config
}
