/**
 * Hardware Fingerprint Collector (ADR-134/135 §3)
 *
 * Collects the hardware fingerprint for a machine: CPU model/cores,
 * cgroup-aware memory, GPU(s) (nvidia-smi → lspci → sysfs → integrated
 * fallback), disk, OS release, and network MACs for identity binding.
 *
 * The fingerprint is hashed into an integrity signature (sha256 over the
 * canonical JSON). On every heartbeat the agent re-collects and compares;
 * drift (a changed GPU, a swapped MAC) is flagged as a tamper/swap event
 * requiring human review.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { cpus, homedir, networkInterfaces, release, totalmem } from 'node:os'
import type {
	GpuFingerprint,
	HardwareFingerprint,
	IntegrityDrift,
	IntegritySignature,
} from '@align/shared-types'

// ─── Helpers ─────────────────────────────────────────────────────

function readFileSafe(path: string): string | null {
	try {
		return readFileSync(path, 'utf-8').trim()
	} catch {
		return null
	}
}

function readCpuModel(): string {
	const content = readFileSafe('/proc/cpuinfo')
	if (content) {
		const match = content.match(/^model name\s*:\s*(.+)$/m)
		if (match) return match[1].trim()
	}
	const cpuList = cpus()
	if (cpuList.length > 0 && cpuList[0].model) return cpuList[0].model
	return 'Unknown CPU'
}

function readMemoryMb(): number {
	// cgroup v2 first (container-aware)
	const cgroupMax = readFileSafe('/sys/fs/cgroup/memory.max')
	if (cgroupMax && cgroupMax !== 'max') {
		const bytes = parseInt(cgroupMax, 10)
		if (Number.isFinite(bytes) && bytes > 0)
			return Math.round(bytes / 1024 / 1024)
	}
	// cgroup v1
	const cgroupV1Limit = readFileSafe(
		'/sys/fs/cgroup/memory/memory.limit_in_bytes',
	)
	if (cgroupV1Limit) {
		const bytes = parseInt(cgroupV1Limit, 10)
		if (Number.isFinite(bytes) && bytes < Number.MAX_SAFE_INTEGER) {
			return Math.round(bytes / 1024 / 1024)
		}
	}
	// Host fallback
	return Math.round(totalmem() / 1024 / 1024)
}

function readDiskGb(): number {
	try {
		const proc = Bun.spawnSync(['df', '-k', '/'], { stdout: 'pipe' })
		if (proc.exitCode === 0 && proc.stdout) {
			const lines = proc.stdout.toString().trim().split('\n')
			if (lines.length > 1) {
				const parts = lines[1].split(/\s+/)
				const totalKb = parseInt(parts[1], 10)
				if (Number.isFinite(totalKb)) return Math.round(totalKb / 1024 / 1024)
			}
		}
	} catch {
		// df unavailable
	}
	return 0
}

function readOsRelease(): string {
	const osRelease = readFileSafe('/etc/os-release')
	if (osRelease) {
		const match = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?$/m)
		if (match) return match[1].trim()
	}
	return release()
}

function collectGpus(): GpuFingerprint[] {
	// 1. nvidia-smi (authoritative for NVIDIA)
	try {
		const proc = Bun.spawnSync(
			['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'],
			{ stdout: 'pipe', stderr: 'pipe' },
		)
		if (proc.exitCode === 0 && proc.stdout) {
			const names = proc.stdout
				.toString()
				.trim()
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
			if (names.length > 0) {
				return names.map((name) => ({
					name,
					vendor: 'NVIDIA',
					pciId: null,
				}))
			}
		}
	} catch {
		// nvidia-smi not available
	}

	// 2. lspci (vendor + device ids)
	try {
		const proc = Bun.spawnSync(['lspci', '-nn'], {
			stdout: 'pipe',
			stderr: 'pipe',
		})
		if (proc.exitCode === 0 && proc.stdout) {
			const gpus = proc.stdout
				.toString()
				.split('\n')
				.filter((line) => /VGA|3D controller|Display controller/i.test(line))
				.map((line) => {
					const pciMatch = line.match(/\[([0-9a-f]{4}:[0-9a-f]{4})\]/i)
					const name = line.replace(/\[[0-9a-f]{4}:[0-9a-f]{4}\]/gi, '').trim()
					return {
						name: name || 'Unknown GPU',
						vendor: null,
						pciId: pciMatch ? pciMatch[1] : null,
					}
				})
			if (gpus.length > 0) return gpus
		}
	} catch {
		// lspci not available
	}

	// 3. sysfs VGA class (0x030000)
	const pciDevicesPath = '/sys/bus/pci/devices'
	if (existsSync(pciDevicesPath)) {
		try {
			const devices = readFileSync(pciDevicesPath, 'utf-8').trim().split('\n')
			const gpus: GpuFingerprint[] = []
			for (const dev of devices) {
				const classHex = readFileSafe(`${pciDevicesPath}/${dev}/class`)
				if (classHex && classHex.startsWith('0x030000')) {
					const vendor = readFileSafe(`${pciDevicesPath}/${dev}/vendor`) ?? ''
					const device = readFileSafe(`${pciDevicesPath}/${dev}/device`) ?? ''
					let name = 'Unknown GPU'
					const vendorLower = vendor.toLowerCase()
					if (vendorLower.includes('0x8086')) name = 'Intel iGPU'
					else if (vendorLower.includes('0x10de')) name = 'NVIDIA GPU'
					else if (vendorLower.includes('0x1002')) name = 'AMD GPU'
					else name = `VGA ${vendor}/${device}`
					gpus.push({
						name,
						vendor: vendor || null,
						pciId: `${vendor}:${device}`,
					})
				}
			}
			if (gpus.length > 0) return gpus
		} catch {
			// sysfs not accessible
		}
	}

	return []
}

function collectMacs(): string[] {
	const interfaces = networkInterfaces()
	const macs: string[] = []
	for (const entries of Object.values(interfaces)) {
		for (const entry of entries ?? []) {
			if (entry.mac && entry.mac !== '00:00:00:00:00:00') {
				macs.push(entry.mac.toLowerCase())
			}
		}
	}
	return [...new Set(macs)].sort()
}

// ─── Fingerprint Collection ──────────────────────────────────────

/**
 * Collect the full hardware fingerprint for this machine.
 * Deterministic field ordering — required for stable hashing.
 */
export function collectHardwareFingerprint(): HardwareFingerprint {
	return {
		cpuModel: readCpuModel(),
		cpuCores: cpus().length,
		memoryMb: readMemoryMb(),
		gpus: collectGpus(),
		diskGb: readDiskGb(),
		osRelease: readOsRelease(),
		macs: collectMacs(),
		collectedAt: new Date().toISOString(),
	}
}

/**
 * Canonical serialization for hashing. Excludes `collectedAt` so the
 * signature is stable across re-collections (drift detection compares
 * hardware, not timestamps).
 */
export function canonicalFingerprintJson(
	fingerprint: HardwareFingerprint,
): string {
	const { collectedAt: _collectedAt, ...stable } = fingerprint
	return JSON.stringify(stable)
}

/**
 * Hash the fingerprint into an integrity signature (sha256 hex).
 */
export function signFingerprint(
	fingerprint: HardwareFingerprint,
): IntegritySignature {
	const hash = createHash('sha256')
		.update(canonicalFingerprintJson(fingerprint), 'utf8')
		.digest('hex')
	return {
		algorithm: 'sha256',
		hash,
		signedAt: new Date().toISOString(),
	}
}

/**
 * Signature-level drift check. When only the baseline signature is
 * available (no stored fingerprint snapshot), a hash mismatch proves
 * tamper but not which field changed — report a generic high-severity
 * tamper event. Prefer `compareFingerprints` (field-level) on heartbeat.
 */
export function detectFingerprintDrift(
	current: HardwareFingerprint,
	baselineSignature: IntegritySignature,
	machineId: string,
): IntegrityDrift | null {
	const currentSignature = signFingerprint(current)
	if (currentSignature.hash === baselineSignature.hash) return null

	return {
		event: 'tamper',
		machineId,
		driftedFields: [],
		severity: 'high',
		detectedAt: new Date().toISOString(),
	}
}

/**
 * Field-level drift comparison against a stored baseline fingerprint.
 * This is the authoritative drift detector used on heartbeat.
 */
export function compareFingerprints(
	current: HardwareFingerprint,
	baseline: HardwareFingerprint,
	machineId: string,
): IntegrityDrift | null {
	const currentSignature = signFingerprint(current)
	const baselineSignature = signFingerprint(baseline)
	if (currentSignature.hash === baselineSignature.hash) return null

	const driftedFields: string[] = []
	if (current.cpuModel !== baseline.cpuModel) driftedFields.push('cpuModel')
	if (current.cpuCores !== baseline.cpuCores) driftedFields.push('cpuCores')
	if (current.memoryMb !== baseline.memoryMb) driftedFields.push('memoryMb')
	if (current.diskGb !== baseline.diskGb) driftedFields.push('diskGb')
	if (current.osRelease !== baseline.osRelease) driftedFields.push('osRelease')
	if (JSON.stringify(current.gpus) !== JSON.stringify(baseline.gpus))
		driftedFields.push('gpus')
	if (JSON.stringify(current.macs) !== JSON.stringify(baseline.macs))
		driftedFields.push('macs')

	const hasMacDrift = driftedFields.includes('macs')
	const hasGpuDrift = driftedFields.includes('gpus')
	const severity = hasMacDrift ? 'high' : hasGpuDrift ? 'medium' : 'low'

	return {
		event: hasMacDrift || hasGpuDrift ? 'swap' : 'tamper',
		machineId,
		driftedFields,
		severity,
		detectedAt: new Date().toISOString(),
	}
}

/**
 * Default search roots for LlamaIndex artifacts (exported for reuse).
 */
export function defaultLlamaIndexSearchDirs(): string[] {
	return [joinHome('llamaindex'), joinHome('indexes')]
}

function joinHome(...parts: string[]): string {
	return [homedir(), ...parts].join('/')
}
