/**
 * Fingerprint-Scoped Pause Layer — shouldEscalateToGlobal tests (P1-1).
 *
 * These tests need an isolated SQLite DB instance. The kill-switch app
 * uses a module-level singleton `db` from `db/index.ts` that other test
 * files in this directory mock with `:memory:` replacements — which
 * would break this test's DB queries. To avoid the cross-file mock
 * leakage, we mock `db/index` HERE with our OWN in-memory DB (created
 * fresh for this test file) that includes the `verification_event`
 * table the escalation query reads.
 *
 * Stage 2 fix (cycle 2/6, Nikaya 84/100 — `shouldEscalateToGlobal` was
 * querying ONLY UNSAFE rows, so a single UNSAFE fingerprint in a 10-fp
 * system blocked the other nine. Now the production function queries
 * BOTH total distinct active fingerprints AND distinct UNSAFE
 * fingerprints, escalating only when `unsafeActive === totalActive &&
 * totalActive > 0`. The DB handle is injected so tests exercise the
 * REAL production function (no raw-SQL bypass).
 *
 * If you add tests here, ensure the `CREATE TABLE` block at the top of
 * this file matches `db/schema.ts` exactly so the escalation query
 * returns the expected shape.
 */

import { Database } from 'bun:sqlite'
import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'

// ─── Per-test DB construction (defensive against cross-file pollution) ───
//
// The `bun test` runner shares the module graph across test files in the
// same process. Other test files in this directory mock 'drizzle-orm' to
// a stripped subset. The Drizzle classes captured at first load inherit
// that pollution. To make this test file robust to that, we build the
// Drizzle DB *inside* a `beforeAll` hook (which runs after the per-file
// mock.module calls below). The fresh instance picks up the real
// `gt`/`eq`/`and`/`isNotNull`/`sql` from the sub-path imports.
//
// The CREATE TABLE block below matches `db/schema.ts` exactly so the
// escalation query (which references `verificationEvents.machineId`,
// `verificationEvents.verdict`, and `verificationEvents.createdAt`)
// returns the expected shape.

let testSqlite: Database
let testDb: any

beforeAll(() => {
	testSqlite = new Database(':memory:', { create: true })
	testSqlite.run('PRAGMA journal_mode=WAL')
	testSqlite.run('PRAGMA foreign_keys=ON')
	testSqlite.run(`
		CREATE TABLE IF NOT EXISTS verification_event (
			id TEXT PRIMARY KEY,
			request_id TEXT NOT NULL,
			machine_id TEXT,
			verdict TEXT NOT NULL,
			confidence REAL,
			reason TEXT,
			model TEXT NOT NULL,
			degraded INTEGER NOT NULL DEFAULT 0,
			prompt_hash TEXT,
			output_hash TEXT,
			triggered_kill INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)
	`)
	testDb = drizzle(testSqlite, { schema })

	// Replace the singleton `db` for the duration of this test file.
	// Module mocks use the absolute path that consumers use; we register
	// both `../../db/index` (used by tests in __tests__/) and `../db`
	// (used by sibling modules like fingerprint-pause.ts) so the mock
	// applies regardless of where the import originates.
	mock.module('../../db/index', () => ({
		db: testDb,
		sqlite: testSqlite,
		initDatabase: () => ({ db: testDb, sqlite: testSqlite }),
	}))
	mock.module('../db', () => ({
		db: testDb,
		sqlite: testSqlite,
		initDatabase: () => ({ db: testDb, sqlite: testSqlite }),
	}))
})

// Other test files in this directory mock 'drizzle-orm' with stripped
// or replaced exports (e.g. `eq`/`and` replaced with custom AST nodes).
// The production `shouldEscalateToGlobal` uses the real Drizzle query
// builder, which needs the REAL `gt`/`eq`/`and`/`isNotNull` operators
// to assemble valid SQL. We re-mock the module HERE with the real
// operators imported from a sub-path (`drizzle-orm/sql`), which is not
// affected by the top-level mock. This way the production function
// gets the real operators regardless of what other test files did
// to `drizzle-orm` in their own context.
import {
	eq as realEq,
	and as realAnd,
	gt as realGt,
	isNotNull as realIsNotNull,
	sql as realSql,
} from 'drizzle-orm/sql'
mock.module('drizzle-orm', () => ({
	eq: realEq,
	and: realAnd,
	gt: realGt,
	isNotNull: realIsNotNull,
	sql: realSql,
}))

// Import the PRODUCTION function under test. The DB handle is injected
// via the second argument so we exercise the real production code path
// (no raw-SQL bypass).
const { shouldEscalateToGlobal, queryEscalationCounts } = await import(
	'../fingerprint-pause'
)
const { resetTrafficPauseState } = await import('../traffic-pause')
const { resetFingerprintPauseState } = await import('../fingerprint-blocklist')
// Schema reference kept for type-checking; not used at runtime.
void schema

describe('shouldEscalateToGlobal (P1-1 escalation rule)', () => {
	beforeEach(() => {
		resetFingerprintPauseState()
		resetTrafficPauseState()
		// Clear the verification_event table for a clean slate.
		testSqlite.exec('DELETE FROM verification_event')
	})

	function uniqueId(label: string): string {
		return `${label}-${crypto.randomUUID()}`
	}

	function insertRow(
		label: string,
		machineId: string,
		verdict: 'SAFE' | 'UNSAFE' | 'REVIEW',
		createdAtMs?: number,
	): void {
		// Drizzle ORM with `integer mode 'timestamp'` stores Date as Unix
		// seconds. Convert ms → s to match what `new Date()` would produce.
		const createdAtSec = Math.floor((createdAtMs ?? Date.now()) / 1000)
		testSqlite
			.prepare(
				`INSERT INTO verification_event
          (id, request_id, machine_id, verdict, confidence, reason, model, degraded, prompt_hash, output_hash, triggered_kill, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				uniqueId(label),
				`r-${label}`,
				machineId,
				verdict,
				verdict === 'UNSAFE' ? 0.9 : 0.5,
				verdict.toLowerCase(),
				'test',
				0,
				'h1',
				'h2',
				0,
				createdAtSec,
			)
	}

	it('does NOT escalate when there are no verdicts in the window', async () => {
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(0)
		expect(result.unsafeFingerprints).toBe(0)
		expect(result.escalated).toBe(false)
	})

	it('does NOT escalate when the only fingerprint is SAFE (scoped halt, not global)', async () => {
		// Stage 2 fix (cycle 2/6): a single SAFE fingerprint in the window
		// must NOT escalate to global pause. The previous (buggy) version
		// escalated on `activeFingerprints > 0` alone.
		insertRow('safe-only', 'm-safe', 'SAFE')
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(1)
		expect(result.unsafeFingerprints).toBe(0)
		expect(result.escalated).toBe(false)
	})

	it('does NOT escalate when some fingerprints are UNSAFE but others are SAFE', async () => {
		// The scoped-halt design: a single UNSAFE in a 10-fingerprint
		// system halts only that fingerprint and the other nine keep
		// flowing. Escalation only when EVERY active fingerprint is UNSAFE.
		insertRow('esc-1', 'm-1', 'UNSAFE')
		insertRow('esc-2', 'm-2', 'UNSAFE')
		insertRow('esc-3', 'm-3', 'UNSAFE')
		insertRow('esc-safe-1', 'm-safe-1', 'SAFE')
		insertRow('esc-safe-2', 'm-safe-2', 'SAFE')
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(5)
		expect(result.unsafeFingerprints).toBe(3)
		expect(result.escalated).toBe(false)
	})

	it('escalates when the only active fingerprint has UNSAFE', async () => {
		insertRow('esc-single', 'm-single', 'UNSAFE')
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(1)
		expect(result.unsafeFingerprints).toBe(1)
		expect(result.escalated).toBe(true)
		expect(result.alreadyPaused).toBe(false)
	})

	it('escalates when ALL active fingerprints have UNSAFE (3/3 unsafe)', async () => {
		insertRow('esc-all-1', 'm-1', 'UNSAFE')
		insertRow('esc-all-2', 'm-2', 'UNSAFE')
		insertRow('esc-all-3', 'm-3', 'UNSAFE')
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(3)
		expect(result.unsafeFingerprints).toBe(3)
		expect(result.escalated).toBe(true)
	})

	it('does NOT consider rows OUTSIDE the window', async () => {
		insertRow('esc-old', 'm-old', 'UNSAFE', Date.now() - 10 * 60_000)
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(0)
		expect(result.unsafeFingerprints).toBe(0)
		expect(result.escalated).toBe(false)
	})

	it('counts distinct fingerprints (multiple UNSAFE rows from same fingerprint = 1)', async () => {
		insertRow('esc-dup-1', 'm-same', 'UNSAFE')
		insertRow('esc-dup-2', 'm-same', 'UNSAFE')
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(1)
		expect(result.unsafeFingerprints).toBe(1)
		expect(result.escalated).toBe(true)
	})

	it('mixed UNSAFE+SAFE counts unsafe only as the unsafe subset', async () => {
		// Single fingerprint emits both SAFE and UNSAFE: still counts as
		// 1 active, 1 unsafe, 1 safe — net unsafe == active → escalate.
		insertRow('mix-1-safe', 'm-mix', 'SAFE')
		insertRow('mix-1-unsafe', 'm-mix', 'UNSAFE')
		const result = await shouldEscalateToGlobal(60_000, testDb)
		expect(result.activeFingerprints).toBe(1)
		expect(result.unsafeFingerprints).toBe(1)
		expect(result.escalated).toBe(true)
	})

	it('is idempotent: second call after escalation reports alreadyPaused=true', async () => {
		insertRow('esc-idem', 'm-idem', 'UNSAFE')
		const first = await shouldEscalateToGlobal(60_000, testDb)
		expect(first.escalated).toBe(true)
		// Second call: still unsafe/total === 1, but already paused.
		const second = await shouldEscalateToGlobal(60_000, testDb)
		expect(second.escalated).toBe(false)
		expect(second.alreadyPaused).toBe(true)
	})
})

describe('queryEscalationCounts (extracted helper)', () => {
	beforeEach(() => {
		testSqlite.exec('DELETE FROM verification_event')
	})

	function uniqueId(label: string): string {
		return `${label}-${crypto.randomUUID()}`
	}

	function insertRow(
		label: string,
		machineId: string,
		verdict: 'SAFE' | 'UNSAFE' | 'REVIEW',
	): void {
		const createdAtSec = Math.floor(Date.now() / 1000)
		testSqlite
			.prepare(
				`INSERT INTO verification_event
          (id, request_id, machine_id, verdict, confidence, reason, model, degraded, prompt_hash, output_hash, triggered_kill, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				uniqueId(label),
				`r-${label}`,
				machineId,
				verdict,
				0.5,
				verdict.toLowerCase(),
				'test',
				0,
				'h1',
				'h2',
				0,
				createdAtSec,
			)
	}

	it('returns zero counts on an empty table', async () => {
		const counts = await queryEscalationCounts(testDb, 60_000)
		expect(counts.totalActive).toBe(0)
		expect(counts.unsafeActive).toBe(0)
	})

	it('separates totalActive and unsafeActive correctly', async () => {
		insertRow('a', 'm-1', 'UNSAFE')
		insertRow('b', 'm-2', 'SAFE')
		insertRow('c', 'm-3', 'REVIEW')
		insertRow('d', 'm-4', 'UNSAFE')
		const counts = await queryEscalationCounts(testDb, 60_000)
		expect(counts.totalActive).toBe(4)
		expect(counts.unsafeActive).toBe(2)
	})
})
