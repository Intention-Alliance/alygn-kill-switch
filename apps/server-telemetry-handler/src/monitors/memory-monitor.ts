/**
 * Memory Monitor
 *
 * Collects system memory metrics: total RAM, used RAM, swap usage.
 * Uses Node's `os` module for cross-platform compatibility.
 *
 * Metrics collected:
 *  - total_bytes: total system RAM in bytes
 *  - used_bytes: used RAM (total - free) in bytes
 *  - free_bytes: available RAM in bytes
 *  - usage_percent: RAM usage as percentage
 *  - swap_total_bytes: total swap space
 *  - swap_used_bytes: used swap space
 *  - swap_usage_percent: swap usage as percentage
 */

import { totalmem, freemem } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import type { HardwareMonitor } from './interface';
import type { HardwareMetric } from '../types';

/**
 * Memory Monitor — tracks RAM and swap usage.
 */
export class MemoryMonitor implements HardwareMonitor {
  public readonly name = 'memory';

  public async collect(): Promise<HardwareMetric[]> {
    const metrics: HardwareMetric[] = [];

    const totalBytes = totalmem();
    const freeBytes = freemem();
    const usedBytes = totalBytes - freeBytes;
    const usagePercent = totalBytes > 0
      ? Math.round((usedBytes / totalBytes) * 100 * 100) / 100
      : 0;

    metrics.push({
      monitorName: this.name,
      metricName: 'total_bytes',
      metricValue: totalBytes,
      unit: 'bytes',
    });

    metrics.push({
      monitorName: this.name,
      metricName: 'used_bytes',
      metricValue: usedBytes,
      unit: 'bytes',
    });

    metrics.push({
      monitorName: this.name,
      metricName: 'free_bytes',
      metricValue: freeBytes,
      unit: 'bytes',
    });

    metrics.push({
      monitorName: this.name,
      metricName: 'usage_percent',
      metricValue: usagePercent,
      unit: 'percent',
    });

    // ─── Swap (Linux /proc/meminfo, best-effort) ───────────────────
    const swapMetrics = this.readSwapMetrics();
    metrics.push(...swapMetrics);

    return metrics;
  }

  /**
   * Read swap metrics from /proc/meminfo on Linux.
   * Gracefully returns empty array on non-Linux or permission issues.
   */
  private readSwapMetrics(): HardwareMetric[] {
    try {
      const meminfoPath = '/proc/meminfo';

      if (!existsSync(meminfoPath)) {
        return [];
      }

      const content = readFileSync(meminfoPath, 'utf-8');
      const lines = content.split('\n');

      // Parse /proc/meminfo format: "SwapTotal:      123456 kB"
      let swapTotalKb = 0;
      let swapFreeKb = 0;

      for (const line of lines) {
        if (line.startsWith('SwapTotal:')) {
          swapTotalKb = parseInt(line.split(':')[1]?.trim() || '0', 10);
        }
        if (line.startsWith('SwapFree:')) {
          swapFreeKb = parseInt(line.split(':')[1]?.trim() || '0', 10);
        }
      }

      if (swapTotalKb === 0) {
        return [];
      }

      const swapTotalBytes = swapTotalKb * 1024;
      const swapFreeBytes = swapFreeKb * 1024;
      const swapUsedBytes = swapTotalBytes - swapFreeBytes;
      const swapUsagePercent = swapTotalBytes > 0
        ? Math.round((swapUsedBytes / swapTotalBytes) * 100 * 100) / 100
        : 0;

      return [
        {
          monitorName: this.name,
          metricName: 'swap_total_bytes',
          metricValue: swapTotalBytes,
          unit: 'bytes',
        },
        {
          monitorName: this.name,
          metricName: 'swap_used_bytes',
          metricValue: swapUsedBytes,
          unit: 'bytes',
        },
        {
          monitorName: this.name,
          metricName: 'swap_usage_percent',
          metricValue: swapUsagePercent,
          unit: 'percent',
        },
      ];
    } catch {
      return [];
    }
  }
}
