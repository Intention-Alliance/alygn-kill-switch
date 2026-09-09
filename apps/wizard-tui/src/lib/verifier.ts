/**
 * Post-install verification (WS-C wizard-tui lib).
 *
 * Pure logic — no clack imports. Health-checks the running kill-switch
 * server: API liveness, redis readiness, machines list, audit log, and a
 * live heartbeat probe (POST /v1/discovery/heartbeat with x-api-key).
 * Contracts are live — this module only reads them, never changes them.
 */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { WizardConfig } from './config'

export interface VerificationReport {
	api: { ok: boolean; status?: string; version?: string }
	redis: { ok: boolean }
	machines: unknown[]
	auditLog: { ok: boolean }
	heartbeat: { state?: string; agentRegistered?: boolean } | null
}

/** Read a KEY=value pair from a .env file (no export prefix). */
function readEnvValue(envText: string, key: string): string | null {
	const match = envText.match(new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}=(.+)$`, 'm'))
	if (!match?.[1]) return null
	return match[1].trim().replace(/^["']|["']$/g, '')
}

/** Load the API keys the verifier needs from the install .env. */
async function loadApiKeys(config: WizardConfig): Promise<{ apiKey: string; adminUiKey: string }> {
	const envPath = join(resolve(config.installDir), '.env')
	let envText = ''
	try {
		envText = await readFile(envPath, 'utf8')
	} catch {
		// Missing .env — keys stay empty and checks will fail with 401.
	}
	return {
		apiKey: readEnvValue(envText, 'KILL_SWITCH_API_KEY') ?? '',
		adminUiKey: readEnvValue(envText, 'ADMIN_UI_API_KEY') ?? '',
	}
}

/** GET with a short timeout; returns { status, body } or null on network error. */
async function getJson(
	url: string,
	headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown } | null> {
	try {
		const res = await fetch(url, {
			headers: { Accept: 'application/json', ...headers },
			signal: AbortSignal.timeout(5_000),
		})
		let body: unknown = null
		try {
			body = await res.json()
		} catch {
			// non-JSON body — status alone is enough
		}
		return { status: res.status, body }
	} catch {
		return null
	}
}

/**
 * Probe the mother machine with a real heartbeat (spec §6). Uses the
 * same payload shape as the agent-plane HeartbeatClient. Returns the
 * machine state and whether the agent is registered, or null when the
 * probe could not be delivered (server down / bad key).
 */
export async function probeHeartbeat(
	config: WizardConfig,
): Promise<{ state: string; agentRegistered: boolean } | null> {
	const { apiKey } = await loadApiKeys(config)
	if (!apiKey) return null

	const motherUrl = config.motherUrl.replace(/\/$/, '')
	const payload = {
		machineId: config.machineId,
		hostname: config.machineHostname,
		agentId: `agent-${config.machineId}`,
		agentName: 'alygn-agent',
		agentVersion: '0.1.0',
		capabilities: ['intercept', 'score', 'enforce', 'integrity'],
	}

	try {
		const res = await fetch(`${motherUrl}/v1/discovery/heartbeat`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(5_000),
		})
		if (!res.ok) return null
		const body = (await res.json()) as {
			state?: string
			agentRegistered?: boolean
		}
		return {
			state: body.state ?? 'OK',
			agentRegistered: body.agentRegistered ?? false,
		}
	} catch {
		return null
	}
}

/**
 * Full post-install verification (spec §5). Every check degrades to a
 * non-throwing "not ok" so the caller can render a clear report.
 */
export async function verifyInstall(config: WizardConfig): Promise<VerificationReport> {
	const motherUrl = config.motherUrl.replace(/\/$/, '')
	const { apiKey, adminUiKey } = await loadApiKeys(config)

	// 1. API liveness — GET /health (no auth).
	const health = await getJson(`${motherUrl}/health`)
	const api = {
		ok: health?.status === 200,
		status: health?.status !== undefined ? String(health.status) : undefined,
		version: undefined as string | undefined,
	}
	if (health?.status === 200 && typeof health.body === 'object' && health.body) {
		const body = health.body as Record<string, unknown>
		if (typeof body.status === 'string') api.status = body.status
		if (typeof body.version === 'string') api.version = body.version
	}

	// 2. Redis readiness — GET /ready (no auth).
	const ready = await getJson(`${motherUrl}/ready`)
	let redisOk = false
	if (ready?.status === 200 && typeof ready.body === 'object' && ready.body) {
		const body = ready.body as { checks?: { redis?: { redis?: string } } }
		redisOk = body.checks?.redis?.redis === 'OK'
	}
	const redis = { ok: redisOk }

	// 3. Machines list — GET /v1/discovery/machines?state=NEW_MACHINE (x-api-key).
	let machines: unknown[] = []
	if (apiKey) {
		const machinesRes = await getJson(`${motherUrl}/v1/discovery/machines?state=NEW_MACHINE`, {
			'x-api-key': apiKey,
		})
		if (machinesRes?.status === 200 && typeof machinesRes.body === 'object' && machinesRes.body) {
			const body = machinesRes.body as { data?: unknown[] }
			machines = body.data ?? []
		}
	}

	// 4. Audit log — GET /api/admin/secrets/audit (Bearer ADMIN_UI_API_KEY).
	let auditOk = false
	if (adminUiKey) {
		const auditRes = await getJson(`${motherUrl}/api/admin/secrets/audit`, {
			Authorization: `Bearer ${adminUiKey}`,
		})
		auditOk = auditRes?.status === 200
	}

	// 5. Heartbeat probe — POST /v1/discovery/heartbeat (x-api-key).
	const heartbeat = await probeHeartbeat(config)

	return { api, redis, machines, auditLog: { ok: auditOk }, heartbeat }
}
