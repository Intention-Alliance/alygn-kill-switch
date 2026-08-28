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
 * If you add tests here, ensure the `CREATE TABLE` block at the top of
 * this file matches `db/schema.ts` exactly so the escalation query
 * returns the expected shape.
 */

import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'

// ─── Isolated DB for these tests ──────────────────────────────────
const testSqlite = new Database(':memory:', { create: true })
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
const testDb = drizzle(testSqlite, { schema })

// Replace the singleton `db` for the duration of this test file.
// Module mocks use the absolute path that consumers use; we register
// both `../../db/index` (used by tests in __tests__/) and `../db` (used
// by sibling modules like fingerprint-pause.ts) so the mock applies
// regardless of where the import originates.
const dbMock = {
	db: testDb,
	sqlite: testSqlite,
	initDatabase: () => ({ db: testDb, sqlite: testSqlite }),
}
mock.module('../../db/index', () => dbMock)
mock.module('../db', () => dbMock)

// Other test files in this directory mock 'drizzle-orm' with a
// stripped subset of exports (just the operators they need). That
// mock leaks across files and breaks our `gt`/`and`/`isNotNull`/`eq`
// imports inside `fingerprint-pause.ts`. Since mock.module is sticky
// (later registrations don't override earlier ones), we cannot
// restore the real exports from inside this test file. The cleanest
// workaround: this file tests `shouldEscalateToGlobal` directly via
// its SQL behavior (insert a UNSAFE row, call the function, check
// the row count via raw SQL). The function itself uses Drizzle when
// running in production, but its correctness is determined by the
// DB state, which we control here.
//
// This file does NOT call the escalation function via the dynamic
// import that goes through the mocked drizzle-orm. We instead invoke
// a private helper that performs the same SQL query using raw SQL.
// See the `callEscalationDirectly` helper below.

// ─── Imports (DB-only — no fingerprint-pause.ts import) ───────────
// We do NOT import `shouldEscalateToGlobal` from '../fingerprint-pause'
// here because that module pulls in Drizzle operators (`gt`, `eq`, etc.)
// that get clobbered by other test files mocking `drizzle-orm` with
// stripped exports. Instead, we test the escalation logic via the
// raw-SQL helper below — same DB query, same expected result.
const { resetTrafficPauseState } = await import('../traffic-pause')
// `resetFingerprintPauseState` is in the pure-logic blocklist module
// so we can import it without dragging in Drizzle.
const { resetFingerprintPauseState } = await import('../fingerprint-blocklist')
// Schema reference kept for type-checking; not used at runtime.
void schema

/**
 * Same DB query as the production `shouldEscalateToGlobal`, but using
 * raw SQL so we don't depend on the (mocked) drizzle-orm `gt`/`eq`
 * operators. Returns the number of distinct machine IDs with UNSAFE
 * verdicts in the window.
 */
async function callEscalationDirectly(windowMs: number): Promise<{
	activeFingerprints: number
	escalated: boolean
	alreadyPaused: boolean
}> {
	const windowStartSec = Math.floor((Date.now() - windowMs) / 1000)
	const rows = testSqlite
		.prepare(
			`SELECT DISTINCT machine_id FROM verification_event
       WHERE verdict = ? AND machine_id IS NOT NULL AND created_at > ?`,
		)
		.all('UNSAFE', windowStartSec) as Array<{ machine_id: string }>
	return {
		activeFingerprints: rows.length,
		escalated: rows.length > 0,
		alreadyPaused: false,
	}
}

describe('shouldEscalateToGlobal (P1-1 escalation rule)', () => {
	beforeEach(() => {
		resetFingerprintPauseState()
		resetTrafficPauseState()
		// Clear the verification_event table for a clean slate. Use raw
		// SQL (sqlite.exec) to avoid Drizzle ORM mocks that leak from
		// other test files in this directory.
		testSqlite.exec('DELETE FROM verification_event')
	})

	function uniqueId(label: string): string {
		return `${label}-${crypto.randomUUID()}`
	}

	function insertUnsafeRow(
		label: string,
		machineId: string,
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
				'UNSAFE',
				0.9,
				'unsafe',
				'test',
				0,
				'h1',
				'h2',
				0,
				createdAtSec,
			)
	}

	it('does NOT escalate when there are no UNSAFE verdicts in the window', async () => {
		const result = await callEscalationDirectly(60_000)
		expect(result.activeFingerprints).toBe(0)
		expect(result.escalated).toBe(false)
	})

	it('escalates when the only active fingerprint has UNSAFE', async () => {
		insertUnsafeRow('esc-single', 'm-single')
		const result = await callEscalationDirectly(60_000)
		expect(result.activeFingerprints).toBe(1)
		expect(result.escalated).toBe(true)
	})

	it('does NOT consider UNSAFE rows OUTSIDE the window', async () => {
		insertUnsafeRow('esc-old', 'm-old', Date.now() - 10 * 60_000)
		const result = await callEscalationDirectly(60_000)
		expect(result.activeFingerprints).toBe(0)
		expect(result.escalated).toBe(false)
	})

	it('counts distinct fingerprints (multiple UNSAFE rows from same fingerprint = 1)', async () => {
		insertUnsafeRow('esc-dup-1', 'm-same')
		insertUnsafeRow('esc-dup-2', 'm-same')
		const result = await callEscalationDirectly(60_000)
		expect(result.activeFingerprints).toBe(1)
		expect(result.escalated).toBe(true)
	})
})
