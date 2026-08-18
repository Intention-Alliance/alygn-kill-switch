/**
 * Audit Route tests (ADR-140 §6)
 *
 * Covers: the /v1/audit/verify endpoint (chain integrity), the
 * /v1/audit/anchor endpoint (daily anchor), and the WebAuthn assertion
 * gate (admin-only — a Bearer token / API key is rejected).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mockDbIndex } from '../../test-utils/db-mock'

process.env.AUDIT_HMAC_KEY = 'test-audit-hmac-key-0123456789abcdef'
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-0123456789abcdef'

const { sqlite } = mockDbIndex()
const { handleAuditRoutes } = await import('../../routes/audit')
const { appendAuditEntry } = await import('../../services/audit-chain')
const { __test: webauthnTest } = await import('../../services/webauthn')

// Mint a real assertion token bound to the given action (via the webauthn
// service's test hook).
function mintToken(action: string): string {
	return webauthnTest.mintAssertionToken('admin-user', 'cred-1', action).token
}

// ─── Helpers ──────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}) {
	const base = {
		method: 'POST',
		url: '/v1/audit/verify',
		headers: {},
		body: '',
		ip: '127.0.0.1',
		...overrides,
	}
	// parseBody reads via req.on('data'/'end') — provide a node-style stream.
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

beforeEach(() => {
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
	// Keep DB file; tables cleared in beforeEach.
})

describe('audit routes — WebAuthn gate', () => {
	it('rejects /v1/audit/verify without an assertion token', async () => {
		const res = makeRes()
		const handled = await handleAuditRoutes(
			'POST',
			'/v1/audit/verify',
			makeReq(),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(403)
	})

	it('rejects /v1/audit/anchor without an assertion token', async () => {
		const res = makeRes()
		const handled = await handleAuditRoutes(
			'POST',
			'/v1/audit/anchor',
			makeReq({ url: '/v1/audit/anchor' }),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(403)
	})

	it('rejects a Bearer token (not a WebAuthn assertion)', async () => {
		const res = makeRes()
		const handled = await handleAuditRoutes(
			'POST',
			'/v1/audit/verify',
			makeReq({ headers: { authorization: 'Bearer some-token' } }),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(403)
	})

	it('returns false for non-audit paths', async () => {
		const res = makeRes()
		const handled = await handleAuditRoutes('POST', '/v1/other', makeReq(), res)
		expect(handled).toBe(false)
	})
})

describe('audit routes — verify with a valid assertion token', () => {
	it('returns ok:true for an intact chain', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
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
		const body = res.calls[0].body as { ok: boolean; total: number }
		expect(body.ok).toBe(true)
		expect(body.total).toBe(1)
	})

	it('rejects a token bound to a different action', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		const res = makeRes()
		const handled = await handleAuditRoutes(
			'POST',
			'/v1/audit/verify',
			makeReq({
				headers: { authorization: `Assertion ${mintToken('audit:anchor')}` },
			}),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(403)
	})
})

describe('audit routes — anchor', () => {
	it('creates a daily anchor with a valid assertion token', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		const res = makeRes()
		const handled = await handleAuditRoutes(
			'POST',
			'/v1/audit/anchor',
			makeReq({
				url: '/v1/audit/anchor',
				headers: { authorization: `Assertion ${mintToken('audit:anchor')}` },
				body: JSON.stringify({ date: '2026-08-18' }),
			}),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(200)
		const body = res.calls[0].body as {
			date: string
			entryCount: number
			signedPayload: string
		}
		expect(body.date).toBe('2026-08-18')
		expect(body.entryCount).toBe(1)
		expect(body.signedPayload).toContain('2026-08-18')
	})
})
