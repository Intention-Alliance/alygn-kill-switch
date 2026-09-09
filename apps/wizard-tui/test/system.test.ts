/**
 * Tests for lib/system.ts — system detection + preflight report.
 */

import { describe, expect, test } from 'bun:test'
import { currentHostname, detectSystem, hasBlockingIssues } from '../src/lib/system'

describe('detectSystem', () => {
	test('returns a complete SystemReport without throwing', async () => {
		const report = await detectSystem()

		expect(report.os).toBeTypeOf('string')
		expect(report.kernel).toBeTypeOf('string')
		expect(report.arch).toBeTypeOf('string')
		expect(report.systemd).toBeTypeOf('boolean')
		expect(report.bun).not.toBeNull()
		expect(report.redis).not.toBeNull()
		expect(report.git).not.toBeNull()
		expect(report.ports[3000]).toBeOneOf(['free', 'used'])
		expect(report.ports[3001]).toBeOneOf(['free', 'used'])
		expect(report.hardware.cores).toBeGreaterThan(0)
		expect(report.hardware.memMb).toBeGreaterThan(0)
		expect(report.hardware.cpu).toBeTypeOf('string')
		expect(Array.isArray(report.issues)).toBe(true)
	})

	test('bun reports installed with a version on this machine', async () => {
		const report = await detectSystem()
		expect(report.bun?.installed).toBe(true)
		expect(report.bun?.version).toBeTypeOf('string')
	})

	test('issues carry severity, message and remediation', async () => {
		const report = await detectSystem()
		for (const issue of report.issues) {
			expect(['error', 'warn']).toContain(issue.severity)
			expect(issue.message.length).toBeGreaterThan(0)
			expect(issue.remediation.length).toBeGreaterThan(0)
		}
	})
})

describe('hasBlockingIssues', () => {
	test('true when an error-severity issue exists', () => {
		const report = {
			os: 'Linux',
			kernel: 'x',
			arch: 'x86_64',
			systemd: true,
			bun: { installed: true, version: '1.4.0' },
			redis: { installed: true, running: true },
			git: { installed: true, version: '2.40' },
			ports: { 3000: 'free' as const, 3001: 'free' as const },
			hardware: { cpu: 'x', cores: 4, memMb: 8192 },
			issues: [{ severity: 'error' as const, message: 'boom', remediation: 'fix it' }],
		}
		expect(hasBlockingIssues(report)).toBe(true)
	})

	test('false when only warnings exist', () => {
		const report = {
			os: 'Linux',
			kernel: 'x',
			arch: 'x86_64',
			systemd: true,
			bun: { installed: true, version: '1.4.0' },
			redis: { installed: true, running: true },
			git: { installed: true, version: '2.40' },
			ports: { 3000: 'free' as const, 3001: 'free' as const },
			hardware: { cpu: 'x', cores: 4, memMb: 8192 },
			issues: [{ severity: 'warn' as const, message: 'meh', remediation: 'later' }],
		}
		expect(hasBlockingIssues(report)).toBe(false)
	})
})

describe('currentHostname', () => {
	test('returns a non-empty hostname', () => {
		expect(currentHostname().length).toBeGreaterThan(0)
	})
})
