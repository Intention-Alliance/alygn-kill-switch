/**
 * Tests for lib/services.ts — systemd unit rendering + install/uninstall.
 */

import { describe, expect, test } from 'bun:test'
import { validateConfig } from '../src/lib/config'
import { renderAgentUnit, renderServerUnit, renderUnits, UNITS } from '../src/lib/services'

const baseConfig = validateConfig({
	orgName: 'TestOrg',
	adminEmail: 'admin@test.org',
	motherUrl: 'http://localhost:3000',
	machineId: 'machine-test',
	machineName: 'test-node',
	machineHostname: 'test-node.local',
	redisUrl: 'redis://localhost:6379',
	webauthnRpId: 'test-node.local',
	webauthnOrigin: 'http://localhost:3001',
	ollamaBaseUrl: 'http://localhost:11434',
	installDir: '/opt/alygn',
	serviceUser: 'alygn',
	licenseAccepted: true,
})

describe('renderServerUnit', () => {
	test('renders a systemd unit with parameterized fields', () => {
		const unit = renderServerUnit(baseConfig, '/usr/local/bin/bun')

		expect(unit).toContain('[Unit]')
		expect(unit).toContain('Description=ALYGN Web Regulator (Kill Switch)')
		expect(unit).toContain('User=alygn')
		expect(unit).toContain('WorkingDirectory=/opt/alygn/apps/server-kill-switch')
		expect(unit).toContain('EnvironmentFile=/opt/alygn/.env')
		expect(unit).toContain('ExecStart=/usr/local/bin/bun run src/index.ts')
		expect(unit).toContain('Restart=on-failure')
		expect(unit).toContain('WantedBy=multi-user.target')
	})

	test('matches the repo-root template structure (spec §7)', () => {
		const unit = renderServerUnit(baseConfig, 'bun')
		// Template sections must all be present.
		for (const section of ['[Unit]', '[Service]', '[Install]']) {
			expect(unit).toContain(section)
		}
		expect(unit).toContain('After=network.target')
		expect(unit).toContain('Type=simple')
		expect(unit).toContain('Environment=NODE_ENV=production')
	})
})

describe('renderAgentUnit', () => {
	test('renders the agent-plane unit', () => {
		const unit = renderAgentUnit(baseConfig, '/usr/local/bin/bun')

		expect(unit).toContain('Description=ALYGN Agent Plane (heartbeat + interceptor)')
		expect(unit).toContain('User=alygn')
		expect(unit).toContain('WorkingDirectory=/opt/alygn/apps/agent-plane')
		expect(unit).toContain('EnvironmentFile=/opt/alygn/.env')
		expect(unit).toContain('ExecStart=/usr/local/bin/bun run src/index.ts')
		expect(unit).toContain('Environment=ALYGN_MOTHER_URL=http://localhost:3000')
	})
})

describe('renderUnits', () => {
	test('returns both units keyed by filename', () => {
		const units = renderUnits(baseConfig)
		expect(Object.keys(units).sort()).toEqual([UNITS.server, UNITS.agent].sort())
		expect(units[UNITS.server]).toContain('Kill Switch')
		expect(units[UNITS.agent]).toContain('Agent Plane')
	})

	test('unit names match the spec §7 contract', () => {
		expect(UNITS.server).toBe('alygn-web-regulator.service')
		expect(UNITS.agent).toBe('alygn-agent-plane.service')
	})
})
