/**
 * Hardware Fingerprint — Unit Tests (ADR-134/135 §3)
 *
 * Covers: fingerprint collection shape, canonical serialization stability,
 * signature hashing, and drift detection (tamper/swap events).
 */

import { describe, expect, it } from 'bun:test'
import type { HardwareFingerprint } from '@align/shared-types'
import {
	canonicalFingerprintJson,
	collectHardwareFingerprint,
	compareFingerprints,
	detectFingerprintDrift,
	signFingerprint,
} from '../fingerprint'

function makeFingerprint(
	overrides: Partial<HardwareFingerprint> = {},
): HardwareFingerprint {
	return {
		cpuModel: 'Test CPU',
		cpuCores: 8,
		memoryMb: 16384,
		gpus: [{ name: 'Test GPU', vendor: 'NVIDIA', pciId: '10de:1234' }],
		diskGb: 512,
		osRelease: 'TestOS 1.0',
		macs: ['aa:bb:cc:dd:ee:ff'],
		collectedAt: '2026-08-08T00:00:00.000Z',
		...overrides,
	}
}

describe('collectHardwareFingerprint', () => {
	it('returns a fingerprint with all required fields', () => {
		const fp = collectHardwareFingerprint()
		expect(typeof fp.cpuModel).toBe('string')
		expect(fp.cpuModel.length).toBeGreaterThan(0)
		expect(typeof fp.cpuCores).toBe('number')
		expect(fp.cpuCores).toBeGreaterThan(0)
		expect(typeof fp.memoryMb).toBe('number')
		expect(Array.isArray(fp.gpus)).toBe(true)
		expect(typeof fp.diskGb).toBe('number')
		expect(typeof fp.osRelease).toBe('string')
		expect(Array.isArray(fp.macs)).toBe(true)
		expect(typeof fp.collectedAt).toBe('string')
	})

	it('returns sorted unique MACs', () => {
		const fp = collectHardwareFingerprint()
		const sorted = [...fp.macs].sort()
		expect(fp.macs).toEqual(sorted)
		expect(new Set(fp.macs).size).toBe(fp.macs.length)
	})
})

describe('canonicalFingerprintJson', () => {
	it('excludes collectedAt so signatures are stable across re-collection', () => {
		const a = makeFingerprint({ collectedAt: '2026-08-08T00:00:00.000Z' })
		const b = makeFingerprint({ collectedAt: '2026-08-09T00:00:00.000Z' })
		expect(canonicalFingerprintJson(a)).toBe(canonicalFingerprintJson(b))
	})

	it('is deterministic for identical hardware', () => {
		const a = makeFingerprint()
		const b = makeFingerprint()
		expect(canonicalFingerprintJson(a)).toBe(canonicalFingerprintJson(b))
	})
})

describe('signFingerprint', () => {
	it('produces a sha256 hex signature', () => {
		const fp = makeFingerprint()
		const sig = signFingerprint(fp)
		expect(sig.algorithm).toBe('sha256')
		expect(sig.hash).toMatch(/^[0-9a-f]{64}$/)
		expect(typeof sig.signedAt).toBe('string')
	})

	it('produces identical hashes for identical hardware', () => {
		const a = signFingerprint(makeFingerprint())
		const b = signFingerprint(makeFingerprint())
		expect(a.hash).toBe(b.hash)
	})

	it('produces different hashes when hardware changes', () => {
		const a = signFingerprint(makeFingerprint())
		const b = signFingerprint(
			makeFingerprint({
				gpus: [{ name: 'Other GPU', vendor: 'AMD', pciId: '1002:5678' }],
			}),
		)
		expect(a.hash).not.toBe(b.hash)
	})
})

describe('compareFingerprints', () => {
	it('returns null when hardware is intact', () => {
		const baseline = makeFingerprint()
		const current = makeFingerprint({ collectedAt: '2026-08-09T00:00:00.000Z' })
		expect(compareFingerprints(current, baseline, 'machine-1')).toBeNull()
	})

	it('flags MAC change as high-severity swap', () => {
		const baseline = makeFingerprint()
		const current = makeFingerprint({ macs: ['11:22:33:44:55:66'] })
		const drift = compareFingerprints(current, baseline, 'machine-1')
		expect(drift).not.toBeNull()
		expect(drift!.event).toBe('swap')
		expect(drift!.severity).toBe('high')
		expect(drift!.driftedFields).toContain('macs')
		expect(drift!.machineId).toBe('machine-1')
	})

	it('flags GPU change as medium-severity swap', () => {
		const baseline = makeFingerprint()
		const current = makeFingerprint({
			gpus: [{ name: 'New GPU', vendor: 'NVIDIA', pciId: '10de:9999' }],
		})
		const drift = compareFingerprints(current, baseline, 'machine-1')
		expect(drift).not.toBeNull()
		expect(drift!.event).toBe('swap')
		expect(drift!.severity).toBe('medium')
		expect(drift!.driftedFields).toContain('gpus')
	})

	it('flags CPU change as low-severity tamper', () => {
		const baseline = makeFingerprint()
		const current = makeFingerprint({ cpuModel: 'Different CPU' })
		const drift = compareFingerprints(current, baseline, 'machine-1')
		expect(drift).not.toBeNull()
		expect(drift!.event).toBe('tamper')
		expect(drift!.severity).toBe('low')
		expect(drift!.driftedFields).toContain('cpuModel')
	})

	it('reports multiple drifted fields', () => {
		const baseline = makeFingerprint()
		const current = makeFingerprint({
			cpuModel: 'Different CPU',
			memoryMb: 32768,
			macs: ['11:22:33:44:55:66'],
		})
		const drift = compareFingerprints(current, baseline, 'machine-1')
		expect(drift).not.toBeNull()
		expect(drift!.driftedFields).toEqual(
			expect.arrayContaining(['cpuModel', 'memoryMb', 'macs']),
		)
	})
})

describe('detectFingerprintDrift (signature-only)', () => {
	it('returns null when signature matches', () => {
		const fp = makeFingerprint()
		const sig = signFingerprint(fp)
		expect(detectFingerprintDrift(fp, sig, 'machine-1')).toBeNull()
	})

	it('returns high-severity tamper when signature mismatches', () => {
		const baseline = makeFingerprint()
		const current = makeFingerprint({ macs: ['11:22:33:44:55:66'] })
		const sig = signFingerprint(baseline)
		const drift = detectFingerprintDrift(current, sig, 'machine-1')
		expect(drift).not.toBeNull()
		expect(drift!.event).toBe('tamper')
		expect(drift!.severity).toBe('high')
	})
})
