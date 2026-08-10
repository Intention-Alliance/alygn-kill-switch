/**
 * Onboarding Service — Unit Tests (ADR-138)
 *
 * Covers the service layer with a mocked Drizzle db:
 *   - approve: NEW_MACHINE → ADMITTED + machine tenant + monitoring_only
 *   - deny: NEW_MACHINE → DENIED + audit log + no machine record
 *   - rogue alert: 3 denials from same hostname → rogue_device_alert
 *   - re-onboarding: high-severity drift → PENDING_REVIEW → approve → ADMITTED
 *   - monitoring-only gate: machine in monitoring_only cannot receive active responses
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'

// ─── In-memory stores ───────────────────────────────────────────

interface DiscoveredRow {
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

interface MachineRow {
	id: string
	name: string
	hostname: string
	status: string
	role: string
	hasDpu: boolean
	specs: string | null
	monitoringOnly: boolean
	zone: string
	lastSeen: Date | null
	createdAt: Date
}

interface RegistrationRow {
	id: string
	machineId: string
	requestedBy: string
	status: string
	denialReason: string | null
	reviewedBy: string | null
	reviewedAt: Date | null
	createdAt: Date
}

interface RogueAlertRow {
	id: string
	hostname: string
	ip: string | null
	denialCount: number
	lastDeniedAt: Date
	resolved: boolean
	resolvedBy: string | null
	resolvedAt: Date | null
	createdAt: Date
}

interface AuditRow {
	id: string
	timestamp: Date
	userId: string
	reason: string
	previousState: string
	newState: string
	traceId: string
	machineId: string | null
	severity: string
	metadata: string | null
}

interface IntegrityRow {
	id: string
	machineId: string
	event: string
	severity: string
	driftedFields: string | null
	detectedAt: Date
}

interface FlagRow {
	id: string
	key: string
	value: boolean
	description: string | null
	enabled: boolean
	createdBy: string
	createdAt: Date
	updatedAt: Date
}

interface MachineFlagRow {
	machineId: string
	flagKey: string
	value: string | null
	updatedAt: Date
}

let discoveredStore: DiscoveredRow[] = []
let machinesStore: MachineRow[] = []
let registrationStore: RegistrationRow[] = []
let rogueStore: RogueAlertRow[] = []
let auditStore: AuditRow[] = []
let integrityStore: IntegrityRow[] = []
let flagsStore: FlagRow[] = []
let machineFlagsStore: MachineFlagRow[] = []

// When true, the next db.transaction() callback runs and then the
// transaction "rolls back" — all stores are restored to their pre-
// transaction snapshots and the transaction rejects. Lets tests assert
// that writes inside the transaction (e.g. flag seeding) are atomic.
let rollbackNextTransaction = false

function snapshotStores() {
	// Deep-clone rows: the mock's update() mutates row objects in place,
	// so a shallow array copy would still see post-transaction mutations.
	const clone = <T>(rows: T[]): T[] => rows.map((row) => ({ ...row }))
	return {
		discovered: clone(discoveredStore),
		machines: clone(machinesStore),
		registration: clone(registrationStore),
		rogue: clone(rogueStore),
		audit: clone(auditStore),
		integrity: clone(integrityStore),
		flags: clone(flagsStore),
		machineFlags: clone(machineFlagsStore),
	}
}

function restoreStores(snapshot: ReturnType<typeof snapshotStores>) {
	discoveredStore = snapshot.discovered
	machinesStore = snapshot.machines
	registrationStore = snapshot.registration
	rogueStore = snapshot.rogue
	auditStore = snapshot.audit
	integrityStore = snapshot.integrity
	flagsStore = snapshot.flags
	machineFlagsStore = snapshot.machineFlags
}

beforeEach(() => {
	discoveredStore = []
	machinesStore = []
	registrationStore = []
	rogueStore = []
	auditStore = []
	integrityStore = []
	flagsStore = []
	machineFlagsStore = []
	rollbackNextTransaction = false
})

// ─── Mock drizzle-orm ──────────────────────────────────────────

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

let _eqValues: unknown[] = []

function resetEqValues() {
	_eqValues = []
}

function camelize(name: string): string {
	return name.replace(/_([a-z])/g, (_match, letter: string) =>
		letter.toUpperCase(),
	)
}

function matchesFilters(row: Record<string, unknown>): boolean {
	for (let i = 0; i < _eqValues.length; i += 2) {
		const column = camelize(String(_eqValues[i]))
		const value = _eqValues[i + 1]
		// inArray conditions are captured as raw value arrays.
		if (Array.isArray(value)) {
			if (!value.includes(row[column])) return false
			continue
		}
		if (row[column] !== value) return false
	}
	return true
}

function makeTableProxy(store: any[], tableName: string) {
	// Sort rows by the orderBy conditions: asc(col) → { __asc }, desc(col)
	// → { __desc }. Column names are snake_case; rows use camelCase.
	const sorted = (rows: any[], conds: any[]): any[] => {
		const sorters = conds.map((c: any) => ({
			column: camelize(String(c?.__asc ?? c?.__desc ?? '')),
			dir: c?.__asc !== undefined ? 1 : -1,
		}))
		const arr = [...rows]
		arr.sort((a, b) => {
			for (const s of sorters) {
				if (a[s.column] < b[s.column]) return -1 * s.dir
				if (a[s.column] > b[s.column]) return 1 * s.dir
			}
			return 0
		})
		return arr
	}

	return {
		select: () => ({
			from: (_table: unknown) => ({
				where: (cond: any) => {
					// inArray conditions carry { __in: values[] }; eq carries { __eq }.
					_eqValues.push(cond?.__leftName, cond?.__in ?? cond?.__eq)
					return {
						where: (cond2: any) => {
							_eqValues.push(cond2?.__leftName, cond2?.__in ?? cond2?.__eq)
							return {
								get: async () =>
									store.find((row) => matchesFilters(row)) ?? null,
								all: async () => store.filter((row) => matchesFilters(row)),
								orderBy: (...conds: any[]) => ({
									get: async () =>
										sorted(store.filter((row) => matchesFilters(row)), conds)[0] ??
										null,
									all: async () =>
										sorted(store.filter((row) => matchesFilters(row)), conds),
								}),
								limit: () => ({
									all: async () => store.filter((row) => matchesFilters(row)),
								}),
							}
						},
						get: async () => store.find((row) => matchesFilters(row)) ?? null,
						all: async () => store.filter((row) => matchesFilters(row)),
						orderBy: (...conds: any[]) => ({
							get: async () =>
								sorted(store.filter((row) => matchesFilters(row)), conds)[0] ??
								null,
							all: async () =>
								sorted(store.filter((row) => matchesFilters(row)), conds),
						}),
						limit: () => ({
							all: async () => store.filter((row) => matchesFilters(row)),
						}),
					}
				},
				get: async () => store[0] ?? null,
				all: async () => store,
				orderBy: (...conds: any[]) => ({
					get: async () => sorted(store, conds)[0] ?? null,
					all: async () => sorted(store, conds),
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

mock.module('../../db/index', () => {
	const dbMock = {
		select: () => ({
			from: (table: any) => {
				resetEqValues()
				const name = tableName(table)
				if (name === 'discovered_machine')
					return makeTableProxy(discoveredStore, name).select().from(table)
				if (name === 'machine')
					return makeTableProxy(machinesStore, name).select().from(table)
				if (name === 'registration_request')
					return makeTableProxy(registrationStore, name).select().from(table)
				if (name === 'rogue_device_alert')
					return makeTableProxy(rogueStore, name).select().from(table)
				if (name === 'kill_switch_audit_log')
					return makeTableProxy(auditStore, name).select().from(table)
				if (name === 'integrity_event')
					return makeTableProxy(integrityStore, name).select().from(table)
				if (name === 'feature_flag')
					return makeTableProxy(flagsStore, name).select().from(table)
				if (name === 'machine_flag')
					return makeTableProxy(machineFlagsStore, name).select().from(table)
				return makeTableProxy([], name).select().from(table)
			},
		}),
		insert: (table: any) => {
			const name = tableName(table)
			if (name === 'discovered_machine')
				return makeTableProxy(discoveredStore, name).insert()
			if (name === 'machine')
				return makeTableProxy(machinesStore, name).insert()
			if (name === 'registration_request')
				return makeTableProxy(registrationStore, name).insert()
			if (name === 'rogue_device_alert')
				return makeTableProxy(rogueStore, name).insert()
			if (name === 'kill_switch_audit_log')
				return makeTableProxy(auditStore, name).insert()
			if (name === 'integrity_event')
				return makeTableProxy(integrityStore, name).insert()
			if (name === 'feature_flag')
				return makeTableProxy(flagsStore, name).insert()
			if (name === 'machine_flag')
				return makeTableProxy(machineFlagsStore, name).insert()
			return makeTableProxy([], name).insert()
		},
		update: (table: any) => {
			const name = tableName(table)
			if (name === 'discovered_machine')
				return makeTableProxy(discoveredStore, name).update()
			if (name === 'machine')
				return makeTableProxy(machinesStore, name).update()
			if (name === 'registration_request')
				return makeTableProxy(registrationStore, name).update()
			if (name === 'rogue_device_alert')
				return makeTableProxy(rogueStore, name).update()
			return makeTableProxy([], name).update()
		},
		// ADR-138: onboarding decisions run inside a transaction. The mock
		// executes the callback against the same in-memory db object so
		// reads/writes share the same stores. When rollbackNextTransaction
		// is set, the stores are restored to their pre-transaction state
		// and the transaction rejects — simulating a rolled-back decision.
		transaction: async (cb: (tx: any) => Promise<unknown>) => {
			const snapshot = snapshotStores()
			const result = await cb(dbMock)
			if (rollbackNextTransaction) {
				rollbackNextTransaction = false
				restoreStores(snapshot)
				throw new Error('transaction rolled back')
			}
			return result
		},
	}
	return { db: dbMock }
})

// ─── Fixtures ───────────────────────────────────────────────────

function seedDiscoveredMachine(
	overrides: Partial<DiscoveredRow> = {},
): DiscoveredRow {
	const row: DiscoveredRow = {
		id: 'machine-1',
		hostname: 'worker-01',
		ip: '10.0.0.5',
		source: 'heartbeat',
		state: 'NEW_MACHINE',
		fingerprint: JSON.stringify({
			cpuModel: 'AMD Ryzen 9',
			cpuCores: 16,
			memoryMb: 65536,
			gpus: [{ name: 'NVIDIA RTX 4090', vendor: 'NVIDIA', pciId: null }],
			diskGb: 1024,
			osRelease: 'Arch Linux',
			macs: ['aa:bb:cc:dd:ee:ff'],
			collectedAt: '2026-08-08T00:00:00.000Z',
		}),
		integritySignature: null,
		firstSeen: new Date('2026-08-08T00:00:00.000Z'),
		lastSeen: new Date('2026-08-08T00:00:00.000Z'),
		confirmedAt: null,
		confirmedBy: null,
		...overrides,
	}
	discoveredStore.push(row)
	return row
}

function seedGlobalFlag(key: string, value: boolean) {
	flagsStore.push({
		id: crypto.randomUUID(),
		key,
		value,
		description: null,
		enabled: true,
		createdBy: 'admin',
		createdAt: new Date(),
		updatedAt: new Date(),
	})
}

// ─── Tests ──────────────────────────────────────────────────────

let OnboardingService: any

beforeEach(async () => {
	const mod = await import('../onboarding')
	OnboardingService = mod.OnboardingService
})

describe('OnboardingService', () => {
	it('approve: NEW_MACHINE → ADMITTED + machine tenant + monitoring_only + audit', async () => {
		seedDiscoveredMachine()
		seedGlobalFlag('llm_interception_enabled', true)
		const service = new OnboardingService()

		const decision = await service.approve({
			machineId: 'machine-1',
			reviewedBy: 'admin@alygn.com',
		})

		expect(decision).not.toBeNull()
		expect(decision!.machine.state).toBe('ADMITTED')
		expect(decision!.machine.confirmedBy).toBe('admin@alygn.com')
		expect(decision!.machineRecord).not.toBeNull()
		expect(decision!.machineRecord!.monitoringOnly).toBe(true)
		expect(decision!.machineRecord!.zone).toBe('unassigned')
		expect(decision!.registration.status).toBe('APPROVED')

		// Machine tenant created with fingerprint-derived specs
		expect(machinesStore.length).toBe(1)
		expect(machinesStore[0].hostname).toBe('worker-01')
		expect(machinesStore[0].monitoringOnly).toBe(true)
		expect(machinesStore[0].zone).toBe('unassigned')
		expect(machinesStore[0].specs).toContain('AMD Ryzen 9')

		// Tenant flags seeded from org defaults
		expect(machineFlagsStore.length).toBe(1)
		expect(machineFlagsStore[0].flagKey).toBe('llm_interception_enabled')

		// Audit log written
		expect(auditStore.length).toBe(1)
		expect(auditStore[0].reason).toBe('onboarding.approve')
		expect(auditStore[0].previousState).toBe('NEW_MACHINE')
		expect(auditStore[0].newState).toBe('ADMITTED')
		expect(auditStore[0].userId).toBe('admin@alygn.com')
	})

	it('approve with explicit zone assigns the machine to that zone', async () => {
		seedDiscoveredMachine()
		const service = new OnboardingService()

		const decision = await service.approve({
			machineId: 'machine-1',
			reviewedBy: 'admin@alygn.com',
			zone: 'gpu-zone',
		})

		expect(decision!.machineRecord!.zone).toBe('gpu-zone')
		expect(machinesStore[0].zone).toBe('gpu-zone')
	})

	it('deny: NEW_MACHINE → DENIED + audit + no machine record', async () => {
		seedDiscoveredMachine()
		const service = new OnboardingService()

		const decision = await service.deny({
			machineId: 'machine-1',
			reviewedBy: 'admin@alygn.com',
			denialReason: 'Unknown device',
		})

		expect(decision).not.toBeNull()
		expect(decision!.machine.state).toBe('DENIED')
		expect(decision!.machineRecord).toBeNull()
		expect(decision!.registration.status).toBe('DENIED')
		expect(decision!.registration.denialReason).toBe('Unknown device')

		// No machine tenant created
		expect(machinesStore.length).toBe(0)

		// Audit log written
		expect(auditStore.length).toBe(1)
		expect(auditStore[0].reason).toBe('onboarding.deny')
		expect(auditStore[0].previousState).toBe('NEW_MACHINE')
		expect(auditStore[0].newState).toBe('DENIED')
		expect(auditStore[0].severity).toBe('medium')
	})

	it('rogue alert: 3 denials from same hostname → rogue_device_alert created', async () => {
		const service = new OnboardingService()

		// Three distinct discovered rows, same hostname, each denied.
		for (let i = 0; i < 3; i++) {
			seedDiscoveredMachine({
				id: `machine-${i}`,
				hostname: 'rogue-node',
				ip: '10.0.0.99',
			})
		}

		for (let i = 0; i < 3; i++) {
			const decision = await service.deny({
				machineId: `machine-${i}`,
				reviewedBy: 'admin@alygn.com',
			})
			expect(decision!.machine.state).toBe('DENIED')
		}

		// Threshold reached on the 3rd denial → alert raised
		expect(rogueStore.length).toBe(1)
		expect(rogueStore[0].hostname).toBe('rogue-node')
		expect(rogueStore[0].ip).toBe('10.0.0.99')
		expect(rogueStore[0].denialCount).toBe(3)
		expect(rogueStore[0].resolved).toBe(false)

		// The 3rd denial audit entry is severity high (alert raised)
		expect(auditStore.length).toBe(3)
		expect(auditStore[2].severity).toBe('high')
		expect(auditStore[2].metadata).toContain('rogueAlertId')
	})

	it('rogue alert: fewer than 3 denials → no alert', async () => {
		const service = new OnboardingService()
		seedDiscoveredMachine({ id: 'machine-1', hostname: 'suspicious-node' })
		seedDiscoveredMachine({ id: 'machine-2', hostname: 'suspicious-node' })

		await service.deny({
			machineId: 'machine-1',
			reviewedBy: 'admin@alygn.com',
		})
		await service.deny({
			machineId: 'machine-2',
			reviewedBy: 'admin@alygn.com',
		})

		expect(rogueStore.length).toBe(0)
	})

	it('rogue alert: 4th denial updates the existing alert (no duplicate)', async () => {
		const service = new OnboardingService()

		// Four distinct discovered rows, same hostname, each denied.
		for (let i = 0; i < 4; i++) {
			seedDiscoveredMachine({
				id: `machine-${i}`,
				hostname: 'rogue-node',
				ip: '10.0.0.99',
			})
		}

		for (let i = 0; i < 4; i++) {
			const decision = await service.deny({
				machineId: `machine-${i}`,
				reviewedBy: 'admin@alygn.com',
			})
			expect(decision!.machine.state).toBe('DENIED')
		}

		// Still exactly one alert — the 4th denial updated it in place.
		expect(rogueStore.length).toBe(1)
		expect(rogueStore[0].hostname).toBe('rogue-node')
		expect(rogueStore[0].denialCount).toBe(4)
		expect(rogueStore[0].resolved).toBe(false)

		// The 4th denial returned the same alert id (no duplicate created).
		expect(auditStore.length).toBe(4)
		expect(auditStore[3].severity).toBe('high')
		expect(auditStore[3].metadata).toContain('rogueAlertId')
	})

	it('approve: flag seeding rolls back with the transaction (R1)', async () => {
		seedDiscoveredMachine()
		seedGlobalFlag('llm_interception_enabled', true)
		const service = new OnboardingService()

		// Simulate a failure inside the transaction (e.g. audit write
		// error) — the whole decision must roll back, including the
		// machine_flag rows seeded by seedDefaultFlags.
		rollbackNextTransaction = true

		await expect(
			service.approve({
				machineId: 'machine-1',
				reviewedBy: 'admin@alygn.com',
			}),
		).rejects.toThrow(/rolled back/)

		// Nothing committed: no machine tenant, no flags, no audit entry,
		// and the discovered machine is still NEW_MACHINE.
		expect(machinesStore.length).toBe(0)
		expect(machineFlagsStore.length).toBe(0)
		expect(auditStore.length).toBe(0)
		expect(discoveredStore[0].state).toBe('NEW_MACHINE')
		expect(registrationStore.length).toBe(0)
	})

	it('re-onboarding: high-severity drift → PENDING_REVIEW → approve → ADMITTED again', async () => {
		seedDiscoveredMachine({ state: 'ADMITTED' })
		const service = new OnboardingService()

		// High-severity integrity event (tamper/swap) triggers re-onboarding.
		integrityStore.push({
			id: crypto.randomUUID(),
			machineId: 'machine-1',
			event: 'swap',
			severity: 'high',
			driftedFields: JSON.stringify(['macs']),
			detectedAt: new Date(),
		})

		const flagged = await service.flagForReview('machine-1')
		expect(flagged).toBe(true)
		expect(discoveredStore[0].state).toBe('PENDING_REVIEW')

		// Audit entry for the drift
		expect(auditStore.length).toBe(1)
		expect(auditStore[0].reason).toBe('onboarding.integrity-drift')
		expect(auditStore[0].newState).toBe('PENDING_REVIEW')
		expect(auditStore[0].severity).toBe('high')

		// Re-approval returns the machine to ADMITTED.
		const decision = await service.approve({
			machineId: 'machine-1',
			reviewedBy: 'admin@alygn.com',
		})
		expect(decision!.machine.state).toBe('ADMITTED')
		expect(discoveredStore[0].state).toBe('ADMITTED')
	})

	it('flagForReview is a no-op for non-admitted machines', async () => {
		seedDiscoveredMachine({ state: 'NEW_MACHINE' })
		const service = new OnboardingService()

		const flagged = await service.flagForReview('machine-1')
		expect(flagged).toBe(false)
		expect(discoveredStore[0].state).toBe('NEW_MACHINE')
		expect(auditStore.length).toBe(0)
	})

	it('monitoring-only gate: machine in monitoring_only cannot receive active responses', async () => {
		const service = new OnboardingService()

		// No managed record → safe default: monitoring-only (no active responses).
		expect(await service.isMonitoringOnly('machine-unknown')).toBe(true)

		// Admitted machine starts monitoring-only.
		seedDiscoveredMachine()
		await service.approve({
			machineId: 'machine-1',
			reviewedBy: 'admin@alygn.com',
		})
		expect(await service.isMonitoringOnly('machine-1')).toBe(true)

		// Onboarding completes → monitoring-only cleared → active responses allowed.
		machinesStore[0].monitoringOnly = false
		expect(await service.isMonitoringOnly('machine-1')).toBe(false)
	})

	it('approve rejects machines already ADMITTED (state machine guard)', async () => {
		seedDiscoveredMachine({ state: 'ADMITTED' })
		const service = new OnboardingService()

		await expect(
			service.approve({
				machineId: 'machine-1',
				reviewedBy: 'admin@alygn.com',
			}),
		).rejects.toThrow(/Cannot approve machine in state ADMITTED/)
	})

	it('deny rejects machines already DENIED (state machine guard)', async () => {
		seedDiscoveredMachine({ state: 'DENIED' })
		const service = new OnboardingService()

		await expect(
			service.deny({ machineId: 'machine-1', reviewedBy: 'admin@alygn.com' }),
		).rejects.toThrow(/Cannot deny machine in state DENIED/)
	})

	it('approve returns null for unknown machine', async () => {
		const service = new OnboardingService()
		const decision = await service.approve({
			machineId: 'machine-unknown',
			reviewedBy: 'admin@alygn.com',
		})
		expect(decision).toBeNull()
	})

	it('listPending returns machines in NEW_MACHINE/PENDING_CONFIRMATION', async () => {
		seedDiscoveredMachine({ id: 'm1', state: 'NEW_MACHINE' })
		seedDiscoveredMachine({ id: 'm2', state: 'PENDING_CONFIRMATION' })
		seedDiscoveredMachine({ id: 'm3', state: 'ADMITTED' })
		const service = new OnboardingService()

		const pending = await service.listPending()
		expect(pending.length).toBe(2)
		expect(pending.map((m: any) => m.id).sort()).toEqual(['m1', 'm2'])
	})

	it('listPending includes PENDING_REVIEW machines (R2, ADR-138 §4)', async () => {
		seedDiscoveredMachine({ id: 'm1', state: 'NEW_MACHINE' })
		seedDiscoveredMachine({ id: 'm2', state: 'PENDING_REVIEW' })
		seedDiscoveredMachine({ id: 'm3', state: 'ADMITTED' })
		const service = new OnboardingService()

		const pending = await service.listPending()
		expect(pending.length).toBe(2)
		expect(pending.map((m: any) => m.id).sort()).toEqual(['m1', 'm2'])
		expect(pending.find((m: any) => m.id === 'm2')!.state).toBe('PENDING_REVIEW')
	})

	it('listRogueAlerts returns alerts ordered by recency', async () => {
		rogueStore.push({
			id: 'alert-1',
			hostname: 'rogue-a',
			ip: '10.0.0.1',
			denialCount: 3,
			lastDeniedAt: new Date('2026-08-10T00:00:00.000Z'),
			resolved: false,
			resolvedBy: null,
			resolvedAt: null,
			createdAt: new Date('2026-08-10T00:00:00.000Z'),
		})
		const service = new OnboardingService()

		const alerts = await service.listRogueAlerts()
		expect(alerts.length).toBe(1)
		expect(alerts[0].hostname).toBe('rogue-a')
		expect(alerts[0].denialCount).toBe(3)
	})

	it('listRogueAlerts returns unresolved alerts first, then by recency', async () => {
		rogueStore.push({
			id: 'alert-old-resolved',
			hostname: 'rogue-resolved',
			ip: '10.0.0.2',
			denialCount: 3,
			lastDeniedAt: new Date('2026-08-01T00:00:00.000Z'),
			resolved: true,
			resolvedBy: 'admin@alygn.com',
			resolvedAt: new Date('2026-08-02T00:00:00.000Z'),
			createdAt: new Date('2026-08-01T00:00:00.000Z'),
		})
		rogueStore.push({
			id: 'alert-recent-unresolved',
			hostname: 'rogue-b',
			ip: '10.0.0.3',
			denialCount: 5,
			lastDeniedAt: new Date('2026-08-09T00:00:00.000Z'),
			resolved: false,
			resolvedBy: null,
			resolvedAt: null,
			createdAt: new Date('2026-08-09T00:00:00.000Z'),
		})
		rogueStore.push({
			id: 'alert-old-unresolved',
			hostname: 'rogue-a',
			ip: '10.0.0.1',
			denialCount: 3,
			lastDeniedAt: new Date('2026-08-05T00:00:00.000Z'),
			resolved: false,
			resolvedBy: null,
			resolvedAt: null,
			createdAt: new Date('2026-08-05T00:00:00.000Z'),
		})
		const service = new OnboardingService()

		const alerts = await service.listRogueAlerts()
		expect(alerts.length).toBe(3)
		// Unresolved first (recency within the group), resolved trailing.
		expect(alerts[0].id).toBe('alert-recent-unresolved')
		expect(alerts[1].id).toBe('alert-old-unresolved')
		expect(alerts[2].id).toBe('alert-old-resolved')
	})
})
