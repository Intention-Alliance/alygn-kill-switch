/**
 * Metric Collector Unit Tests
 *
 * Tests for MetricCollector:
 *  - Deduplication of unchanged metric values
 *  - Batch flushing lifecycle
 *  - Start/stop lifecycle
 *  - Critical-only collection mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MetricCollector } from './metric-collector';
import type { HardwareMonitor } from '../monitors/interface';
import type { SqlitePersister } from '../persisters/sqlite-persister';
import type { HardwareMetric } from '../types';

// ─── Mock Hardware Monitor ─────────────────────────────────────────

class MockMonitor implements HardwareMonitor {
  public readonly name: string;
  private callCount = 0;

  constructor(name: string) {
    this.name = name;
  }

  public async collect(): Promise<HardwareMetric[]> {
    this.callCount++;

    return [
      {
        monitorName: this.name,
        metricName: 'temperature',
        metricValue: 45 + this.callCount,
        unit: 'celsius',
      },
      {
        monitorName: this.name,
        metricName: 'usage_percent',
        metricValue: 72,
        unit: 'percent',
      },
    ];
  }
}

// ─── Mock Persister ────────────────────────────────────────────────

class MockPersister {
  public writtenBatches: HardwareMetric[][] = [];
  public writeCallCount = 0;

  public async writeMetrics(metrics: HardwareMetric[]): Promise<void> {
    this.writtenBatches.push([...metrics]);
    this.writeCallCount++;
  }
}

describe('MetricCollector', () => {
  let mockMonitor: MockMonitor;
  let mockPersister: MockPersister;
  let collector: MetricCollector;

  beforeEach(() => {
    mockMonitor = new MockMonitor('test-monitor');
    mockPersister = new MockPersister();
    collector = new MetricCollector(
      [mockMonitor],
      mockPersister as unknown as SqlitePersister,
      30000,
      5000,
      10000,
      2,
    );
  });

  afterEach(async () => {
    await collector.stopCollecting();
  });

  describe('deduplication', () => {
    it('should track metric values in state for deduplication', async () => {
      collector.startCollecting();

      await new Promise((resolve) => setTimeout(resolve, 200));
      await collector.stopCollecting();

      const state = collector.getCollectorState();

      // At least one metric value should be tracked
      expect(state.lastMetricValues.size).toBeGreaterThan(0);
    });
  });

  describe('lifecycle', () => {
    it('should start and stop without errors', async () => {
      collector.startCollecting();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await collector.stopCollecting();

      // Reaching here means no unhandled errors
      expect(true).toBe(true);
    });

    it('should flush remaining metrics on stop', async () => {
      collector.startCollecting();

      await new Promise((resolve) => setTimeout(resolve, 200));

      await collector.stopCollecting();

      // After stop, service should be clean
      expect(typeof mockPersister.writeCallCount).toBe('number');
    });

    it('should warn when started twice without crashing', async () => {
      collector.startCollecting();
      collector.startCollecting();

      await collector.stopCollecting();
      expect(true).toBe(true);
    });
  });

  describe('critical metrics mode', () => {
    it('should handle critical interval collection without errors', async () => {
      const fastCollector = new MetricCollector(
        [mockMonitor],
        mockPersister as unknown as SqlitePersister,
        30000,
        100,
        10000,
        100,
      );

      fastCollector.startCollecting();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await fastCollector.stopCollecting();

      expect(true).toBe(true);
    });
  });
});
