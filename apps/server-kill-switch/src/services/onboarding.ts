/**
 * Onboarding Service (ADR-138) — Multi-Tenant Registration & Human Confirmation
 *
 * Human-in-the-loop registration lifecycle:
 *
 *   NEW_MACHINE → PENDING_CONFIRMATION → ADMITTED | DENIED
 *   ADMITTED → PENDING_REVIEW (high-severity integrity drift) → ADMITTED
 *
 * A full-privilege admin reviews the discovery report (ADR-135) and either
 * APPROVEs — promoting the discovered machine to ADMITTED and creating a
 * managed `machine` tenant (monitoring-only until onboarding completes) —
 * or DENies — blocking the machine with zero authority and raising a
 * rogue-device alert after repeated denials from the same hostname/IP.
 *
 * Every decision is recorded in the immutable kill-switch audit log
 * (ADR-140) and in the `registration_request` table.
 */

import type {
	DiscoveredMachine,
	HardwareFingerprint,
	MachineDiscoveryState,
	OnboardingDecision,
	RegistrationRequest,
	RogueDeviceAlert,
} from '@align/shared-types'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index'
import {
	discoveredMachines,
	featureFlags,
	killSwitchAuditLog,
	machineFlags,
	machines,
	registrationRequests,
	rogueDeviceAlerts,
} from '../db/schema'

// ─── Constants ───────────────────────────────────────────────────

/** Denials from the same hostname/IP that trigger a rogue-device alert. */
export const ROGUE_ALERT_DENIAL_THRESHOLD = 3

/** Default zone for a newly admitted machine (ADR-137/138). */
export const DEFAULT_ZONE = 'unassigned'

/** States that may be approved (initial onboarding + re-onboarding). */
const APPROVABLE_STATES: readonly MachineDiscoveryState[] = [
	'NEW_MACHINE',
	'PENDING_CONFIRMATION',
	'PENDING_REVIEW',
]

/** States that may be denied. */
const DENIABLE_STATES: readonly MachineDiscoveryState[] = [
	'NEW_MACHINE',
	'PENDING_CONFIRMATION',
	'PENDING_REVIEW',
]

// ─── Types ───────────────────────────────────────────────────────

/**
 * Raised when a state-machine guard rejects a transition (e.g. approving
 * an already-ADMITTED machine). Routes map this to HTTP 409 (Conflict).
 */
export class OnboardingStateError extends Error {
	readonly statusCode = 409

	constructor(message: string) {
		super(message)
		this.name = 'OnboardingStateError'
	}
}

export interface ApproveMachineParams {
	machineId: string
	reviewedBy: string
	zone?: string
}

export interface DenyMachineParams {
	machineId: string
	reviewedBy: string
	denialReason?: string
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseJson<T>(value: string | null): T | null {
	if (!value) return null
	try {
		return JSON.parse(value) as T
	} catch {
		return null
	}
}

function serializeDiscoveredMachine(
	row: Record<string, unknown>,
): DiscoveredMachine {
	return {
		id: String(row.id),
		hostname: String(row.hostname),
		ip: row.ip ? String(row.ip) : null,
		source: row.source as DiscoveredMachine['source'],
		state: row.state as MachineDiscoveryState,
		fingerprint: row.fingerprint
			? parseJson<HardwareFingerprint>(String(row.fingerprint))
			: null,
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

function serializeRegistrationRequest(
	row: Record<string, unknown>,
): RegistrationRequest {
	return {
		id: String(row.id),
		machineId: String(row.machineId),
		requestedBy: String(row.requestedBy),
		status: row.status as RegistrationRequest['status'],
		denialReason: row.denialReason ? String(row.denialReason) : null,
		reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
		reviewedAt: row.reviewedAt
			? new Date(Number(row.reviewedAt)).toISOString()
			: null,
		createdAt: row.createdAt
			? new Date(Number(row.createdAt)).toISOString()
			: '',
	}
}

function serializeRogueAlert(row: Record<string, unknown>): RogueDeviceAlert {
	return {
		id: String(row.id),
		hostname: String(row.hostname),
		ip: row.ip ? String(row.ip) : null,
		denialCount: Number(row.denialCount),
		lastDeniedAt: new Date(Number(row.lastDeniedAt)).toISOString(),
		resolved: Boolean(row.resolved),
		resolvedBy: row.resolvedBy ? String(row.resolvedBy) : null,
		resolvedAt: row.resolvedAt
			? new Date(Number(row.resolvedAt)).toISOString()
			: null,
		createdAt: row.createdAt
			? new Date(Number(row.createdAt)).toISOString()
			: '',
	}
}

/**
 * Map a hardware fingerprint (ADR-135) onto the `machine.specs` JSON shape
 * used by the machines inventory (ADR-133): { cpu, ram, gpu, dpu }.
 */
function fingerprintToSpecs(
	fingerprint: HardwareFingerprint | null,
): string | null {
	if (!fingerprint) return null
	return JSON.stringify({
		cpu: fingerprint.cpuModel,
		ram: `${fingerprint.memoryMb}MB`,
		gpu: fingerprint.gpus.map((gpu: any) => gpu.name).join(', ') || null,
		dpu: null,
	})
}

/**
 * Seed the machine tenant's flag set from the organization/zone defaults
 * (global feature flags). ADR-138 §1: each machine tenant has its own
 * config and flags; the org defaults are copied at admission so the
 * machine's safety profile is explicit and tenant-scoped.
 */
async function seedDefaultFlags(
	tx: typeof db,
	machineId: string,
): Promise<void> {
	const globalFlags = await tx.select().from(featureFlags).all()
	for (const flag of globalFlags) {
		const existing = await tx
			.select({ machineId: machineFlags.machineId })
			.from(machineFlags)
			.where(
				and(
					eq(machineFlags.machineId, machineId),
					eq(machineFlags.flagKey, flag.key),
				),
			)
			.get()
		if (existing) continue
		await tx.insert(machineFlags).values({
			machineId,
			flagKey: flag.key,
			value: String(flag.value),
			updatedAt: new Date(),
		})
	}
}

// ─── Service ────────────────────────────────────────────────────

export class OnboardingService {
	/**
	 * Approve a discovered machine (full-privilege admin, ADR-138 §2).
	 * Promotes the machine to ADMITTED, creates the managed `machine`
	 * tenant (monitoring-only, default zone), seeds tenant flags from the
	 * org defaults, records the registration request, and writes the audit
	 * log. Also used for re-onboarding after integrity drift (PENDING_REVIEW).
	 */
	async approve({
		machineId,
		reviewedBy,
		zone = DEFAULT_ZONE,
	}: ApproveMachineParams): Promise<OnboardingDecision | null> {
		const machine = await db
			.select()
			.from(discoveredMachines)
			.where(eq(discoveredMachines.id, machineId))
			.get()
		if (!machine) return null

		const currentState = machine.state as MachineDiscoveryState
		if (!APPROVABLE_STATES.includes(currentState)) {
			throw new OnboardingStateError(
				`Cannot approve machine in state ${currentState} — only ${APPROVABLE_STATES.join(', ')} are approvable`,
			)
		}

		const now = new Date()
		const fingerprint = machine.fingerprint
			? parseJson<HardwareFingerprint>(String(machine.fingerprint))
			: null

		const decision = await db.transaction(async (tx) => {
			// 1. Promote the discovered machine to ADMITTED.
			await tx
				.update(discoveredMachines)
				.set({
					state: 'ADMITTED',
					confirmedAt: now,
					confirmedBy: reviewedBy,
				})
				.where(eq(discoveredMachines.id, machineId))

			// 2. Record the registration request as APPROVED.
			const existingRequest = await tx
				.select()
				.from(registrationRequests)
				.where(eq(registrationRequests.machineId, machineId))
				.get()

			let requestId: string
			if (existingRequest) {
				requestId = String(existingRequest.id)
				await tx
					.update(registrationRequests)
					.set({
						status: 'APPROVED',
						denialReason: null,
						reviewedBy,
						reviewedAt: now,
					})
					.where(eq(registrationRequests.id, requestId))
			} else {
				requestId = crypto.randomUUID()
				await tx.insert(registrationRequests).values({
					id: requestId,
					machineId,
					requestedBy: machine.source,
					status: 'APPROVED',
					denialReason: null,
					reviewedBy,
					reviewedAt: now,
					createdAt: now,
				})
			}

			// 3. Create (or update) the managed machine tenant.
			const existingMachine = await tx
				.select()
				.from(machines)
				.where(eq(machines.hostname, machine.hostname))
				.get()

			let machineRecordId: string
			if (existingMachine) {
				machineRecordId = String(existingMachine.id)
				await tx
					.update(machines)
					.set({
						// Re-admission after drift: keep the tenant, refresh specs.
						specs: fingerprintToSpecs(fingerprint) ?? existingMachine.specs,
						monitoringOnly: true,
						zone: existingMachine.zone ?? zone,
						lastSeen: now,
					})
					.where(eq(machines.id, machineRecordId))
			} else {
				machineRecordId = machineId
				await tx.insert(machines).values({
					id: machineRecordId,
					name: machine.hostname,
					hostname: machine.hostname,
					status: 'active',
					role: 'Managed AI Machine',
					hasDpu: false,
					specs: fingerprintToSpecs(fingerprint),
					monitoringOnly: true,
					zone,
					lastSeen: now,
					createdAt: now,
				})
			}

			// 4. Seed tenant flags from the org/zone defaults (ADR-138 §4).
			// Runs on the tx handle so flag seeding rolls back with the
			// decision — no orphaned machine_flag rows on rollback.
			await seedDefaultFlags(tx as any, machineRecordId)

			// 5. Audit log (ADR-140 — append-only).
			await tx.insert(killSwitchAuditLog).values({
				id: crypto.randomUUID(),
				timestamp: now,
				userId: reviewedBy,
				reason: 'onboarding.approve',
				previousState: currentState,
				newState: 'ADMITTED',
				traceId: crypto.randomUUID(),
				machineId,
				severity: 'info',
				metadata: JSON.stringify({
					hostname: machine.hostname,
					zone,
					monitoringOnly: true,
					registrationRequestId: requestId,
				}),
			})

			return {
				machineRecordId,
				requestId,
			}
		})

		const updated = await db
			.select()
			.from(discoveredMachines)
			.where(eq(discoveredMachines.id, machineId))
			.get()
		const request = await db
			.select()
			.from(registrationRequests)
			.where(eq(registrationRequests.id, decision.requestId))
			.get()
		const machineRecord = await db
			.select()
			.from(machines)
			.where(eq(machines.id, decision.machineRecordId))
			.get()

		return {
			machine: updated
				? serializeDiscoveredMachine(
						updated as unknown as Record<string, unknown>,
					)
				: (null as unknown as DiscoveredMachine),
			registration: request
				? serializeRegistrationRequest(
						request as unknown as Record<string, unknown>,
					)
				: (null as unknown as RegistrationRequest),
			machineRecord: machineRecord
				? {
						id: String(machineRecord.id),
						name: String(machineRecord.name),
						hostname: String(machineRecord.hostname),
						monitoringOnly: Boolean(machineRecord.monitoringOnly),
						zone: String(machineRecord.zone),
					}
				: null,
			rogueAlert: null,
		}
	}

	/**
	 * Deny a discovered machine (full-privilege admin, ADR-138 §2).
	 * Blocks the machine with zero authority, records the denial, and —
	 * after ROGUE_ALERT_DENIAL_THRESHOLD denials from the same
	 * hostname/IP — raises a rogue-device alert.
	 */
	async deny({
		machineId,
		reviewedBy,
		denialReason,
	}: DenyMachineParams): Promise<OnboardingDecision | null> {
		const machine = await db
			.select()
			.from(discoveredMachines)
			.where(eq(discoveredMachines.id, machineId))
			.get()
		if (!machine) return null

		const currentState = machine.state as MachineDiscoveryState
		if (!DENIABLE_STATES.includes(currentState)) {
			throw new OnboardingStateError(
				`Cannot deny machine in state ${currentState} — only ${DENIABLE_STATES.join(', ')} are deniable`,
			)
		}

		const now = new Date()

		const decision = await db.transaction(async (tx) => {
			// 1. Block the machine.
			await tx
				.update(discoveredMachines)
				.set({
					state: 'DENIED',
					confirmedAt: now,
					confirmedBy: reviewedBy,
				})
				.where(eq(discoveredMachines.id, machineId))

			// 2. Record the registration request as DENIED.
			const existingRequest = await tx
				.select()
				.from(registrationRequests)
				.where(eq(registrationRequests.machineId, machineId))
				.get()

			let requestId: string
			if (existingRequest) {
				requestId = String(existingRequest.id)
				await tx
					.update(registrationRequests)
					.set({
						status: 'DENIED',
						denialReason: denialReason ?? null,
						reviewedBy,
						reviewedAt: now,
					})
					.where(eq(registrationRequests.id, requestId))
			} else {
				requestId = crypto.randomUUID()
				await tx.insert(registrationRequests).values({
					id: requestId,
					machineId,
					requestedBy: machine.source,
					status: 'DENIED',
					denialReason: denialReason ?? null,
					reviewedBy,
					reviewedAt: now,
					createdAt: now,
				})
			}

			// 3. Rogue-device detection: count denials for this hostname/IP.
			const denialCount = await tx
				.select({ id: discoveredMachines.id })
				.from(discoveredMachines)
				.where(
					and(
						eq(discoveredMachines.hostname, machine.hostname),
						eq(discoveredMachines.state, 'DENIED'),
					),
				)
				.all()

			let rogueAlertId: string | null = null
			if (denialCount.length >= ROGUE_ALERT_DENIAL_THRESHOLD) {
				const existingAlert = await tx
					.select()
					.from(rogueDeviceAlerts)
					.where(
						and(
							eq(rogueDeviceAlerts.hostname, machine.hostname),
							eq(rogueDeviceAlerts.resolved, false),
						),
					)
					.get()

				if (existingAlert) {
					rogueAlertId = String(existingAlert.id)
					await tx
						.update(rogueDeviceAlerts)
						.set({
							denialCount: denialCount.length,
							lastDeniedAt: now,
						})
						.where(eq(rogueDeviceAlerts.id, rogueAlertId))
				} else {
					rogueAlertId = crypto.randomUUID()
					await tx.insert(rogueDeviceAlerts).values({
						id: rogueAlertId,
						hostname: machine.hostname,
						ip: machine.ip,
						denialCount: denialCount.length,
						lastDeniedAt: now,
						resolved: false,
						resolvedBy: null,
						resolvedAt: null,
						createdAt: now,
					})
				}
			}

			// 4. Audit log (ADR-140 — append-only).
			await tx.insert(killSwitchAuditLog).values({
				id: crypto.randomUUID(),
				timestamp: now,
				userId: reviewedBy,
				reason: 'onboarding.deny',
				previousState: currentState,
				newState: 'DENIED',
				traceId: crypto.randomUUID(),
				machineId,
				severity: rogueAlertId ? 'high' : 'medium',
				metadata: JSON.stringify({
					hostname: machine.hostname,
					ip: machine.ip,
					denialReason: denialReason ?? null,
					denialCount: denialCount.length,
					rogueAlertId,
				}),
			})

			return { requestId, rogueAlertId }
		})

		const updated = await db
			.select()
			.from(discoveredMachines)
			.where(eq(discoveredMachines.id, machineId))
			.get()
		const request = await db
			.select()
			.from(registrationRequests)
			.where(eq(registrationRequests.id, decision.requestId))
			.get()
		const rogueAlert = decision.rogueAlertId
			? await db
					.select()
					.from(rogueDeviceAlerts)
					.where(eq(rogueDeviceAlerts.id, decision.rogueAlertId))
					.get()
			: null

		return {
			machine: updated
				? serializeDiscoveredMachine(
						updated as unknown as Record<string, unknown>,
					)
				: (null as unknown as DiscoveredMachine),
			registration: request
				? serializeRegistrationRequest(
						request as unknown as Record<string, unknown>,
					)
				: (null as unknown as RegistrationRequest),
			machineRecord: null,
			rogueAlert: rogueAlert
				? serializeRogueAlert(rogueAlert as unknown as Record<string, unknown>)
				: null,
		}
	}

	/**
	 * List machines awaiting human confirmation. NEW_MACHINE is the
	 * provisional state written by discovery (it covers what ADR-138
	 * originally envisioned as PENDING_CONFIRMATION), so both states are
	 * returned as "pending" — as is PENDING_REVIEW, because ADR-138 §4
	 * machines returned by integrity drift are the highest-severity items
	 * in the admin work queue and must not be invisible to it.
	 */
	async listPending(): Promise<DiscoveredMachine[]> {
		const rows = await db
			.select()
			.from(discoveredMachines)
			.where(
				inArray(discoveredMachines.state, [
					'NEW_MACHINE',
					'PENDING_CONFIRMATION',
					'PENDING_REVIEW',
				]),
			)
			.orderBy(desc(discoveredMachines.lastSeen))
			.all()
		return rows.map((row) =>
			serializeDiscoveredMachine(row as unknown as Record<string, unknown>),
		)
	}

	/**
	 * List rogue-device alerts (unresolved first, then by recency).
	 * Unresolved alerts are the actionable ones; resolved alerts trail
	 * behind them for audit visibility.
	 */
	async listRogueAlerts(): Promise<RogueDeviceAlert[]> {
		const rows = await db
			.select()
			.from(rogueDeviceAlerts)
			.orderBy(
				asc(rogueDeviceAlerts.resolved),
				desc(rogueDeviceAlerts.lastDeniedAt),
			)
			.all()
		return rows.map((row) =>
			serializeRogueAlert(row as unknown as Record<string, unknown>),
		)
	}

	/**
	 * Re-onboarding on integrity drift (ADR-138 §4): a high-severity
	 * tamper/swap event returns an ADMITTED machine to PENDING_REVIEW,
	 * requiring re-confirmation before it can operate normally again.
	 * No-op for machines not currently ADMITTED.
	 */
	async flagForReview(machineId: string): Promise<boolean> {
		const machine = await db
			.select()
			.from(discoveredMachines)
			.where(eq(discoveredMachines.id, machineId))
			.get()
		if (!machine) return false
		if (machine.state !== 'ADMITTED') return false

		const now = new Date()
		await db
			.update(discoveredMachines)
			.set({ state: 'PENDING_REVIEW' })
			.where(eq(discoveredMachines.id, machineId))

		await db.insert(killSwitchAuditLog).values({
			id: crypto.randomUUID(),
			timestamp: now,
			userId: 'system',
			reason: 'onboarding.integrity-drift',
			previousState: 'ADMITTED',
			newState: 'PENDING_REVIEW',
			traceId: crypto.randomUUID(),
			machineId,
			severity: 'high',
			metadata: JSON.stringify({
				hostname: machine.hostname,
				note: 'High-severity integrity drift — re-confirmation required (ADR-138 §4).',
			}),
		})

		return true
	}

	/**
	 * Monitoring-only gate (ADR-138 §3): a machine tenant may report
	 * telemetry but cannot receive active responses until onboarding is
	 * fully completed. Returns true when the machine is in monitoring-only
	 * mode (or has no managed record yet — safe default).
	 */
	async isMonitoringOnly(machineId: string): Promise<boolean> {
		const machine = await db
			.select({ monitoringOnly: machines.monitoringOnly })
			.from(machines)
			.where(eq(machines.id, machineId))
			.get()
		// No managed record → not admitted → no active responses.
		return machine ? Boolean(machine.monitoringOnly) : true
	}
}
