/**
 * Alygn Kill-Switch — black-box proof harness.
 *
 * Boots the REAL server against a throwaway HOME + DATA_DIR + local Redis,
 * runs three black-box checks over HTTP, and writes proof/latest.json.
 * Run: bun tests/proof-harness/run.ts
 *
 * Exit 0 only when checks 1–3 pass. The expected, correct result today is
 * exit 1 with check 1 failing on
 * apps/server-kill-switch/src/routes/kill-authorization.ts.
 */

import { Database } from 'bun:sqlite'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EnforcementConsumer } from '../../apps/agent-plane/src/enforcement'
import {
	applyMigrations,
	BASE,
	type ChainEntry,
	computeSelfHash,
	getChaosState,
	http,
	makeSecrets,
	mintAssertionToken,
	PORT,
	portInUse,
	REDIS_CONTAINER,
	REDIS_HOST_PORT,
	REDIS_PORT,
	readAuditRows,
	resetChaosState,
	restoreChaosState,
	rowToEntry,
	setupHome,
	spawnServer,
	WORKTREE,
	waitForAdminUser,
	waitForHealth,
} from './lib'

type CheckStatus = 'pass' | 'fail' | 'skip'
interface CheckResult {
	name: string
	status: CheckStatus
	detail: string
	evidence?: Record<string, unknown>
}

const checks: CheckResult[] = []
const skips: Array<{ claim: string; reason: string; file?: string }> = []
const startedAt = new Date().toISOString()

function record(c: CheckResult) {
	checks.push(c)
	console.log(`\n[${c.status.toUpperCase()}] ${c.name} — ${c.detail}`)
}

function skip(claim: string, reason: string, file?: string) {
	skips.push({ claim, reason, file })
	console.log(`[SKIP] ${claim} — ${reason}${file ? ` (${file})` : ''}`)
}

async function main() {
	const root = `/tmp/proof-harness-${process.pid}`
	rmSync(root, { recursive: true, force: true })
	mkdirSync(root, { recursive: true })
	const dataDir = join(root, 'data')
	mkdirSync(dataDir, { recursive: true })
	const home = setupHome(root)
	const dbPath = join(dataDir, 'kill-switch.sqlite')
	const secrets = makeSecrets()

	if (await portInUse(PORT)) {
		const reason =
			`Port ${PORT} is already in use — the harness needs a free port for ` +
			`the server under test. Stop the process bound to ${PORT} or re-run ` +
			`with PROOF_PORT=<free-port> bun tests/proof-harness/run.ts`
		console.log(`\n[SKIP] preflight — ${reason}`)
		skip('full harness run', reason, `tcp port ${PORT}`)
		const portSkipProof: Record<string, unknown> = {
			git_sha: await gitSha(),
			started_at: startedAt,
			harness: 'tests/proof-harness/run.ts',
			server_port: PORT,
			preflight: { port: { ok: false, port: PORT } },
			checks: [],
			skips,
			finished_at: new Date().toISOString(),
			exit_code: 2,
		}
		rmSync(root, { recursive: true, force: true })
		const portSkipOutDir = join(WORKTREE, 'proof')
		mkdirSync(portSkipOutDir, { recursive: true })
		writeFileSync(
			join(portSkipOutDir, 'latest.json'),
			`${JSON.stringify(portSkipProof, null, 2)}\n`,
		)
		console.log(
			`\n[proof] wrote proof/latest.json (exit 2 — skipped: port ${PORT} in use)`,
		)
		process.exit(2)
	}
	console.log(`[preflight] port ${PORT} free`)

	const redis = redisReachable()
	if (!redis.ok) {
		const reason =
			`Redis dependency unreachable — docker container '${REDIS_CONTAINER}' ` +
			`(redis://127.0.0.1:${REDIS_HOST_PORT}) did not answer PING` +
			(redis.output ? ` (${redis.output})` : '')
		console.log(`\n[SKIP] preflight — ${reason}`)
		skip('full harness run', reason, `docker container ${REDIS_CONTAINER}`)
		const skipProof: Record<string, unknown> = {
			git_sha: await gitSha(),
			started_at: startedAt,
			harness: 'tests/proof-harness/run.ts',
			server_port: PORT,
			preflight: { redis: { ok: false, output: redis.output } },
			checks: [],
			skips,
			finished_at: new Date().toISOString(),
			exit_code: 2,
		}
		rmSync(root, { recursive: true, force: true })
		const skipOutDir = join(WORKTREE, 'proof')
		mkdirSync(skipOutDir, { recursive: true })
		writeFileSync(
			join(skipOutDir, 'latest.json'),
			`${JSON.stringify(skipProof, null, 2)}\n`,
		)
		console.log(
			'\n[proof] wrote proof/latest.json (exit 2 — skipped: Redis unavailable)',
		)
		process.exit(2)
	}
	console.log(`[preflight] redis reachable: ${redis.output}`)

	// Apply the repo's own migrations BEFORE boot: the server's initDatabase()
	// auto-creates a stale schema (kill_authorization_request lacks `action`).
	const migrations = applyMigrations(dbPath)
	console.log(
		`[migrate] applied ${migrations.statements} statements from ${migrations.files.length} files` +
			(migrations.errors.length ? ` (${migrations.errors.length} errors)` : ''),
	)

	// Capture the pre-run value of the SHARED `chaos:kill-switch` key so the
	// finally block can restore it — other local consumers read this key.
	const chaosBefore = getChaosState()
	console.log(
		`[redis] pre-run chaos:kill-switch = ${chaosBefore.value === null ? '<absent>' : chaosBefore.value}`,
	)

	const redisReset = resetChaosState()
	console.log(`[redis] reset chaos state: ${JSON.stringify(redisReset)}`)

	const env: Record<string, string> = {
		HOME: home,
		DATA_DIR: dataDir,
		KILL_SWITCH_PORT: String(PORT),
		KILL_SWITCH_ENV: 'development',
		// REDIS_URL is mandatory and overrides REDIS_URLS (config/index.ts),
		// so the server runs standalone against node-1 only — see PROOF.md.
		REDIS_URL: `redis://127.0.0.1:${REDIS_HOST_PORT}`,
		REDIS_URLS: `redis://127.0.0.1:${REDIS_HOST_PORT},redis://127.0.0.1:6381,redis://127.0.0.1:6382`,
		REDIS_NODE_MAP:
			'{"redis-node-1:6379":{"host":"127.0.0.1","port":6380},"redis-node-2:6379":{"host":"127.0.0.1","port":6381},"redis-node-3:6379":{"host":"127.0.0.1","port":6382}}',
		BETTER_AUTH_SECRET: secrets.BETTER_AUTH_SECRET,
		WEBAUTHN_ASSERTION_TOKEN_SECRET: secrets.WEBAUTHN_ASSERTION_TOKEN_SECRET,
		KILL_SWITCH_AUTH_TOKEN: secrets.KILL_SWITCH_AUTH_TOKEN,
		KILL_SWITCH_API_KEY: secrets.KILL_SWITCH_API_KEY,
		ADMIN_UI_API_KEY: secrets.ADMIN_UI_API_KEY,
		KILL_SWITCH_INTERNAL_KEY: secrets.KILL_SWITCH_INTERNAL_KEY,
		AUDIT_HMAC_KEY: secrets.AUDIT_HMAC_KEY,
		KILL_SWITCH_VERIFY_ENABLED: 'false',
		KILL_SWITCH_VERIFICATION_FEATURE_FLAG: 'false',
		ALYGN_MACHINE_HOSTNAME: 'proof-harness',
	}

	const server = spawnServer(env)
	let exitCode = 1
	const proof: Record<string, unknown> = {
		git_sha: await gitSha(),
		started_at: startedAt,
		harness: 'tests/proof-harness/run.ts',
		server_port: PORT,
		adversary_sentence:
			'tamper-evident against outsiders only, not against the key holder',
		// Real UUID from the kill-authorization audit row (not the transition path's 'noop').
		trace_id: null,
		migrations: {
			files: migrations.files,
			statements: migrations.statements,
			errors: migrations.errors,
		},
		redis_reset: redisReset,
		redis_pre_run: chaosBefore.value,
		checks: checks,
		skips: skips,
	}

	try {
		const healthy = await waitForHealth()
		if (!healthy) {
			record({
				name: 'server_boot',
				status: 'fail',
				detail: 'server did not become healthy within 45s',
				evidence: { log_tail: server.logs.slice(-25) },
			})
			throw new Error('server boot failed')
		}
		console.log('[boot] server healthy')

		const adminId = await waitForAdminUser(dbPath)
		if (!adminId) throw new Error('admin user never seeded')
		console.log(`[boot] admin user id = ${adminId}`)

		const check1 = await checkAppend(secrets, dbPath)
		record(check1)
		proof.trace_id =
			(check1.evidence?.kill_auth_entry as Record<string, unknown> | undefined)
				?.trace_id ?? null

		const check2 = await checkMutation(secrets, dbPath)
		record(check2)

		const check3 = await checkStopEchoed(secrets, adminId)
		record(check3)

		const verifyToken = mintAssertionToken(
			secrets.WEBAUTHN_ASSERTION_TOKEN_SECRET,
			{
				sub: adminId,
				cred: 'proof-harness-cred',
				action: 'audit:verify',
			},
		)
		const verifyRes = await http('POST', '/v1/audit/verify', {
			headers: { authorization: `Assertion ${verifyToken}` },
			body: {},
		})
		proof.audit_verify = {
			status: verifyRes.status,
			body: verifyRes.json,
			// verifyChain() returns the FIRST mismatch, which may be a different
			// broken row than the one check 1 names; both are writeAudit() rows.
			note: 'audit_verify.brokenAt is the first mismatch returned by verifyChain() and may be a DIFFERENT broken row than the kill-authorization row named by check 1; both are writeAudit() rows.',
		}
		console.log(
			`[audit/verify] status=${verifyRes.status} body=${JSON.stringify(verifyRes.json)}`,
		)

		skip(
			'Bitcoin / Taproot external anchor publish',
			'anchorChainHead() stores a signed payload locally; external publish is an explicit TODO stub',
			'apps/server-kill-switch/src/services/audit-chain.ts',
		)
		skip(
			'POST /v1/audit/anchor',
			'external publish is a stub — not called',
			'apps/server-kill-switch/src/services/audit-chain.ts',
		)
		skip(
			'BlueField-3 DPU hardware inhibit',
			'no DPU/hardware inhibit path exists in this repo',
		)
		skip(
			'3.4 ms hardware kill latency',
			'no hardware kill path exists; latency claim is not measurable here',
		)
		skip(
			'Dignity Test score',
			'no Dignity Test scorer is implemented in this repo',
		)
		skip(
			'agent-local trace/hash echo',
			'AgentStateStore has no trace/hash echo method — only kill_switch_state / heartbeat / fingerprint',
			'apps/agent-plane/src/state.ts',
		)

		proof.finished_at = new Date().toISOString()
		proof.exit_code = checks.every((c) => c.status === 'pass') ? 0 : 1
		exitCode = proof.exit_code as number
	} catch (err: any) {
		proof.fatal = err?.message ?? String(err)
		proof.server_log_tail = server.logs.slice(-40)
		proof.finished_at = new Date().toISOString()
		proof.exit_code = 1
		exitCode = 1
	} finally {
		server.stop()
		await Bun.sleep(300)
		rmSync(root, { recursive: true, force: true })
		// Restore the SHARED key so other local consumers are not left paused.
		const restored = restoreChaosState(chaosBefore.value)
		proof.redis_restore = {
			pre_run_value: chaosBefore.value,
			ok: restored.ok,
			output: restored.output,
		}
		console.log(
			`[redis] restored chaos:kill-switch to ${chaosBefore.value === null ? '<absent>' : chaosBefore.value}: ${JSON.stringify(restored)}`,
		)
	}

	const outDir = join(WORKTREE, 'proof')
	mkdirSync(outDir, { recursive: true })
	writeFileSync(
		join(outDir, 'latest.json'),
		`${JSON.stringify(proof, null, 2)}\n`,
	)
	console.log(`\n[proof] wrote proof/latest.json (exit ${exitCode})`)
	process.exit(exitCode)
}

async function checkAppend(
	secrets: ReturnType<typeof makeSecrets>,
	dbPath: string,
): Promise<CheckResult> {
	const evidence: Record<string, unknown> = {}
	try {
		const token = mintAssertionToken(secrets.WEBAUTHN_ASSERTION_TOKEN_SECRET, {
			sub: 'proof-harness-user',
			cred: 'proof-harness-cred',
			action: 'kill:fleet',
		})
		const kill = await http('POST', '/v1/kill-authorization/requests', {
			headers: { authorization: `Assertion ${token}` },
			body: {
				target: 'fleet',
				state: 'STOPPED',
				reason: 'proof-harness append',
			},
		})
		evidence.kill_auth_post = { status: kill.status, body: kill.json }
		if (kill.status !== 200 && kill.status !== 202) {
			return {
				name: 'check1_append',
				status: 'fail',
				detail: `POST /v1/kill-authorization/requests rejected (status ${kill.status})`,
				evidence,
			}
		}

		const rows = readAuditRows(dbPath)
		evidence.chain_length = rows.length
		const killRow = rows.find((r) =>
			String(r.reason).startsWith('Kill authorization initiated'),
		)
		if (!killRow) {
			return {
				name: 'check1_append',
				status: 'fail',
				detail: 'no kill-authorization audit row found after the action',
				evidence,
			}
		}
		const entry = rowToEntry(killRow)
		const recomputed = computeSelfHash(entry)
		evidence.kill_auth_entry = {
			id: entry.id,
			trace_id: entry.traceId,
			stored_self_hash: entry.selfHash,
			recomputed_self_hash: recomputed,
			prev_hash: entry.prevHash,
			server_hmac: String(killRow.server_hmac ?? ''),
			plain_explanation: entry.plainExplanation,
		}

		// Control: the transition path writes through appendAuditEntry, so its
		// row MUST recompute — this isolates the failure to the kill-auth path.
		const chaosToken = mintAssertionToken(
			secrets.WEBAUTHN_ASSERTION_TOKEN_SECRET,
			{
				sub: 'proof-harness-user',
				cred: 'proof-harness-cred',
				action: 'kill:fleet',
			},
		)
		// The action above moved RUNNING → STOPPED, so use the reverse transition.
		const chaos = await http('POST', '/v1/kill-switch/chaos', {
			headers: { authorization: `Assertion ${chaosToken}` },
			body: { state: 'RUNNING', reason: 'proof-harness control' },
		})
		evidence.control_chaos = { status: chaos.status, body: chaos.json }
		const rows2 = readAuditRows(dbPath)
		const controlRow = rows2.find(
			(r) => String(r.reason) === 'proof-harness control',
		)
		if (!controlRow) {
			return {
				name: 'check1_append',
				status: 'fail',
				detail: 'control transition produced no audit row',
				evidence,
			}
		}
		const controlEntry = rowToEntry(controlRow)
		const controlRecomputed = computeSelfHash(controlEntry)
		evidence.control_entry = {
			id: controlEntry.id,
			stored_self_hash: controlEntry.selfHash,
			recomputed_self_hash: controlRecomputed,
			prev_hash: controlEntry.prevHash,
			matches: controlRecomputed === controlEntry.selfHash,
		}
		if (controlRecomputed !== controlEntry.selfHash) {
			return {
				name: 'check1_append',
				status: 'fail',
				detail: `control (transition path) self_hash mismatch at ${controlEntry.id} — recompute algorithm is wrong`,
				evidence,
			}
		}

		// The kill-auth row must fail the recompute — the CORRECT outcome:
		// writeAudit() inserts without prevHash/selfHash, so defaults apply.
		if (recomputed !== entry.selfHash) {
			return {
				name: 'check1_append',
				status: 'fail',
				detail:
					`self_hash mismatch on kill-authorization audit row ${entry.id} — ` +
					`apps/server-kill-switch/src/routes/kill-authorization.ts writeAudit() ` +
					`inserts without prevHash/selfHash/serverHmac/plainExplanation ` +
					`(stored='${entry.selfHash}', recomputed='${recomputed}')`,
				evidence,
			}
		}

		return {
			name: 'check1_append',
			status: 'pass',
			detail: `kill-authorization audit row ${entry.id} recomputed correctly`,
			evidence,
		}
	} catch (err: any) {
		return {
			name: 'check1_append',
			status: 'fail',
			detail: `threw: ${err?.message}`,
			evidence,
		}
	}
}

async function checkMutation(
	secrets: ReturnType<typeof makeSecrets>,
	dbPath: string,
): Promise<CheckResult> {
	const evidence: Record<string, unknown> = {}
	try {
		const before = readAuditRows(dbPath)
		if (before.length === 0)
			return {
				name: 'check2_mutation',
				status: 'fail',
				detail: 'no audit rows to attempt mutation against',
				evidence,
			}
		const target = rowToEntry(before[before.length - 1])
		const beforeHash = target.selfHash
		evidence.target_id = target.id
		evidence.before_hash = beforeHash

		const token = mintAssertionToken(secrets.WEBAUTHN_ASSERTION_TOKEN_SECRET, {
			sub: 'proof-harness-user',
			cred: 'proof-harness-cred',
			action: 'audit:verify',
		})
		const routeAttempts: Array<{
			method: string
			path: string
			headers: Record<string, string>
			body?: unknown
		}> = [
			{
				method: 'PUT',
				path: `/v1/inference-logs/${target.id}`,
				headers: { 'x-api-key': secrets.KILL_SWITCH_API_KEY },
				body: { action: 'tampered' },
			},
			{
				method: 'DELETE',
				path: `/v1/inference-logs/${target.id}`,
				headers: { 'x-api-key': secrets.KILL_SWITCH_API_KEY },
			},
			{
				method: 'PUT',
				path: `/v1/audit/${target.id}`,
				headers: { authorization: `Assertion ${token}` },
				body: { selfHash: 'deadbeef' },
			},
			{
				method: 'DELETE',
				path: `/v1/audit/${target.id}`,
				headers: { authorization: `Assertion ${token}` },
			},
			{
				method: 'PUT',
				path: `/v1/kill-authorization/requests/${target.id}`,
				headers: { authorization: `Assertion ${token}` },
				body: { status: 'EXECUTED' },
			},
			{
				method: 'DELETE',
				path: `/v1/kill-authorization/requests/${target.id}`,
				headers: { authorization: `Assertion ${token}` },
			},
		]
		const routeResults: Array<{
			method: string
			path: string
			status: number
		}> = []
		for (const a of routeAttempts) {
			const r = await http(a.method, a.path, {
				headers: a.headers,
				body: a.body,
			})
			routeResults.push({ method: a.method, path: a.path, status: r.status })
		}
		evidence.route_attempts = routeResults

		// Direct SQL as the "operator DB role".
		const sqlResult = directSqlMutation(dbPath, target.id)
		evidence.direct_sql = sqlResult

		const after = readAuditRows(dbPath)
		const afterEntry = after.find((r) => String(r.id) === target.id)
		const afterHash = afterEntry ? rowToEntry(afterEntry).selfHash : null
		evidence.after_hash = afterHash
		evidence.chain_length_after = after.length

		const unchanged = afterHash === beforeHash
		const sqlRewrote = sqlResult.updateSucceeded || sqlResult.deleteSucceeded

		if (sqlRewrote) {
			return {
				name: 'check2_mutation',
				status: 'fail',
				detail:
					'tamper-evident against outsiders only, not against the key holder — direct SQL rewrote the audit row',
				evidence,
			}
		}
		if (!unchanged) {
			return {
				name: 'check2_mutation',
				status: 'fail',
				detail:
					'second read returned a different hash — mutation was effective',
				evidence,
			}
		}
		return {
			name: 'check2_mutation',
			status: 'pass',
			detail: `all ${routeResults.length} route attempts rejected/ineffective; direct SQL blocked by triggers; second read hash unchanged`,
			evidence,
		}
	} catch (err: any) {
		return {
			name: 'check2_mutation',
			status: 'fail',
			detail: `threw: ${err?.message}`,
			evidence,
		}
	}
}

function directSqlMutation(
	dbPath: string,
	id: string,
): {
	updateSucceeded: boolean
	deleteSucceeded: boolean
	updateError: string | null
	deleteError: string | null
} {
	const db = new Database(dbPath)
	let updateSucceeded = false
	let deleteSucceeded = false
	let updateError: string | null = null
	let deleteError: string | null = null
	try {
		try {
			db.query('UPDATE kill_switch_audit_log SET reason = ? WHERE id = ?').run(
				'TAMPERED',
				id,
			)
			updateSucceeded = true
		} catch (e: any) {
			updateError = e?.message ?? String(e)
		}
		try {
			db.query('DELETE FROM kill_switch_audit_log WHERE id = ?').run(id)
			deleteSucceeded = true
		} catch (e: any) {
			deleteError = e?.message ?? String(e)
		}
	} finally {
		db.close()
	}
	return { updateSucceeded, deleteSucceeded, updateError, deleteError }
}

async function checkStopEchoed(
	secrets: ReturnType<typeof makeSecrets>,
	adminId: string,
): Promise<CheckResult> {
	const evidence: Record<string, unknown> = {}
	try {
		evidence.redis_reset = resetChaosState()

		// GET /v1/kill-switch/status requires auth (x-api-key).
		const before = await http('GET', '/v1/kill-switch/status', {
			headers: { 'x-api-key': secrets.KILL_SWITCH_API_KEY },
		})
		evidence.status_before = before.json?.state ?? null
		if (before.json?.state !== 'RUNNING') {
			return {
				name: 'check3_stop_echoed',
				status: 'fail',
				detail: `expected initial state RUNNING, got ${before.json?.state}`,
				evidence,
			}
		}

		const token = mintAssertionToken(secrets.WEBAUTHN_ASSERTION_TOKEN_SECRET, {
			sub: adminId,
			cred: 'proof-harness-cred',
			action: 'kill:fleet',
		})
		const chaos = await http('POST', '/v1/kill-switch/chaos', {
			headers: { authorization: `Assertion ${token}` },
			body: { state: 'STOPPED', reason: 'proof-harness stop' },
		})
		evidence.chaos = { status: chaos.status, body: chaos.json }
		if (chaos.status !== 200) {
			return {
				name: 'check3_stop_echoed',
				status: 'fail',
				detail: `chaos STOPPED rejected (status ${chaos.status})`,
				evidence,
			}
		}

		const after = await http('GET', '/v1/kill-switch/status', {
			headers: { 'x-api-key': secrets.KILL_SWITCH_API_KEY },
		})
		evidence.status_after = after.json?.state ?? null
		if (after.json?.state === 'RUNNING') {
			return {
				name: 'check3_stop_echoed',
				status: 'fail',
				detail: 'status still RUNNING after STOPPED',
				evidence,
			}
		}

		// Run the REAL agent-plane EnforcementConsumer (no fetch mock).
		const consumer = new EnforcementConsumer({
			motherUrl: BASE,
			apiKey: secrets.KILL_SWITCH_API_KEY,
			pollIntervalMs: 500,
		})
		evidence.agent_state_before_poll = consumer.getState()
		evidence.agent_isPaused_before_poll = consumer.isPaused()

		const status = await consumer.pollOnce()
		evidence.agent_polled_status = status.state
		evidence.agent_state_after_poll = consumer.getState()
		evidence.agent_isPaused_after_poll = consumer.isPaused()

		const failClosedUnknown = new EnforcementConsumer({
			motherUrl: BASE,
			apiKey: secrets.KILL_SWITCH_API_KEY,
		}).isPaused()
		evidence.agent_fail_closed_when_unknown = failClosedUnknown

		const ok =
			consumer.getState() === 'STOPPED' &&
			consumer.isPaused() === true &&
			failClosedUnknown === true
		if (!ok) {
			return {
				name: 'check3_stop_echoed',
				status: 'fail',
				detail: `agent did not echo STOPPED (state=${consumer.getState()}, isPaused=${consumer.isPaused()})`,
				evidence,
			}
		}
		return {
			name: 'check3_stop_echoed',
			status: 'pass',
			detail:
				'status left RUNNING → STOPPED; real EnforcementConsumer polled, transitioned, and isPaused() fail-closed',
			evidence,
		}
	} catch (err: any) {
		return {
			name: 'check3_stop_echoed',
			status: 'fail',
			detail: `threw: ${err?.message}`,
			evidence,
		}
	}
}

async function gitSha(): Promise<string> {
	try {
		const p = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: WORKTREE })
		return p.stdout.toString().trim()
	} catch {
		return 'unknown'
	}
}

function redisReachable(): { ok: boolean; output: string } {
	try {
		const p = Bun.spawnSync([
			'docker',
			'exec',
			REDIS_CONTAINER,
			'redis-cli',
			'-p',
			REDIS_PORT,
			'PING',
		])
		const output = `${p.stdout.toString()}${p.stderr.toString()}`.trim()
		return { ok: p.exitCode === 0 && /PONG/i.test(output), output }
	} catch (e: any) {
		return { ok: false, output: e?.message ?? String(e) }
	}
}

main()
