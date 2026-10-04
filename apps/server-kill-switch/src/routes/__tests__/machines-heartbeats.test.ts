/**
 * Machines Routes — heartbeat history API (H5.2).
 *
 * Exercises GET /v1/machines/:id/heartbeats against a real in-memory SQLite
 * DB (mocked db/index): pagination bounds, ordering, 404, and the
 * insert-per-tick path on POST /v1/machines/:id/heartbeat.
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
  CREATE TABLE machine_flag (
    machine_id TEXT NOT NULL,
    flag_key TEXT NOT NULL,
    value TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (machine_id, flag_key)
  )
`)
sqlite.run(`
  CREATE TABLE agent (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    capabilities TEXT,
    last_heartbeat INTEGER,
    created_at INTEGER NOT NULL
  )
`)
sqlite.run(`
  CREATE TABLE feature_flag (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    created_by TEXT NOT NULL DEFAULT 'admin',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
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
    metadata TEXT
  )
`)

mock.module(path.resolve(__dirname, '../../db/index.ts'), () => ({
	db,
	sqlite,
	initDatabase: () => ({ db, sqlite }),
}))

// Several suites globally mock `drizzle-orm` (partial objects without
// `sql.identifier`), which breaks the Drizzle query builder used by the
// machines route. Clear leaked mocks so this file exercises the real builder.
mock.restore()

const { handleMachinesRoutes } = await import('../machines')

// ─── Helpers ──────────────────────────────────────────────────────

function makeReq(body?: unknown) {
	const raw = body === undefined ? '' : JSON.stringify(body)
	const req: {
		on: (event: string, cb: (chunk?: Buffer) => void) => unknown
	} = {
		on(event, cb) {
			if (event === 'data' && raw) cb(Buffer.from(raw))
			if (event === 'end') cb()
			return req
		},
	}
	return req
}

function makeRes() {
	const calls: { status: number; body: any }[] = []
	return {
		calls,
		writeHead(status: number) {
			calls.push({ status, body: undefined })
		},
		end(data?: string) {
			if (calls.length === 0) calls.push({ status: 200, body: undefined })
			calls[calls.length - 1].body = data ? JSON.parse(data) : undefined
		},
	}
}

async function get(url: string) {
	const res = makeRes()
	const handled = await handleMachinesRoutes('GET', url, makeReq(), res)
	return { handled, status: res.calls[0]?.status, body: res.calls[0]?.body }
}

async function post(url: string, body: unknown) {
	const res = makeRes()
	const handled = await handleMachinesRoutes('POST', url, makeReq(body), res)
	return { handled, status: res.calls[0]?.status, body: res.calls[0]?.body }
}

function insertHeartbeat(machineId: string, ts: number, cpu = 1, memory = 2) {
	sqlite.run(
		`INSERT INTO machine_heartbeat_log (id, machine_id, timestamp, cpu, memory, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
		[crypto.randomUUID(), machineId, Math.floor(ts / 1000), cpu, memory],
	)
}

beforeEach(() => {
	sqlite.run('DELETE FROM machine_heartbeat_log')
	sqlite.run('DELETE FROM machine')
	sqlite.run(
		`INSERT INTO machine (id, name, hostname, status, role, created_at)
     VALUES ('machine-localhost', 'localhost', 'localhost', 'active', 'primary', ?)`,
		[Date.now()],
	)
})

describe('GET /v1/machines/:id/heartbeats', () => {
	it('returns heartbeat history newest-first with pagination metadata', async () => {
		insertHeartbeat('machine-localhost', 1000)
		insertHeartbeat('machine-localhost', 2000)
		insertHeartbeat('machine-localhost', 3000)

		const { handled, status, body } = await get(
			'/v1/machines/machine-localhost/heartbeats',
		)

		expect(handled).toBe(true)
		expect(status).toBe(200)
		expect(body.machineId).toBe('machine-localhost')
		expect(body.total).toBe(3)
		expect(body.limit).toBe(50)
		expect(body.offset).toBe(0)
		expect(body.data).toHaveLength(3)
		expect(body.data[0].timestamp).toBe(new Date(3000).toISOString())
		expect(body.data[2].timestamp).toBe(new Date(1000).toISOString())
	})

	it('applies limit and offset', async () => {
		for (let i = 1; i <= 10; i++) insertHeartbeat('machine-localhost', i * 1000)

		const { body } = await get(
			'/v1/machines/machine-localhost/heartbeats?limit=3&offset=2',
		)

		expect(body.limit).toBe(3)
		expect(body.offset).toBe(2)
		expect(body.total).toBe(10)
		expect(body.data).toHaveLength(3)
		// newest-first: offset 2 skips the two newest (10000, 9000)
		expect(body.data[0].timestamp).toBe(new Date(8000).toISOString())
	})

	it('clamps limit above the max to 500', async () => {
		const { body } = await get(
			'/v1/machines/machine-localhost/heartbeats?limit=9999',
		)
		expect(body.limit).toBe(500)
	})

	it('clamps limit below the min to 1', async () => {
		const { body } = await get(
			'/v1/machines/machine-localhost/heartbeats?limit=0',
		)
		expect(body.limit).toBe(1)
	})

	it('falls back to the default limit when limit is not a number', async () => {
		const { body } = await get(
			'/v1/machines/machine-localhost/heartbeats?limit=abc',
		)
		expect(body.limit).toBe(50)
	})

	it('falls back to offset 0 when offset is not a number', async () => {
		const { body } = await get(
			'/v1/machines/machine-localhost/heartbeats?offset=xyz',
		)
		expect(body.offset).toBe(0)
	})

	it('returns an empty page for a machine with no heartbeats', async () => {
		const { status, body } = await get(
			'/v1/machines/machine-localhost/heartbeats',
		)
		expect(status).toBe(200)
		expect(body.data).toEqual([])
		expect(body.total).toBe(0)
	})

	it('returns 404 for an unknown machine', async () => {
		const { status, body } = await get(
			'/v1/machines/machine-missing/heartbeats',
		)
		expect(status).toBe(404)
		expect(body.error).toBe('Machine not found')
	})
})

describe('POST /v1/machines/:id/heartbeat', () => {
	it('persists one history row per tick', async () => {
		const { status } = await post('/v1/machines/machine-localhost/heartbeat', {
			cpuUsage: 33.5,
			memoryUsage: 61.25,
		})

		expect(status).toBe(200)

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
		expect(row.cpu).toBe(33.5)
		expect(row.memory).toBe(61.25)
		expect(row.status).toBe('active')
	})

	it('returns 404 for an unknown machine and writes nothing', async () => {
		const { status } = await post('/v1/machines/machine-missing/heartbeat', {})
		expect(status).toBe(404)

		const row = sqlite
			.query('SELECT count(*) AS n FROM machine_heartbeat_log')
			.get() as { n: number }
		expect(row.n).toBe(0)
	})
})
