/**
 * Kill Switch Routes — WebAuthn Assertion Authorization Tests (ADR-136)
 *
 * POST /v1/kill-switch/chaos now requires a human WebAuthn assertion
 * token (Authorization: Assertion <token>) instead of a Bearer token.
 * Covers:
 *   - valid assertion token → transition executes
 *   - Bearer token / API key REJECTED (403)
 *   - assertion token bound to wrong action REJECTED
 *   - garbage assertion token REJECTED
 *
 * Uses the REAL webauthn service with tokens minted via its test hook
 * (no mock collision with the service unit tests).
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Env for assertion token HMAC ─────────────────────────────────
process.env.BETTER_AUTH_SECRET =
	process.env.BETTER_AUTH_SECRET ||
	'test-secret-0123456789abcdef0123456789abcdef'
process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET =
	process.env.WEBAUTHN_ASSERTION_TOKEN_SECRET || 'test-assertion-token-secret'

// ─── Mock @simplewebauthn/server (never called by these tests) ────
mock.module('@simplewebauthn/server', () => ({
	generateRegistrationOptions: async () => ({ challenge: 'x' }),
	verifyRegistrationResponse: async () => ({ verified: false }),
	generateAuthenticationOptions: async () => ({ challenge: 'x' }),
	verifyAuthenticationResponse: async () => ({ verified: false }),
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
	// Other modules in the graph (audit-chain, webhook-keys, websocket-manager)
	// import `sqlite` from db/index; the mock must expose it or those imports
	// fail with "Export named 'sqlite' not found".
	sqlite: {
		query: () => ({ get: () => undefined, all: () => [], run: () => {} }),
	},
}))

// ─── Mock ../lib/auth (avoids loading real better-auth, whose drizzle
// adapter needs drizzle-orm exports missing from the installed version) ──
// getSession returns an admin user only when the request carries a
// better-auth session cookie, so the session-cookie path can be exercised.
mock.module(path.resolve(__dirname, '../../lib/auth.ts'), () => ({
	auth: {
		api: {
			getSession: async ({ headers }: { headers: Headers }) => {
				const cookie = headers.get('cookie') || ''
				if (cookie.includes('better-auth.session_token=admin-session')) {
					return { user: { email: 'admin@alygn.com', role: 'admin' } }
				}
				return { user: null }
			},
		},
	},
	seedAdminUser: async () => {},
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

// ─── Mock kill-switch service ─────────────────────────────────────

const mockTransitionTo = mock(async (state: string, metadata: any) => ({
	id: 'audit-1',
	previousState: 'ARMED',
	newState: state,
	timestamp: new Date().toISOString(),
	traceId: 'trace-1',
	initiatedBy: metadata.userId,
	reason: metadata.reason,
	ip: metadata.ip,
}))

const mockService = {
	transitionTo: mockTransitionTo,
	getCurrentState: async () => 'ARMED',
	getAuditLog: () => [],
	getLastActivation: () => ({ timestamp: null, by: null, reason: null }),
	healthCheck: async () => ({ status: 'healthy' }),
}

// ─── Import route + webauthn service after mocks ─────────────────

let handleKillSwitchRoutes: any
let mintAssertionToken: any

beforeEach(async () => {
	mockTransitionTo.mockClear()
	const routeMod = await import('../kill-switch')
	handleKillSwitchRoutes = routeMod.handleKillSwitchRoutes
	const waMod = await import('../../services/webauthn')
	mintAssertionToken = waMod.__test.mintAssertionToken
})

// ─── Helpers ──────────────────────────────────────────────────────

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

function createMockReq(bodyStr: string, headers: Record<string, string> = {}) {
	const req: any = {
		headers,
		_body: bodyStr,
		on(event: string, cb: Function) {
			if (event === 'data') {
				if (req._body) cb(Buffer.from(req._body))
			}
			if (event === 'end') cb()
			return req
		},
	}
	return req
}

function getJson(res: any): any {
	return JSON.parse(res.body)
}

// ─── Tests ────────────────────────────────────────────────────────

describe('POST /v1/kill-switch/chaos — WebAuthn assertion authorization', () => {
	it('valid assertion token → transition executes', async () => {
		const token = mintAssertionToken('human-a', 'cred-a', 'kill:fleet').token
		const res = createMockRes()
		const req = createMockReq(
			JSON.stringify({
				state: 'STOPPED',
				reason: 'human kill',
				target: 'fleet',
			}),
			{ authorization: `Assertion ${token}` },
		)

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		const body = getJson(res)
		expect(body.newState).toBe('STOPPED')
		expect(body.initiatedBy).toBe('human-a')
		expect(mockTransitionTo).toHaveBeenCalledTimes(1)
	})

	it('Bearer token REJECTED — only WebAuthn assertion accepted', async () => {
		const res = createMockRes()
		const req = createMockReq(JSON.stringify({ state: 'STOPPED' }), {
			authorization: 'Bearer legacy-bearer-token',
		})

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).code).toBe('ASSERTION_REQUIRED')
		expect(mockTransitionTo).not.toHaveBeenCalled()
	})

	it('API key (x-api-key) REJECTED — service account cannot kill', async () => {
		const res = createMockRes()
		const req = createMockReq(JSON.stringify({ state: 'STOPPED' }), {
			'x-api-key': 'leaked-service-key',
		})

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).code).toBe('ASSERTION_REQUIRED')
		expect(mockTransitionTo).not.toHaveBeenCalled()
	})

	it('valid admin session cookie → transition executes (session fallback)', async () => {
		const res = createMockRes()
		const req = createMockReq(
			JSON.stringify({ state: 'STOPPED', reason: 'dashboard kill' }),
			{ cookie: 'better-auth.session_token=admin-session' },
		)

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
		expect(getJson(res).initiatedBy).toBe('admin@alygn.com')
		expect(mockTransitionTo).toHaveBeenCalledTimes(1)
	})

	it('non-admin session cookie REJECTED (403)', async () => {
		const res = createMockRes()
		const req = createMockReq(JSON.stringify({ state: 'STOPPED' }), {
			cookie: 'better-auth.session_token=viewer-session',
		})

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(mockTransitionTo).not.toHaveBeenCalled()
	})

	it('no authorization header REJECTED', async () => {
		const res = createMockRes()
		const req = createMockReq(JSON.stringify({ state: 'STOPPED' }))

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).code).toBe('ASSERTION_REQUIRED')
	})

	it('assertion token bound to wrong action REJECTED', async () => {
		// Token minted for kill:machine-1, but request targets fleet
		const token = mintAssertionToken(
			'human-a',
			'cred-a',
			'kill:machine-1',
		).token
		const res = createMockRes()
		const req = createMockReq(
			JSON.stringify({ state: 'STOPPED', target: 'fleet' }),
			{ authorization: `Assertion ${token}` },
		)

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).code).toBe('TOKEN_ACTION_MISMATCH')
		expect(mockTransitionTo).not.toHaveBeenCalled()
	})

	it('garbage assertion token REJECTED', async () => {
		const res = createMockRes()
		const req = createMockReq(JSON.stringify({ state: 'STOPPED' }), {
			authorization: 'Assertion garbage-token',
		})

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(mockTransitionTo).not.toHaveBeenCalled()
	})

	it('invalid state still 400 before assertion check', async () => {
		const res = createMockRes()
		const req = createMockReq(JSON.stringify({ state: 'NOT_A_STATE' }), {
			authorization: 'Assertion whatever',
		})

		const handled = await handleKillSwitchRoutes(
			'POST',
			'/v1/kill-switch/chaos',
			req,
			res,
			mockService,
			'10.0.0.1',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(400)
		expect(mockTransitionTo).not.toHaveBeenCalled()
	})
})
