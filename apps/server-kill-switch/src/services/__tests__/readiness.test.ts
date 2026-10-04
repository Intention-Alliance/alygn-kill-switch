import { describe, expect, it } from 'bun:test'
import type { HardwareFingerprint } from '@align/shared-types'
import {
	DEFAULT_READINESS_REQUIREMENTS,
	evaluateReadiness,
} from '../readiness'

function fingerprint(overrides: Partial<HardwareFingerprint> = {}): HardwareFingerprint {
	return {
		cpuModel: 'Test CPU',
		cpuCores: 8,
		memoryMb: 16384,
		gpus: [],
		diskGb: 100,
		osRelease: 'Linux 7.0.9',
		macs: ['aa:bb:cc:dd:ee:ff'],
		collectedAt: new Date().toISOString(),
		...overrides,
	}
}

describe('evaluateReadiness', () => {
	it('passes a machine that meets every requirement', () => {
		const report = evaluateReadiness(fingerprint())
		expect(report.verdict).toBe('READY')
		expect(report.findings).toHaveLength(0)
		expect(report.missingFingerprint).toBe(false)
	})

	it('fails a missing fingerprint rather than passing it', () => {
		const report = evaluateReadiness(null)
		expect(report.verdict).toBe('NOT_READY')
		expect(report.missingFingerprint).toBe(true)
		expect(report.findings[0]?.code).toBe('fingerprint_missing')
	})

	it('treats undefined the same as null', () => {
		expect(evaluateReadiness(undefined).verdict).toBe('NOT_READY')
	})

	it('reports each unmet requirement with a remediation', () => {
		const report = evaluateReadiness(
			fingerprint({ cpuCores: 2, memoryMb: 2048, diskGb: 5, macs: [] }),
		)
		expect(report.verdict).toBe('NOT_READY')
		const codes = report.findings.map((f) => f.code).sort()
		expect(codes).toEqual(['cpu_cores', 'disk', 'memory', 'network_identity'])
		for (const finding of report.findings) {
			expect(finding.remediation.length).toBeGreaterThan(0)
			expect(finding.observed.length).toBeGreaterThan(0)
		}
	})

	it('accepts a machine exactly at the thresholds', () => {
		const req = DEFAULT_READINESS_REQUIREMENTS
		const report = evaluateReadiness(
			fingerprint({
				cpuCores: req.minCpuCores,
				memoryMb: req.minMemoryMb,
				diskGb: req.minDiskGb,
			}),
		)
		expect(report.verdict).toBe('READY')
	})

	it('honours a custom requirement set', () => {
		const report = evaluateReadiness(fingerprint({ gpus: [] }), {
			...DEFAULT_READINESS_REQUIREMENTS,
			minGpus: 1,
		})
		expect(report.verdict).toBe('NOT_READY')
		expect(report.findings.map((f) => f.code)).toContain('gpu')
	})
})
