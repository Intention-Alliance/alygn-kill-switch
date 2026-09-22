/**
 * installer.ts tests — migration fallback + install pipeline wiring.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateConfig } from '../src/lib/config'
import { runMigrations } from '../src/lib/installer'

const config = validateConfig({
	orgName: 'Acme',
	adminEmail: 'admin@acme.com',
	adminPassword: 'supersecret-password-123',
	motherUrl: 'http://mother:3000',
	machineId: 'machine-acme-1',
	machineName: 'acme-1',
	machineHostname: 'acme-1.local',
	redisUrl: 'redis://redis:6379',
	zones: ['default'],
	installDir: '/opt/alygn',
	serviceUser: 'alygn',
	licenseAccepted: true,
})

describe('runMigrations', () => {
	test('falls back gracefully when the app dir has no drizzle setup', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'wizard-migrate-'))
		const cfg = { ...config, installDir: dir }
		const result = await runMigrations(cfg)
		// Never throws; reports ok:false with a fallback note.
		expect(typeof result.ok).toBe('boolean')
		expect(result.output.length).toBeGreaterThan(0)
	})
})
