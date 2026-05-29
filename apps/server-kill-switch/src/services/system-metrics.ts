/**
 * Real System Metrics Collector
 *
 * Collects live system telemetry from the host machine:
 *   - CPU: delta-based sampling (two-sample: computes % across 5s interval)
 *   - Memory: cgroup v2/v1 aware, falls back to /proc/meminfo → os module
 *   - GPU: nvidia-smi → /sys/bus/pci/devices VGA detection → graceful fallback
 *   - Disk: df -h /host-root (host mount) → df -h / (container)
 *   - CPU Model: /proc/cpuinfo model name → os.cpus()[0].model
 *   - Load avg & uptime: os.loadavg() / os.uptime()
 *
 * Periodic broadcast via Redis pubsub → WebSocketManager → frontend.
 * Audit entries are written to SQLite and published on bcp:machines:events.
 *
 * ADR-134: Accurate System Metrics & Journal Log Streaming.
 */

import { cpus, totalmem, freemem, loadavg, uptime } from 'node:os';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { db } from '../db/index';
import { machines, killSwitchAuditLog } from '../db/schema';

// ─── Types ────────────────────────────────────────────────────────

export interface MachineMetrics {
  cpuUsage: number;     // percentage (0-100)
  memoryUsage: number;  // percentage (0-100)
  gpuUsage: number;     // percentage (0-100), 0 if no GPU
  gpuModel: string;     // model name or "N/A"
  dpuStatus: string;    // "inactive" (no DPU hardware)
  loadAvg: number;      // 1-minute load average
  uptime: number;       // system uptime in seconds
  diskUsage: number;    // root disk usage percentage (0-100)
  timestamp: number;    // unix millis at collection time
}

// ─── Helpers ─────────────────────────────────────────────────────

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    return null;
  }
}

function readFileNumber(path: string): number | null {
  const val = readFileSafe(path);
  if (val === null) return null;
  const num = parseInt(val, 10);
  return Number.isFinite(num) ? num : null;
}

function readMeminfoValue(meminfoPath: string, key: string): number | null {
  try {
    const content = readFileSync(meminfoPath, 'utf-8');
    const match = content.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function readCpuModel(cpuinfoPath: string): string | null {
  try {
    const content = readFileSync(cpuinfoPath, 'utf-8');
    const match = content.match(/^model name\\s*:\\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// ─── Real Metrics Collection ─────────────────────────────────────

/** Module-level state for delta-based CPU calculation */
let _prevCpuTicks: { idle: number; total: number }[] | null = null;

function collectCpuUsage(): number {
  const cores = cpus();
  if (cores.length === 0) return 0;

  if (!_prevCpuTicks) {
    // First call: store baseline, return 0
    _prevCpuTicks = cores.map((c) => {
      const total = Object.values(c.times).reduce((a, b) => a + b, 0);
      return { idle: c.times.idle, total };
    });
    return 0;
  }

  let totalDelta = 0;
  let idleDelta = 0;
  for (let i = 0; i < cores.length; i++) {
    const total = Object.values(cores[i].times).reduce((a, b) => a + b, 0);
    const idle = cores[i].times.idle;
    totalDelta += total - _prevCpuTicks[i].total;
    idleDelta += idle - _prevCpuTicks[i].idle;
  }

  // Store current sample for next call
  _prevCpuTicks = cores.map((c) => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: c.times.idle, total };
  });

  if (totalDelta === 0) return 0;
  return ((totalDelta - idleDelta) / totalDelta) * 100;
}

function collectMemoryUsage(): { usage: number; usedMb: number; totalMb: number } {
  // Try cgroup v2 first (container's own cgroup — no mount needed)
  const cgroupMax = readFileNumber('/sys/fs/cgroup/memory.max');
  const cgroupCurrent = readFileNumber('/sys/fs/cgroup/memory.current');
  if (cgroupMax && cgroupCurrent) {
    return {
      usage: (cgroupCurrent / cgroupMax) * 100,
      totalMb: Math.round(cgroupMax / 1024 / 1024),
      usedMb: Math.round(cgroupCurrent / 1024 / 1024),
    };
  }

  // cgroup v1 fallback
  const cgroupV1Limit = readFileNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const cgroupV1Usage = readFileNumber('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  if (cgroupV1Limit && cgroupV1Limit < Number.MAX_SAFE_INTEGER) {
    return {
      usage: (cgroupV1Usage! / cgroupV1Limit) * 100,
      totalMb: Math.round(cgroupV1Limit / 1024 / 1024),
      usedMb: Math.round(cgroupV1Usage! / 1024 / 1024),
    };
  }

  // Fallback: host /proc/meminfo (requires /host/proc mount via docker)
  const memTotal = readMeminfoValue('/host/proc/meminfo', 'MemTotal');
  const memAvailable = readMeminfoValue('/host/proc/meminfo', 'MemAvailable');
  if (memTotal && memAvailable) {
    return {
      usage: ((memTotal - memAvailable) / memTotal) * 100,
      totalMb: Math.round(memTotal / 1024),
      usedMb: Math.round((memTotal - memAvailable) / 1024),
    };
  }

  // Last resort: os module (returns host values, bypasses cgroups)
  const total = totalmem();
  const free = freemem();
  return {
    usage: ((total - free) / total) * 100,
    totalMb: Math.round(total / 1024 / 1024),
    usedMb: Math.round((total - free) / 1024 / 1024),
  };
}

interface GpuInfo {
  usage: number;
  name: string;
}

function collectGpuInfo(): GpuInfo {
  // Try nvidia-smi first
  try {
    const proc = Bun.spawnSync(
      ['nvidia-smi', '--query-gpu=utilization.gpu,name', '--format=csv,noheader,nounits'],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    if (proc.exitCode === 0 && proc.stdout) {
      const out = proc.stdout.toString().trim();
      if (out) {
        const [usageStr, nameStr] = out.split(',').map((s) => s.trim());
        return {
          usage: parseInt(usageStr, 10) || 0,
          name: nameStr || 'NVIDIA GPU',
        };
      }
    }
  } catch { /* nvidia-smi not available */ }

  // Fallback: read /sys/bus/pci/devices for VGA controllers (0x030000)
  try {
    const pciDevicesPath = '/sys/bus/pci/devices';
    if (existsSync(pciDevicesPath)) {
      const devices = readdirSync(pciDevicesPath);
      for (const dev of devices) {
        try {
          const classHex = readFileSafe(`${pciDevicesPath}/${dev}/class`);
          if (classHex && classHex.startsWith('0x030000')) {
            const vendor = readFileSafe(`${pciDevicesPath}/${dev}/vendor`) || '';
            const device = readFileSafe(`${pciDevicesPath}/${dev}/device`) || '';
            // Try to resolve vendor name from the vendor file
            let name = 'Unknown GPU';
            const vendorLower = vendor.toLowerCase();
            if (vendorLower.includes('0x8086')) name = 'Intel iGPU';
            else if (vendorLower.includes('0x10de')) name = 'NVIDIA GPU';
            else if (vendorLower.includes('0x1002')) name = 'AMD GPU';
            else name = `VGA ${vendor}/${device}`;
            // Can't get usage from sysfs — return 0 (no real-time GPU monitoring for iGPU)
            return { usage: 0, name };
          }
        } catch { /* ignore individual device read errors */ }
      }
    }
  } catch { /* pci devices not accessible */ }

  return { usage: 0, name: 'No GPU detected' };
}

function collectDiskUsage(): number {
  // Try host-root mount first (docker volume mount of /)
  try {
    const proc = Bun.spawnSync(['df', '-h', '/host-root'], { stdout: 'pipe' });
    if (proc.exitCode === 0 && proc.stdout) {
      const lines = proc.stdout.toString().trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        return parseInt(parts[4], 10) || 0; // Use% column
      }
    }
  } catch { /* ignore */ }

  // Fallback: container's own /
  try {
    const proc = Bun.spawnSync(['df', '-h', '/'], { stdout: 'pipe' });
    if (proc.exitCode === 0 && proc.stdout) {
      const lines = proc.stdout.toString().trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        return parseInt(parts[4], 10) || 0;
      }
    }
  } catch { /* ignore */ }

  return 0;
}

function collectCpuModel(): string {
  // Try host /proc/cpuinfo (requires /host/proc mount)
  const model = readCpuModel('/host/proc/cpuinfo');
  if (model) return model;

  // Fallback: container's own /proc/cpuinfo
  const containerModel = readCpuModel('/proc/cpuinfo');
  if (containerModel) return containerModel;

  // Last resort: os.cpus()
  const cpuList = cpus();
  if (cpuList.length > 0 && cpuList[0].model) return cpuList[0].model;

  return 'Unknown CPU';
}

/**
 * Collect real system metrics from the host machine.
 * Uses delta-based CPU sampling, cgroup-aware memory, and graceful GPU fallback.
 * Sync function — suitable for frequent calls (5s interval).
 */
export function collectRealMetrics(): MachineMetrics {
  const cpuUsage = collectCpuUsage();
  const mem = collectMemoryUsage();
  const gpu = collectGpuInfo();
  const [load1] = loadavg();
  const sysUptime = uptime();
  const disk = collectDiskUsage();
  const cpuModel = collectCpuModel();

  return {
    cpuUsage: Math.round(cpuUsage * 100) / 100,
    memoryUsage: Math.round(mem.usage * 100) / 100,
    gpuUsage: gpu.usage,
    gpuModel: gpu.name,
    dpuStatus: 'inactive',
    loadAvg: Math.round(load1 * 100) / 100,
    uptime: sysUptime,
    diskUsage: disk,
    timestamp: Date.now(),
  };
}

// ─── Cached Access ───────────────────────────────────────────────

let _lastMetrics: MachineMetrics | null = null;

/** Async alias — same as collectRealMetrics, for API route compatibility. */
export async function collectSystemMetrics(): Promise<MachineMetrics> {
  const metrics = collectRealMetrics();
  _lastMetrics = metrics;
  return metrics;
}

export function getLastMetrics(): MachineMetrics | null {
  return _lastMetrics;
}

/**
 * Synchronous access to most recent metrics.
 * Keeps the same function name so serializeMachine() doesn't break.
 */
export function getMachineMetrics(_machineId: string): {
  cpuUsage: number; memoryUsage: number; gpuUsage: number; dpuStatus: string;
} {
  const m = _lastMetrics ?? collectRealMetrics();
  return {
    cpuUsage: m.cpuUsage,
    memoryUsage: m.memoryUsage,
    gpuUsage: m.gpuUsage,
    dpuStatus: m.dpuStatus,
  };
}

// ─── Audit Entry Generation & Broadcast ──────────────────────────

const SEVERITIES = ['info', 'warning', 'critical'] as const;
const STATES = ['ARMED', 'RUNNING', 'STOPPING', 'STOPPED', 'LOCKED'] as const;
const REASONS = [
  'Scheduled inference check',
  'DPU attestation verified',
  'Redline threshold exceeded',
  'Model drift detected',
  'Resource usage spike',
  'Compliance audit',
  'Policy enforcement triggered',
  'Heartbeat timeout recovery',
];

export interface MockAuditEntry {
  userId: string;
  reason: string;
  previousState: string;
  newState: string;
  traceId: string;
  severity: string;
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  }
  return (h >>> 0) / 0xffffffff;
}

export function generateMockAuditEntry(machineId: string): MockAuditEntry {
  const tick = Date.now();
  const sevHash = hashString(`${machineId}_sev_${tick}`);
  const stHash = hashString(`${machineId}_st_${tick}`);
  const prevStHash = hashString(`${machineId}_ps_${tick}`);
  const reasonHash = hashString(`${machineId}_r_${tick}`);

  const severity = SEVERITIES[Math.floor(sevHash * SEVERITIES.length)];
  const isViolation =
    severity === 'critical' || (severity === 'warning' && hashString(`${machineId}_viol_${tick}`) > 0.4);

  const newState = isViolation
    ? 'STOPPING'
    : STATES[Math.floor(stHash * 3)];
  const prevState = isViolation
    ? 'RUNNING'
    : STATES[Math.floor(prevStHash * 2)];

  return {
    userId: 'system-metrics',
    reason: REASONS[Math.floor(reasonHash * REASONS.length)],
    previousState: prevState,
    newState,
    traceId: `trace-${tick.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    severity,
  };
}

// ─── Periodic Metrics + Audit Generation ─────────────────────────

let _interval: ReturnType<typeof setInterval> | null = null;
let _publish: ((channel: string, msg: string) => Promise<void>) | null = null;
let _running = false;

export interface MetricCollectionOpts {
  intervalMs?: number;
  publish?: (channel: string, msg: string) => Promise<void>;
}

/**
 * Start periodic metrics collection + audit log generation.
 *
 * Every intervalMs (default 5s):
 *   1. Collects real system metrics via collectRealMetrics()
 *   2. Queries registered machines from SQLite
 *   3. For each machine: generates audit entry + inserts into kill_switch_audit_log
 *   4. Publishes machine-metrics + audit-entry events via Redis pubsub
 *      → WebSocketManager → frontend use-kill-switch-websocket handler
 */
export function startMetricGeneration(opts: MetricCollectionOpts = {}): void {
  if (_interval) return;

  _publish = opts.publish || null;
  const intervalMs = opts.intervalMs ?? 5000;

  console.log(`[metrics] Real system metrics collection every ${intervalMs}ms`);

  // Seed initial metrics on startup
  collectRealMetrics();

  _interval = setInterval(async () => {
    if (_running) return;
    _running = true;

    try {
      const metrics = collectRealMetrics();

      // Broadcast real-time metrics
      if (_publish) {
        try {
          await _publish('bcp:machines:metrics', JSON.stringify({
            type: 'machine-metrics',
            payload: metrics,
          }));
        } catch { /* Redis unavailable */ }
      }

      // Generate audit entries for registered machines
      const allMachines = await db
        .select({ id: machines.id, name: machines.name })
        .from(machines)
        .all();

      for (const machine of allMachines) {
        const entry = generateMockAuditEntry(machine.id);
        const now = new Date();

        await db.insert(killSwitchAuditLog).values({
          id: crypto.randomUUID(),
          timestamp: now,
          userId: entry.userId,
          reason: entry.reason,
          previousState: entry.previousState,
          newState: entry.newState,
          traceId: entry.traceId,
          machineId: machine.id,
          severity: entry.severity,
          metadata: JSON.stringify(metrics),
        });

        if (_publish) {
          try {
            await _publish('bcp:machines:events', JSON.stringify({
              type: 'audit-entry',
              payload: {
                id: machine.id,
                timestamp: now.toISOString(),
                user: entry.userId,
                reason: entry.reason,
                previousState: entry.previousState,
                newState: entry.newState,
                traceId: entry.traceId,
                machineId: machine.id,
                severity: entry.severity,
                machineName: machine.name,
              },
            }));
          } catch { /* Redis unavailable */ }
        }
      }
    } catch (err: any) {
      console.error('[metrics] Collection error:', err.message);
    } finally {
      _running = false;
    }
  }, intervalMs);
}

export function stopMetricGeneration(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
    _publish = null;
    console.log('[metrics] Collection stopped');
  }
}
