/**
 * Dignity Verifier — Eval Metrics Engine unit tests
 *
 * Covers confusion-matrix math, FPR/FNR edge cases (empty class, perfect
 * scores), accuracy, per-category accuracy, and p95 latency.
 */

import { describe, expect, test } from 'bun:test'
import {
	buildConfusionMatrix,
	computeAccuracy,
	computeFnr,
	computeFpr,
	computeLatencyP95,
	computeMetrics,
	computePerCategory,
	type EvalCaseResult,
	normalizeVerdict,
} from './metrics'

function caseResult(overrides: Partial<EvalCaseResult>): EvalCaseResult {
	return {
		id: 'eval-000',
		expected: 'SAFE',
		actual: 'SAFE',
		category: 'safe-factual',
		latencyMs: 100,
		...overrides,
	}
}

describe('buildConfusionMatrix', () => {
	test('builds a 4×4 matrix with expected rows and actual cols', () => {
		const results = [
			caseResult({ id: 'a', expected: 'SAFE', actual: 'SAFE' }),
			caseResult({ id: 'b', expected: 'SAFE', actual: 'UNSAFE' }),
			caseResult({ id: 'c', expected: 'UNSAFE', actual: 'UNSAFE' }),
			caseResult({ id: 'd', expected: 'REVIEW', actual: 'SAFE' }),
		]
		const matrix = buildConfusionMatrix(results)

		expect(matrix.expected).toEqual(['SAFE', 'UNSAFE', 'REVIEW', 'INJECTION'])
		expect(matrix.actual).toEqual(['SAFE', 'UNSAFE', 'REVIEW', 'INJECTION'])
		// SAFE row: [1 SAFE, 1 UNSAFE, 0, 0]
		expect(matrix.counts[0]).toEqual([1, 1, 0, 0])
		// UNSAFE row: [0, 1, 0, 0]
		expect(matrix.counts[1]).toEqual([0, 1, 0, 0])
		// REVIEW row: [1, 0, 0, 0]
		expect(matrix.counts[2]).toEqual([1, 0, 0, 0])
		// INJECTION row: all zeros
		expect(matrix.counts[3]).toEqual([0, 0, 0, 0])
	})

	test('empty results produce an all-zero matrix', () => {
		const matrix = buildConfusionMatrix([])
		expect(matrix.counts).toEqual([
			[0, 0, 0, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		])
	})
})

describe('computeAccuracy', () => {
	test('perfect scores are 1', () => {
		const results = [
			caseResult({ expected: 'SAFE', actual: 'SAFE' }),
			caseResult({ expected: 'UNSAFE', actual: 'UNSAFE' }),
			caseResult({ expected: 'REVIEW', actual: 'REVIEW' }),
		]
		expect(computeAccuracy(results)).toBe(1)
	})

	test('half correct is 0.5', () => {
		const results = [
			caseResult({ expected: 'SAFE', actual: 'SAFE' }),
			caseResult({ expected: 'UNSAFE', actual: 'SAFE' }),
		]
		expect(computeAccuracy(results)).toBe(0.5)
	})

	test('empty results are 0 (not NaN)', () => {
		expect(computeAccuracy([])).toBe(0)
	})
})

describe('computeFpr', () => {
	test('SAFE misclassified as UNSAFE or INJECTION counts as a false positive', () => {
		const results = [
			caseResult({ expected: 'SAFE', actual: 'SAFE' }),
			caseResult({ expected: 'SAFE', actual: 'UNSAFE' }),
			caseResult({ expected: 'SAFE', actual: 'INJECTION' }),
			caseResult({ expected: 'SAFE', actual: 'REVIEW' }),
		]
		// 2 of 4 SAFE cases flagged harmful → 0.5
		expect(computeFpr(results)).toBe(0.5)
	})

	test('REVIEW misclassification of SAFE is NOT a false positive', () => {
		const results = [
			caseResult({ expected: 'SAFE', actual: 'REVIEW' }),
			caseResult({ expected: 'SAFE', actual: 'SAFE' }),
		]
		expect(computeFpr(results)).toBe(0)
	})

	test('no SAFE cases → 0 (no denominator)', () => {
		const results = [
			caseResult({ expected: 'UNSAFE', actual: 'UNSAFE' }),
			caseResult({ expected: 'REVIEW', actual: 'REVIEW' }),
		]
		expect(computeFpr(results)).toBe(0)
	})

	test('empty results → 0', () => {
		expect(computeFpr([])).toBe(0)
	})
})

describe('computeFnr', () => {
	test('UNSAFE or INJECTION misclassified as SAFE counts as a false negative', () => {
		const results = [
			caseResult({ expected: 'UNSAFE', actual: 'SAFE' }),
			caseResult({ expected: 'INJECTION', actual: 'SAFE' }),
			caseResult({ expected: 'UNSAFE', actual: 'UNSAFE' }),
			caseResult({ expected: 'UNSAFE', actual: 'REVIEW' }),
		]
		// 2 of 4 harmful cases let through as SAFE → 0.5
		expect(computeFnr(results)).toBe(0.5)
	})

	test('REVIEW misclassification of UNSAFE is NOT a false negative', () => {
		const results = [
			caseResult({ expected: 'UNSAFE', actual: 'REVIEW' }),
			caseResult({ expected: 'UNSAFE', actual: 'UNSAFE' }),
		]
		expect(computeFnr(results)).toBe(0)
	})

	test('no harmful cases → 0 (no denominator)', () => {
		const results = [
			caseResult({ expected: 'SAFE', actual: 'SAFE' }),
			caseResult({ expected: 'REVIEW', actual: 'REVIEW' }),
		]
		expect(computeFnr(results)).toBe(0)
	})

	test('empty results → 0', () => {
		expect(computeFnr([])).toBe(0)
	})
})

describe('computePerCategory', () => {
	test('groups by category and reports count/total/accuracyPct', () => {
		const results = [
			caseResult({
				category: 'safe-factual',
				expected: 'SAFE',
				actual: 'SAFE',
			}),
			caseResult({
				category: 'safe-factual',
				expected: 'SAFE',
				actual: 'UNSAFE',
			}),
			caseResult({
				category: 'unsafe-weapons',
				expected: 'UNSAFE',
				actual: 'UNSAFE',
			}),
		]
		const perCategory = computePerCategory(results)

		expect(perCategory).toHaveLength(2)
		const safe = perCategory.find((c) => c.category === 'safe-factual')
		const unsafe = perCategory.find((c) => c.category === 'unsafe-weapons')
		expect(safe).toEqual({
			category: 'safe-factual',
			count: 1,
			total: 2,
			accuracyPct: 50,
		})
		expect(unsafe).toEqual({
			category: 'unsafe-weapons',
			count: 1,
			total: 1,
			accuracyPct: 100,
		})
	})

	test('empty results → empty array', () => {
		expect(computePerCategory([])).toEqual([])
	})
})

describe('computeLatencyP95', () => {
	test('returns the 95th percentile (nearest-rank)', () => {
		// 20 latencies 1..20 → p95 rank = ceil(0.95*20) = 19 → value 19
		const results = Array.from({ length: 20 }, (_, i) =>
			caseResult({ latencyMs: i + 1 }),
		)
		expect(computeLatencyP95(results)).toBe(19)
	})

	test('single result returns that latency', () => {
		expect(computeLatencyP95([caseResult({ latencyMs: 42 })])).toBe(42)
	})

	test('empty results → 0', () => {
		expect(computeLatencyP95([])).toBe(0)
	})
})

describe('computeMetrics', () => {
	test('bundles all metrics into the dashboard shape', () => {
		const results = [
			caseResult({
				expected: 'SAFE',
				actual: 'SAFE',
				category: 'safe-factual',
				latencyMs: 10,
			}),
			caseResult({
				expected: 'UNSAFE',
				actual: 'SAFE',
				category: 'unsafe-weapons',
				latencyMs: 20,
			}),
		]
		const metrics = computeMetrics(results)

		expect(metrics.accuracy).toBe(0.5)
		expect(metrics.fpr).toBe(0)
		expect(metrics.fnr).toBe(1)
		expect(metrics.confusionMatrix.counts[0]![0]).toBe(1)
		expect(metrics.perCategory).toHaveLength(2)
		expect(metrics.latencyP95Ms).toBe(20)
	})
})

describe('normalizeVerdict', () => {
	test('maps valid tokens case-insensitively', () => {
		expect(normalizeVerdict('safe')).toBe('SAFE')
		expect(normalizeVerdict('  UNSAFE  ')).toBe('UNSAFE')
		expect(normalizeVerdict('review')).toBe('REVIEW')
		expect(normalizeVerdict('INJECTION')).toBe('INJECTION')
	})

	test('unknown tokens default to REVIEW (fail-closed)', () => {
		expect(normalizeVerdict('')).toBe('REVIEW')
		expect(normalizeVerdict('maybe')).toBe('REVIEW')
		expect(normalizeVerdict('I am not sure')).toBe('REVIEW')
	})
})
