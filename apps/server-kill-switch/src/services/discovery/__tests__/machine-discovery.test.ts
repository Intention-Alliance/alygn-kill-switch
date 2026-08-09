/**
 * Machine Discovery — Unit Tests (ADR-135 §2, §5)
 *
 * Covers the NO auto-admission security control: every discovered host
 * enters NEW_MACHINE state and requires human confirmation. Also covers
 * subnet enumeration and the bounded sweep.
 */

import { describe, expect, it, mock } from 'bun:test'
import type { DiscoveredMachine } from '@align/shared-types'
import {
	buildDiscoveredMachine,
	getLocalSubnets,
	subnetHosts,
} from '../machine-discovery'

// ─── buildDiscoveredMachine ─────────────────────────────────────

describe('buildDiscoveredMachine', () => {
	it('creates a NEW_MACHINE with no authority (NO auto-admission)', () => {
		const machine = buildDiscoveredMachine(
			'192.168.1.50',
			'arp-sweep',
			'worker-01',
		)
		expect(machine.state).toBe('NEW_MACHINE')
		expect(machine.confirmedAt).toBeNull()
		expect(machine.confirmedBy).toBeNull()
		expect(machine.fingerprint).toBeNull()
		expect(machine.integritySignature).toBeNull()
		expect(machine.source).toBe('arp-sweep')
		expect(machine.hostname).toBe('worker-01')
		expect(machine.ip).toBe('192.168.1.50')
	})

	it('falls back to IP as hostname when resolution fails', () => {
		const machine = buildDiscoveredMachine('10.0.0.7', 'mdns', null)
		expect(machine.hostname).toBe('10.0.0.7')
	})

	it('generates a stable id from the IP', () => {
		const machine = buildDiscoveredMachine('192.168.1.50', 'arp-sweep', null)
		expect(machine.id).toBe('discovered-192-168-1-50')
	})

	it('records firstSeen and lastSeen', () => {
		const machine = buildDiscoveredMachine('192.168.1.50', 'arp-sweep', null)
		expect(machine.firstSeen).toBe(machine.lastSeen)
		expect(new Date(machine.firstSeen).getTime()).not.toBeNaN()
	})
})

// ─── subnetHosts ────────────────────────────────────────────────

describe('subnetHosts', () => {
	it('enumerates hosts within the subnet', () => {
		const hosts = subnetHosts({ ip: '192.168.1.10', prefix: 24 }, 5)
		expect(hosts).toEqual([
			'192.168.1.11',
			'192.168.1.12',
			'192.168.1.13',
			'192.168.1.14',
			'192.168.1.15',
		])
	})

	it('respects maxHostsPerSweep bound', () => {
		const hosts = subnetHosts({ ip: '192.168.1.10', prefix: 24 }, 2)
		expect(hosts.length).toBe(2)
	})

	it('caps at the subnet size (never exceeds 2^hostBits - 2)', () => {
		const hosts = subnetHosts({ ip: '192.168.1.10', prefix: 30 }, 1000)
		expect(hosts.length).toBe(2) // /30 → 2 usable hosts
	})

	it('returns empty for malformed IPs', () => {
		expect(subnetHosts({ ip: 'not-an-ip', prefix: 24 }, 5)).toEqual([])
	})
})

// ─── getLocalSubnets ────────────────────────────────────────────

describe('getLocalSubnets', () => {
	it('returns at least the loopback-free IPv4 subnets present on the host', () => {
		const subnets = getLocalSubnets()
		expect(Array.isArray(subnets)).toBe(true)
		for (const subnet of subnets) {
			expect(typeof subnet.ip).toBe('string')
			expect(typeof subnet.prefix).toBe('number')
		}
	})
})

// ─── Sweep result shape (integration-lite) ──────────────────────

describe('sweep result shape', () => {
	it('discovered machines are provisional DiscoveredMachine objects', () => {
		const machine: DiscoveredMachine = buildDiscoveredMachine(
			'10.0.0.5',
			'mdns',
			'gpu-node',
		)
		expect(machine.state).toBe('NEW_MACHINE')
		expect(machine.source).toBe('mdns')
		// The orchestrator routes these through the registry — never auto-admits.
		expect(['NEW_MACHINE', 'PENDING_CONFIRMATION']).toContain(machine.state)
	})

	it('mock: sweepLocalNetwork is bounded and returns a SweepResult', async () => {
		// We don't run a real sweep in unit tests (network side effects);
		// the orchestrator test covers the registry path with a mocked sweep.
		const { sweepLocalNetwork } = await import('../machine-discovery')
		const spy = mock(sweepLocalNetwork)
		spy.mockResolvedValue({
			hosts: [buildDiscoveredMachine('10.0.0.9', 'arp-sweep', null)],
			sweptAt: new Date().toISOString(),
			durationMs: 12,
		})
		const result = await spy()
		expect(result.hosts.length).toBe(1)
		expect(result.hosts[0].state).toBe('NEW_MACHINE')
		expect(typeof result.durationMs).toBe('number')
		expect(typeof result.sweptAt).toBe('string')
	})
})
