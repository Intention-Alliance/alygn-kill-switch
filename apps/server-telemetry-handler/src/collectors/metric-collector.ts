/**
 * Metric Collector
 *
 * Orchestrates metric collection across all hardware monitors.
 * Handles scheduling, deduplication, and batch writes.
 *
 * Key behaviors:
 *  - Runs all monitors on a configurable interval
 *  - Deduplicates: skips write when a metric value hasn't changed since last collection
 *  - Batches: flushes pending metrics every N seconds or M metrics, whichever comes first
 *  - Critical metrics (temperature) run on a faster, separate interval
 *
 * Constructor Injection: receives monitors and persister via constructor,
 * never instantiates dependencies internally.
 */

import type { HardwareMonitor } from '../monitors/interface';
import type { SqlitePersister } from '../persisters/sqlite-persister';
import type { HardwareMetric, CollectorState } from '../types';

/**
 * Generate a deduplication key for a hardware metric.
 * Combines monitor name, metric name, and labels JSON for uniqueness.
 */
function generateDeduplicationKey(metric: HardwareMetric): string {
  const labelsJson = metric.labels
    ? JSON.stringify(metric.labels, Object.keys(metric.labels).sort())
    : '{}';
  return `${metric.monitorName}:${metric.metricName}:${labelsJson}`;
}

/**
 * MetricCollector — runs hardware monitors on a schedule,
 * deduplicates unchanged values, and batch-flushes to the persister.
 */
export class MetricCollector {
  private readonly collectorState: CollectorState = {
    lastMetricValues: new Map(),
    pendingBatch: [],
    lastFlushTimestamp: Date.now(),
  };

  private collectionTimer: ReturnType<typeof setInterval> | null = null;
  private criticalCollectionTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isCollecting = false;

  constructor(
    private readonly hardwareMonitors: HardwareMonitor[],
    private readonly sqlitePersister: SqlitePersister,
    private readonly collectionIntervalMs: number,
    private readonly criticalCollectionIntervalMs: number,
    private readonly batchFlushIntervalMs: number,
    private readonly batchMaxSize: number,
  ) {}

  /**
   * Start the collection loop.
   * Spawns two timers: standard interval for most metrics,
   * faster interval for critical metrics (temperature).
   */
  public startCollecting(): void {
    if (this.collectionTimer !== null) {
      console.warn('[metric-collector] Collection already running');
      return;
    }

    console.log(
      `[metric-collector] Starting collection — standard: ${this.collectionIntervalMs}ms, critical: ${this.criticalCollectionIntervalMs}ms`,
    );

    // Standard collection interval
    this.collectionTimer = setInterval(() => {
      this.collectAndProcess(false).catch((error: unknown) => {
        console.error('[metric-collector] Standard collection error:', (error as Error).message);
      });
    }, this.collectionIntervalMs);

    // Critical metrics collection interval (faster)
    this.criticalCollectionTimer = setInterval(() => {
      this.collectAndProcess(true).catch((error: unknown) => {
        console.error('[metric-collector] Critical collection error:', (error as Error).message);
      });
    }, this.criticalCollectionIntervalMs);

    // Batch flush timer
    this.flushTimer = setInterval(() => {
      this.flushPendingBatch().catch((error: unknown) => {
        console.error('[metric-collector] Flush error:', (error as Error).message);
      });
    }, this.batchFlushIntervalMs);

    // Run an immediate first collection
    this.collectAndProcess(false).catch((error: unknown) => {
      console.error('[metric-collector] Initial collection error:', (error as Error).message);
    });
  }

  /**
   * Stop the collection loop and flush any remaining pending metrics.
   */
  public async stopCollecting(): Promise<void> {
    console.log('[metric-collector] Stopping collection...');

    if (this.collectionTimer !== null) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }

    if (this.criticalCollectionTimer !== null) {
      clearInterval(this.criticalCollectionTimer);
      this.criticalCollectionTimer = null;
    }

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining metrics before shutdown
    await this.flushPendingBatch();

    console.log('[metric-collector] Collection stopped');
  }

  /**
   * Run all monitors, deduplicate results, and queue for batch write.
   *
   * @param criticalOnly — when true, only collect temperature metrics from monitors that have them.
   */
  private async collectAndProcess(criticalOnly: boolean): Promise<void> {
    if (this.isCollecting) {
      return; // Prevent overlapping collections
    }

    this.isCollecting = true;

    try {
      for (const monitor of this.hardwareMonitors) {
        let rawMetrics: HardwareMetric[];

        try {
          rawMetrics = await monitor.collect();
        } catch (error: unknown) {
          console.error(
            `[metric-collector] Monitor '${monitor.name}' threw during collection:`,
            (error as Error).message,
          );
          continue;
        }

        for (const metric of rawMetrics) {
          // Critical-only mode: skip non-temperature metrics
          if (criticalOnly && metric.metricName !== 'temperature') {
            continue;
          }

          // Deduplication check
          const deduplicationKey = generateDeduplicationKey(metric);
          const previousValue = this.collectorState.lastMetricValues.get(deduplicationKey);

          if (previousValue !== undefined && previousValue === metric.metricValue) {
            continue; // Skip — value hasn't changed
          }

          // Update tracked value
          this.collectorState.lastMetricValues.set(deduplicationKey, metric.metricValue);

          // Queue for batch write
          this.collectorState.pendingBatch.push(metric);

          // Flush if batch reached max size
          if (this.collectorState.pendingBatch.length >= this.batchMaxSize) {
            await this.flushPendingBatch();
          }
        }
      }
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * Flush all pending metrics to the SQLite persister.
   * Clears the batch after successful write.
   */
  private async flushPendingBatch(): Promise<void> {
    if (this.collectorState.pendingBatch.length === 0) {
      return;
    }

    const batchSnapshot = [...this.collectorState.pendingBatch];
    this.collectorState.pendingBatch = [];

    try {
      await this.sqlitePersister.writeMetrics(batchSnapshot);
      this.collectorState.lastFlushTimestamp = Date.now();
    } catch (error: unknown) {
      console.error(
        `[metric-collector] Failed to flush ${batchSnapshot.length} metrics:`,
        (error as Error).message,
      );
      // Re-queue failed metrics at the front (not ideal to lose data)
      this.collectorState.pendingBatch = [...batchSnapshot, ...this.collectorState.pendingBatch];
    }
  }

  /**
   * Get the current collector state (for testing and health checks).
   */
  public getCollectorState(): Readonly<CollectorState> {
    return this.collectorState;
  }
}
