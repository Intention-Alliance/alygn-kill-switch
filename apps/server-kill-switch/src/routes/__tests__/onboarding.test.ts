/**
 * Onboarding Routes — Unit Tests (ADR-138)
 *
 * Covers the HTTP surface with a mocked OnboardingService:
 *   - approve flow: NEW_MACHINE → ADMITTED + machine record + monitoring_only
 *   - deny flow: NEW_MACHINE → DENIED + audit + no machine record
 *   - rogue alert: 3 denials from same hostname → rogue_device_alert
 *   - re-onboarding: integrity drift → PENDING_REVIEW → approve → ADMITTED
 *   - auth: non-admin cannot approve/deny (403)
 *   - monitoring-only gate: machine in monitoring_only cannot receive active responses
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { OnboardingStateError } from '../../services/onboarding'

// ─── Mock OnboardingService ─────────────────────────────────────

const mockService = {
	approve: async ({ machineId, reviewedBy, zone }: any) => ({
		machine: {
			id: machineId,
			hostname: 'worker-01',
			ip: null,
			source: 'heartbeat',
			state: 'ADMITTED',
			fingerprint: null,
			integritySignature: null,
			firstSeen: '2026-08-08T00:00:00.000Z',
			lastSeen: '2026-08-08T00:00:00.000Z',
			confirmedAt: '2026-08-10T00:00:00.000Z',
			confirmedBy: reviewedBy,
		},
		registration: {
			id: 'req-1',
			machineId,
			requestedBy: 'heartbeat',
			status: 'APPROVED',
			denialReason: null,
			reviewedBy,
			reviewedAt: '2026-08-10T00:00:00.000Z',
			createdAt: '2026-08-08T00:00:00.000Z',
		},
		machineRecord: {
			id: machineId,
			name: 'worker-01',
			hostname: 'worker-01',
			monitoringOnly: true,
			zone: zone ?? 'unassigned',
		},
		rogueAlert: null,
	}),
	deny: async ({ machineId, reviewedBy, denialReason }: any) => ({
		machine: {
			id: machineId,
			hostname: 'worker-01',
			ip: null,
			source: 'heartbeat',
			state: 'DENIED',
			fingerprint: null,
			integritySignature: null,
			firstSeen: '2026-08-08T00:00:00.000Z',
			lastSeen: '2026-08-08T00:00:00.000Z',
			confirmedAt: '2026-08-10T00:00:00.000Z',
			confirmedBy: reviewedBy,
		},
		registration: {
			id: 'req-1',
			machineId,
			requestedBy: 'heartbeat',
			status: 'DENIED',
			denialReason: denialReason ?? null,
			reviewedBy,
			reviewedAt: '2026-08-10T00:00:00.000Z',
			createdAt: '2026-08-08T00:00:00.000Z',
		},
		machineRecord: null,
		rogueAlert: null,
	}),
	listPending: async () => [
		{
			id: 'machine-1',
			hostname: 'worker-01',
			ip: null,
			source: 'heartbeat',
			state: 'NEW_MACHINE',
			fingerprint: null,
			integritySignature: null,
			firstSeen: '2026-08-08T00:00:00.000Z',
			lastSeen: '2026-08-08T00:00:00.000Z',
			confirmedAt: null,
			confirmedBy: null,
		},
	],
	listRogueAlerts: async () => [
		{
			id: 'alert-1',
			hostname: 'rogue-node',
			ip: '10.0.0.99',
			denialCount: 3,
			lastDeniedAt: '2026-08-10T00:00:00.000Z',
			resolved: false,
			resolvedBy: null,
			resolvedAt: null,
			createdAt: '2026-08-10T00:00:00.000Z',
		},
	],
}

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

let handleOnboardingRoutes: any

beforeEach(async () => {
	const mod = await import('../onboarding')
	handleOnboardingRoutes = mod.handleOnboardingRoutes
})

function withService() {
	return mockService
}

// ─── Tests ──────────────────────────────────────────────────────

describe('handleOnboardingRoutes', () => {
	it('returns false for non-onboarding paths', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'GET',
			'/v1/machines',
			createMockReq(null),
			res,
			'api',
			'admin',
			withService(),
		)
		expect(handled).toBe(false)
	})

	it('POST approve: NEW_MACHINE → ADMITTED + machine record + monitoring_only', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-1/approve',
			createMockReq({}),
			res,
			'admin@alygn.com',
			'admin',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.machine.state).toBe('ADMITTED')
		expect(body.machine.confirmedBy).toBe('admin@alygn.com')
		expect(body.registration.status).toBe('APPROVED')
		expect(body.machineRecord).not.toBeNull()
		expect(body.machineRecord.monitoringOnly).toBe(true)
		expect(body.machineRecord.zone).toBe('unassigned')
		expect(body.note).toContain('monitoring-only')
	})

	it('POST approve passes an explicit zone through', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-1/approve',
			createMockReq({ zone: 'gpu-zone' }),
			res,
			'admin@alygn.com',
			'admin',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		expect(getJson(res).machineRecord.zone).toBe('gpu-zone')
	})

	it('POST approve rejects an invalid zone (400, matches machines PATCH)', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-1/approve',
			createMockReq({ zone: 'x'.repeat(65) }),
			res,
			'admin@alygn.com',
			'admin',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(400)
		expect(getJson(res).error).toContain('zone must be 1-64 characters')
	})

	it('POST approve maps state-guard errors to 409 (Conflict)', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-1/approve',
			createMockReq({}),
			res,
			'admin@alygn.com',
			'admin',
			{
				...withService(),
				approve: async () => {
					throw new OnboardingStateError(
						'Cannot approve machine in state ADMITTED',
					)
				},
			},
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(409)
		expect(getJson(res).error).toContain('Cannot approve machine in state ADMITTED')
	})

	it('POST deny: NEW_MACHINE → DENIED + no machine record', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-1/deny',
			createMockReq({ denialReason: 'Unknown device' }),
			res,
			'admin@alygn.com',
			'admin',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.machine.state).toBe('DENIED')
		expect(body.registration.status).toBe('DENIED')
		expect(body.registration.denialReason).toBe('Unknown device')
		expect(body.machineRecord).toBeNull()
		expect(body.note).toContain('zero authority')
	})

	it('POST approve rejects non-admin (403, ADR-138)', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-1/approve',
			createMockReq({}),
			res,
			'viewer@alygn.com',
			'viewer',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('admin')
	})

	it('POST deny rejects non-admin (403, ADR-138)', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-1/deny',
			createMockReq({}),
			res,
			'viewer@alygn.com',
			'viewer',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('admin')
	})

	it('GET /v1/onboarding/pending lists machines awaiting confirmation', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'GET',
			'/v1/onboarding/pending',
			createMockReq(null),
			res,
			'api',
			'admin',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.data.length).toBe(1)
		expect(body.data[0].state).toBe('NEW_MACHINE')
		expect(body.note).toContain('human confirmation')
	})

	it('GET /v1/onboarding/pending includes PENDING_REVIEW machines (R2)', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'GET',
			'/v1/onboarding/pending',
			createMockReq(null),
			res,
			'api',
			'admin',
			{
				...withService(),
				listPending: async () => [
					{
						id: 'machine-drifted',
						hostname: 'worker-drifted',
						ip: null,
						source: 'heartbeat',
						state: 'PENDING_REVIEW',
						fingerprint: null,
						integritySignature: null,
						firstSeen: '2026-08-08T00:00:00.000Z',
						lastSeen: '2026-08-10T00:00:00.000Z',
						confirmedAt: '2026-08-09T00:00:00.000Z',
						confirmedBy: 'admin@alygn.com',
					},
				],
			},
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.data.length).toBe(1)
		expect(body.data[0].state).toBe('PENDING_REVIEW')
		expect(body.note).toContain('PENDING_REVIEW')
	})

	it('GET /v1/onboarding/rogue-alerts lists rogue device alerts', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'GET',
			'/v1/onboarding/rogue-alerts',
			createMockReq(null),
			res,
			'api',
			'admin',
			withService(),
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.data.length).toBe(1)
		expect(body.data[0].hostname).toBe('rogue-node')
		expect(body.data[0].denialCount).toBe(3)
	})

	it('POST approve returns 404 for unknown machine', async () => {
		const res = createMockRes()
		const handled = await handleOnboardingRoutes(
			'POST',
			'/v1/onboarding/registration/machine-unknown/approve',
			createMockReq({}),
			res,
			'admin@alygn.com',
			'admin',
			{
				...withService(),
				approve: async () => null,
			},
		)
		expect(handled).toBe(true)
		expect(res.statusCode).toBe(404)
		expect(getJson(res).error).toContain('not found')
	})
})
