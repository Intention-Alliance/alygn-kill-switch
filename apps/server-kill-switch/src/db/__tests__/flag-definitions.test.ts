/**
 * Flag definitions — S1 anti-regression lock
 *
 * The decision.* flags (Jev feature flag + Laya + the KS-LAYA chain/gate) were
 * appended to PREDEFINED_FLAG_DEFINITIONS. This test locks the original 8
 * entries byte-for-byte so a future edit cannot silently reorder, retype, or
 * re-default them, and locks the decision.* block in documented order.
 */

import { describe, expect, it } from 'bun:test'
import {
	type FlagValueType,
	getFlagDefinition,
	getFlagType,
	PREDEFINED_FLAG_DEFINITIONS,
	stableFlagId,
} from '../flag-definitions'

interface FlagTuple {
	key: string
	type: FlagValueType
	defaultValue: boolean | number | string
	order: number
}

/** The original 8 flags, exactly as they were before S1. */
const ORIGINAL_8: FlagTuple[] = [
	{
		key: 'llm_interception_enabled',
		type: 'boolean',
		defaultValue: true,
		order: 1,
	},
	{ key: 'auto_stop_threshold', type: 'number', defaultValue: 0.85, order: 2 },
	{
		key: 'damage_logging_level',
		type: 'string',
		defaultValue: 'standard',
		order: 3,
	},
	{
		key: 'alert_on_critical_score',
		type: 'boolean',
		defaultValue: true,
		order: 4,
	},
	{ key: 'request_sampling_rate', type: 'number', defaultValue: 1.0, order: 5 },
	{
		key: 'kill.authorization.mode',
		type: 'boolean',
		defaultValue: true,
		order: 6,
	},
	{
		key: 'kill.authorization.quorum',
		type: 'boolean',
		defaultValue: true,
		order: 7,
	},
	{
		key: 'kill.authorization.timeoutMs',
		type: 'boolean',
		defaultValue: true,
		order: 8,
	},
]

/** The decision.* block appended after the original 8 (orders 9-17). */
const DECISION_9: FlagTuple[] = [
	{ key: 'decision.provider', type: 'string', defaultValue: 'laya', order: 9 },
	{
		key: 'decision.providerChain',
		type: 'string',
		defaultValue: '',
		order: 10,
	},
	{
		key: 'decision.jev.model',
		type: 'string',
		defaultValue: 'jev-latest',
		order: 11,
	},
	{
		key: 'decision.jev.timeoutMs',
		type: 'number',
		defaultValue: 500,
		order: 12,
	},
	{
		key: 'decision.review_threshold',
		type: 'number',
		defaultValue: 0.6,
		order: 13,
	},
	{
		key: 'decision.laya.baseUrl',
		type: 'string',
		defaultValue: 'http://127.0.0.1:8110',
		order: 14,
	},
	{
		key: 'decision.laya.model',
		type: 'string',
		defaultValue: 'laya-multilingual',
		order: 15,
	},
	{
		key: 'decision.laya.timeoutMs',
		type: 'number',
		defaultValue: 1000,
		order: 16,
	},
	{
		key: 'decision.laya.ready',
		type: 'boolean',
		defaultValue: false,
		order: 17,
	},
]

describe('PREDEFINED_FLAG_DEFINITIONS', () => {
	it('has 17 flags after the KS-LAYA set', () => {
		expect(PREDEFINED_FLAG_DEFINITIONS.length).toBe(17)
	})

	it('keeps the original 8 byte-identical (key/type/default/order)', () => {
		const actual = PREDEFINED_FLAG_DEFINITIONS.slice(0, 8).map((d) => ({
			key: d.key,
			type: d.type,
			defaultValue: d.defaultValue,
			order: d.order,
		}))
		expect(actual).toEqual(ORIGINAL_8)
	})

	it('appends the 9 decision.* flags at orders 9-17', () => {
		const actual = PREDEFINED_FLAG_DEFINITIONS.slice(8).map((d) => ({
			key: d.key,
			type: d.type,
			defaultValue: d.defaultValue,
			order: d.order,
		}))
		expect(actual).toEqual(DECISION_9)
	})

	it('orders are strictly increasing', () => {
		const orders = PREDEFINED_FLAG_DEFINITIONS.map((d) => d.order)
		for (let i = 1; i < orders.length; i++) {
			expect(orders[i]).toBeGreaterThan(orders[i - 1])
		}
	})

	it('derives stable ids for the new flags', () => {
		expect(stableFlagId('decision.jev.timeoutMs')).toBe(
			'flag-decision-jev-timeoutMs',
		)
		expect(stableFlagId('decision.provider')).toBe('flag-decision-provider')
		expect(stableFlagId('decision.providerChain')).toBe(
			'flag-decision-providerChain',
		)
		expect(stableFlagId('decision.laya.ready')).toBe('flag-decision-laya-ready')
		expect(stableFlagId('decision.review_threshold')).toBe(
			'flag-decision-review-threshold',
		)
	})

	it('all 17 ids are unique', () => {
		const ids = PREDEFINED_FLAG_DEFINITIONS.map((d) => stableFlagId(d.key))
		expect(new Set(ids).size).toBe(17)
	})

	it('exposes the declared types for the new flags', () => {
		expect(getFlagType('decision.provider')).toBe('string')
		expect(getFlagType('decision.providerChain')).toBe('string')
		expect(getFlagType('decision.review_threshold')).toBe('number')
		expect(getFlagType('decision.jev.timeoutMs')).toBe('number')
		expect(getFlagType('decision.jev.model')).toBe('string')
		expect(getFlagType('decision.laya.ready')).toBe('boolean')
	})

	it('defaults decision.provider to laya (the shipped default provider)', () => {
		expect(getFlagDefinition('decision.provider')?.defaultValue).toBe('laya')
	})

	it('defaults decision.laya.baseUrl to the pinned loopback bind 8110', () => {
		expect(getFlagDefinition('decision.laya.baseUrl')?.defaultValue).toBe(
			'http://127.0.0.1:8110',
		)
	})

	it('defaults decision.laya.ready to false (gate closed — shadow only)', () => {
		expect(getFlagDefinition('decision.laya.ready')?.defaultValue).toBe(false)
	})

	it('defaults decision.jev.timeoutMs to 500 (D2: 500ms budget)', () => {
		expect(getFlagDefinition('decision.jev.timeoutMs')?.defaultValue).toBe(500)
	})
})
