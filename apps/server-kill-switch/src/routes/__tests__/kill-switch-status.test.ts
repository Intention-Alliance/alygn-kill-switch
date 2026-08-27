/**
 * Kill Switch Routes — Status endpoint (H1.1)
 *
 * GET /v1/kill-switch/status now exposes `verifierReachable` so the dashboard
 * can surface whether inference verification is active or degraded. Covers:
 *   - verifierReachable reflects the tracker's current state
 *   - verifierReachable is null when no tracker is provided (verification off)
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Mock @simplewebauthn/server (webauthn service imports it) ────
mock.module('@simplewebauthn/server', () => ({
	generateRegistrationOptions: async () => ({ challenge: 'x' }),
	verifyRegistrationResponse: async () => ({ verified: false }),
	generateAuthenticationOptions: async () => ({ challenge: 'x' }),
	verifyAuthenticationResponse: async () => ({ verified: false }),
}))

// ─── Mock ../lib/auth (avoids loading real better-auth, whose drizzle
// adapter needs drizzle-orm exports missing from the installed version) ──
mock.module(path.resolve(__dirname, '../../lib/auth.ts'), () => ({
	auth: {
		api: {
			getSession: async () => ({ user: null }),
		},
	},
	seedAdminUser: async () => {},
}))

// ─── Mock db/index (webauthn service imports it at top level) ─────
mock.module(path.resolve(__dirname, '../../db/index.ts'), () => ({
	db: {
		select: () => ({
			from: () => ({
				all: () => [],
				where: () => ({ all: () => [], get: () => null }),
			}),
		}),
		insert: () => ({ values: () => ({ run: () => {} }) }),
		update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
	},
}))

// ─── Mock drizzle-orm (desc/sql/eq/and/isNull used by transitive imports) ──
mock.module('drizzle-orm', () => ({
	eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
	and: (...args: any[]) => ({ __and: args }),
	isNull: (col: any) => ({ __isNull: true, __col: col?.name }),
	desc: (col: any) => ({ __desc: true, __col: col?.name }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
		__sql: String.raw(strings, ...values),
	}),
}))

const mockService = {
	transitionTo: mock(async () => ({})),
	getCurrentState: async () => 'ARMED',
	getAuditLog: () => [],
	getLastActivation: () => ({ timestamp: null, by: null, reason: null }),
	healthCheck: async () => ({ status: 'healthy' }),
}

let handleKillSwitchRoutes: any

beforeEach(async () => {
	const routeMod = await import('../kill-switch')
	handleKillSwitchRoutes = routeMod.handleKillSwitchRoutes
})

function createMockRes() {
	return {
		statusCode: 0,
		headers: {} as Record<string, string>,
		body: '',
		writeHead(code: number, headers: Record<string, string>) {
			this.statusCode = code
			this.headers = headers
		},
		end(data: string) {
			this.body = data
		},
	}
}

function createMockReq() {
	const req: any = {
		headers: {},
		on() {
			return req
		},
	}
	return req
}

function getJson(res: any): any {
	return JSON.parse(res.body)
}

describe('GET /v1/kill-switch/status — verifierReachable (H1.1)', () => {
	it('exposes verifierReachable=true when the tracker reports reachable', async () => {
		const res = createMockRes()
		const req = createMockReq()
		const tracker = { getVerifierReachable: () => true }

		const handled = await handleKillSwitchRoutes(
			'GET',
			'/v1/kill-switch/status',
			req,
			res,
			mockService,
			'10.0.0.1',
			tracker,
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		expect(getJson(res).verifierReachable).toBe(true)
	})

	it('exposes verifierReachable=false when the tracker reports degraded', async () => {
		const res = createMockRes()
		const req = createMockReq()
		const tracker = { getVerifierReachable: () => false }

		const handled = await handleKillSwitchRoutes(
			'GET',
			'/v1/kill-switch/status',
			req,
			res,
			mockService,
			'10.0.0.1',
			tracker,
		)

		expect(handled).toBe(true)
		expect(getJson(res).verifierReachable).toBe(false)
	})

	it('exposes verifierReachable=null when no tracker is provided (verification off)', async () => {
		const res = createMockRes()
		const req = createMockReq()

		const handled = await handleKillSwitchRoutes(
			'GET',
			'/v1/kill-switch/status',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(getJson(res).verifierReachable).toBeNull()
	})
})
