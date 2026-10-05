/**
 * Proof-harness helpers — black-box HTTP + independent audit-chain recompute.
 *
 * Deliberately independent of the server's own modules, except the pure
 * canonical-JSON/hash algorithm, which is re-implemented exactly per
 * apps/server-kill-switch/src/services/audit-chain.ts so the recompute is a
 * genuine second opinion, not a call into the code under test.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto'
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'

export const WORKTREE = process.cwd()
export const PORT = Number(process.env.PROOF_PORT ?? 3999)
export const BASE = `http://127.0.0.1:${PORT}`

// Defaults match docker-compose.yml: container `align-redis-node-1`,
// redis-cli port 6379 inside the container, host port 6380 for the server.
export const REDIS_CONTAINER =
	process.env.PROOF_REDIS_CONTAINER ?? 'align-redis-node-1'
export const REDIS_PORT = process.env.PROOF_REDIS_PORT ?? '6379'
export const REDIS_HOST_PORT = process.env.PROOF_REDIS_HOST_PORT ?? '6380'

export function genSecret(): string {
	return randomBytes(32).toString('hex')
}

export interface HarnessSecrets {
	OLLAMA_TAILSCALE_AUTH_TOKEN: string
	BETTER_AUTH_SECRET: string
	WEBAUTHN_ASSERTION_TOKEN_SECRET: string
	KILL_SWITCH_AUTH_TOKEN: string
	KILL_SWITCH_API_KEY: string
	ADMIN_UI_API_KEY: string
	KILL_SWITCH_INTERNAL_KEY: string
	AUDIT_HMAC_KEY: string
}

export function makeSecrets(): HarnessSecrets {
	return {
		OLLAMA_TAILSCALE_AUTH_TOKEN: `tsauth_${randomBytes(32).toString('base64url')}`,
		BETTER_AUTH_SECRET: genSecret(),
		WEBAUTHN_ASSERTION_TOKEN_SECRET: genSecret(),
		KILL_SWITCH_AUTH_TOKEN: genSecret(),
		KILL_SWITCH_API_KEY: genSecret(),
		ADMIN_UI_API_KEY: genSecret(),
		KILL_SWITCH_INTERNAL_KEY: genSecret(),
		AUDIT_HMAC_KEY: genSecret(),
	}
}

// SecretsLoader reads a FIXED $HOME/.openclaw/secrets.json and requires
// OLLAMA_TAILSCALE_AUTH_TOKEN, so the server gets its own throwaway HOME.
export function setupHome(root: string): string {
	const home = join(root, 'home')
	const oc = join(home, '.openclaw')
	mkdirSync(oc, { recursive: true })
	const p = join(oc, 'secrets.json')
	writeFileSync(
		p,
		`${JSON.stringify({ OLLAMA_TAILSCALE_AUTH_TOKEN: `tsauth_${randomBytes(32).toString('base64url')}` }, null, 2)}\n`,
	)
	chmodSync(p, 0o600)
	return home
}

// Apply the repo's OWN migrations before boot: the server's initDatabase()
// auto-creates a stale subset of tables (e.g. kill_authorization_request
// without `action`), which 500s POST /v1/kill-authorization/requests.
// Statements split on `--> statement-breakpoint`; `already exists` /
// `duplicate column name` errors are tolerated (idempotent re-application).
export function applyMigrations(dbPath: string): {
	files: string[]
	statements: number
	errors: string[]
} {
	const dir = join(WORKTREE, 'apps/server-kill-switch/drizzle')
	const files = readdirSync(dir)
		.filter((f) => f.endsWith('.sql'))
		.sort()
	const db = new Database(dbPath, { create: true })
	const errors: string[] = []
	let statements = 0
	try {
		db.run('PRAGMA foreign_keys=OFF')
		for (const f of files) {
			const sql = readFileSync(join(dir, f), 'utf8')
			for (const raw of sql.split('--> statement-breakpoint')) {
				const stmt = raw.trim()
				if (!stmt) continue
				try {
					db.run(stmt)
					statements++
				} catch (e: any) {
					const msg = e?.message ?? String(e)
					if (/already exists|duplicate column name/i.test(msg)) continue
					errors.push(`${f}: ${msg}`)
				}
			}
		}
	} finally {
		db.close()
	}
	return { files, statements, errors }
}

// `-c` follows MOVED redirects so the logical key is read/written on
// whichever cluster node owns its slot (`chaos:kill-switch` hashes to node-2).
function redisCli(args: string[]): { ok: boolean; output: string } {
	try {
		const p = Bun.spawnSync([
			'docker',
			'exec',
			REDIS_CONTAINER,
			'redis-cli',
			'-c',
			'-p',
			REDIS_PORT,
			...args,
		])
		return {
			ok: p.exitCode === 0,
			output: `${p.stdout.toString()}${p.stderr.toString()}`.trim(),
		}
	} catch (e: any) {
		return { ok: false, output: e?.message ?? String(e) }
	}
}

// State lives in Redis (`chaos:kill-switch`, ADR-117); delete it on the
// cluster node the server connects to (node-1, standalone mode).
export function resetChaosState(): { ok: boolean; output: string } {
	return redisCli(['DEL', 'chaos:kill-switch'])
}

// Capture the pre-run value so the harness can restore it afterwards — the
// shared Redis is used by other local consumers. `value` is null when absent.
export function getChaosState(): {
	ok: boolean
	value: string | null
	output: string
} {
	const r = redisCli(['GET', 'chaos:kill-switch'])
	if (!r.ok) return { ok: false, value: null, output: r.output }
	return {
		ok: true,
		value: r.output === '' ? null : r.output,
		output: r.output,
	}
}

// When the key was absent before the run, delete it again so no state is left.
export function restoreChaosState(value: string | null): {
	ok: boolean
	output: string
} {
	return value === null
		? redisCli(['DEL', 'chaos:kill-switch'])
		: redisCli(['SET', 'chaos:kill-switch', value])
}

export interface HttpResult {
	status: number
	json: any
	text: string
}

export async function http(
	method: string,
	path: string,
	opts: { headers?: Record<string, string>; body?: unknown; retries?: number } = {},
): Promise<HttpResult> {
	const headers: Record<string, string> = { ...(opts.headers ?? {}) }
	let bodyText: string | undefined
	if (opts.body !== undefined) {
		headers['content-type'] = 'application/json'
		bodyText = JSON.stringify(opts.body)
	}
	const retries = opts.retries ?? 2
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${BASE}${path}`, {
			method,
			headers,
			body: bodyText,
			signal: AbortSignal.timeout(15_000),
		})
		const text = await res.text()
		let json: any = null
		try {
			json = JSON.parse(text)
		} catch {
			/* non-JSON */
		}
		if (res.status === 429 && attempt < retries) {
			const wait = Math.min(Number(res.headers.get('retry-after') ?? 60), 65)
			await Bun.sleep(wait * 1000)
			continue
		}
		return { status: res.status, json, text }
	}
}

export function mintAssertionToken(
	secret: string,
	opts: { sub: string; cred: string; action: string; ttlMs?: number },
): string {
	const payload = {
		sub: opts.sub,
		cred: opts.cred,
		action: opts.action,
		exp: Date.now() + (opts.ttlMs ?? 120_000),
		jti: randomBytes(16).toString('hex'),
	}
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
	const sig = createHmac('sha256', secret).update(body).digest('base64url')
	return `${body}.${sig}`
}

export interface ChainEntry {
	id: string
	timestamp: number
	userId: string
	reason: string
	previousState: string
	newState: string
	traceId: string
	machineId: string | null
	severity: string
	metadata: string | null
	prevHash: string
	selfHash: string
	actorSignature: string | null
	plainExplanation: string
}

// Exact copy of canonicalEntryJson() from services/audit-chain.ts.
// Timestamps are truncated to epoch SECONDS — the hash covers seconds only.
export function canonicalEntryJson(e: ChainEntry): string {
	const ts =
		e.timestamp instanceof Date
			? Math.floor(e.timestamp.getTime() / 1000)
			: e.timestamp
	return JSON.stringify({
		id: e.id,
		timestamp: ts,
		userId: e.userId,
		reason: e.reason,
		previousState: e.previousState,
		newState: e.newState,
		traceId: e.traceId,
		machineId: e.machineId,
		severity: e.severity,
		metadata: e.metadata,
		prevHash: e.prevHash,
		actorSignature: e.actorSignature,
		plainExplanation: e.plainExplanation,
	})
}

// Exact copy of computeSelfHash() from services/audit-chain.ts.
export function computeSelfHash(e: ChainEntry): string {
	return createHash('sha256')
		.update(canonicalEntryJson(e) + e.prevHash, 'utf8')
		.digest('hex')
}

export function rowToEntry(row: Record<string, unknown>): ChainEntry {
	return {
		id: String(row.id),
		timestamp: Number(row.timestamp),
		userId: String(row.user_id),
		reason: String(row.reason),
		previousState: String(row.previous_state),
		newState: String(row.new_state),
		traceId: String(row.trace_id),
		machineId: row.machine_id == null ? null : String(row.machine_id),
		severity: String(row.severity),
		metadata: row.metadata == null ? null : String(row.metadata),
		prevHash: String(row.prev_hash),
		selfHash: String(row.self_hash),
		actorSignature:
			row.actor_signature == null ? null : String(row.actor_signature),
		plainExplanation: String(row.plain_explanation),
	}
}

export function readAuditRows(dbPath: string): Record<string, unknown>[] {
	const db = new Database(dbPath, { readonly: true })
	try {
		return db
			.query('SELECT rowid, * FROM kill_switch_audit_log ORDER BY rowid ASC')
			.all() as Record<string, unknown>[]
	} finally {
		db.close()
	}
}

export function readAdminUserId(dbPath: string): string | null {
	const db = new Database(dbPath, { readonly: true })
	try {
		const row = db
			.query("SELECT id FROM user WHERE email = 'admin@alygn.com'")
			.get() as { id: string } | undefined
		return row?.id ?? null
	} finally {
		db.close()
	}
}

export interface ServerHandle {
	proc: ReturnType<typeof Bun.spawn>
	logs: string[]
	stop: () => void
}

export function spawnServer(env: Record<string, string>): ServerHandle {
	const logs: string[] = []
	const proc = Bun.spawn(['bun', 'run', 'apps/server-kill-switch/src/index.ts'], {
		cwd: WORKTREE,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const pump = async (stream: ReadableStream<Uint8Array> | null) => {
		if (!stream) return
		const reader = stream.getReader()
		const dec = new TextDecoder()
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			const chunk = dec.decode(value)
			for (const line of chunk.split('\n')) if (line.trim()) logs.push(line)
		}
	}
	void pump(proc.stdout as any)
	void pump(proc.stderr as any)
	return {
		proc,
		logs,
		stop: () => {
			try {
				proc.kill()
			} catch {
				/* already dead */
			}
		},
	}
}

// Probe whether a TCP port is already bound on 127.0.0.1, so the harness can
// emit a legible SKIP (exit 2) instead of a fatal boot failure.
export async function portInUse(port: number): Promise<boolean> {
	return await new Promise<boolean>((resolve) => {
		const srv = createServer()
		srv.once('error', () => resolve(true))
		srv.once('listening', () => srv.close(() => resolve(false)))
		srv.listen(port, '127.0.0.1')
	})
}

export async function waitForHealth(timeoutMs = 45_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${BASE}/v1/kill-switch/health`, {
				signal: AbortSignal.timeout(2_000),
			})
			if (res.status === 200 || res.status === 503) return true
		} catch {
			/* not up yet */
		}
		await Bun.sleep(500)
	}
	return false
}

export async function waitForAdminUser(
	dbPath: string,
	timeoutMs = 15_000,
): Promise<string | null> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const id = readAdminUserId(dbPath)
		if (id) return id
		await Bun.sleep(500)
	}
	return null
}
