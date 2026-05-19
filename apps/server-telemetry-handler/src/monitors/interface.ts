/**
 * Hardware Monitor Interface
 *
 * Abstract contract that all hardware monitors must implement.
 * Each monitor collects metrics for a specific hardware category (CPU, GPU, memory, etc.)
 * and returns them as an array of standardized HardwareMetric objects.
 *
 * Pattern: SDK wrapper — monitor implementations wrap OS/hardware SDKs,
 * never exposing implementation details to callers.
 */

import type { HardwareMetric } from '../types';

/**
 * HardwareMonitor — the abstract contract for all hardware data collectors.
 *
 * Each implementation handles one hardware domain:
 *  - CpuMonitor: CPU model, cores, usage, temperature
 *  - GpuMonitor: GPU via nvidia-smi
 *  - MemoryMonitor: RAM and swap
 *  - DiskMonitor: mount points, usage, IOPS
 *  - DpuMonitor: DPU stub for future hardware
 *  - NetworkMonitor: interfaces, throughput
 */
export interface HardwareMonitor {
  /** Unique identifier for this monitor (e.g., 'cpu', 'gpu', 'memory') */
  readonly name: string;

  /**
   * Collect current hardware metrics.
   *
   * @returns Array of metrics — may be empty if hardware is unavailable.
   *          Must NEVER throw. On failure, log a warning and return [].
   */
  collect(): Promise<HardwareMetric[]>;
}
