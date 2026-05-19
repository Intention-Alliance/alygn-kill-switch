/**
 * Disk Monitor
 *
 * Collects disk I/O and usage metrics for all mounted filesystems.
 * Uses Bun's native file operations and /proc/diskstats on Linux.
 *
 * Metrics collected:
 *  - total_bytes: filesystem total size
 *  - used_bytes: filesystem used space
 *  - free_bytes: filesystem available space
 *  - usage_percent: disk usage percentage
 *  - reads_completed: cumulative read operations (from /proc/diskstats)
 *  - writes_completed: cumulative write operations (from /proc/diskstats)
 */

import { statfsSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HardwareMonitor } from './interface';
import type { HardwareMetric } from '../types';

/** Directories to skip when enumerating block devices */
const SKIP_PARTITIONS = new Set(['.', '..']);

/**
 * Disk Monitor — collects filesystem usage and I/O statistics.
 */
export class DiskMonitor implements HardwareMonitor {
  public readonly name = 'disk';

  public async collect(): Promise<HardwareMetric[]> {
    const metrics: HardwareMetric[] = [];

    // ─── Filesystem Usage (via statfs on key mount points) ────────
    const mountPoints = this.getMountPoints();
    for (const mountPoint of mountPoints) {
      try {
        const fsStats = statfsSync(mountPoint);
        const blockSize = (fsStats as unknown as Record<string, number>).bsize || 4096;
        const totalBlocks = (fsStats as unknown as Record<string, number>).blocks || 0;
        const availableBlocks = (fsStats as unknown as Record<string, number>).bavail
          || (fsStats as unknown as Record<string, number>).bfree
          || 0;

        const totalBytes = totalBlocks * blockSize;
        const availableBytes = availableBlocks * blockSize;
        const usedBytes = totalBytes - availableBytes;
        const usagePercent = totalBytes > 0
          ? Math.round((usedBytes / totalBytes) * 100 * 100) / 100
          : 0;

        const deviceLabel: Record<string, string> = { mount_point: mountPoint };

        metrics.push({
          monitorName: this.name,
          metricName: 'total_bytes',
          metricValue: totalBytes,
          unit: 'bytes',
          labels: deviceLabel,
        });

        metrics.push({
          monitorName: this.name,
          metricName: 'used_bytes',
          metricValue: usedBytes,
          unit: 'bytes',
          labels: deviceLabel,
        });

        metrics.push({
          monitorName: this.name,
          metricName: 'free_bytes',
          metricValue: availableBytes,
          unit: 'bytes',
          labels: deviceLabel,
        });

        metrics.push({
          monitorName: this.name,
          metricName: 'usage_percent',
          metricValue: usagePercent,
          unit: 'percent',
          labels: deviceLabel,
        });
      } catch (error: unknown) {
        console.warn(
          `[disk-monitor] Failed to stat mount point ${mountPoint}:`,
          (error as Error).message,
        );
      }
    }

    // ─── Disk I/O Stats (Linux /proc/diskstats) ────────────────────
    const ioMetrics = this.readDiskIOStats();
    metrics.push(...ioMetrics);

    return metrics;
  }

  /**
   * Get a list of filesystem mount points to monitor.
   * On Linux, reads /proc/mounts; falls back to root.
   */
  private getMountPoints(): string[] {
    try {
      if (!existsSync('/proc/mounts')) {
        return ['/'];
      }

      const mountsContent = readFileSync('/proc/mounts', 'utf-8');
      const lines = mountsContent.split('\n').filter((line) => line.trim().length > 0);

      const mountPoints: string[] = [];
      for (const line of lines) {
        const parts = line.split(' ');
        if (parts.length >= 2) {
          const mountPoint = parts[1];
          // Only include real filesystems (skip pseudo-fs)
          const filesystemType = parts[2] || '';
          if (
            !filesystemType.startsWith('tmpfs')
            && !filesystemType.startsWith('devtmpfs')
            && !filesystemType.startsWith('sysfs')
            && !filesystemType.startsWith('proc')
            && !filesystemType.startsWith('cgroup')
            && !filesystemType.startsWith('debugfs')
            && !filesystemType.startsWith('tracefs')
            && !filesystemType.startsWith('securityfs')
            && !filesystemType.startsWith('pstore')
            && !filesystemType.startsWith('efivarfs')
            && !filesystemType.startsWith('bpf')
            && !filesystemType.startsWith('hugetlbfs')
            && !filesystemType.startsWith('mqueue')
            && !filesystemType.startsWith('configfs')
            && !filesystemType.startsWith('fusectl')
          ) {
            mountPoints.push(mountPoint);
          }
        }
      }

      return mountPoints.length > 0 ? mountPoints : ['/'];
    } catch {
      return ['/'];
    }
  }

  /**
   * Read disk I/O stats from /proc/diskstats on Linux.
   * Returns cumulative read/write counts per block device.
   */
  private readDiskIOStats(): HardwareMetric[] {
    const diskstatsPath = '/proc/diskstats';
    if (!existsSync(diskstatsPath)) {
      return [];
    }

    const metrics: HardwareMetric[] = [];

    try {
      const content = readFileSync(diskstatsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim().length > 0);

      for (const line of lines) {
        const fields = line.trim().split(/\s+/);
        // /proc/diskstats format: major minor name reads ... writes ...
        if (fields.length < 8) {
          continue;
        }

        const deviceName = fields[2];
        // Skip partitions (names ending in digits), focus on whole disks
        if (/^\d+$/.test(deviceName) || /\d$/.test(deviceName)) {
          continue;
        }

        const readsCompleted = parseInt(fields[3], 10);
        const writesCompleted = parseInt(fields[7], 10);

        if (!isNaN(readsCompleted)) {
          metrics.push({
            monitorName: this.name,
            metricName: 'reads_completed',
            metricValue: readsCompleted,
            unit: 'count',
            labels: { device: deviceName },
          });
        }

        if (!isNaN(writesCompleted)) {
          metrics.push({
            monitorName: this.name,
            metricName: 'writes_completed',
            metricValue: writesCompleted,
            unit: 'count',
            labels: { device: deviceName },
          });
        }
      }
    } catch (error: unknown) {
      console.warn('[disk-monitor] Failed to read /proc/diskstats:', (error as Error).message);
    }

    return metrics;
  }
}
