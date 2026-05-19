/**
 * DPU Monitor (Stub)
 *
 * Placeholder monitor for future Data Processing Unit (DPU) hardware integration.
 * Modeled after Mellanox/NVIDIA BlueField DPU SDK patterns.
 *
 * Currently returns an unavailable status until hardware is provisioned.
 * When DPU hardware becomes available, this monitor will populate:
 *  - dpu_model: DPU model identifier
 *  - firmware_version: running firmware version
 *  - arm_core_count: number of ARM cores
 *  - arm_core_usage_percent: ARM core utilization
 *  - memory_total_bytes: DPU onboard memory
 *  - memory_used_bytes: DPU memory usage
 *  - network_throughput_mbps: RDMA/inline network throughput
 *  - pcie_link_speed: PCIe link speed
 *  - temperature_celsius: DPU temperature
 *
 * Interface contract follows the same HardwareMonitor pattern as all other monitors.
 */

import type { HardwareMonitor } from './interface';
import type { HardwareMetric } from '../types';

/**
 * DPU Monitor — stub implementation for future hardware.
 *
 * When DPU hardware is available, this will wrap the BlueField SDK
 * or use dpuctl CLI tools, mirroring the GpuMonitor nvidia-smi pattern.
 */
export class DpuMonitor implements HardwareMonitor {
  public readonly name = 'dpu';

  public async collect(): Promise<HardwareMetric[]> {
    // Return an "unavailable" status metric rather than an empty array,
    // so consumers can distinguish "no hardware" from "error".
    return [
      {
        monitorName: this.name,
        metricName: 'status',
        metricValue: 0,
        unit: 'string',
        labels: {
          status: 'unavailable',
          reason: 'no_dpu_hardware',
        },
      },
    ];
  }
}
