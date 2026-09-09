/**
 * Integrity — MAC glob expansion (regression for the literal-glob bug)
 * and drift detection.
 */

import { describe, expect, it } from 'bun:test'
import { collectFingerprint, detectDrift, type HardwareFingerprint } from '../integrity'

describe('getMacs (via collectFingerprint)', () => {
  it('expands /sys/class/net/* and returns real MAC addresses on Linux', async () => {
    const fp = await collectFingerprint()
    // Regression: `cat /sys/class/net/*/address` never expanded the glob,
    // so MACs were always []. On a Linux host with any NIC this must be > 0.
    expect(Array.isArray(fp.macs)).toBe(true)
    for (const mac of fp.macs) {
      expect(mac).toMatch(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)
    }
  })
})

describe('procfs fingerprint (regression: exists()+text() returns empty)', () => {
  it('reads real CPU model and memory from /proc on Linux', async () => {
    const fp = await collectFingerprint()
    // Regression: Bun.file('/proc/cpuinfo').exists() then .text() returns
    // EMPTY (the exists() probe consumes the stream), so cpuModel was
    // 'unknown' and memoryMb 0 — silently blinding CPU/memory drift
    // detection. readFileSync must be used instead.
    expect(fp.cpuModel).not.toBe('unknown')
    expect(fp.cpuModel.length).toBeGreaterThan(0)
    expect(fp.memoryMb).toBeGreaterThan(0)
  })
})

describe('detectDrift', () => {
  const base: HardwareFingerprint = {
    cpuModel: 'Intel Xeon',
    cpuCores: 8,
    memoryMb: 16384,
    gpus: [{ name: 'NVIDIA A100', vendor: 'NVIDIA', pciId: '10de:20b0' }],
    diskGb: 512,
    osRelease: 'Arch Linux',
    macs: ['aa:bb:cc:dd:ee:01', 'aa:bb:cc:dd:ee:02'],
    collectedAt: '2026-09-09T00:00:00.000Z',
  }

  it('reports no drift for identical fingerprints', () => {
    expect(detectDrift(base, { ...base })).toEqual([])
  })

  it('reports cpu/cores/memory/gpu/disk/os/macs changes', () => {
    const changed: HardwareFingerprint = {
      ...base,
      cpuModel: 'AMD EPYC',
      cpuCores: 16,
      memoryMb: 32768,
      gpus: [{ name: 'AMD MI250', vendor: 'AMD', pciId: '1002:740f' }],
      diskGb: 1024,
      osRelease: 'Ubuntu 24.04',
      macs: ['aa:bb:cc:dd:ee:03'],
    }
    const drifts = detectDrift(base, changed)
    expect(drifts).toContain('cpu: Intel Xeon → AMD EPYC')
    expect(drifts).toContain('cores: 8 → 16')
    expect(drifts).toContain('memory: 16384MB → 32768MB')
    expect(drifts).toContain('gpu changed')
    expect(drifts).toContain('disk: 512GB → 1024GB')
    expect(drifts).toContain('os: Arch Linux → Ubuntu 24.04')
    expect(drifts).toContain('macs changed')
  })

  it('is order-insensitive for MAC comparison', () => {
    const reordered: HardwareFingerprint = {
      ...base,
      macs: ['aa:bb:cc:dd:ee:02', 'aa:bb:cc:dd:ee:01'],
    }
    expect(detectDrift(base, reordered)).toEqual([])
  })
})
