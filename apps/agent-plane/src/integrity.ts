/**
 * Hardware fingerprint collection — ADR-134 detection model.
 * Collects CPU, memory, GPU, disk, OS, and MAC addresses.
 * Used for registration and integrity drift detection.
 */

import { readdirSync, readFileSync } from 'node:fs'

export interface HardwareFingerprint {
  cpuModel: string
  cpuCores: number
  memoryMb: number
  gpus: { name: string; vendor: string | null; pciId: string | null }[]
  diskGb: number
  osRelease: string
  macs: string[]
  collectedAt: string
}

export async function collectFingerprint(): Promise<HardwareFingerprint> {
  const [cpuModel, cpuCores, memoryMb, gpus, diskGb, osRelease, macs] = await Promise.all([
    getCpuModel(),
    getCoreCount(),
    getMemoryMb(),
    getGpus(),
    getDiskGb(),
    getOsRelease(),
    getMacs(),
  ])

  return {
    cpuModel, cpuCores, memoryMb, gpus, diskGb, osRelease, macs,
    collectedAt: new Date().toISOString(),
  }
}

async function getCpuModel(): Promise<string> {
  try {
    // readFileSync, not Bun.file().exists() + .text(): on /proc files the
    // exists() probe consumes the stream and .text() then returns empty,
    // silently yielding cpuModel=unknown and blinding CPU drift detection.
    const content = readFileSync('/proc/cpuinfo', 'utf8')
    const match = content.match(/model name\s*:\s*(.+)/)
    if (match) return match[1].trim()
  } catch {
    // no /proc (non-Linux) — unknown is valid
  }
  return 'unknown'
}

function getCoreCount(): number {
  return navigator.hardwareConcurrency ?? 0
}

async function getMemoryMb(): Promise<number> {
  try {
    // Same readFileSync rationale as getCpuModel: exists()+text() on /proc
    // returns empty, yielding memoryMb=0 and blind memory drift detection.
    const content = readFileSync('/proc/meminfo', 'utf8')
    const match = content.match(/MemTotal:\s+(\d+)\s+kB/)
    if (match) return Math.round(parseInt(match[1]) / 1024)
  } catch {
    // no /proc (non-Linux) — 0 is valid
  }
  return 0
}

async function getGpus(): Promise<HardwareFingerprint['gpus']> {
  try {
    const proc = Bun.spawn(['lspci', '-nn'], { stdout: 'pipe', stderr: 'pipe' })
    const output = await new Response(proc.stdout).text()
    await proc.exited
    return output
      .split('\n')
      .filter(l => /VGA|3D controller|Display/.test(l))
      .map(l => {
        const pciMatch = l.match(/^(\S+)/)
        const nameMatch = l.match(/\[(\w{4}:\w{4})\]/)
        const vendorMatch = l.match(/\[(\w{4}):\w{4}\]/)
        return {
          name: l.split(':')[2]?.trim() ?? l.trim(),
          vendor: /NVIDIA/i.test(l) ? 'NVIDIA' : /Intel/i.test(l) ? 'Intel' : /AMD/i.test(l) ? 'AMD' : null,
          pciId: nameMatch?.[1] ?? null,
        }
      })
  } catch {
    // lspci not installed (e.g. minimal containers) — no GPU info is valid
    return []
  }
}

async function getDiskGb(): Promise<number> {
  try {
    const proc = Bun.spawn(['df', '--output=size', '--total', '-B1G', '/'], { stdout: 'pipe', stderr: 'pipe' })
    const output = await new Response(proc.stdout).text()
    await proc.exited
    const lines = output.trim().split('\n')
    const totalLine = lines.find(l => l.trim() && !isNaN(parseInt(l.trim())))
    return totalLine ? parseInt(totalLine.trim()) : 0
  } catch {
    return 0
  }
}

async function getOsRelease(): Promise<string> {
  try {
    // readFileSync for consistency with the other fingerprint readers.
    const content = readFileSync('/etc/os-release', 'utf8')
    const pretty = content.match(/PRETTY_NAME="?([^"\n]+)"?/)
    if (pretty) return pretty[1]
  } catch {
    // no /etc/os-release (non-Linux) — unknown is valid
  }
  return 'unknown'
}

/**
 * Read MAC addresses by expanding the /sys/class/net directory ourselves.
 *
 * Passing the literal glob 'cat /sys/class/net/star/address' to Bun.spawn
 * never expands it (the shell does that, and Bun.spawn does not run a
 * shell) — the literal path fails and MACs always come back empty,
 * silently disabling drift detection. We enumerate the directory and
 * read each interface's address file instead.
 */
async function getMacs(): Promise<string[]> {
  const macs: string[] = []
  let ifaces: string[] = []
  try {
    ifaces = readdirSync('/sys/class/net')
  } catch {
    return macs // no /sys (non-Linux) — empty MAC list is valid
  }
  for (const iface of ifaces) {
    try {
      const address = readFileSync(`/sys/class/net/${iface}/address`, 'utf8').trim()
      if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(address)) {
        macs.push(address.toLowerCase())
      }
    } catch {
      // interface without an address file (e.g. some virtual devices) — skip
    }
  }
  return macs
}

export function detectDrift(previous: HardwareFingerprint, current: HardwareFingerprint): string[] {
  const drifts: string[] = []
  if (previous.cpuModel !== current.cpuModel) drifts.push(`cpu: ${previous.cpuModel} → ${current.cpuModel}`)
  if (previous.cpuCores !== current.cpuCores) drifts.push(`cores: ${previous.cpuCores} → ${current.cpuCores}`)
  if (previous.memoryMb !== current.memoryMb) drifts.push(`memory: ${previous.memoryMb}MB → ${current.memoryMb}MB`)
  const prevGpu = JSON.stringify(previous.gpus)
  const currGpu = JSON.stringify(current.gpus)
  if (prevGpu !== currGpu) drifts.push(`gpu changed`)
  if (previous.diskGb !== current.diskGb) drifts.push(`disk: ${previous.diskGb}GB → ${current.diskGb}GB`)
  if (previous.osRelease !== current.osRelease) drifts.push(`os: ${previous.osRelease} → ${current.osRelease}`)
  const prevMacs = [...previous.macs].sort().join(',')
  const currMacs = [...current.macs].sort().join(',')
  if (prevMacs !== currMacs) drifts.push(`macs changed`)
  return drifts
}
