/**
 * KillSwitchService → Audit Chain integration tests (P0 critical fix)
 *
 * Regression coverage for the fix that wires the tamper-evident audit
 * chain (ADR-140) into kill-switch state transitions. Previously
 * `transitionTo` wrote directly via `db.insert(killSwitchAuditLog)`,
 * leaving every entry with `prev_hash: "GENESIS"` and `self_hash: ""` —
 * the chain was NOT protecting state transitions.
 *
 * Covers:
 *   1. A fresh transition produces a properly chained entry (real
 *      prev_hash + self_hash + server_hmac) and `POST /v1/audit/verify`
 *      returns `{ ok: true }`.
 *   2. Tampering a `self_hash` in SQLite → verify returns
 *      `{ ok: false, brokenAt }`.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mockDbIndex } from '../../test-utils/db-mock'

process.env.AUDIT_HMAC_KEY = 'test-audit-hmac-key-0123456789abcdef'
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-0123456789abcdef'

// Isolated in-memory DB per test file (Phase 4) — must be called BEFORE
// importing any module that imports `db/index`.
const { sqlite } = mockDbIndex()

// Mock loadTracing to return a no-op tracer (mirrors kill-switch.test.ts).
mock.module('../../infra-loader', () => ({
	loadTracing: async () => ({
		recordSpan: async (
			_name: string,
			_attrs: Record<string, unknown>,
			fn: (span: {
				spanContext: () => { traceId: string }
				setAttribute: (k: string, v: unknown) => void
			}) => Promise<unknown>,
		) => {
			const span = {
				spanContext: () => ({ traceId: 'mock-trace-id' }),
				setAttribute: () => {},
			}
			return fn(span)
		},
	}),
}))

// Mock config so the traffic-pause hook is enabled (mirrors kill-switch.test.ts)
// and the webauthn service can mint assertion tokens (needs webauthn config).
mock.module('../../config', () => ({
	getConfig: () => ({
		server: { port: 3000, host: '0.0.0.0' },
		env: 'test',
		redis: { urls: [] },
		webauthn: { assertionTokenTtlMs: 120_000 },
	}),
	isFeatureEnabled: (key: string) => key === 'killSwitchTrafficPauseEnabled',
}))

const { KillSwitchService } = await import('../kill-switch')
const { verifyChain } = await import('../audit-chain')
const { handleAuditRoutes } = await import('../../routes/audit')
const { __test: webauthnTest } = await import('../../services/webauthn')
const { resetTrafficPauseState } = await import('../traffic-pause')

// ─── Test doubles ──────────────────────────────────────────────────

let internalState: string | null = null

function createMockRedis() {
	return {
		getClient: async () => ({}),
		releaseClient: () => {},
		chaosKillSwitchKey: () => 'ks:state',
		get: async () => internalState,
		set: async (_k: string, val: string) => {
			internalState = val
			return 'OK'
		},
		del: async () => 0,
		publish: async () => 0,
		subscribe: async () => {},
		healthCheck: async () => ({ redis: 'OK' }),
		acquire: async () => ({}),
		release: () => {},
		withClient: async <T>(fn: (client: unknown) => Promise<T>): Promise<T> =>
			fn({}),
		connect: async () => {},
	}
}

function createService() {
	return new KillSwitchService({
		redis: createMockRedis() as never,
		authToken: 'test-bearer-token',
		apiKey: 'test-api-key',
	})
}

function mintToken(action: string): string {
	return webauthnTest.mintAssertionToken('admin-user', 'cred-1', action).token
}

function makeReq(overrides: Record<string, unknown> = {}) {
	const base = {
		method: 'POST',
		url: '/v1/audit/verify',
		headers: {},
		body: '',
		ip: '127.0.0.1',
		...overrides,
	}
	const req: {
		method: string
		url: string
		headers: Record<string, string | string[] | undefined>
		body: string
		ip: string
		on: (event: string, cb: (chunk?: Buffer) => void) => unknown
	} = {
		...base,
		on(event: string, cb: (chunk?: Buffer) => void) {
			if (event === 'data' && base.body) cb(Buffer.from(base.body))
			if (event === 'end') cb()
			return req
		},
	}
	return req
}

function makeRes() {
	const calls: { status: number; body: unknown }[] = []
	return {
		calls,
		writeHead(status: number) {
			calls.push({ status, body: undefined })
		},
		end(data?: string) {
			if (calls.length === 0) calls.push({ status: 200, body: undefined })
			const last = calls[calls.length - 1]
			last.body = data ? JSON.parse(data) : undefined
		},
	}
}

// ─── Setup / teardown ──────────────────────────────────────────────

beforeEach(() => {
	internalState = null
	resetTrafficPauseState()
	sqlite.run('DROP TABLE IF EXISTS kill_switch_audit_log')
	sqlite.run('DROP TABLE IF EXISTS chain_anchor')
	sqlite.run(`
    CREATE TABLE kill_switch_audit_log (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      previous_state TEXT NOT NULL,
      new_state TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      machine_id TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      metadata TEXT,
      prev_hash TEXT NOT NULL DEFAULT 'GENESIS',
      self_hash TEXT NOT NULL DEFAULT '',
      actor_signature TEXT,
      server_hmac TEXT NOT NULL DEFAULT '',
      plain_explanation TEXT NOT NULL DEFAULT ''
    )
  `)
	sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS kill_switch_audit_log_no_update
    BEFORE UPDATE ON kill_switch_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_audit_log is append-only (ADR-140): UPDATE forbidden');
    END
  `)
	sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS kill_switch_audit_log_no_delete
    BEFORE DELETE ON kill_switch_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_audit_log is append-only (ADR-140): DELETE forbidden');
    END
  `)
	sqlite.run(`
    CREATE TABLE IF NOT EXISTS chain_anchor (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      chain_head_hash TEXT NOT NULL,
      entry_count INTEGER NOT NULL DEFAULT 0,
      signed_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)
})

afterEach(() => {
	// Tables cleared in beforeEach; keep the shared in-memory DB.
})

// ─── Tests ─────────────────────────────────────────────────────────

describe('kill-switch → audit chain wiring (P0 fix)', () => {
	it('transitionTo writes a properly chained entry (real prev_hash + self_hash + server_hmac)', async () => {
		internalState = 'ARMED'
		const service = createService()

		await service.transitionTo('RUNNING')

		const rows = sqlite
			.query('SELECT * FROM kill_switch_audit_log ORDER BY rowid ASC')
			.all() as Record<string, unknown>[]
		expect(rows.length).toBe(1)

		const entry = rows[0]
		// First real entry chains off GENESIS (no seed written in this test).
		expect(entry.prev_hash).toBe('GENESIS')
		expect(entry.self_hash).toMatch(/^[0-9a-f]{64}$/)
		expect(entry.server_hmac).toMatch(/^[0-9a-f]{64}$/)
		expect(entry.plain_explanation).toContain('RUNNING')
	})

	it('two transitions form a linked chain (second prev_hash = first self_hash)', async () => {
		internalState = 'ARMED'
		const service = createService()

		await service.transitionTo('RUNNING')
		internalState = 'RUNNING'
		await service.transitionTo('LOCKED')

		const rows = sqlite
			.query('SELECT * FROM kill_switch_audit_log ORDER BY rowid ASC')
			.all() as Record<string, unknown>[]
		expect(rows.length).toBe(2)
		expect(rows[1].prev_hash).toBe(rows[0].self_hash)
	})

	it('POST /v1/audit/verify returns { ok: true } after a fresh transition', async () => {
		internalState = 'ARMED'
		const service = createService()
		await service.transitionTo('RUNNING')

		const res = makeRes()
		const handled = await handleAuditRoutes(
			'POST',
			'/v1/audit/verify',
			makeReq({
				headers: { authorization: `Assertion ${mintToken('audit:verify')}` },
			}),
			res,
		)

		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(200)
		const body = res.calls[0].body as {
			ok: boolean
			total: number
			brokenAt: string | null
		}
		expect(body.ok).toBe(true)
		expect(body.total).toBe(1)
		expect(body.brokenAt).toBeNull()
	})

	it('verifyChain returns ok:true after a fresh transition (direct service check)', async () => {
		internalState = 'ARMED'
		const service = createService()
		await service.transitionTo('RUNNING')

		const result = await verifyChain()
		expect(result.ok).toBe(true)
		expect(result.total).toBe(1)
		expect(result.brokenAt).toBeNull()
	})

	it('tampering a self_hash → verify returns { ok: false, brokenAt }', async () => {
		internalState = 'ARMED'
		const service = createService()
		await service.transitionTo('RUNNING')
		internalState = 'RUNNING'
		await service.transitionTo('LOCKED')

		// Tamper: overwrite the first entry's self_hash directly in SQLite.
		// The trigger blocks UPDATE, so drop it to simulate an attacker with
		// raw DB access (the exact threat ADR-140 addresses).
		sqlite.run('DROP TRIGGER IF EXISTS kill_switch_audit_log_no_update')
		sqlite.run(
			"UPDATE kill_switch_audit_log SET self_hash='deadbeef' WHERE new_state='RUNNING'",
		)

		const res = makeRes()
		const handled = await handleAuditRoutes(
			'POST',
			'/v1/audit/verify',
			makeReq({
				headers: { authorization: `Assertion ${mintToken('audit:verify')}` },
			}),
			res,
		)

		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(409)
		const body = res.calls[0].body as { ok: boolean; brokenAt: string | null }
		expect(body.ok).toBe(false)
		expect(body.brokenAt).not.toBeNull()
	})
})
