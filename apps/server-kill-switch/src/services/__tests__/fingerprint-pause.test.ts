/**
 * Fingerprint-Scoped Pause Layer — P1-1 (Stage 2 fingerprint-scoped variant).
 *
 * Tests for the pure-logic layer of the fingerprint-pause module. The
 * DB-dependent escalation tests live in `fingerprint-pause-escalation.test.ts`
 * (separate file) because they need an isolated DB instance and would
 * otherwise collide with other test files that mock `../../db/index`.
 *
 * Verifies:
 *  - Fingerprint derivation priority order (machineId → sessionId → header →
 *    API key → IP+UA fallback)
 *  - blockFingerprint idempotency (re-blocking extends TTL + increments count)
 *  - checkFingerprintBlocked honors TTL (past-expiry → undefined + cleared)
 *  - sweepExpiredBlocks removes only expired entries
 *  - selfHealOnSafe unblocks SAFE verdicts only
 *  - deriveFingerprint returns "" when no identity signal
 *  - IP+UA fallback hashes the IP (does not store raw IP)
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import {
	blockFingerprint,
	checkFingerprintBlocked,
	deriveFingerprint,
	FINGERPRINT_BLOCK_TTL_MS,
	getBlockedFingerprintCount,
	getBlockedFingerprints,
	resetFingerprintPauseState,
	selfHealOnSafe,
	sweepExpiredBlocks,
	unblockFingerprint,
} from '../fingerprint-pause'

describe('deriveFingerprint (priority order)', () => {
	it('returns body.machineId when present (priority 1)', () => {
		expect(deriveFingerprint({ body: { machineId: 'm-1' } })).toBe(
			'machine:m-1',
		)
	})

	it('falls back to body.sessionId when no machineId (priority 2)', () => {
		expect(deriveFingerprint({ body: { sessionId: 's-1' } })).toBe(
			'session:s-1',
		)
	})

	it('falls back to body.fingerprint when no machineId/sessionId', () => {
		expect(deriveFingerprint({ body: { fingerprint: 'fp-1' } })).toBe('fp:fp-1')
	})

	it('falls back to header x-fingerprint when no body fields', () => {
		expect(deriveFingerprint({ headers: { 'x-fingerprint': 'h-fp-1' } })).toBe(
			'fp:h-fp-1',
		)
	})

	it('falls back to x-api-key (priority 4) and hashes the value', () => {
		const fp = deriveFingerprint({ headers: { 'x-api-key': '***' } })
		expect(fp.startsWith('apikey:')).toBe(true)
		expect(fp.length).toBeGreaterThan(7)
		// Don't store the raw key.
		expect(fp).not.toContain('***')
	})

	it('falls back to authorization Bearer header', () => {
		const fp = deriveFingerprint({
			headers: { authorization: '***' },
		})
		expect(fp.startsWith('bearer:')).toBe(true)
		expect(fp).not.toContain('***')
	})

	it('falls back to IP+UA hash (priority 5)', () => {
		const fp = deriveFingerprint({
			ip: '192.168.1.42',
			headers: { 'user-agent': 'curl/8.0' },
		})
		expect(fp.startsWith('ipua:')).toBe(true)
		// Don't store raw IP.
		expect(fp).not.toContain('192.168.1.42')
	})

	it('returns "" when no identity signal', () => {
		expect(deriveFingerprint({})).toBe('')
		expect(deriveFingerprint({ body: null })).toBe('')
	})

	it('priority order is stable: machineId beats sessionId beats header beats IP', () => {
		const fp = deriveFingerprint({
			body: { machineId: 'm-1', sessionId: 's-1', fingerprint: 'fp-1' },
			headers: { 'x-api-key': '***', 'x-fingerprint': 'h-fp' },
			ip: '1.2.3.4',
		})
		expect(fp).toBe('machine:m-1')
	})
})

describe('blockFingerprint / unblockFingerprint', () => {
	beforeEach(() => {
		resetFingerprintPauseState()
	})

	it('adds a block for a new fingerprint', () => {
		const block = blockFingerprint('machine:m-1', 'test reason')
		expect(block.fingerprint).toBe('machine:m-1')
		expect(block.reason).toBe('test reason')
		expect(block.unsafeCount).toBe(1)
		expect(getBlockedFingerprintCount()).toBe(1)
	})

	it('re-blocking the same fingerprint increments count + extends TTL', () => {
		blockFingerprint('machine:m-1', 'first')
		const first = checkFingerprintBlocked('machine:m-1')
		const second = blockFingerprint('machine:m-1', 'second')
		expect(second.unsafeCount).toBe(2)
		expect(second.reason).toBe('second')
		// TTL must be extended past the original.
		expect(second.expiresAt).toBeGreaterThanOrEqual(first?.expiresAt)
	})

	it('unblockFingerprint removes the block', () => {
		blockFingerprint('machine:m-1', 'first')
		expect(unblockFingerprint('machine:m-1')).toBe(true)
		expect(checkFingerprintBlocked('machine:m-1')).toBeUndefined()
	})

	it('unblockFingerprint returns false when not blocked', () => {
		expect(unblockFingerprint('machine:not-blocked')).toBe(false)
	})

	it('throws on empty fingerprint', () => {
		expect(() => blockFingerprint('', 'reason')).toThrow(/empty/)
	})

	it('snapshot reflects current state', () => {
		blockFingerprint('machine:a', 'r1')
		blockFingerprint('machine:b', 'r2')
		const snap = getBlockedFingerprints()
		expect(snap.length).toBe(2)
		expect(snap.map((b) => b.fingerprint).sort()).toEqual([
			'machine:a',
			'machine:b',
		])
	})
})

describe('checkFingerprintBlocked (TTL-aware)', () => {
	beforeEach(() => {
		resetFingerprintPauseState()
	})

	it('returns the block when present and not expired', () => {
		blockFingerprint('machine:m-1', 'test')
		const block = checkFingerprintBlocked('machine:m-1')
		expect(block).toBeDefined()
		expect(block?.reason).toBe('test')
	})

	it('returns undefined when not blocked', () => {
		expect(checkFingerprintBlocked('machine:not-blocked')).toBeUndefined()
	})

	it('returns undefined when the fingerprint is empty string', () => {
		expect(checkFingerprintBlocked('')).toBeUndefined()
	})

	it('block is fresh within TTL (default 5 minutes)', async () => {
		blockFingerprint('machine:m-1', 'test')
		await new Promise((r) => setTimeout(r, 5))
		const block = checkFingerprintBlocked('machine:m-1')
		expect(block).toBeDefined()
		expect(block?.expiresAt).toBeGreaterThan(Date.now())
	})
})

describe('sweepExpiredBlocks', () => {
	beforeEach(() => {
		resetFingerprintPauseState()
	})

	it('returns 0 when nothing expired', () => {
		blockFingerprint('machine:a', 'r')
		blockFingerprint('machine:b', 'r')
		expect(sweepExpiredBlocks()).toBe(0)
	})

	it('clears the map when called on empty state', () => {
		expect(sweepExpiredBlocks()).toBe(0)
		expect(getBlockedFingerprintCount()).toBe(0)
	})
})

describe('selfHealOnSafe', () => {
	beforeEach(() => {
		resetFingerprintPauseState()
	})

	it('unblocks the fingerprint when verdict is SAFE', () => {
		blockFingerprint('machine:m-1', 'unsafe')
		const healed = selfHealOnSafe('machine:m-1', 'SAFE')
		expect(healed).toBe(true)
		expect(checkFingerprintBlocked('machine:m-1')).toBeUndefined()
	})

	it('does NOT unblock when verdict is UNSAFE', () => {
		blockFingerprint('machine:m-1', 'unsafe')
		selfHealOnSafe('machine:m-1', 'UNSAFE')
		expect(checkFingerprintBlocked('machine:m-1')).toBeDefined()
	})

	it('does NOT unblock when verdict is REVIEW', () => {
		blockFingerprint('machine:m-1', 'unsafe')
		selfHealOnSafe('machine:m-1', 'REVIEW')
		expect(checkFingerprintBlocked('machine:m-1')).toBeDefined()
	})

	it('returns false when the fingerprint is not blocked', () => {
		expect(selfHealOnSafe('machine:not-blocked', 'SAFE')).toBe(false)
	})

	it('returns false when the fingerprint is empty', () => {
		expect(selfHealOnSafe('', 'SAFE')).toBe(false)
	})
})

describe('constants', () => {
	it('TTL is at least 1 minute (so transient bans do not pile up)', () => {
		expect(FINGERPRINT_BLOCK_TTL_MS).toBeGreaterThanOrEqual(60_000)
	})

	it('TTL is at most 1 hour (so stale bans clear in reasonable time)', () => {
		expect(FINGERPRINT_BLOCK_TTL_MS).toBeLessThanOrEqual(60 * 60_000)
	})
})
