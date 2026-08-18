/**
 * Webhook Key Lifecycle Route tests (ADR-139 §5)
 *
 * Covers: create / rotate / revoke / verify-access, the ADMIN_UI_API_KEY
 * gate, and that every lifecycle event writes to the immutable audit log
 * with a plain-language explanation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mockDbIndex } from '../../test-utils/db-mock'

process.env.AUDIT_HMAC_KEY = 'test-audit-hmac-key-0123456789abcdef'
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-0123456789abcdef'
process.env.ADMIN_UI_API_KEY = 'test-admin-ui-key-0123456789abcdef'

const { sqlite } = mockDbIndex()
const { handleWebhookKeysRoutes } = await import('../../routes/webhook-keys')

// ─── Helpers ──────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}) {
	return {
		method: 'POST',
		url: '/v1/admin/webhook-keys',
		headers: { authorization: 'Bearer test-admin-ui-key-0123456789abcdef' },
		body: '',
		ip: '127.0.0.1',
		...overrides,
	}
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
	sqlite.run('DROP TABLE IF EXISTS webhook_keys')
	sqlite.run('DROP TABLE IF EXISTS first_access')
	sqlite.run(`
    CREATE TABLE webhook_keys (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      hashed_secret TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      allowed_machines TEXT NOT NULL DEFAULT '[]',
      allowed_zones TEXT NOT NULL DEFAULT '[]',
      allowed_models TEXT NOT NULL DEFAULT '[]',
      ip_map TEXT NOT NULL DEFAULT '[]',
      created_by_admin_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rotated_at INTEGER,
      revoked_at INTEGER,
      last_used_at INTEGER
    )
  `)
	sqlite.run(`
    CREATE TABLE first_access (
      id TEXT PRIMARY KEY,
      key_id TEXT NOT NULL,
      ip TEXT NOT NULL,
      device_fp TEXT NOT NULL,
      verified_at INTEGER,
      challenge_id TEXT,
      created_at INTEGER NOT NULL
    )
  `)
	sqlite.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS first_access_key_ip_device_unique ON first_access(key_id, ip, device_fp)`,
	)
})

afterEach(() => {
	// Keep DB file; tables cleared in beforeEach.
})

describe('webhook-keys — auth gate', () => {
	it('rejects without a valid ADMIN_UI_API_KEY', async () => {
		const res = makeRes()
		const handled = await handleWebhookKeysRoutes(
			'GET',
			'/v1/admin/webhook-keys',
			makeReq({ headers: {} }),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(401)
	})

	it('returns false for non-webhook-keys paths', async () => {
		const res = makeRes()
		const handled = await handleWebhookKeysRoutes(
			'GET',
			'/v1/other',
			makeReq(),
			res,
		)
		expect(handled).toBe(false)
	})
})

describe('webhook-keys — create', () => {
	it('creates a key and returns the plaintext once', async () => {
		const res = makeRes()
		const handled = await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'mcp-prod',
					ipMap: ['10.0.0.1'],
					allowedMachines: ['m1'],
					allowedZones: ['prod'],
					allowedModels: ['model-a'],
				}),
			}),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(201)
		const body = res.calls[0].body as Record<string, unknown>
		expect(body.key).toBeTruthy()
		expect(String(body.key).startsWith('wk_')).toBe(true)
		expect(body.orgId).toBe('org-1')
	})

	it('rejects a missing orgId', async () => {
		const res = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({ body: JSON.stringify({ name: 'x', ipMap: ['10.0.0.1'] }) }),
			res,
		)
		expect(res.calls[0].status).toBe(400)
	})

	it('rejects an empty ipMap (fail-closed)', async () => {
		const res = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({ orgId: 'org-1', name: 'x', ipMap: [] }),
			}),
			res,
		)
		expect(res.calls[0].status).toBe(400)
	})

	it('writes a create event to the audit log with a plain explanation', async () => {
		const res = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'mcp-prod',
					ipMap: ['10.0.0.1'],
				}),
			}),
			res,
		)
		const audit = sqlite
			.query(
				"SELECT reason, plain_explanation FROM kill_switch_audit_log WHERE reason='Webhook key created'",
			)
			.get() as { reason: string; plain_explanation: string } | undefined
		expect(audit).toBeTruthy()
		expect(audit!.plain_explanation).toContain('org-1')
		expect(audit!.plain_explanation).toContain('mcp-prod')
	})
})

describe('webhook-keys — rotate', () => {
	it('rotates a key: revokes old, returns new plaintext', async () => {
		// Create first
		const createRes = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'k',
					ipMap: ['10.0.0.1'],
				}),
			}),
			createRes,
		)
		const created = createRes.calls[0].body as { id: string; key: string }

		const res = makeRes()
		const handled = await handleWebhookKeysRoutes(
			'POST',
			`/v1/admin/webhook-keys/${created.id}/rotate`,
			makeReq(),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(201)
		const body = res.calls[0].body as { key: string; revokedKeyId: string }
		expect(body.key).toBeTruthy()
		expect(body.key).not.toBe(created.key)
		expect(body.revokedKeyId).toBe(created.id)

		// Old key is revoked
		const old = sqlite.query('SELECT * FROM webhook_keys').all() as Record<
			string,
			unknown
		>[]
		const oldRow = old.find((r) => r.id === created.id)
		expect(oldRow?.revoked_at).toBeTruthy()
	})

	it('writes a rotate event to the audit log', async () => {
		const createRes = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'k',
					ipMap: ['10.0.0.1'],
				}),
			}),
			createRes,
		)
		const created = createRes.calls[0].body as { id: string }
		const res = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			`/v1/admin/webhook-keys/${created.id}/rotate`,
			makeReq(),
			res,
		)
		const audit = sqlite
			.query(
				"SELECT plain_explanation FROM kill_switch_audit_log WHERE reason='Webhook key rotated'",
			)
			.get() as { plain_explanation: string } | undefined
		expect(audit).toBeTruthy()
		expect(audit!.plain_explanation).toContain('rotated')
	})
})

describe('webhook-keys — revoke', () => {
	it('revokes a key (soft delete)', async () => {
		const createRes = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'k',
					ipMap: ['10.0.0.1'],
				}),
			}),
			createRes,
		)
		const created = createRes.calls[0].body as { id: string }

		const res = makeRes()
		const handled = await handleWebhookKeysRoutes(
			'DELETE',
			`/v1/admin/webhook-keys/${created.id}`,
			makeReq(),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(204)

		const row = (
			sqlite.query('SELECT * FROM webhook_keys').all() as Record<
				string,
				unknown
			>[]
		).find((r) => r.id === created.id)
		expect(row?.revoked_at).toBeTruthy()
	})

	it('writes a revoke event to the audit log', async () => {
		const createRes = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'k',
					ipMap: ['10.0.0.1'],
				}),
			}),
			createRes,
		)
		const created = createRes.calls[0].body as { id: string }
		const res = makeRes()
		await handleWebhookKeysRoutes(
			'DELETE',
			`/v1/admin/webhook-keys/${created.id}`,
			makeReq(),
			res,
		)
		const audit = sqlite
			.query(
				"SELECT plain_explanation FROM kill_switch_audit_log WHERE reason='Webhook key revoked'",
			)
			.get() as { plain_explanation: string } | undefined
		expect(audit).toBeTruthy()
	})
})

describe('webhook-keys — verify-access (first-access completion)', () => {
	it('completes first-access verification with a valid OTP', async () => {
		const createRes = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'k',
					ipMap: ['10.0.0.1'],
				}),
			}),
			createRes,
		)
		const created = createRes.calls[0].body as { id: string }

		const res = makeRes()
		const handled = await handleWebhookKeysRoutes(
			'POST',
			`/v1/admin/webhook-keys/${created.id}/verify-access`,
			makeReq({
				body: JSON.stringify({
					ip: '10.0.0.1',
					deviceFp: 'dev-1',
					otp: '123456',
				}),
			}),
			res,
		)
		expect(handled).toBe(true)
		expect(res.calls[0].status).toBe(200)

		const fa = sqlite
			.query(
				"SELECT verified_at FROM first_access WHERE key_id=? AND ip='10.0.0.1'",
			)
			.get(created.id) as { verified_at: number } | undefined
		expect(fa?.verified_at).toBeTruthy()
	})

	it('rejects an invalid OTP', async () => {
		const createRes = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			'/v1/admin/webhook-keys',
			makeReq({
				body: JSON.stringify({
					orgId: 'org-1',
					name: 'k',
					ipMap: ['10.0.0.1'],
				}),
			}),
			createRes,
		)
		const created = createRes.calls[0].body as { id: string }

		const res = makeRes()
		await handleWebhookKeysRoutes(
			'POST',
			`/v1/admin/webhook-keys/${created.id}/verify-access`,
			makeReq({ body: JSON.stringify({ ip: '10.0.0.1', otp: 'abc' }) }),
			res,
		)
		expect(res.calls[0].status).toBe(400)
	})
})
