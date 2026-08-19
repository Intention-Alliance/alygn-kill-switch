/**
 * Discovery Orchestrator — Unit Tests (ADR-135)
 *
 * Covers the full orchestration flow with a mocked Drizzle db:
 *   - heartbeat: fingerprint collection, signing, drift detection
 *   - NO auto-admission: sweep results enter NEW_MACHINE
 *   - provider detection persistence
 *   - human confirmation (approve/deny)
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type {
	HardwareFingerprint,
	IntegritySignature,
} from '@align/shared-types'

// ─── In-memory stores ───────────────────────────────────────────

interface MachineRow {
	id: string
	hostname: string
	ip: string | null
	source: string
	state: string
	fingerprint: string | null
	integritySignature: string | null
	firstSeen: Date
	lastSeen: Date
	confirmedAt: Date | null
	confirmedBy: string | null
}

interface ProviderRow {
	id: string
	machineId: string
	providerId: string
	baseUrl: string | null
	version: string | null
	status: string
	detectedAt: Date
	lastHealthyAt: Date | null
}

interface ModelRow {
	id: string
	machineId: string
	providerId: string
	modelId: string
	name: string
	sizeBytes: number | null
	quantization: string | null
	family: string | null
	served: boolean
	detectedAt: Date
}

interface IntegrityRow {
	id: string
	machineId: string
	event: string
	severity: string
	driftedFields: string | null
	detectedAt: Date
}

let machinesStore: MachineRow[] = []
let providersStore: ProviderRow[] = []
let modelsStore: ModelRow[] = []
let integrityStore: IntegrityRow[] = []

beforeEach(() => {
	machinesStore = []
	providersStore = []
	modelsStore = []
	integrityStore = []
})

// ─── Mock drizzle-orm eq ────────────────────────────────────────

mock.module('drizzle-orm', () => ({
	eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
	and: (...conds: any[]) => conds,
	desc: (col: any) => ({ __desc: col?.name }),
	asc: (col: any) => ({ __asc: col?.name }),
	inArray: (col: any, values: any[]) => ({
		__in: values,
		__leftName: col?.name,
	}),
}))

// ─── Mock db module ─────────────────────────────────────────────

// Track the last eq value(s) for filtering
let _eqValues: unknown[] = []

function resetEqValues() {
	_eqValues = []
}

function matchesFilters(row: Record<string, unknown>): boolean {
	// _eqValues are [columnName, value] pairs captured by the where chain.
	// Drizzle column .name is the DB name (snake_case); rows use camelCase.
	const camelize = (name: string): string =>
		name.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
	for (let i = 0; i < _eqValues.length; i += 2) {
		const column = camelize(String(_eqValues[i]))
		const value = _eqValues[i + 1]
		if (row[column] !== value) return false
	}
	return true
}

function makeTableProxy(store: any[], tableName: string) {
	return {
		select: () => ({
			from: (_table: unknown) => ({
				where: (cond: any) => {
					_eqValues.push(cond?.__leftName, cond?.__eq)
					return {
						where: (cond2: any) => {
							_eqValues.push(cond2?.__leftName, cond2?.__eq)
							return {
								get: async () =>
									store.find((row) => matchesFilters(row)) ?? null,
								all: async () => store.filter((row) => matchesFilters(row)),
								orderBy: () => ({
									get: async () =>
										store.filter((row) => matchesFilters(row))[
											store.length - 1
										] ?? null,
									all: async () => store.filter((row) => matchesFilters(row)),
								}),
								limit: () => ({
									all: async () => store.filter((row) => matchesFilters(row)),
								}),
							}
						},
						get: async () => store.find((row) => matchesFilters(row)) ?? null,
						all: async () => store.filter((row) => matchesFilters(row)),
						orderBy: () => ({
							get: async () =>
								store.filter((row) => matchesFilters(row))[store.length - 1] ??
								null,
							all: async () => store.filter((row) => matchesFilters(row)),
						}),
						limit: () => ({
							all: async () => store.filter((row) => matchesFilters(row)),
						}),
					}
				},
				get: async () => store[0] ?? null,
				all: async () => store,
				orderBy: () => ({
					get: async () => store[store.length - 1] ?? null,
					all: async () => store,
				}),
				limit: () => ({ all: async () => store }),
			}),
		}),
		insert: () => ({
			values: async (values: any) => {
				store.push(values)
				return { lastInsertRowid: store.length }
			},
		}),
		update: () => ({
			set: (values: any) => ({
				where: (cond: any) => {
					_eqValues.push(cond?.__leftName, cond?.__eq)
					const target = store.find((row) => matchesFilters(row))
					if (target) Object.assign(target, values)
					return { get: async () => null }
				},
			}),
		}),
		delete: () => ({
			where: () => ({ get: async () => null }),
		}),
	}
}

function tableName(table: any): string {
	return table?.[Symbol.for('drizzle:Name')] ?? table?.name ?? ''
}

mock.module('../../../db/index', () => {
	const dbMock = {
		select: () => ({
			from: (table: any) => {
				resetEqValues()
				const name = tableName(table)
				if (name === 'discovered_machine')
					return makeTableProxy(machinesStore, name).select().from(table)
				if (name === 'discovered_provider')
					return makeTableProxy(providersStore, name).select().from(table)
				if (name === 'discovered_model')
					return makeTableProxy(modelsStore, name).select().from(table)
				if (name === 'integrity_event')
					return makeTableProxy(integrityStore, name).select().from(table)
				return makeTableProxy([], name).select().from(table)
			},
		}),
		insert: (table: any) => {
			const name = tableName(table)
			if (name === 'discovered_machine')
				return makeTableProxy(machinesStore, name).insert()
			if (name === 'discovered_provider')
				return makeTableProxy(providersStore, name).insert()
			if (name === 'discovered_model')
				return makeTableProxy(modelsStore, name).insert()
			if (name === 'integrity_event')
				return makeTableProxy(integrityStore, name).insert()
			return makeTableProxy([], name).insert()
		},
		update: (table: any) => {
			const name = tableName(table)
			if (name === 'discovered_machine')
				return makeTableProxy(machinesStore, name).update()
			if (name === 'discovered_provider')
				return makeTableProxy(providersStore, name).update()
			if (name === 'discovered_model')
				return makeTableProxy(modelsStore, name).update()
			return makeTableProxy([], name).update()
		},
		// ADR-138: onboarding decisions run inside a transaction. The mock
		// executes the callback against the same in-memory db object so
		// reads/writes share the same stores.
		transaction: async (cb: (tx: any) => Promise<unknown>) => cb(dbMock),
	}
	return { db: dbMock }
})

// ─── Mock provider registry ─────────────────────────────────────

const fakeProviderResult = {
	provider: {
		id: 'ollama',
		name: 'Ollama',
		version: null,
		baseUrl: 'http://127.0.0.1:11434',
		detectedAt: '2026-08-08T00:00:00.000Z',
	},
	models: [
		{
			id: 'llama3:8b',
			name: 'llama3:8b',
			providerId: 'ollama',
			sizeBytes: 4691249611,
			quantization: 'Q4_K_M',
			family: 'llama',
			served: true,
		},
	],
	health: {
		healthy: true,
		latencyMs: 5,
		error: null,
		checkedAt: '2026-08-08T00:00:00.000Z',
	},
}

// Stub registry injected via constructor (dependency injection) instead of
// module mocking. The orchestrator already accepts a `providerRegistry`
// constructor arg, so we avoid `mock.module('../providers/registry', ...)`
// entirely — that module-scope mock leaked into providers.test.ts (which runs
// after this file alphabetically in the full sweep), replacing the real
// ProviderRegistry and causing 4 false failures (e.g. probeProvider returning
// a fake result instead of null for unknown ids).
class StubProviderRegistry {
	async discoverProviders() {
		return [fakeProviderResult]
	}
	async probeProvider() {
		return fakeProviderResult
	}
}

// ─── Tests ──────────────────────────────────────────────────────

let DiscoveryOrchestrator: any
let collectHardwareFingerprint: any
let signFingerprint: (fp: HardwareFingerprint) => IntegritySignature

beforeEach(async () => {
	const mod = await import('../orchestrator')
	DiscoveryOrchestrator = mod.DiscoveryOrchestrator
	const fpMod = await import('../fingerprint')
	collectHardwareFingerprint = fpMod.collectHardwareFingerprint
	signFingerprint = fpMod.signFingerprint
})

describe('DiscoveryOrchestrator', () => {
	it('registers a new machine via heartbeat in NEW_MACHINE state (NO auto-admission)', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		const fp = collectHardwareFingerprint()
		const result = await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: fp,
		})

		expect(result.drift).toBeNull()
		expect(result.signature.hash).toMatch(/^[0-9a-f]{64}$/)
		expect(machinesStore.length).toBe(1)
		expect(machinesStore[0].state).toBe('NEW_MACHINE')
		expect(machinesStore[0].hostname).toBe('worker-01')
	})

	it('detects drift on heartbeat when hardware changed', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		const baseline = collectHardwareFingerprint()
		await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: baseline,
		})

		const tampered: HardwareFingerprint = {
			...baseline,
			macs: ['11:22:33:44:55:66'],
			collectedAt: new Date().toISOString(),
		}
		const result = await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: tampered,
		})

		expect(result.drift).not.toBeNull()
		expect(result.drift!.event).toBe('swap')
		expect(result.drift!.severity).toBe('high')
		expect(result.drift!.driftedFields).toContain('macs')
		// Integrity event persisted
		expect(integrityStore.length).toBe(1)
		expect(integrityStore[0].event).toBe('swap')
	})

	it('high-severity drift on an ADMITTED machine → PENDING_REVIEW (ADR-138 §4)', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		const baseline = collectHardwareFingerprint()

		// An already-admitted machine (onboarding completed).
		machinesStore.push({
			id: 'machine-1',
			hostname: 'worker-01',
			ip: null,
			source: 'heartbeat',
			state: 'ADMITTED',
			fingerprint: JSON.stringify(baseline),
			integritySignature: JSON.stringify(signFingerprint(baseline)),
			firstSeen: new Date(),
			lastSeen: new Date(),
			confirmedAt: new Date(),
			confirmedBy: 'admin@alygn.com',
		})

		const tampered: HardwareFingerprint = {
			...baseline,
			macs: ['11:22:33:44:55:66'],
			collectedAt: new Date().toISOString(),
		}
		const result = await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: tampered,
		})

		// High-severity drift detected and persisted.
		expect(result.drift).not.toBeNull()
		expect(result.drift!.severity).toBe('high')
		expect(integrityStore.length).toBe(1)

		// flagForReview fired: the ADMITTED machine returned to
		// PENDING_REVIEW — re-confirmation required (ADR-138 §4).
		expect(machinesStore[0].state).toBe('PENDING_REVIEW')
	})

	it('high-severity drift on a NEW_MACHINE is a no-op for flagForReview', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		const baseline = collectHardwareFingerprint()

		// Not yet admitted — flagForReview must not change the state.
		machinesStore.push({
			id: 'machine-1',
			hostname: 'worker-01',
			ip: null,
			source: 'heartbeat',
			state: 'NEW_MACHINE',
			fingerprint: JSON.stringify(baseline),
			integritySignature: JSON.stringify(signFingerprint(baseline)),
			firstSeen: new Date(),
			lastSeen: new Date(),
			confirmedAt: null,
			confirmedBy: null,
		})

		const tampered: HardwareFingerprint = {
			...baseline,
			macs: ['11:22:33:44:55:66'],
			collectedAt: new Date().toISOString(),
		}
		const result = await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: tampered,
		})

		expect(result.drift).not.toBeNull()
		expect(result.drift!.severity).toBe('high')
		// Still NEW_MACHINE — flagForReview no-ops for non-admitted machines.
		expect(machinesStore[0].state).toBe('NEW_MACHINE')
	})

	it('falls back to signature-only drift when no fingerprint snapshot exists', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		const baseline = collectHardwareFingerprint()
		const baselineSignature = signFingerprint(baseline)

		// Pre-existing row with only an integrity signature (no snapshot)
		machinesStore.push({
			id: 'machine-legacy',
			hostname: 'worker-legacy',
			ip: null,
			source: 'heartbeat',
			state: 'NEW_MACHINE',
			fingerprint: null,
			integritySignature: JSON.stringify(baselineSignature),
			firstSeen: new Date(),
			lastSeen: new Date(),
			confirmedAt: null,
			confirmedBy: null,
		})

		const tampered: HardwareFingerprint = {
			...baseline,
			macs: ['11:22:33:44:55:66'],
			collectedAt: new Date().toISOString(),
		}
		const result = await orchestrator.handleHeartbeat({
			machineId: 'machine-legacy',
			hostname: 'worker-legacy',
			fingerprint: tampered,
		})

		expect(result.drift).not.toBeNull()
		expect(result.drift!.event).toBe('tamper')
		expect(result.drift!.severity).toBe('high')
		expect(result.drift!.driftedFields).toEqual([])
		// Integrity event persisted
		expect(integrityStore.length).toBe(1)
		expect(integrityStore[0].event).toBe('tamper')
	})

	it('persists detected providers and models for a machine', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: collectHardwareFingerprint(),
		})

		const results = await orchestrator.detectProvidersForMachine('machine-1')
		expect(results.length).toBe(1)
		expect(providersStore.length).toBe(1)
		expect(providersStore[0].providerId).toBe('ollama')
		expect(providersStore[0].status).toBe('healthy')
		expect(modelsStore.length).toBe(1)
		expect(modelsStore[0].modelId).toBe('llama3:8b')
	})

	it('builds a full discovery report for onboarding review', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: collectHardwareFingerprint(),
		})
		await orchestrator.detectProvidersForMachine('machine-1')

		const report = await orchestrator.getDiscoveryReport('machine-1')
		expect(report).not.toBeNull()
		expect(report!.machine.id).toBe('machine-1')
		expect(report!.machine.state).toBe('NEW_MACHINE')
		expect(report!.providers.length).toBe(1)
		expect(report!.models.length).toBe(1)
		expect(report!.integrity.signature).not.toBeNull()
		expect(report!.integrity.drift).toBeNull()
	})

	it('returns null report for unknown machine', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		const report = await orchestrator.getDiscoveryReport('machine-unknown')
		expect(report).toBeNull()
	})

	it('confirms a machine (human approval, ADR-138)', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: collectHardwareFingerprint(),
		})

		const confirmed = await orchestrator.confirmMachine(
			'machine-1',
			'admin@alygn.com',
			true,
		)
		expect(confirmed).not.toBeNull()
		expect(confirmed!.state).toBe('ADMITTED')
		expect(confirmed!.confirmedBy).toBe('admin@alygn.com')
		expect(confirmed!.confirmedAt).not.toBeNull()
	})

	it('denies a machine (zero authority granted)', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		await orchestrator.handleHeartbeat({
			machineId: 'machine-1',
			hostname: 'worker-01',
			fingerprint: collectHardwareFingerprint(),
		})

		const denied = await orchestrator.confirmMachine(
			'machine-1',
			'admin@alygn.com',
			false,
		)
		expect(denied).not.toBeNull()
		expect(denied!.state).toBe('DENIED')
	})

	it('returns null when confirming an unknown machine', async () => {
		const orchestrator = new DiscoveryOrchestrator({ providerRegistry: new StubProviderRegistry() })
		const result = await orchestrator.confirmMachine(
			'machine-unknown',
			'admin@alygn.com',
			true,
		)
		expect(result).toBeNull()
	})
})
