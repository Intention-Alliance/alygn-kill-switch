/**
 * Machine Discovery Service (ADR-135 §2, §5)
 *
 * Two discovery paths:
 *   1. Agent heartbeat — the authoritative registration path (ADR-133).
 *      A machine's agent registers itself with the kill-switch host.
 *   2. Network sweep (mDNS/ARP) — opportunistic discovery of
 *      UNREGISTERED machines on the local subnet.
 *
 * SECURITY CONTROL (ADR-135 §5): NO auto-admission. A newly detected
 * machine enters NEW_MACHINE state and requires human confirmation
 * (ADR-138 onboarding) before receiving any kill-switch authority.
 * Repeated denied attempts raise a rogue-device alert.
 *
 * The sweep is bounded and rate-limited: ARP/ICMP pings are capped per
 * run and per host, and mDNS queries use a short timeout, so discovery
 * never floods the network (ADR-135 consequences §2).
 */

import { execSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import type { DiscoveredMachine, DiscoverySource } from '@align/shared-types'

// ─── Types ───────────────────────────────────────────────────────

export interface SweepResult {
	hosts: DiscoveredMachine[]
	sweptAt: string // ISO timestamp
	durationMs: number
}

export interface MachineDiscoveryParams {
	maxHostsPerSweep?: number
	pingTimeoutMs?: number
	mdnsTimeoutMs?: number
}

interface LocalSubnet {
	ip: string
	prefix: number
}

// ─── Helpers ─────────────────────────────────────────────────────

export function getLocalSubnets(): LocalSubnet[] {
	const subnets: LocalSubnet[] = []
	const interfaces = networkInterfaces()
	for (const entries of Object.values(interfaces)) {
		for (const entry of entries ?? []) {
			if (entry.family === 'IPv4' && !entry.internal) {
				subnets.push({
					ip: entry.address,
					prefix: entry.cidr ? parseInt(entry.cidr.split('/')[1], 10) : 24,
				})
			}
		}
	}
	return subnets
}

export function subnetHosts(subnet: LocalSubnet, maxHosts: number): string[] {
	const parts = subnet.ip.split('.').map((part) => parseInt(part, 10))
	if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)))
		return []

	const hostBits = 32 - subnet.prefix
	const totalHosts = Math.min(2 ** hostBits - 2, maxHosts)
	const hosts: string[] = []
	for (let i = 1; i <= totalHosts; i++) {
		const offset = i
		const hostPart = (parts[3] + offset) % 256
		hosts.push(`${parts[0]}.${parts[1]}.${parts[2]}.${hostPart}`)
	}
	return hosts
}

function pingHost(ip: string, timeoutMs: number): boolean {
	try {
		execSync(
			`ping -c 1 -W ${Math.max(1, Math.floor(timeoutMs / 1000))} ${ip}`,
			{
				stdio: 'ignore',
				timeout: timeoutMs + 500,
			},
		)
		return true
	} catch {
		return false
	}
}

function resolveHostname(ip: string): string | null {
	try {
		const output = execSync(`getent hosts ${ip}`, {
			stdio: 'pipe',
			timeout: 2000,
		})
			.toString()
			.trim()
		const parts = output.split(/\s+/)
		return parts.length > 1 ? parts[1] : null
	} catch {
		return null
	}
}

export function buildDiscoveredMachine(
	ip: string,
	source: DiscoverySource,
	hostname: string | null,
): DiscoveredMachine {
	const now = new Date().toISOString()
	return {
		id: `discovered-${ip.replace(/\./g, '-')}`,
		hostname: hostname ?? ip,
		ip,
		source,
		state: 'NEW_MACHINE', // NO auto-admission (ADR-135 §5)
		fingerprint: null,
		integritySignature: null,
		firstSeen: now,
		lastSeen: now,
		confirmedAt: null,
		confirmedBy: null,
	}
}

// ─── Sweep Implementation ────────────────────────────────────────

/**
 * Bounded ARP/ICMP sweep of the local subnet(s). Opportunistic only —
 * results are provisional and must be human-confirmed before any
 * authority is granted.
 */
export async function sweepLocalNetwork({
	maxHostsPerSweep = 64,
	pingTimeoutMs = 1000,
}: MachineDiscoveryParams = {}): Promise<SweepResult> {
	const startedAt = performance.now()
	const subnets = getLocalSubnets()
	const hosts: DiscoveredMachine[] = []

	for (const subnet of subnets) {
		const candidates = subnetHosts(subnet, maxHostsPerSweep)
		for (const ip of candidates) {
			if (pingHost(ip, pingTimeoutMs)) {
				const hostname = resolveHostname(ip)
				hosts.push(buildDiscoveredMachine(ip, 'arp-sweep', hostname))
			}
		}
	}

	return {
		hosts,
		sweptAt: new Date().toISOString(),
		durationMs: Math.round(performance.now() - startedAt),
	}
}

/**
 * mDNS discovery of machines advertising `_alygn-killswitch._tcp`.
 * Uses avahi-browse when available; degrades to an empty result when
 * the tool is absent (the sweep + heartbeat paths still cover the LAN).
 */
export async function discoverMdns({
	mdnsTimeoutMs = 3000,
}: MachineDiscoveryParams = {}): Promise<DiscoveredMachine[]> {
	try {
		const output = execSync(
			`timeout ${Math.ceil(mdnsTimeoutMs / 1000)} avahi-browse -rt _alygn-killswitch._tcp 2>/dev/null || true`,
			{ stdio: 'pipe', timeout: mdnsTimeoutMs + 1000 },
		).toString()
		const hosts: DiscoveredMachine[] = []
		const lines = output.split('\n')
		for (const line of lines) {
			const match = line.match(/=\s*([^\s]+)\s+IPv4\s+([^\s]+)/)
			if (match) {
				const hostname = match[1]
				const ip = match[2]
				hosts.push(buildDiscoveredMachine(ip, 'mdns', hostname))
			}
		}
		return hosts
	} catch {
		return []
	}
}

/**
 * Full opportunistic sweep: mDNS + ARP/ICMP. Results are provisional —
 * the caller must route them through the registry (NEW_MACHINE state)
 * and human confirmation.
 */
export async function runNetworkDiscovery(
	params: MachineDiscoveryParams = {},
): Promise<SweepResult> {
	const startedAt = performance.now()
	const [mdnsHosts, sweep] = await Promise.all([
		discoverMdns(params),
		sweepLocalNetwork(params),
	])

	// Deduplicate by IP — mDNS wins for hostname resolution
	const byIp = new Map<string, DiscoveredMachine>()
	for (const host of mdnsHosts) byIp.set(host.ip ?? host.hostname, host)
	for (const host of sweep.hosts) {
		if (!byIp.has(host.ip ?? host.hostname))
			byIp.set(host.ip ?? host.hostname, host)
	}

	return {
		hosts: [...byIp.values()],
		sweptAt: new Date().toISOString(),
		durationMs: Math.round(performance.now() - startedAt),
	}
}
