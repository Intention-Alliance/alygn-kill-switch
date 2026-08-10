/**
 * Discovery Orchestrator (ADR-135)
 *
 * Ties the three discovery domains together:
 *   1. Machine discovery (network sweep + agent heartbeat)
 *   2. Hardware integrity fingerprint (collect → sign → drift-check)
 *   3. Model & provider detection (probe provider adapters)
 *
 * Persists provisional results to SQLite. NOTHING is authoritative
 * until a human confirms the machine (ADR-135 §5, ADR-138).
 */

import type {
	DiscoveredMachine,
	DiscoveredModel,
	DiscoveredProvider,
	DiscoveryReport,
	HardwareFingerprint,
	IntegrityDrift,
	IntegritySignature,
	MachineDiscoveryState,
} from '@align/shared-types'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index'
import {
	discoveredMachines,
	discoveredModels,
	discoveredProviders,
	integrityEvents,
} from '../../db/schema'
import { OnboardingService } from '../onboarding'
import {
	collectHardwareFingerprint,
	compareFingerprints,
	detectFingerprintDrift,
	signFingerprint,
} from './fingerprint'
import { runNetworkDiscovery } from './machine-discovery'
import {
	type ProviderProbeResult,
	ProviderRegistry,
} from './providers/registry'

// ─── Types ───────────────────────────────────────────────────────

export interface HeartbeatDiscoveryParams {
	machineId: string
	hostname: string
	fingerprint?: HardwareFingerprint
}

export interface DiscoveryOrchestratorParams {
	providerRegistry?: ProviderRegistry
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
			? parseJson<IntegritySignature>(String(row.integritySignature))
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

// ─── Orchestrator ────────────────────────────────────────────────

export class DiscoveryOrchestrator {
	private readonly providerRegistry: ProviderRegistry

	constructor({ providerRegistry }: DiscoveryOrchestratorParams = {}) {
		this.providerRegistry = providerRegistry ?? new ProviderRegistry()
	}

	/**
	 * Agent heartbeat path (authoritative registration, ADR-133/135 §2).
	 * Collects the hardware fingerprint, signs it, checks for drift against
	 * the stored baseline, and upserts the machine + agent heartbeat.
	 *
	 * Returns the drift report when hardware changed (tamper/swap event).
	 */
	async handleHeartbeat({
		machineId,
		hostname,
		fingerprint,
	}: HeartbeatDiscoveryParams): Promise<{
		drift: IntegrityDrift | null
		signature: IntegritySignature
	}> {
		const current = fingerprint ?? collectHardwareFingerprint()
		const signature = signFingerprint(current)
		const now = new Date()

		const existing = await db
			.select()
			.from(discoveredMachines)
			.where(eq(discoveredMachines.id, machineId))
			.get()

		let drift: IntegrityDrift | null = null

		if (existing) {
			const baseline = existing.fingerprint
				? parseJson<HardwareFingerprint>(String(existing.fingerprint))
				: null
			if (baseline) {
				drift = compareFingerprints(current, baseline, machineId)
			} else {
				// No stored fingerprint snapshot (e.g. a row written before
				// snapshots existed) — fall back to signature-only drift
				// detection against the persisted integrity signature.
				const baselineSignature = existing.integritySignature
					? parseJson<IntegritySignature>(String(existing.integritySignature))
					: null
				if (baselineSignature) {
					drift = detectFingerprintDrift(current, baselineSignature, machineId)
				}
			}
			if (drift) {
				await db.insert(integrityEvents).values({
					id: crypto.randomUUID(),
					machineId,
					event: drift.event,
					severity: drift.severity,
					driftedFields: JSON.stringify(drift.driftedFields),
					detectedAt: now,
				})
				// ADR-138 §4: high-severity tamper/swap returns an ADMITTED
				// machine to PENDING_REVIEW — re-confirmation required before
				// it can operate normally again. No-op for non-admitted machines.
				if (drift.severity === 'high') {
					const onboarding = new OnboardingService()
					await onboarding.flagForReview(machineId)
				}
			}
			await db
				.update(discoveredMachines)
				.set({
					hostname,
					fingerprint: JSON.stringify(current),
					integritySignature: JSON.stringify(signature),
					lastSeen: now,
				})
				.where(eq(discoveredMachines.id, machineId))
		} else {
			await db.insert(discoveredMachines).values({
				id: machineId,
				hostname,
				ip: null,
				source: 'heartbeat',
				state: 'NEW_MACHINE', // NO auto-admission (ADR-135 §5)
				fingerprint: JSON.stringify(current),
				integritySignature: JSON.stringify(signature),
				firstSeen: now,
				lastSeen: now,
				confirmedAt: null,
				confirmedBy: null,
			})
		}

		return { drift, signature }
	}

	/**
	 * Probe all provider adapters for this machine and persist the
	 * detected providers + models (provisional until confirmation).
	 */
	async detectProvidersForMachine(
		machineId: string,
	): Promise<ProviderProbeResult[]> {
		const results = await this.providerRegistry.discoverProviders()
		const now = new Date()

		for (const result of results) {
			const existingProvider = await db
				.select()
				.from(discoveredProviders)
				.where(
					and(
						eq(discoveredProviders.machineId, machineId),
						eq(discoveredProviders.providerId, result.provider.id),
					),
				)
				.get()

			if (existingProvider) {
				await db
					.update(discoveredProviders)
					.set({
						baseUrl: result.provider.baseUrl,
						version: result.provider.version,
						status: result.health.healthy ? 'healthy' : 'unhealthy',
						lastHealthyAt: result.health.healthy
							? now
							: existingProvider.lastHealthyAt,
					})
					.where(eq(discoveredProviders.id, existingProvider.id))
			} else {
				await db.insert(discoveredProviders).values({
					id: crypto.randomUUID(),
					machineId,
					providerId: result.provider.id,
					baseUrl: result.provider.baseUrl,
					version: result.provider.version,
					status: result.health.healthy ? 'healthy' : 'unhealthy',
					detectedAt: now,
					lastHealthyAt: result.health.healthy ? now : null,
				})
			}

			for (const model of result.models) {
				const existingModel = await db
					.select()
					.from(discoveredModels)
					.where(
						and(
							eq(discoveredModels.machineId, machineId),
							eq(discoveredModels.modelId, model.id),
						),
					)
					.get()

				if (existingModel) {
					await db
						.update(discoveredModels)
						.set({
							name: model.name,
							sizeBytes: model.sizeBytes,
							quantization: model.quantization,
							family: model.family,
							served: model.served,
						})
						.where(eq(discoveredModels.id, existingModel.id))
				} else {
					await db.insert(discoveredModels).values({
						id: crypto.randomUUID(),
						machineId,
						providerId: model.providerId,
						modelId: model.id,
						name: model.name,
						sizeBytes: model.sizeBytes,
						quantization: model.quantization,
						family: model.family,
						served: model.served,
						detectedAt: now,
					})
				}
			}
		}

		return results
	}

	/**
	 * Opportunistic network sweep (mDNS + ARP/ICMP). Newly seen hosts are
	 * inserted as NEW_MACHINE — never auto-admitted. Already-registered
	 * hosts are skipped (heartbeat is the authoritative path).
	 */
	async runNetworkSweep(): Promise<{
		discovered: DiscoveredMachine[]
		skipped: number
	}> {
		const sweep = await runNetworkDiscovery()
		const discovered: DiscoveredMachine[] = []
		let skipped = 0

		for (const host of sweep.hosts) {
			const existing = await db
				.select({ id: discoveredMachines.id })
				.from(discoveredMachines)
				.where(eq(discoveredMachines.hostname, host.hostname))
				.get()

			if (existing) {
				skipped++
				continue
			}

			const now = new Date()
			await db.insert(discoveredMachines).values({
				id: host.id,
				hostname: host.hostname,
				ip: host.ip,
				source: host.source,
				state: 'NEW_MACHINE',
				fingerprint: null,
				integritySignature: null,
				firstSeen: now,
				lastSeen: now,
				confirmedAt: null,
				confirmedBy: null,
			})
			discovered.push(host)
		}

		return { discovered, skipped }
	}

	/**
	 * Build the full discovery report for a machine — what the admin
	 * reviews during onboarding (ADR-138).
	 */
	async getDiscoveryReport(machineId: string): Promise<DiscoveryReport | null> {
		const machine = await db
			.select()
			.from(discoveredMachines)
			.where(eq(discoveredMachines.id, machineId))
			.get()
		if (!machine) return null

		const providers = await db
			.select()
			.from(discoveredProviders)
			.where(eq(discoveredProviders.machineId, machineId))
			.all()

		const models = await db
			.select()
			.from(discoveredModels)
			.where(eq(discoveredModels.machineId, machineId))
			.all()

		const latestDrift = await db
			.select()
			.from(integrityEvents)
			.where(eq(integrityEvents.machineId, machineId))
			.orderBy(desc(integrityEvents.detectedAt))
			.get()

		const providerList: DiscoveredProvider[] = providers.map((row) => ({
			id: String(row.id),
			machineId: String(row.machineId),
			providerId: row.providerId as DiscoveredProvider['providerId'],
			baseUrl: row.baseUrl ? String(row.baseUrl) : null,
			version: row.version ? String(row.version) : null,
			status: row.status as DiscoveredProvider['status'],
			detectedAt: new Date(Number(row.detectedAt)).toISOString(),
			lastHealthyAt: row.lastHealthyAt
				? new Date(Number(row.lastHealthyAt)).toISOString()
				: null,
		}))

		const modelList: DiscoveredModel[] = models.map((row) => ({
			id: String(row.id),
			machineId: String(row.machineId),
			providerId: row.providerId as DiscoveredModel['providerId'],
			modelId: String(row.modelId),
			name: String(row.name),
			sizeBytes: row.sizeBytes !== null ? Number(row.sizeBytes) : null,
			quantization: row.quantization ? String(row.quantization) : null,
			family: row.family ? String(row.family) : null,
			served: Boolean(row.served),
			detectedAt: new Date(Number(row.detectedAt)).toISOString(),
		}))

		return {
			machine: serializeDiscoveredMachine(
				machine as unknown as Record<string, unknown>,
			),
			providers: providerList,
			models: modelList,
			integrity: {
				signature: machine.integritySignature
					? parseJson<IntegritySignature>(String(machine.integritySignature))
					: null,
				drift: latestDrift
					? {
							event: latestDrift.event as IntegrityDrift['event'],
							machineId: String(latestDrift.machineId),
							driftedFields: latestDrift.driftedFields
								? (JSON.parse(String(latestDrift.driftedFields)) as string[])
								: [],
							severity: latestDrift.severity as IntegrityDrift['severity'],
							detectedAt: new Date(
								Number(latestDrift.detectedAt),
							).toISOString(),
						}
					: null,
			},
		}
	}

	/**
	 * Human confirmation (ADR-138). Only a full-privilege admin may move a
	 * machine out of NEW_MACHINE/PENDING_CONFIRMATION/PENDING_REVIEW.
	 * Delegates to the OnboardingService so approval creates the managed
	 * machine tenant (monitoring-only) and denial records the block + raises
	 * rogue-device alerts on repeated attempts. Denial keeps the machine
	 * provisional with zero authority.
	 */
	async confirmMachine(
		machineId: string,
		confirmedBy: string,
		approve: boolean,
	): Promise<DiscoveredMachine | null> {
		const onboarding = new OnboardingService()
		if (approve) {
			const decision = await onboarding.approve({
				machineId,
				reviewedBy: confirmedBy,
			})
			return decision?.machine ?? null
		}
		const decision = await onboarding.deny({
			machineId,
			reviewedBy: confirmedBy,
		})
		return decision?.machine ?? null
	}
}
