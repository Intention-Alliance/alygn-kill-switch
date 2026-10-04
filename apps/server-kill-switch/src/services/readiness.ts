/**
 * Readiness gate for the onboarding → arming pipeline (DESIGN-SYSTEM §7A).
 *
 * Arming a machine is a gated pipeline, not a single action. Before a machine
 * may be installed and armed, its collected fingerprint is checked against the
 * security standards. The verdict is one of:
 *
 *   READY      — every requirement satisfied; onboarding may proceed to the
 *                Dignity Test audience and certificate issuance.
 *   NOT_READY  — one or more requirements unsatisfied. The findings are
 *                returned so a human super admin can fix them (config, machine
 *                permissions, hardware). The system never closes these gaps
 *                itself: establishing trust is a human act (Invariants 1 & 9).
 *
 * This module is pure: it takes a fingerprint and returns a verdict. It does
 * not touch the database, the network, or the audit log — the caller records
 * the decision.
 */

import type { HardwareFingerprint } from '@align/shared-types'

/** Minimum host requirements for a machine to be armable. */
export interface ReadinessRequirements {
	/** Minimum logical CPU cores. */
	minCpuCores: number
	/** Minimum RAM in MiB. */
	minMemoryMb: number
	/** Minimum free disk in GiB. */
	minDiskGb: number
	/** At least one network interface MAC is required for identity binding. */
	requireMac: boolean
	/** Minimum GPU count. 0 means "no GPU required". */
	minGpus: number
}

/**
 * Defaults reflect the minimum the kill switch needs to run its local model
 * and hold the audit chain. They are deliberately modest: the gate exists to
 * catch machines that cannot hold the workload at all, not to enforce a
 * procurement standard.
 */
export const DEFAULT_READINESS_REQUIREMENTS: ReadinessRequirements = {
	minCpuCores: 4,
	minMemoryMb: 8192,
	minDiskGb: 40,
	requireMac: true,
	minGpus: 0,
}

export type ReadinessVerdict = 'READY' | 'NOT_READY'

/** One unmet requirement, phrased so a human can act on it. */
export interface ReadinessFinding {
	/** Stable machine-readable id, e.g. `cpu_cores`. */
	code: string
	/** What was expected. */
	expected: string
	/** What the machine actually reported. */
	observed: string
	/** The human action that would close the gap. */
	remediation: string
}

export interface ReadinessReport {
	verdict: ReadinessVerdict
	/** Empty when the verdict is READY. */
	findings: ReadinessFinding[]
	/**
	 * True when no fingerprint was available at all. A missing fingerprint is
	 * NOT_READY — the gate cannot pass what it cannot measure.
	 */
	missingFingerprint: boolean
}

/**
 * Evaluate a machine's fingerprint against the readiness requirements.
 *
 * A missing or null fingerprint yields NOT_READY with a single finding: the
 * low-level analysis (pipeline step 2) has not produced data yet, so no
 * readiness claim is possible.
 */
export function evaluateReadiness(
	fingerprint: HardwareFingerprint | null | undefined,
	requirements: ReadinessRequirements = DEFAULT_READINESS_REQUIREMENTS,
): ReadinessReport {
	if (!fingerprint) {
		return {
			verdict: 'NOT_READY',
			missingFingerprint: true,
			findings: [
				{
					code: 'fingerprint_missing',
					expected: 'a collected hardware fingerprint',
					observed: 'none',
					remediation:
						'Run the low-level host analysis (dashboard onboarding) so the machine reports its hardware, or confirm the agent is reachable.',
				},
			],
		}
	}

	const findings: ReadinessFinding[] = []

	if (fingerprint.cpuCores < requirements.minCpuCores) {
		findings.push({
			code: 'cpu_cores',
			expected: `>= ${requirements.minCpuCores} cores`,
			observed: `${fingerprint.cpuCores} cores`,
			remediation:
				'Move the kill switch to a host with enough CPU, or reduce the local model footprint by agreement with Alygn.',
		})
	}

	if (fingerprint.memoryMb < requirements.minMemoryMb) {
		findings.push({
			code: 'memory',
			expected: `>= ${requirements.minMemoryMb} MiB RAM`,
			observed: `${fingerprint.memoryMb} MiB`,
			remediation:
				'Add RAM to the host. The local model and audit chain both need resident memory.',
		})
	}

	if (fingerprint.diskGb < requirements.minDiskGb) {
		findings.push({
			code: 'disk',
			expected: `>= ${requirements.minDiskGb} GB free disk`,
			observed: `${fingerprint.diskGb} GB`,
			remediation:
				'Free disk space or attach storage. The audit chain is append-only and cannot be trimmed.',
		})
	}

	if (requirements.requireMac && fingerprint.macs.length === 0) {
		findings.push({
			code: 'network_identity',
			expected: '>= 1 network interface MAC',
			observed: 'none reported',
			remediation:
				'Grant the agent permission to read network interfaces, or attach a network interface. MACs bind the machine identity.',
		})
	}

	if (fingerprint.gpus.length < requirements.minGpus) {
		findings.push({
			code: 'gpu',
			expected: `>= ${requirements.minGpus} GPU(s)`,
			observed: `${fingerprint.gpus.length}`,
			remediation: 'Attach the required accelerator, or agree a CPU-only profile with Alygn.',
		})
	}

	return {
		verdict: findings.length === 0 ? 'READY' : 'NOT_READY',
		findings,
		missingFingerprint: false,
	}
}
