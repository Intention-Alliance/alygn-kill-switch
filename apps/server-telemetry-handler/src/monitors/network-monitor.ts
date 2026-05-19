/**
 * Network Monitor
 *
 * Collects network interface statistics.
 * Reads from /proc/net/dev on Linux for RX/TX bytes and packets per interface.
 *
 * Metrics collected (per interface):
 *  - rx_bytes: total bytes received
 *  - tx_bytes: total bytes transmitted
 *  - rx_packets: total packets received
 *  - tx_packets: total packets transmitted
 */

import { readFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import type { HardwareMonitor } from './interface';
import type { HardwareMetric } from '../types';

/** Path to Linux network device statistics */
const NET_DEV_PATH = '/proc/net/dev';

/** Interfaces to skip (loopback and virtual) */
const SKIP_INTERFACES = new Set(['lo']);

/**
 * Network Monitor — collects per-interface network throughput stats.
 */
export class NetworkMonitor implements HardwareMonitor {
  public readonly name = 'network';

  public async collect(): Promise<HardwareMetric[]> {
    const metrics: HardwareMetric[] = [];

    // ─── Interface Listing (os.networkInterfaces) ─────────────────
    const interfaces = networkInterfaces();
    for (const [interfaceName, addresses] of Object.entries(interfaces)) {
      if (!addresses || SKIP_INTERFACES.has(interfaceName)) {
        continue;
      }

      // Count active addresses per interface
      const activeAddressCount = addresses.filter(
        (addr) => !addr.internal,
      ).length;

      metrics.push({
        monitorName: this.name,
        metricName: 'active_addresses',
        metricValue: activeAddressCount,
        unit: 'count',
        labels: { interface: interfaceName },
      });
    }

    // ─── Throughput Stats (Linux /proc/net/dev) ──────────────────
    const throughputMetrics = this.readNetworkThroughput();
    metrics.push(...throughputMetrics);

    return metrics;
  }

  /**
   * Read RX/TX bytes and packet counts from /proc/net/dev.
   */
  private readNetworkThroughput(): HardwareMetric[] {
    if (!existsSync(NET_DEV_PATH)) {
      return [];
    }

    const metrics: HardwareMetric[] = [];

    try {
      const content = readFileSync(NET_DEV_PATH, 'utf-8');
      const lines = content.split('\n');

      // Skip the first two header lines
      for (let lineIndex = 2; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex].trim();
        if (!line) continue;

        // Format: iface: rx_bytes rx_packets ... tx_bytes tx_packets ...
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const interfaceName = line.substring(0, colonIndex).trim();
        if (SKIP_INTERFACES.has(interfaceName)) continue;

        const statsPart = line.substring(colonIndex + 1).trim();
        const stats = statsPart.split(/\s+/);

        if (stats.length < 10) continue;

        const rxBytes = parseInt(stats[0], 10);
        const rxPackets = parseInt(stats[1], 10);
        const txBytes = parseInt(stats[8], 10);
        const txPackets = parseInt(stats[9], 10);

        const interfaceLabel: Record<string, string> = { interface: interfaceName };

        if (!isNaN(rxBytes)) {
          metrics.push({
            monitorName: this.name,
            metricName: 'rx_bytes',
            metricValue: rxBytes,
            unit: 'bytes',
            labels: interfaceLabel,
          });
        }

        if (!isNaN(txBytes)) {
          metrics.push({
            monitorName: this.name,
            metricName: 'tx_bytes',
            metricValue: txBytes,
            unit: 'bytes',
            labels: interfaceLabel,
          });
        }

        if (!isNaN(rxPackets)) {
          metrics.push({
            monitorName: this.name,
            metricName: 'rx_packets',
            metricValue: rxPackets,
            unit: 'count',
            labels: interfaceLabel,
          });
        }

        if (!isNaN(txPackets)) {
          metrics.push({
            monitorName: this.name,
            metricName: 'tx_packets',
            metricValue: txPackets,
            unit: 'count',
            labels: interfaceLabel,
          });
        }
      }
    } catch (error: unknown) {
      console.warn('[network-monitor] Failed to read /proc/net/dev:', (error as Error).message);
    }

    return metrics;
  }
}
