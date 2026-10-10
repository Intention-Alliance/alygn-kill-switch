/**
 * Decision shadow log + training-readiness gate (KS-LAYA §B.5).
 *
 * The db module is mocked so the service can be tested without SQLite.
 * Table identity comes from the real schema (schema.ts does not import db).
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import path from 'node:path'
import { decisionShadowLog as realShadowLog } from '../../../db/schema'

let aggregate: { total: number; agreed: number } | null = null
let inserted: any[] = []
let failInsert = false

mock.module(path.resolve(__dirname, '../../../db/index.ts'), () => ({
	db: {
		insert: (table: any) => ({
			values: async (row: any) => {
				if (failInsert) throw new Error('disk full')
				if (table === realShadowLog) inserted.push(row)
			},
		}),
		select: () => ({
			from: (table: any) => ({
				where: () => ({
					get: async () => (table === realShadowLog ? aggregate : null),
				}),
			}),
		}),
	},
}))

const {
	SHADOW_AGREEMENT_THRESHOLD,
	SHADOW_MIN_DECISIONS,
	getShadowReadiness,
	recordShadowDecision,
} = await import('../shadow')

beforeEach(() => {
	aggregate = null
	inserted = []
	failInsert = false
})

describe('recordShadowDecision', () => {
	it('inserts a shadow row and computes agreement', async () => {
		await recordShadowDecision({
			machineId: 'm1',
			provider: 'laya',
			servedBy: 'jev',
			shadowLabel: 'unsafe',
			shadowAction: 'block',
			shadowScore: 0.9,
			shadowConfidence: 0.8,
			shadowDegraded: false,
			liveLabel: 'unsafe',
			reasons: ['x'],
		})
		expect(inserted.length).toBe(1)
		expect(inserted[0].agreed).toBe(true)
		expect(inserted[0].provider).toBe('laya')
		expect(inserted[0].servedBy).toBe('jev')
	})

	it('marks disagreement when labels differ', async () => {
		await recordShadowDecision({
			machineId: 'm1',
			provider: 'laya',
			servedBy: 'jev',
			shadowLabel: 'safe',
			shadowAction: 'forward',
			shadowScore: 0.1,
			shadowConfidence: 0.9,
			shadowDegraded: false,
			liveLabel: 'unsafe',
			reasons: [],
		})
		expect(inserted[0].agreed).toBe(false)
	})

	it('never throws when the insert fails', async () => {
		failInsert = true
		await recordShadowDecision({
			machineId: 'm1',
			provider: 'laya',
			servedBy: 'jev',
			shadowLabel: 'safe',
			shadowAction: 'forward',
			shadowScore: 0,
			shadowConfidence: 1,
			shadowDegraded: false,
			liveLabel: 'safe',
			reasons: [],
		})
		expect(inserted.length).toBe(0)
	})
})

describe('getShadowReadiness', () => {
	it('is not proposable below the decision floor', async () => {
		aggregate = { total: 199, agreed: 199 }
		const r = await getShadowReadiness('laya')
		expect(r.total).toBe(199)
		expect(r.agreement).toBe(1)
		expect(r.thresholdMet).toBe(false)
	})

	it('is not proposable below the agreement threshold', async () => {
		aggregate = { total: 200, agreed: 180 } // 90%
		const r = await getShadowReadiness('laya')
		expect(r.agreement).toBeCloseTo(0.9, 5)
		expect(r.thresholdMet).toBe(false)
	})

	it('is proposable at >=95% over >=200 decisions', async () => {
		aggregate = { total: 200, agreed: 190 } // 95%
		const r = await getShadowReadiness('laya')
		expect(r.agreement).toBeCloseTo(0.95, 5)
		expect(r.thresholdMet).toBe(true)
		expect(r.requiredDecisions).toBe(SHADOW_MIN_DECISIONS)
		expect(r.requiredAgreement).toBe(SHADOW_AGREEMENT_THRESHOLD)
	})

	it('returns a zeroed, non-proposable readiness on read failure', async () => {
		aggregate = null
		const r = await getShadowReadiness('laya')
		expect(r.total).toBe(0)
		expect(r.thresholdMet).toBe(false)
	})
})
