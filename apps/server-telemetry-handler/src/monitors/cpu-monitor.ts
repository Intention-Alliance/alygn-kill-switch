/**
 * CPU Monitor
 *
 * Collects CPU hardware metrics using Node's `os` module and Linux /sys/class/thermal.
 *
 * Metrics collected:
 *  - model: CPU model name string
 *  - core_count: number of logical cores
 *  - speed_mhz: current clock speed per core (array of MHz values)
 *  - usage_percent: load average as percentage (1min load / core count * 100)
 *  - temperature_celsius: average thermal zone temperature (Linux only)
 *
 * Platform: Linux primary, graceful fallback on others.
 */

import { cpus, loadavg } from 'node:os';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HardwareMonitor } from './interface';
import type { HardwareMetric } from '../types';

/** Base path for thermal zone sensors on Linux */
const THERMAL_ZONE_BASE_PATH = '/sys/class/thermal';

/**
 * CPU Monitor — reads CPU model, cores, load, and temperature.
 */
export class CpuMonitor implements HardwareMonitor {
  public readonly name = 'cpu';

  /**
   * Collect CPU metrics.
   * Temperature reading is Linux-only via sysfs thermal zones.
   */
  public async collect(): Promise<HardwareMetric[]> {
    const metrics: HardwareMetric[] = [];
    const cpuInfo = cpus();

    // ─── Model & Core Count ────────────────────────────────────────
    const cpuModel = cpuInfo[0]?.model || 'unknown';
    const coreCount = cpuInfo.length;

    metrics.push({
      monitorName: this.name,
      metricName: 'model',
      metricValue: 0,
      unit: 'string',
      labels: { model: cpuModel, core_count: String(coreCount) },
    });

    metrics.push({
      monitorName: this.name,
      metricName: 'core_count',
      metricValue: coreCount,
      unit: 'count',
    });

    // ─── Per-Core Speed ────────────────────────────────────────────
    for (let coreIndex = 0; coreIndex < cpuInfo.length; coreIndex++) {
      const core = cpuInfo[coreIndex];
      metrics.push({
        monitorName: this.name,
        metricName: 'speed_mhz',
        metricValue: core.speed,
        unit: 'mhz',
        labels: { core: String(coreIndex) },
      });
    }

    // ─── Load Average ──────────────────────────────────────────────
    const [loadAvg1min] = loadavg();
    const loadPercent = coreCount > 0
      ? Math.round((loadAvg1min / coreCount) * 100 * 100) / 100
      : 0;

    metrics.push({
      monitorName: this.name,
      metricName: 'usage_percent',
      metricValue: loadPercent,
      unit: 'percent',
    });

    // ─── Temperature (Linux sysfs) ─────────────────────────────────
    try {
      const temperatureCelsius = this.readCpuTemperature();
      if (temperatureCelsius !== null) {
        metrics.push({
          monitorName: this.name,
          metricName: 'temperature',
          metricValue: temperatureCelsius,
          unit: 'celsius',
        });
      }
    } catch (error: unknown) {
      // Temperature reading is best-effort; non-Linux or permission issues are fine
      console.warn('[cpu-monitor] Failed to read CPU temperature:', (error as Error).message);
    }

    return metrics;
  }

  /**
   * Read CPU temperature from Linux sysfs thermal zones.
   * Returns average temperature across all thermal_zone entries of type 'x86_pkg_temp'
   * or generic thermal zones if no CPU-specific zone is found.
   *
   * @returns Temperature in Celsius, or null if sysfs is unavailable.
   */
  private readCpuTemperature(): number | null {
    if (!existsSync(THERMAL_ZONE_BASE_PATH)) {
      return null;
    }

    const thermalZones: string[] = [];
    try {
      const zoneEntries = readdirSync(THERMAL_ZONE_BASE_PATH);
      for (const entry of zoneEntries) {
        if (entry.startsWith('thermal_zone')) {
          thermalZones.push(entry);
        }
      }
    } catch {
      return null;
    }

    if (thermalZones.length === 0) {
      return null;
    }

    const temperatures: number[] = [];

    for (const zone of thermalZones) {
      try {
        const typePath = join(THERMAL_ZONE_BASE_PATH, zone, 'type');
        const tempPath = join(THERMAL_ZONE_BASE_PATH, zone, 'temp');

        if (existsSync(typePath) && existsSync(tempPath)) {
          const zoneType = readFileSync(typePath, 'utf-8').trim();
          const tempMilliC = parseInt(readFileSync(tempPath, 'utf-8').trim(), 10);

          if (!isNaN(tempMilliC)) {
            // Prefer x86_pkg_temp or acpitz (CPU-specific zones)
            if (zoneType === 'x86_pkg_temp' || zoneType === 'acpitz') {
              temperatures.push(tempMilliC / 1000);
            }
          }
        }
      } catch {
        // Skip inaccessible thermal zones
      }
    }

    if (temperatures.length === 0) {
      return null;
    }

    // Return average temperature across CPU zones
    const sum = temperatures.reduce((acc, t) => acc + t, 0);
    return Math.round((sum / temperatures.length) * 100) / 100;
  }
}
