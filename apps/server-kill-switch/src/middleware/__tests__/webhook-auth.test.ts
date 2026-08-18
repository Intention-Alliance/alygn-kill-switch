/**
 * Webhook Auth Middleware tests (ADR-139)
 *
 * Covers: key lookup, IP-map binding, machine/zone/model scope,
 * first-access hold + verification, and the key↔kill isolation
 * (a webhook key can NEVER authorize a kill — fail-closed).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mockDbIndex } from '../../test-utils/db-mock'

process.env.AUDIT_HMAC_KEY = 'test-audit-hmac-key-0123456789abcdef'
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-0123456789abcdef'
const { sqlite } = mockDbIndex()

const { webhookAuth, isKnownAccess, verifyFirstAccess, __test } = await import(
	'../../middleware/webhook-auth'
)
const { hashingService } = await import('../../services/hashing')

const { isIpMapped } = __test

// ─── Helpers ──────────────────────────────────────────────────────

function makeKey(overrides: Record<string, unknown> = {}) {
	const plaintext = hashingService.generateApiKey()
	const id = `whk_test_${Math.random().toString(36).slice(2, 10)}`
	const merged: Record<string, unknown> = {
		id,
		orgId: 'org-1',
		hashedSecret: hashingService.hashApiKey(plaintext),
		keyPrefix: plaintext.slice(0, 8),
		name: 'test-key',
		allowedMachines: JSON.stringify(['m1', 'm2']),
		allowedZones: JSON.stringify(['prod', 'staging']),
		allowedModels: JSON.stringify(['model-a', 'model-b']),
		ipMap: JSON.stringify(['10.0.0.1', '10.0.0.2']),
		createdByAdminId: 'admin',
		createdAt: new Date(),
		...overrides,
	}
	sqlite
		.query(
			`INSERT INTO webhook_keys
       (id, org_id, hashed_secret, key_prefix, name, allowed_machines, allowed_zones,
        allowed_models, ip_map, created_by_admin_id, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			merged.id as string,
			merged.orgId as string,
			merged.hashedSecret as string,
			merged.keyPrefix as string,
			merged.name as string,
			merged.allowedMachines as string,
			merged.allowedZones as string,
			merged.allowedModels as string,
			merged.ipMap as string,
			merged.createdByAdminId as string,
			Math.floor((merged.createdAt as Date).getTime() / 1000),
			merged.revokedAt
				? Math.floor((merged.revokedAt as Date).getTime() / 1000)
				: null,
		)
	return { id, plaintext }
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
	// Keep the DB file (module-level initDatabase created it once). Just
	// clear tables in beforeEach. Do NOT delete the directory here.
})

describe('webhookAuth — key↔kill isolation (ADR-136 §4)', () => {
	it('rejects a webhook key on a kill route (fail-closed)', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			isKillRoute: true,
		})
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.status).toBe(403)
			expect(result.code).toBe('WEBHOOK_KEY_CANNOT_KILL')
		}
	})

	it('rejects a kill route even with a valid key + IP (structural separation)', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			requestedMachine: 'm1',
			isKillRoute: true,
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('WEBHOOK_KEY_CANNOT_KILL')
	})
})

describe('webhookAuth — key lookup', () => {
	it('rejects a missing key', async () => {
		const result = await webhookAuth({ rawKey: null, clientIp: '10.0.0.1' })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('MISSING_API_KEY')
	})

	it('rejects a malformed (too short) key', async () => {
		const result = await webhookAuth({ rawKey: 'short', clientIp: '10.0.0.1' })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('MALFORMED_API_KEY')
	})

	it('rejects an unknown key', async () => {
		const result = await webhookAuth({
			rawKey: hashingService.generateApiKey(),
			clientIp: '10.0.0.1',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('UNKNOWN_KEY')
	})

	it('rejects a revoked key', async () => {
		const { plaintext } = makeKey({ revokedAt: new Date() })
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('KEY_REVOKED')
	})
})

describe('webhookAuth — IP binding (ADR-139 §3)', () => {
	it('rejects a source IP not in the key IP map', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '203.0.113.99',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.status).toBe(401)
			expect(result.code).toBe('IP_NOT_MAPPED')
		}
	})

	it('rejects when the IP map is empty (fail-closed)', async () => {
		const { plaintext } = makeKey({ ipMap: '[]' })
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('IP_NOT_MAPPED')
	})

	it('isIpMapped matches an allowed IP and rejects others', () => {
		expect(isIpMapped('10.0.0.1', ['10.0.0.1', '10.0.0.2'])).toBe(true)
		expect(isIpMapped('10.0.0.9', ['10.0.0.1', '10.0.0.2'])).toBe(false)
		expect(isIpMapped('10.0.0.1', [])).toBe(false)
	})
})

describe('webhookAuth — scope (ADR-139 §2)', () => {
	it('rejects a machine not in the key allowed machines', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			requestedMachine: 'm-other',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.status).toBe(403)
			expect(result.code).toBe('MACHINE_NOT_SCOPED')
		}
	})

	it('rejects a zone not in the key allowed zones', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			requestedZone: 'dev',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('ZONE_NOT_SCOPED')
	})

	it('rejects a model not in the key allowed models', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			requestedModel: 'model-other',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('MODEL_NOT_SCOPED')
	})

	it('accepts a machine/zone/model within scope', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			requestedMachine: 'm1',
			requestedZone: 'prod',
			requestedModel: 'model-a',
		})
		// Either first-access hold (202) or success — but never a scope rejection.
		expect(result.ok || (!result.ok && result.status === 202)).toBe(true)
	})
})

describe('webhookAuth — first-access verification (ADR-139 §4)', () => {
	it('holds the call on first access from a new IP/device (challenge raised)', async () => {
		const { plaintext } = makeKey()
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			deviceFp: 'dev-1',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.status).toBe(202)
			expect(result.code).toBe('FIRST_ACCESS_REQUIRED')
			expect(result.challenge?.method).toBe('otp+passkey')
			expect(result.challenge?.challengeId).toBeTruthy()
		}
	})

	it('proceeds directly after the IP/device is verified', async () => {
		const { id, plaintext } = makeKey()
		await verifyFirstAccess(id, '10.0.0.1', 'dev-1', 'admin')
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.1',
			deviceFp: 'dev-1',
		})
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.context.orgId).toBe('org-1')
			expect(result.context.keyId).toBe(id)
		}
	})

	it('re-challenges a new IP/device even after another was verified', async () => {
		const { id, plaintext } = makeKey()
		await verifyFirstAccess(id, '10.0.0.1', 'dev-1', 'admin')
		// Different IP → re-challenge
		const result = await webhookAuth({
			rawKey: plaintext,
			clientIp: '10.0.0.2',
			deviceFp: 'dev-2',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('FIRST_ACCESS_REQUIRED')
	})

	it('isKnownAccess reflects verification state', async () => {
		const { id } = makeKey()
		expect(await isKnownAccess(id, '10.0.0.1', 'dev-1')).toBe(false)
		await verifyFirstAccess(id, '10.0.0.1', 'dev-1', 'admin')
		expect(await isKnownAccess(id, '10.0.0.1', 'dev-1')).toBe(true)
	})
})
