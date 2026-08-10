/**
 * Onboarding API Routes (ADR-138) — Multi-Tenant Registration
 *
 * Endpoints:
 *   POST /v1/onboarding/registration/:machineId/approve — Admin approves a discovered machine
 *   POST /v1/onboarding/registration/:machineId/deny    — Admin denies (optional denial_reason)
 *   GET  /v1/onboarding/pending                          — Machines awaiting human confirmation
 *   GET  /v1/onboarding/rogue-alerts                     — Rogue device alerts
 *
 * SECURITY: approve/deny require a full-privilege admin (role 'admin').
 * Every decision is written to the immutable audit log (ADR-140) and the
 * registration_request table.
 */

import {
	OnboardingService,
	OnboardingStateError,
} from '../services/onboarding'

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

function isFullPrivilegeAdmin(userRole: string | null): boolean {
	return userRole === 'admin'
}

/**
 * Zone validation shared with the machines PATCH route (ADR-137/138):
 * a zone is a 1–64 character string. Both admission paths must accept
 * the same set of valid zones.
 */
export function validateZone(zone: unknown): string | null {
	if (typeof zone !== 'string' || zone.length < 1 || zone.length > 64) {
		return 'zone must be 1-64 characters'
	}
	return null
}

// ─── Route Handler ──────────────────────────────────────────────

export async function handleOnboardingRoutes(
	method: string,
	url: string,
	req: any,
	res: any,
	actor: string,
	userRole: string | null,
	onboarding?: OnboardingService,
): Promise<boolean> {
	if (!url.startsWith('/v1/onboarding')) return false

	const service = onboarding ?? new OnboardingService()

	try {
		// ─── POST /v1/onboarding/registration/:machineId/approve ─────
		const approveMatch = url.match(
			/^\/v1\/onboarding\/registration\/([^/]+)\/approve$/,
		)
		if (method === 'POST' && approveMatch) {
			if (!isFullPrivilegeAdmin(userRole)) {
				json(res, 403, { error: 'Full-privilege admin role required' })
				return true
			}
			const machineId = approveMatch[1]
			const body = await parseJsonBody(req)
			let zone: string | undefined
			if (body?.zone !== undefined && body.zone !== null) {
				const zoneErr = validateZone(body.zone)
				if (zoneErr) {
					json(res, 400, { error: zoneErr })
					return true
				}
				zone = body.zone
			}

			const decision = await service.approve({
				machineId,
				reviewedBy: actor,
				zone,
			})
			if (!decision) {
				json(res, 404, {
					error: 'Machine not found in discovery registry',
					machineId,
				})
				return true
			}

			json(res, 200, {
				machine: decision.machine,
				registration: decision.registration,
				machineRecord: decision.machineRecord,
				note: 'Machine admitted — monitoring-only until onboarding completes (ADR-138).',
			})
			return true
		}

		// ─── POST /v1/onboarding/registration/:machineId/deny ────────
		const denyMatch = url.match(
			/^\/v1\/onboarding\/registration\/([^/]+)\/deny$/,
		)
		if (method === 'POST' && denyMatch) {
			if (!isFullPrivilegeAdmin(userRole)) {
				json(res, 403, { error: 'Full-privilege admin role required' })
				return true
			}
			const machineId = denyMatch[1]
			const body = await parseJsonBody(req)
			const denialReason =
				typeof body?.denialReason === 'string' && body.denialReason.length > 0
					? body.denialReason
					: undefined

			const decision = await service.deny({
				machineId,
				reviewedBy: actor,
				denialReason,
			})
			if (!decision) {
				json(res, 404, {
					error: 'Machine not found in discovery registry',
					machineId,
				})
				return true
			}

			json(res, 200, {
				machine: decision.machine,
				registration: decision.registration,
				machineRecord: decision.machineRecord,
				rogueAlert: decision.rogueAlert,
				note: decision.rogueAlert
					? 'Machine denied — repeated denials raised a rogue-device alert.'
					: 'Machine denied — zero authority granted.',
			})
			return true
		}

		// ─── GET /v1/onboarding/pending — Awaiting confirmation ─────
		if (method === 'GET' && url === '/v1/onboarding/pending') {
			const pending = await service.listPending()
			json(res, 200, {
				data: pending,
				total: pending.length,
				note: 'Machines in NEW_MACHINE/PENDING_CONFIRMATION/PENDING_REVIEW require human confirmation (ADR-138).',
			})
			return true
		}

		// ─── GET /v1/onboarding/rogue-alerts — Rogue device alerts ──
		if (method === 'GET' && url === '/v1/onboarding/rogue-alerts') {
			const alerts = await service.listRogueAlerts()
			json(res, 200, { data: alerts, total: alerts.length })
			return true
		}

		return false
	} catch (err: unknown) {
		// State-machine guard violations (e.g. approving an already-ADMITTED
		// machine) are client errors — 409 Conflict, not 500.
		if (err instanceof OnboardingStateError) {
			json(res, err.statusCode, {
				error: err.message,
			})
			return true
		}
		const message = err instanceof Error ? err.message : 'Unknown error'
		console.error('[onboarding] Error:', message)
		json(res, 500, { error: 'Internal server error', detail: message })
		return true
	}
}
