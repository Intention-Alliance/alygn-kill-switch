/**
 * Discovery API Routes (ADR-135)
 *
 * Endpoints:
 *   GET    /v1/discovery/machines          — List discovered machines (provisional registry)
 *   POST   /v1/discovery/sweep             — Run opportunistic network sweep (mDNS + ARP/ICMP)
 *   POST   /v1/discovery/heartbeat         — Agent heartbeat: fingerprint + integrity check
 *   POST   /v1/discovery/:machineId/probe  — Probe provider adapters for a machine
 *   GET    /v1/discovery/:machineId/report — Full discovery report (onboarding review)
 *   POST   /v1/discovery/:machineId/confirm— Human confirmation (approve/deny, ADR-138)
 *
 * SECURITY: NO auto-admission. Sweep results enter NEW_MACHINE state and
 * require human confirmation before any kill-switch authority (ADR-135 §5).
 */

import type {
	DiscoveredMachine,
	MachineDiscoveryState,
} from '@align/shared-types'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db/index'
import { discoveredMachines, integrityEvents } from '../db/schema'
import { DiscoveryOrchestrator } from '../services/discovery/orchestrator'

// ─── Helpers ────────────────────────────────────────────────────

function json(res: any, statusCode: number, body: unknown) {
	res.writeHead(statusCode, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(body))
}

async function parseJsonBody(req: any): Promise<any> {
	return new Promise((resolve, reject) => {
		let data = ''
		req.on('data', (chunk: Buffer) => {
			data += chunk.toString()
		})
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : null)
			} catch {
				reject(new Error('Invalid JSON body'))
			}
		})
		req.on('error', reject)
	})
}

function parseJson<T>(value: string | null): T | null {
	if (!value) return null
	try {
		return JSON.parse(value) as T
	} catch {
		return null
	}
}

function serializeMachine(row: Record<string, unknown>): DiscoveredMachine {
	return {
		id: String(row.id),
		hostname: String(row.hostname),
		ip: row.ip ? String(row.ip) : null,
		source: row.source as DiscoveredMachine['source'],
		state: row.state as MachineDiscoveryState,
		fingerprint: row.fingerprint ? parseJson(String(row.fingerprint)) : null,
		integritySignature: row.integritySignature
			? parseJson(String(row.integritySignature))
			: null,
		firstSeen: row.firstSeen
			? new Date(Number(row.firstSeen)).toISOString()
			: '',
		lastSeen: row.lastSeen ? new Date(Number(row.lastSeen)).toISOString() : '',
		confirmedAt: row.confirmedAt
			? new Date(Number(row.confirmedAt)).toISOString()
			: null,
		confirmedBy: row.confirmedBy ? String(row.confirmedBy) : null,
	}
}

// ─── Route Handler ──────────────────────────────────────────────

export async function handleDiscoveryRoutes(
	method: string,
	url: string,
	req: any,
	res: any,
	actor: string,
	userRole: string | null,
	orchestrator?: DiscoveryOrchestrator,
): Promise<boolean> {
	if (!url.startsWith('/v1/discovery')) return false

	const discovery = orchestrator ?? new DiscoveryOrchestrator()

	try {
		// ─── GET /v1/discovery/machines — List discovered machines ─────
		if (
			method === 'GET' &&
			(url === '/v1/discovery/machines' || url === '/v1/discovery/machines/')
		) {
			const parsed = new URL(url, 'http://localhost')
			const stateFilter = parsed.searchParams.get('state')
			const limit = parseInt(parsed.searchParams.get('limit') || '50', 10)

			let query = db.select().from(discoveredMachines).$dynamic()
			if (stateFilter) {
				query = query.where(eq(discoveredMachines.state, stateFilter))
			}
			const rows = await query
				.orderBy(desc(discoveredMachines.lastSeen))
				.limit(limit)
				.all()

			const data = rows.map((row) =>
				serializeMachine(row as unknown as Record<string, unknown>),
			)
			json(res, 200, { data, total: data.length, limit })
			return true
		}

		// ─── POST /v1/discovery/sweep — Opportunistic network sweep ────
		if (method === 'POST' && url === '/v1/discovery/sweep') {
			if (userRole !== 'admin') {
				json(res, 403, { error: 'Admin role required' })
				return true
			}
			const result = await discovery.runNetworkSweep()
			json(res, 200, {
				discovered: result.discovered,
				skipped: result.skipped,
				note: 'NO auto-admission: discovered machines enter NEW_MACHINE and require human confirmation (ADR-135 §5).',
			})
			return true
		}

		// ─── POST /v1/discovery/heartbeat — Agent heartbeat ────────────
		if (method === 'POST' && url === '/v1/discovery/heartbeat') {
			const body = await parseJsonBody(req)
			const machineId = body?.machineId
			const hostname = body?.hostname

			if (!machineId || typeof machineId !== 'string') {
				json(res, 400, { error: 'machineId is required' })
				return true
			}
			if (!hostname || typeof hostname !== 'string') {
				json(res, 400, { error: 'hostname is required' })
				return true
			}

			const result = await discovery.handleHeartbeat({
				machineId,
				hostname,
				fingerprint: body?.fingerprint ?? undefined,
			})

			json(res, 200, {
				acknowledged: true,
				machineId,
				signature: result.signature,
				drift: result.drift,
				state: result.drift ? 'INTEGRITY_DRIFT' : 'OK',
			})
			return true
		}

		// ─── POST /v1/discovery/:machineId/probe — Probe providers ─────
		const probeMatch = url.match(/^\/v1\/discovery\/([^/]+)\/probe$/)
		if (method === 'POST' && probeMatch) {
			if (userRole !== 'admin') {
				json(res, 403, { error: 'Admin role required' })
				return true
			}
			const machineId = probeMatch[1]
			const results = await discovery.detectProvidersForMachine(machineId)
			json(res, 200, {
				machineId,
				providers: results.map((result) => ({
					provider: result.provider,
					health: result.health,
					modelCount: result.models.length,
				})),
			})
			return true
		}

		// ─── GET /v1/discovery/:machineId/report — Full report ─────────
		const reportMatch = url.match(/^\/v1\/discovery\/([^/]+)\/report$/)
		if (method === 'GET' && reportMatch) {
			const machineId = reportMatch[1]
			const report = await discovery.getDiscoveryReport(machineId)
			if (!report) {
				json(res, 404, {
					error: 'Machine not found in discovery registry',
					machineId,
				})
				return true
			}
			json(res, 200, report)
			return true
		}

		// ─── POST /v1/discovery/:machineId/confirm — Human confirmation ─
		const confirmMatch = url.match(/^\/v1\/discovery\/([^/]+)\/confirm$/)
		if (method === 'POST' && confirmMatch) {
			if (userRole !== 'admin') {
				json(res, 403, { error: 'Admin role required' })
				return true
			}
			const machineId = confirmMatch[1]
			const body = await parseJsonBody(req)
			const approve = body?.approve === true

			const machine = await discovery.confirmMachine(machineId, actor, approve)
			if (!machine) {
				json(res, 404, {
					error: 'Machine not found in discovery registry',
					machineId,
				})
				return true
			}

			json(res, 200, {
				machine,
				state: machine.state,
				note: approve
					? 'Machine confirmed — onboarding complete (ADR-138).'
					: 'Machine denied — zero authority granted. Repeated denials raise a rogue-device alert.',
			})
			return true
		}

		// ─── GET /v1/discovery/integrity-events — Drift/tamper log ─────
		if (method === 'GET' && url === '/v1/discovery/integrity-events') {
			const rows = await db
				.select()
				.from(integrityEvents)
				.orderBy(desc(integrityEvents.detectedAt))
				.limit(100)
				.all()

			const data = rows.map((row) => ({
				id: String(row.id),
				machineId: String(row.machineId),
				event: String(row.event),
				severity: String(row.severity),
				driftedFields: row.driftedFields
					? (JSON.parse(String(row.driftedFields)) as string[])
					: [],
				detectedAt: new Date(Number(row.detectedAt)).toISOString(),
			}))
			json(res, 200, { data, total: data.length })
			return true
		}

		return false
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown error'
		console.error('[discovery] Error:', message)
		json(res, 500, { error: 'Internal server error', detail: message })
		return true
	}
}
