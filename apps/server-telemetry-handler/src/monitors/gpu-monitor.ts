/**
 * GPU Monitor
 *
 * Collects GPU hardware metrics via nvidia-smi CLI.
 * Gracefully falls back when no GPU or nvidia-smi is available.
 *
 * Metrics collected (per GPU):
 *  - name: GPU product name
 *  - temperature: GPU temperature in Celsius
 *  - utilization_percent: GPU utilization percentage
 *  - memory_used_bytes: used GPU memory
 *  - memory_total_bytes: total GPU memory
 *  - memory_usage_percent: GPU memory usage as percentage
 *  - power_draw_watts: current power draw in watts (when available)
 *
 * Dependencies: nvidia-smi CLI (NVIDIA driver package)
 */

import type { HardwareMonitor } from './interface';
import type { HardwareMetric } from '../types';
import type { Subprocess } from 'bun';

/** nvidia-smi query command for GPU metrics */
const NVIDIA_SMI_QUERY = [
  'nvidia-smi',
  '--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw',
  '--format=csv,noheader,nounits',
];

/**
 * GPU Monitor — collects metrics from NVIDIA GPUs via nvidia-smi.
 *
 * NEVER crashes if GPU or nvidia-smi is absent.
 * Returns empty array with a warning log in that case.
 *
 * Constructor: accepts an optional spawn function for testing/Docker environments.
 */
export class GpuMonitor implements HardwareMonitor {
  public readonly name = 'gpu';

  private readonly spawnFunction: typeof Bun.spawn;

  /**
   * @param spawnFunctionOverride — alternate spawn function (for testing).
   *   Defaults to Bun.spawn for production use.
   */
  constructor(spawnFunctionOverride?: typeof Bun.spawn) {
    this.spawnFunction = spawnFunctionOverride || Bun.spawn;
  }

  /**
   * Collect GPU metrics by spawning nvidia-smi and parsing CSV output.
   * Handles all error cases gracefully.
   */
  public async collect(): Promise<HardwareMetric[]> {
    let spawnedProcess: Subprocess<'pipe', 'pipe'> | null = null;

    try {
      spawnedProcess = this.spawnFunction(NVIDIA_SMI_QUERY, {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await spawnedProcess.exited;

      if (exitCode !== 0) {
        let stderrOutput = '';
        const stderrStream = spawnedProcess.stderr;
        if (stderrStream && typeof stderrStream !== 'number') {
          const stderrReader = stderrStream.getReader();
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            if (value) {
              stderrOutput += new TextDecoder().decode(value);
            }
          }
        }
        console.warn(
          `[gpu-monitor] nvidia-smi exited with code ${exitCode}:`,
          stderrOutput.trim(),
        );
        return [];
      }

      let rawOutput = '';
      {
        const stdoutStream = spawnedProcess.stdout;
        if (stdoutStream && typeof stdoutStream !== 'number') {
          const reader = stdoutStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              rawOutput += new TextDecoder().decode(value);
            }
          }
        }
      }

      if (!rawOutput.trim()) {
        return [];
      }

      return this.parseNvidiaSmiOutput(rawOutput);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('nvidia-smi') || errorMessage.includes('ENOENT')) {
        console.warn('[gpu-monitor] nvidia-smi not found — GPU monitoring unavailable');
      } else {
        console.warn('[gpu-monitor] Failed to collect GPU metrics:', errorMessage);
      }

      return [];
    } finally {
      // Ensure spawned process is cleaned up if still running
      if (spawnedProcess && !spawnedProcess.killed) {
        spawnedProcess.kill();
      }
    }
  }

  /**
   * Parse nvidia-smi CSV output into HardwareMetric array.
   *
   * Expected format per line:
   *   gpu_name, temp, util%, mem_used, mem_total, power_draw
   *
   * @param rawOutput — raw stdout from nvidia-smi
   */
  private parseNvidiaSmiOutput(rawOutput: string): HardwareMetric[] {
    const metrics: HardwareMetric[] = [];
    const lines = rawOutput.trim().split('\n');

    for (let gpuIndex = 0; gpuIndex < lines.length; gpuIndex++) {
      const line = lines[gpuIndex].trim();
      if (!line) continue;

      const columns = line.split(',').map((col) => col.trim());

      // Minimum: name, temp, util, mem_used, mem_total
      if (columns.length < 5) {
        console.warn(
          `[gpu-monitor] Unexpected nvidia-smi output format at line ${gpuIndex}: "${line}"`,
        );
        continue;
      }

      const gpuName = columns[0];
      const temperatureCelsius = parseFloat(columns[1]);
      const utilizationPercent = parseFloat(columns[2]);
      const memoryUsedMib = parseFloat(columns[3]);
      const memoryTotalMib = parseFloat(columns[4]);
      const powerDrawWatts = columns.length >= 6 ? parseFloat(columns[5]) : NaN;

      const gpuLabel: Record<string, string> = {
        gpu_index: String(gpuIndex),
        gpu_name: gpuName,
      };

      // GPU name (stored as a label for reference, not a numeric metric)
      metrics.push({
        monitorName: this.name,
        metricName: 'name',
        metricValue: 0,
        unit: 'string',
        labels: { ...gpuLabel, name: gpuName },
      });

      if (!isNaN(temperatureCelsius)) {
        metrics.push({
          monitorName: this.name,
          metricName: 'temperature',
          metricValue: temperatureCelsius,
          unit: 'celsius',
          labels: gpuLabel,
        });
      }

      if (!isNaN(utilizationPercent)) {
        metrics.push({
          monitorName: this.name,
          metricName: 'utilization_percent',
          metricValue: utilizationPercent,
          unit: 'percent',
          labels: gpuLabel,
        });
      }

      if (!isNaN(memoryUsedMib)) {
        metrics.push({
          monitorName: this.name,
          metricName: 'memory_used_bytes',
          metricValue: memoryUsedMib * 1024 * 1024,
          unit: 'bytes',
          labels: gpuLabel,
        });
      }

      if (!isNaN(memoryTotalMib)) {
        metrics.push({
          monitorName: this.name,
          metricName: 'memory_total_bytes',
          metricValue: memoryTotalMib * 1024 * 1024,
          unit: 'bytes',
          labels: gpuLabel,
        });

        // Memory usage as percentage
        const memoryUsagePercent = memoryTotalMib > 0
          ? Math.round((memoryUsedMib / memoryTotalMib) * 100 * 100) / 100
          : 0;
        metrics.push({
          monitorName: this.name,
          metricName: 'memory_usage_percent',
          metricValue: memoryUsagePercent,
          unit: 'percent',
          labels: gpuLabel,
        });
      }

      if (!isNaN(powerDrawWatts)) {
        metrics.push({
          monitorName: this.name,
          metricName: 'power_draw',
          metricValue: powerDrawWatts,
          unit: 'watts',
          labels: gpuLabel,
        });
      }
    }

    return metrics;
  }
}
