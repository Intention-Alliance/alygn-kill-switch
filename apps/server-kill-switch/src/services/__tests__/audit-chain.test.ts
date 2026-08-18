/**
 * Immutable Audit Chain tests (ADR-140)
 *
 * Covers: hash-chain integrity, tamper detection, server HMAC,
 * chain verification, daily anchor signing, and the append-only
 * guarantee (via the SQLite triggers).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mockDbIndex } from '../../test-utils/db-mock'

// ─── Isolated in-memory DB per test file (Phase 4) ────────────────
// Mock db/index with a real in-memory SQLite DB so this file never
// touches the shared singleton (test isolation, per Phase 3 review).
process.env.AUDIT_HMAC_KEY = 'test-audit-hmac-key-0123456789abcdef'
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-0123456789abcdef'
const { sqlite } = mockDbIndex()

const {
	appendAuditEntry,
	verifyChain,
	anchorChainHead,
	computeSelfHash,
	computeServerHmac,
	signAnchorPayload,
} = await import('../../services/audit-chain')

beforeEach(() => {
	// Clear the audit log between tests (direct SQL — the trigger blocks
	// UPDATE/DELETE, so we drop + recreate the table for isolation).
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
	// Recreate the INSERT-only triggers (the production db/index.ts adds
	// these; we recreate them here since we dropped the table).
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
	// Keep the DB file (module-level initDatabase created it once). Just
	// clear tables in beforeEach. Do NOT delete the directory here — that
	// would break the shared connection for subsequent tests.
})

function sampleEntry(overrides: Record<string, unknown> = {}) {
	return {
		id: 'e1',
		timestamp: new Date(1700000000000),
		userId: 'admin',
		reason: 'test',
		previousState: 'A',
		newState: 'B',
		traceId: 'tr1',
		machineId: null,
		severity: 'info',
		metadata: null,
		prevHash: 'GENESIS',
		actorSignature: null,
		plainExplanation: 'test entry',
		...overrides,
	}
}

describe('audit-chain — hash computation', () => {
	it('self_hash is deterministic for identical input', () => {
		const a = computeSelfHash(sampleEntry())
		const b = computeSelfHash(sampleEntry())
		expect(a).toBe(b)
		expect(a).toMatch(/^[0-9a-f]{64}$/)
	})

	it('self_hash changes when the entry content changes', () => {
		const a = computeSelfHash(sampleEntry())
		const b = computeSelfHash(sampleEntry({ reason: 'different' }))
		expect(a).not.toBe(b)
	})

	it('self_hash changes when prevHash changes (chain link is part of hash)', () => {
		const a = computeSelfHash(sampleEntry())
		const b = computeSelfHash(sampleEntry({ prevHash: 'other-hash' }))
		expect(a).not.toBe(b)
	})

	it('server_hmac is deterministic and 64-hex', () => {
		const entry = { ...sampleEntry(), selfHash: computeSelfHash(sampleEntry()) }
		const hmac = computeServerHmac(entry)
		expect(hmac).toMatch(/^[0-9a-f]{64}$/)
		expect(computeServerHmac(entry)).toBe(hmac)
	})

	it('server_hmac changes when the entry changes', () => {
		const e1 = { ...sampleEntry(), selfHash: computeSelfHash(sampleEntry()) }
		const e2 = {
			...sampleEntry({ reason: 'x' }),
			selfHash: computeSelfHash(sampleEntry({ reason: 'x' })),
		}
		expect(computeServerHmac(e1)).not.toBe(computeServerHmac(e2))
	})
})

describe('audit-chain — append + chain integrity', () => {
	it('first entry has prevHash GENESIS', async () => {
		const entry = await appendAuditEntry({
			userId: 'admin',
			reason: 'first',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'first entry',
		})
		expect(entry.prevHash).toBe('GENESIS')
		expect(entry.selfHash).toMatch(/^[0-9a-f]{64}$/)
		expect(entry.serverHmac).toMatch(/^[0-9a-f]{64}$/)
	})

	it('second entry links to the first via prevHash', async () => {
		const first = await appendAuditEntry({
			userId: 'admin',
			reason: 'first',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'first',
		})
		const second = await appendAuditEntry({
			userId: 'admin',
			reason: 'second',
			previousState: 'B',
			newState: 'C',
			plainExplanation: 'second',
		})
		expect(second.prevHash).toBe(first.selfHash)
	})

	it('chain verifies cleanly after sequential appends', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		await appendAuditEntry({
			userId: 'u2',
			reason: 'b',
			previousState: 'B',
			newState: 'C',
			plainExplanation: 'b',
		})
		await appendAuditEntry({
			userId: 'u3',
			reason: 'c',
			previousState: 'C',
			newState: 'D',
			plainExplanation: 'c',
		})
		const result = await verifyChain()
		expect(result.ok).toBe(true)
		expect(result.total).toBe(3)
		expect(result.brokenAt).toBeNull()
	})

	it('empty chain verifies as ok', async () => {
		const result = await verifyChain()
		expect(result.ok).toBe(true)
		expect(result.total).toBe(0)
	})
})

describe('audit-chain — tamper detection', () => {
	it('detects a modified entry (self_hash mismatch)', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		await appendAuditEntry({
			userId: 'u2',
			reason: 'b',
			previousState: 'B',
			newState: 'C',
			plainExplanation: 'b',
		})

		// Tamper: change the reason of the first entry directly in the DB.
		// The trigger blocks UPDATE, so we must drop the trigger to simulate
		// an attacker with raw DB access (the exact threat ADR-140 addresses).
		sqlite.run('DROP TRIGGER IF EXISTS kill_switch_audit_log_no_update')
		sqlite.run(
			"UPDATE kill_switch_audit_log SET reason='TAMPERED' WHERE reason='a'",
		)

		const result = await verifyChain()
		expect(result.ok).toBe(false)
		expect(result.brokenAt).not.toBeNull()
		expect(result.reason).toBe('self_hash_mismatch')
	})

	it('detects a broken chain link (prev_hash mismatch)', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		await appendAuditEntry({
			userId: 'u2',
			reason: 'b',
			previousState: 'B',
			newState: 'C',
			plainExplanation: 'b',
		})

		// Break the link: change the second entry's prev_hash AND recompute its
		// self_hash so the ONLY inconsistency is the chain link (prev_hash no
		// longer matches the previous entry's self_hash).
		sqlite.run('DROP TRIGGER IF EXISTS kill_switch_audit_log_no_update')
		const row = sqlite
			.query("SELECT * FROM kill_switch_audit_log WHERE reason='b'")
			.get() as Record<string, unknown>
		const recomputed = computeSelfHash({
			id: String(row.id),
			timestamp: new Date(Number(row.timestamp) * 1000),
			userId: String(row.user_id),
			reason: String(row.reason),
			previousState: String(row.previous_state),
			newState: String(row.new_state),
			traceId: String(row.trace_id),
			machineId: row.machine_id ? String(row.machine_id) : null,
			severity: String(row.severity),
			metadata: row.metadata ? String(row.metadata) : null,
			prevHash: 'WRONG',
			actorSignature: row.actor_signature ? String(row.actor_signature) : null,
			plainExplanation: String(row.plain_explanation),
		})
		sqlite.run(
			"UPDATE kill_switch_audit_log SET prev_hash='WRONG', self_hash=? WHERE reason='b'",
			[recomputed],
		)

		const result = await verifyChain()
		expect(result.ok).toBe(false)
		expect(result.reason).toBe('chain_link_broken')
	})

	it('detects a server_hmac mismatch (recomputed chain)', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})

		// Attacker recomputes self_hash but not the server HMAC.
		sqlite.run('DROP TRIGGER IF EXISTS kill_switch_audit_log_no_update')
		sqlite.run(
			"UPDATE kill_switch_audit_log SET server_hmac='0000000000000000000000000000000000000000000000000000000000000000'",
		)

		const result = await verifyChain()
		expect(result.ok).toBe(false)
		expect(result.reason).toBe('server_hmac_mismatch')
	})
})

describe('audit-chain — append-only guarantee (triggers)', () => {
	it('UPDATE on a real row is blocked by the trigger', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		expect(() => {
			sqlite.run("UPDATE kill_switch_audit_log SET reason='x' WHERE reason='a'")
		}).toThrow(/append-only/)
	})

	it('DELETE on a real row is blocked by the trigger', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		expect(() => {
			sqlite.run("DELETE FROM kill_switch_audit_log WHERE reason='a'")
		}).toThrow(/append-only/)
	})
})

describe('audit-chain — anchor signing (ADR-140 §6.1)', () => {
	it('signAnchorPayload produces a signed payload with a valid HMAC', () => {
		const payload = {
			date: '2026-08-18',
			chainHeadHash: 'abc123',
			entryCount: 5,
		}
		const signed = signAnchorPayload(payload)
		const parsed = JSON.parse(signed)
		expect(parsed.date).toBe('2026-08-18')
		expect(parsed.chainHeadHash).toBe('abc123')
		expect(parsed.entryCount).toBe(5)
		expect(parsed.signature).toMatch(/^[0-9a-f]{64}$/)
	})

	it('anchorChainHead creates a daily anchor with the current head hash', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		const anchor = await anchorChainHead('2026-08-18')
		expect(anchor.date).toBe('2026-08-18')
		expect(anchor.entryCount).toBe(1)
		expect(anchor.chainHeadHash).toMatch(/^[0-9a-f]{64}$/)
		expect(anchor.signedPayload).toContain('2026-08-18')
	})

	it('verifyChain reports anchoredAt when the head matches the daily anchor', async () => {
		await appendAuditEntry({
			userId: 'u1',
			reason: 'a',
			previousState: 'A',
			newState: 'B',
			plainExplanation: 'a',
		})
		await anchorChainHead('2026-08-18')
		const result = await verifyChain()
		expect(result.ok).toBe(true)
		expect(result.anchoredAt).toBe('2026-08-18')
	})
})
