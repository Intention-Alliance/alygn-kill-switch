// System Resource Monitor — CPU, Memory, Disk tracking with alert thresholds
// Provides real-time resource stats and threshold-based alerting

import { readdirSync, statfsSync } from 'fs';
import { join } from 'path';

export interface ResourceStats {
  cpu: {
    userMicros: number;
    systemMicros: number;
    usagePercent: number;
  };
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
    usagePercent: number;
    totalSystemBytes: number;
  };
  disk: {
    availableBytes: number;
    totalBytes: number;
    usagePercent: number;
  };
  timestamp: string;
}

export interface ResourceAlert {
  type: 'cpu' | 'memory' | 'disk';
  level: 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
}

// Thresholds (configurable via env)
const CPU_WARNING_THRESHOLD = parseFloat(process.env.RESOURCE_CPU_WARNING || '70');
const CPU_CRITICAL_THRESHOLD = parseFloat(process.env.RESOURCE_CPU_CRITICAL || '90');
const MEMORY_WARNING_THRESHOLD = parseFloat(process.env.RESOURCE_MEMORY_WARNING || '80');
const MEMORY_CRITICAL_THRESHOLD = parseFloat(process.env.RESOURCE_MEMORY_CRITICAL || '90');
const DISK_WARNING_THRESHOLD = parseFloat(process.env.RESOURCE_DISK_WARNING || '85');
const DISK_CRITICAL_THRESHOLD = parseFloat(process.env.RESOURCE_DISK_CRITICAL || '95');

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

/**
 * Get current resource stats.
 */
export function getResourceStats(): ResourceStats {
  // CPU — calculate % since last check
  const currentCpu = process.cpuUsage();
  const now = Date.now();
  const elapsedMicros = (now - lastCpuTime) * 1000; // wall time in microseconds
  const userDelta = currentCpu.user - lastCpuUsage.user;
  const systemDelta = currentCpu.system - lastCpuUsage.system;
  const totalCpuMicros = userDelta + systemDelta;
  const cpuPercent = elapsedMicros > 0 ? Math.round((totalCpuMicros / elapsedMicros) * 10000) / 100 : 0;

  // Update for next calculation
  lastCpuUsage = currentCpu;
  lastCpuTime = now;

  // Memory
  const mem = process.memoryUsage();
  const totalSystemMem = require('os').totalmem();
  const memoryPercent = totalSystemMem > 0
    ? Math.round((mem.rss / totalSystemMem) * 10000) / 100
    : 0;

  // Disk
  let diskStats = { availableBytes: 0, totalBytes: 0, usagePercent: 0 };
  try {
    const workDir = process.cwd();
    const fsStats = statfsSync(workDir);
    const blockSize = (fsStats as any).bsize || 4096;
    const availableBlocks = (fsStats as any).bavail || (fsStats as any).blocks || 0;
    const totalBlocks = (fsStats as any).blocks || 0;
    const availableBytes = availableBlocks * blockSize;
    const totalBytes = totalBlocks * blockSize;
    const usagePercent = totalBytes > 0
      ? Math.round(((totalBytes - availableBytes) / totalBytes) * 10000) / 100
      : 0;
    diskStats = { availableBytes, totalBytes, usagePercent };
  } catch {
    // statfsSync may not be available on all platforms
  }

  return {
    cpu: {
      userMicros: currentCpu.user,
      systemMicros: currentCpu.system,
      usagePercent: cpuPercent,
    },
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      externalBytes: mem.external,
      usagePercent: memoryPercent,
      totalSystemBytes: totalSystemMem,
    },
    disk: diskStats,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check resource thresholds and return alerts.
 */
export function checkResourceAlerts(stats: ResourceStats): ResourceAlert[] {
  const alerts: ResourceAlert[] = [];

  // CPU alerts
  if (stats.cpu.usagePercent >= CPU_CRITICAL_THRESHOLD) {
    alerts.push({
      type: 'cpu',
      level: 'critical',
      value: stats.cpu.usagePercent,
      threshold: CPU_CRITICAL_THRESHOLD,
      message: `CPU usage critical: ${stats.cpu.usagePercent}% (threshold: ${CPU_CRITICAL_THRESHOLD}%)`,
    });
  } else if (stats.cpu.usagePercent >= CPU_WARNING_THRESHOLD) {
    alerts.push({
      type: 'cpu',
      level: 'warning',
      value: stats.cpu.usagePercent,
      threshold: CPU_WARNING_THRESHOLD,
      message: `CPU usage warning: ${stats.cpu.usagePercent}% (threshold: ${CPU_WARNING_THRESHOLD}%)`,
    });
  }

  // Memory alerts
  if (stats.memory.usagePercent >= MEMORY_CRITICAL_THRESHOLD) {
    alerts.push({
      type: 'memory',
      level: 'critical',
      value: stats.memory.usagePercent,
      threshold: MEMORY_CRITICAL_THRESHOLD,
      message: `Memory usage critical: ${stats.memory.usagePercent}% (threshold: ${MEMORY_CRITICAL_THRESHOLD}%)`,
    });
  } else if (stats.memory.usagePercent >= MEMORY_WARNING_THRESHOLD) {
    alerts.push({
      type: 'memory',
      level: 'warning',
      value: stats.memory.usagePercent,
      threshold: MEMORY_WARNING_THRESHOLD,
      message: `Memory usage warning: ${stats.memory.usagePercent}% (threshold: ${MEMORY_WARNING_THRESHOLD}%)`,
    });
  }

  // Disk alerts
  if (stats.disk.usagePercent >= DISK_CRITICAL_THRESHOLD) {
    alerts.push({
      type: 'disk',
      level: 'critical',
      value: stats.disk.usagePercent,
      threshold: DISK_CRITICAL_THRESHOLD,
      message: `Disk usage critical: ${stats.disk.usagePercent}% (threshold: ${DISK_CRITICAL_THRESHOLD}%)`,
    });
  } else if (stats.disk.usagePercent >= DISK_WARNING_THRESHOLD) {
    alerts.push({
      type: 'disk',
      level: 'warning',
      value: stats.disk.usagePercent,
      threshold: DISK_WARNING_THRESHOLD,
      message: `Disk usage warning: ${stats.disk.usagePercent}% (threshold: ${DISK_WARNING_THRESHOLD}%)`,
    });
  }

  return alerts;
}

/**
 * Check if system is under memory pressure (for request rejection).
 * Returns true if memory usage exceeds critical threshold.
 */
export function isMemoryCritical(): boolean {
  const stats = getResourceStats();
  return stats.memory.usagePercent >= MEMORY_CRITICAL_THRESHOLD;
}

/**
 * Check if system is under memory warning.
 */
export function isMemoryWarning(): boolean {
  const stats = getResourceStats();
  return stats.memory.usagePercent >= MEMORY_WARNING_THRESHOLD;
}