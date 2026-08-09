/**
 * Discovery Routes — Unit Tests (ADR-135)
 *
 * Covers the HTTP surface: list machines, sweep (NO auto-admission),
 * heartbeat, probe, report, confirm (approve/deny), integrity events.
 * Uses a mocked orchestrator so no network or DB side effects occur.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'

// ─── Mock orchestrator ──────────────────────────────────────────

const mockOrchestrator = {
	runNetworkSweep: async () => ({
		discovered: [
			{
				id: 'discovered-10-0-0-5',
				hostname: 'gpu-node',
				ip: '10.0.0.5',
				source: 'arp-sweep',
				state: 'NEW_MACHINE',
				fingerprint: null,
				integritySignature: null,
				firstSeen: '2026-08-08T00:00:00.000Z',
				lastSeen: '2026-08-08T00:00:00.000Z',
				confirmedAt: null,
				confirmedBy: null,
			},
		],
		skipped: 2,
	}),
	handleHeartbeat: async ({ machineId }: { machineId: string }) => ({
		signature: {
			algorithm: 'sha256',
			hash: 'a'.repeat(64),
			signedAt: '2026-08-08T00:00:00.000Z',
		},
		drift: null,
		machineId,
	}),
	detectProvidersForMachine: async (_machineId: string) => [
		{
			provider: {
				id: 'ollama',
				name: 'Ollama',
				version: null,
				baseUrl: 'http://127.0.0.1:11434',
				detectedAt: '2026-08-08T00:00:00.000Z',
			},
			health: {
				healthy: true,
				latencyMs: 5,
				error: null,
				checkedAt: '2026-08-08T00:00:00.000Z',
			},
			models: [
				{
					id: 'llama3:8b',
					name: 'llama3:8b',
					providerId: 'ollama',
					sizeBytes: 4691249611,
					quantization: 'Q4_K_M',
					family: 'llama',
					served: true,
				},
			],
		},
	],
	getDiscoveryReport: async (machineId: string) => ({
		machine: {
			id: machineId,
			hostname: 'worker-01',
			ip: null,
			source: 'heartbeat',
			state: 'NEW_MACHINE',
			fingerprint: null,
			integritySignature: {
				algorithm: 'sha256',
				hash: 'b'.repeat(64),
				signedAt: '2026-08-08T00:00:00.000Z',
			},
			firstSeen: '2026-08-08T00:00:00.000Z',
			lastSeen: '2026-08-08T00:00:00.000Z',
			confirmedAt: null,
			confirmedBy: null,
		},
		providers: [],
		models: [],
		integrity: { signature: null, drift: null },
	}),
	confirmMachine: async (
		machineId: string,
		confirmedBy: string,
		approve: boolean,
	) => ({
		id: machineId,
		hostname: 'worker-01',
		ip: null,
		source: 'heartbeat',
		state: approve ? 'CONFIRMED' : 'DENIED',
		fingerprint: null,
		integritySignature: null,
		firstSeen: '2026-08-08T00:00:00.000Z',
		lastSeen: '2026-08-08T00:00:00.000Z',
		confirmedAt: approve ? '2026-08-08T01:00:00.000Z' : null,
		confirmedBy: approve ? confirmedBy : null,
	}),
}

// ─── Mock db (for list + integrity-events endpoints) ──────────────

mock.module('../../db/index', () => ({
	db: {
		select: () => ({
			from: () => ({
				$dynamic: () => ({
					where: () => ({
						orderBy: () => ({
							limit: () => ({ all: async () => [] }),
						}),
					}),
					orderBy: () => ({
						limit: () => ({ all: async () => [] }),
					}),
					limit: () => ({ all: async () => [] }),
				}),
				orderBy: () => ({
					limit: () => ({ all: async () => [] }),
				}),
				limit: () => ({ all: async () => [] }),
				all: async () => [],
			}),
		}),
	},
}))

// ─── Helpers ────────────────────────────────────────────────────

function createMockRes() {
	const res: any = {
		statusCode: 0,
		body: '',
		writeHead(statusCode: number, headers: Record<string, string>) {
			res.statusCode = statusCode
			res.headers = headers
		},
		end(body: string) {
			res.body = body
		},
	}
	return res
}

function createMockReq(body: unknown) {
	let data = body === undefined ? '' : JSON.stringify(body)
	return {
		on(event: string, cb: (chunk: Buffer) => void) {
			if (event === 'data' && data) {
				cb(Buffer.from(data))
				data = ''
			}
			if (event === 'end') cb(Buffer.from(''))
		},
	}
}

function getJson(res: any): any {
	return JSON.parse(res.body)
}

let handleDiscoveryRoutes: any

beforeEach(async () => {
	const mod = await import('../discovery')
	handleDiscoveryRoutes = mod.handleDiscoveryRoutes
})

// Inject the mock orchestrator instance (route handler accepts it as a param)
function withOrchestrator() {
	return mockOrchestrator
}

// ─── Tests ──────────────────────────────────────────────────────

describe('handleDiscoveryRoutes', () => {
	it('returns false for non-discovery paths', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'GET',
			'/v1/machines',
			createMockReq(null),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(false)
	})

	it('GET /v1/discovery/machines lists the registry', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'GET',
			'/v1/discovery/machines',
			createMockReq(null),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(Array.isArray(body.data)).toBe(true)
		expect(typeof body.total).toBe('number')
	})

	it('POST /v1/discovery/sweep returns NEW_MACHINE hosts (NO auto-admission)', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/sweep',
			createMockReq(null),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.discovered.length).toBe(1)
		expect(body.discovered[0].state).toBe('NEW_MACHINE')
		expect(body.skipped).toBe(2)
		expect(body.note).toContain('NO auto-admission')
	})

	it('POST /v1/discovery/heartbeat requires machineId and hostname', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/heartbeat',
			createMockReq({}),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(400)
	})

	it('POST /v1/discovery/heartbeat acknowledges with signature', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/heartbeat',
			createMockReq({ machineId: 'machine-1', hostname: 'worker-01' }),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.acknowledged).toBe(true)
		expect(body.signature.hash).toMatch(/^[0-9a-f]{64}$/)
		expect(body.state).toBe('OK')
	})

	it('POST /v1/discovery/:id/probe returns detected providers', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/machine-1/probe',
			createMockReq(null),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.machineId).toBe('machine-1')
		expect(body.providers.length).toBe(1)
		expect(body.providers[0].provider.id).toBe('ollama')
		expect(body.providers[0].modelCount).toBe(1)
	})

	it('GET /v1/discovery/:id/report returns the onboarding report', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'GET',
			'/v1/discovery/machine-1/report',
			createMockReq(null),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.machine.id).toBe('machine-1')
		expect(body.machine.state).toBe('NEW_MACHINE')
	})

	it('POST /v1/discovery/:id/confirm approves a machine', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/machine-1/confirm',
			createMockReq({ approve: true }),
			res,
			'admin@alygn.com',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.state).toBe('CONFIRMED')
		expect(body.machine.confirmedBy).toBe('admin@alygn.com')
	})

	it('POST /v1/discovery/:id/confirm denies a machine (zero authority)', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/machine-1/confirm',
			createMockReq({ approve: false }),
			res,
			'admin@alygn.com',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.state).toBe('DENIED')
		expect(body.note).toContain('zero authority')
	})

	it('POST /v1/discovery/:id/confirm rejects non-admin (403, ADR-138)', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/machine-1/confirm',
			createMockReq({ approve: true }),
			res,
			'viewer@alygn.com',
			'viewer',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		const body = getJson(res)
		expect(body.error).toContain('Admin role required')
	})

	it('POST /v1/discovery/sweep rejects non-admin (403)', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/sweep',
			createMockReq(null),
			res,
			'viewer@alygn.com',
			'viewer',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
	})

	it('POST /v1/discovery/:id/probe rejects non-admin (403)', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'POST',
			'/v1/discovery/machine-1/probe',
			createMockReq(null),
			res,
			'viewer@alygn.com',
			'viewer',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
	})

	it('GET /v1/discovery/integrity-events returns the drift log', async () => {
		const res = createMockRes()
		const handled = await handleDiscoveryRoutes(
			'GET',
			'/v1/discovery/integrity-events',
			createMockReq(null),
			res,
			'api',
			'admin',
			withOrchestrator(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(Array.isArray(body.data)).toBe(true)
	})
})
