/**
 * Machine Heartbeat — history persistence + retention (H5.1).
 *
 * Uses a real in-memory SQLite DB (mocked db/index) so the retention DELETE
 * and the insert-per-tick path are exercised against real SQL, not stubs.
 */

import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sqlite = new Database(':memory:', { create: true })
sqlite.run('PRAGMA foreign_keys=ON')
const db = drizzle(sqlite, { schema })

sqlite.run(`
  CREATE TABLE machine (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hostname TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    role TEXT NOT NULL,
    has_dpu INTEGER NOT NULL DEFAULT 0,
    specs TEXT,
    monitoring_only INTEGER NOT NULL DEFAULT 1,
    zone TEXT NOT NULL DEFAULT 'unassigned',
    last_seen INTEGER,
    created_at INTEGER NOT NULL
  )
`)
sqlite.run(`
  CREATE TABLE machine_heartbeat_log (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES machine(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL,
    cpu REAL,
    memory REAL,
    status TEXT NOT NULL DEFAULT 'active'
  )
`)
sqlite.run(
	`CREATE INDEX machine_heartbeat_machine_time_idx ON machine_heartbeat_log(machine_id, timestamp)`,
)
sqlite.run(`
  CREATE TABLE setting (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

mock.module(path.resolve(__dirname, '../../db/index.ts'), () => ({
	db,
	sqlite,
	initDatabase: () => ({ db, sqlite }),
}))

const {
	recordHeartbeat,
	cleanupHeartbeatLog,
	getHeartbeatRetentionDays,
	stampLocalMachineHeartbeat,
} = await import('../machine-heartbeat')

const DAY_MS = 24 * 60 * 60 * 1000

function insertHeartbeat(
	machineId: string,
	ageDays: number,
	cpu = 1,
	memory = 2,
) {
	const ts = Math.floor((Date.now() - ageDays * DAY_MS) / 1000)
	sqlite.run(
		`INSERT INTO machine_heartbeat_log (id, machine_id, timestamp, cpu, memory, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
		[crypto.randomUUID(), machineId, ts, cpu, memory],
	)
}

function setRetention(value: string) {
	sqlite.run(
		`INSERT INTO setting (key, value, updated_at) VALUES ('audit_log_retention_days', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		[value, Date.now()],
	)
}

function heartbeatCount(): number {
	const row = sqlite
		.query('SELECT count(*) AS n FROM machine_heartbeat_log')
		.get() as { n: number }
	return row.n
}

beforeEach(() => {
	sqlite.run('DELETE FROM machine_heartbeat_log')
	sqlite.run('DELETE FROM setting')
	sqlite.run('DELETE FROM machine')
	sqlite.run(
		`INSERT INTO machine (id, name, hostname, status, role, created_at)
     VALUES ('machine-localhost', 'localhost', 'localhost', 'active', 'primary', ?)`,
		[Date.now()],
	)
})

describe('getHeartbeatRetentionDays', () => {
	it('reads the audit_log_retention_days setting', async () => {
		setRetention('30')
		expect(await getHeartbeatRetentionDays()).toBe(30)
	})

	it('falls back to the default when the setting is missing', async () => {
		expect(await getHeartbeatRetentionDays()).toBe(30)
	})

	it('falls back to the default when the setting is malformed', async () => {
		setRetention('not-a-number')
		expect(await getHeartbeatRetentionDays()).toBe(30)
	})

	it('clamps below the minimum to 1 day', async () => {
		setRetention('0')
		expect(await getHeartbeatRetentionDays()).toBe(1)
	})

	it('clamps above the maximum to 365 days', async () => {
		setRetention('9999')
		expect(await getHeartbeatRetentionDays()).toBe(365)
	})
})

describe('recordHeartbeat', () => {
	it('appends one row per tick with cpu/memory/status', async () => {
		await recordHeartbeat('machine-localhost', {
			cpu: 12.5,
			memory: 48.25,
			status: 'active',
		})

		const row = sqlite
			.query(
				'SELECT machine_id, cpu, memory, status FROM machine_heartbeat_log',
			)
			.get() as {
			machine_id: string
			cpu: number
			memory: number
			status: string
		}

		expect(row.machine_id).toBe('machine-localhost')
		expect(row.cpu).toBe(12.5)
		expect(row.memory).toBe(48.25)
		expect(row.status).toBe('active')
	})

	it('stores nulls when no sample is provided', async () => {
		await recordHeartbeat('machine-localhost')

		const row = sqlite
			.query('SELECT cpu, memory, status FROM machine_heartbeat_log')
			.get() as { cpu: number | null; memory: number | null; status: string }

		expect(row.cpu).toBeNull()
		expect(row.memory).toBeNull()
		expect(row.status).toBe('active')
	})
})

describe('cleanupHeartbeatLog', () => {
	it('deletes rows older than the configured retention window', async () => {
		setRetention('30')
		insertHeartbeat('machine-localhost', 40) // stale
		insertHeartbeat('machine-localhost', 10) // fresh
		insertHeartbeat('machine-localhost', 0) // fresh

		const deleted = await cleanupHeartbeatLog()

		expect(deleted).toBe(1)
		expect(heartbeatCount()).toBe(2)
	})

	it('keeps rows exactly at the retention boundary', async () => {
		setRetention('30')
		insertHeartbeat('machine-localhost', 29.9)

		const deleted = await cleanupHeartbeatLog()

		expect(deleted).toBe(0)
		expect(heartbeatCount()).toBe(1)
	})

	it('honors an explicit retention override', async () => {
		insertHeartbeat('machine-localhost', 10)
		insertHeartbeat('machine-localhost', 2)

		const deleted = await cleanupHeartbeatLog(5)

		expect(deleted).toBe(1)
		expect(heartbeatCount()).toBe(1)
	})

	it('is a no-op when the log is empty', async () => {
		expect(await cleanupHeartbeatLog()).toBe(0)
	})
})

describe('stampLocalMachineHeartbeat', () => {
	it('stamps last_seen and appends a history row', async () => {
		const id = await stampLocalMachineHeartbeat()

		expect(id).toBe('machine-localhost')
		expect(heartbeatCount()).toBe(1)

		const machine = sqlite
			.query('SELECT last_seen, status FROM machine WHERE id = ?')
			.get('machine-localhost') as { last_seen: number | null; status: string }

		expect(machine.last_seen).not.toBeNull()
		expect(machine.status).toBe('active')
	})
})
