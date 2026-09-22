/**
 * Tests for lib/verifier.ts — post-install health checks + heartbeat probe.
 *
 * Spins up a mock mother server on an ephemeral port implementing the
 * live contracts (spec §6) so the checks are exercised end-to-end.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateConfig } from '../src/lib/config'
import { probeHeartbeat, verifyInstall } from '../src/lib/verifier'

const API_KEY = 'test-api-key-1234567890'
const ADMIN_UI_KEY = 'test-admin-ui-key-12345678901234567890123456789012'

let server: ReturnType<typeof Bun.serve> | null = null
let port = 0
let installDir = ''

beforeAll(async () => {
	installDir = await mkdtemp(join(tmpdir(), 'wizard-verify-'))
	await writeFile(
		join(installDir, '.env'),
		[
			`KILL_SWITCH_API_KEY=${API_KEY}`,
			`ADMIN_UI_API_KEY=${ADMIN_UI_KEY}`,
			'KILL_SWITCH_ENV=production',
		].join('\n'),
	)

	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url)
			const apiKey = req.headers.get('x-api-key')
			const auth = req.headers.get('authorization')

			if (url.pathname === '/health') {
				return Response.json({ status: 'alive', version: '2.0.0' })
			}
			if (url.pathname === '/ready') {
				return Response.json({
					status: 'ready',
					checks: { redis: { redis: 'OK' }, killSwitchState: 'RUNNING' },
				})
			}
			if (url.pathname === '/v1/discovery/machines') {
				if (apiKey !== API_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 })
				return Response.json({
					data: [{ id: 'machine-1', hostname: 'node-1', state: 'NEW_MACHINE' }],
					total: 1,
					limit: 50,
				})
			}
			if (url.pathname === '/api/admin/secrets/audit') {
				if (auth !== `Bearer ${ADMIN_UI_KEY}`) {
					return Response.json({ error: 'unauthorized' }, { status: 401 })
				}
				return Response.json({ data: [], total: 0 })
			}
			if (url.pathname === '/v1/discovery/heartbeat' && req.method === 'POST') {
				if (apiKey !== API_KEY) {
					return Response.json({ error: 'unauthorized' }, { status: 401 })
				}
				return Response.json({
					acknowledged: true,
					machineId: 'machine-test',
					state: 'OK',
					agentRegistered: true,
				})
			}
			return Response.json({ error: 'not found' }, { status: 404 })
		},
	})
	port = server.port ?? 0
})

afterAll(async () => {
	server?.stop(true)
	await rm(installDir, { recursive: true, force: true })
})

function makeConfig(): ReturnType<typeof validateConfig> {
	return validateConfig({
		orgName: 'TestOrg',
		adminEmail: 'admin@test.org',
		motherUrl: `http://localhost:${port}`,
		machineId: 'machine-test',
		machineName: 'test-node',
		machineHostname: 'test-node.local',
		redisUrl: 'redis://localhost:6379',
		webauthnRpId: 'test-node.local',
		webauthnOrigin: 'http://localhost:3001',
		ollamaBaseUrl: 'http://localhost:11434',
		installDir,
		serviceUser: 'tester',
		licenseAccepted: true,
	})
}

describe('probeHeartbeat', () => {
	test('returns state and agentRegistered from a live heartbeat', async () => {
		const result = await probeHeartbeat(makeConfig())
		expect(result).not.toBeNull()
		expect(result?.state).toBe('OK')
		expect(result?.agentRegistered).toBe(true)
	})

	test('returns null when the server is unreachable', async () => {
		const cfg = makeConfig()
		const result = await probeHeartbeat({
			...cfg,
			motherUrl: 'http://localhost:1',
		})
		expect(result).toBeNull()
	})
})

describe('verifyInstall', () => {
	test('reports all checks against a healthy mother', async () => {
		const report = await verifyInstall(makeConfig())

		expect(report.api.ok).toBe(true)
		expect(report.api.status).toBe('alive')
		expect(report.api.version).toBe('2.0.0')
		expect(report.redis.ok).toBe(true)
		expect(report.machines).toHaveLength(1)
		expect(report.auditLog.ok).toBe(true)
		expect(report.heartbeat).not.toBeNull()
		expect(report.heartbeat?.state).toBe('OK')
		expect(report.heartbeat?.agentRegistered).toBe(true)
	})

	test('degrades gracefully when the server is down', async () => {
		const cfg = makeConfig()
		const report = await verifyInstall({ ...cfg, motherUrl: 'http://localhost:1' })

		expect(report.api.ok).toBe(false)
		expect(report.redis.ok).toBe(false)
		expect(report.machines).toEqual([])
		expect(report.auditLog.ok).toBe(false)
		expect(report.heartbeat).toBeNull()
	})
})
