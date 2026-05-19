/**
 * SQLite Persister
 *
 * Writes hardware metric batches to Drizzle SQLite tables.
 * Uses the Drizzle ORM pattern established in server-kill-switch.
 *
 * Constructor Injection: receives the Drizzle database instance via constructor.
 * All writes are transaction-safe.
 */

import { eq, desc, and } from 'drizzle-orm';
import { telemetryMetrics, telemetryAlerts } from '../db/schema';
import type { TelemetryDatabase } from '../db/index';
import type { HardwareMetric } from '../types';
import type { SeverityLevel } from '../types';

/**
 * Alert record payload for writing alert events.
 */
export interface AlertWritePayload {
  readonly machineId: string;
  readonly monitorName: string;
  readonly metricName: string;
  readonly thresholdValue: number;
  readonly actualValue: number;
  readonly severity: SeverityLevel;
  readonly triggeredKillSwitch: boolean;
}

/**
 * SqlitePersister — handles all telemetry database writes.
 *
 * Methods:
 *  - writeMetrics: batch-insert hardware metric data points
 *  - writeAlert: insert a single alert event
 */
export class SqlitePersister {
  constructor(private readonly telemetryDatabase: TelemetryDatabase) {}

  /**
   * Batch-write hardware metrics to the telemetry_metric table.
   *
   * @param metrics — array of HardwareMetric to persist
   */
  public async writeMetrics(metrics: HardwareMetric[]): Promise<void> {
    if (metrics.length === 0) {
      return;
    }

    // Build insert values — one row per metric
    const rows = metrics.map((metric) => ({
      id: crypto.randomUUID(),
      machineId: metric.labels?.machine_id || 'default',
      monitorName: metric.monitorName,
      metricName: metric.metricName,
      metricValue: metric.metricValue,
      unit: metric.unit,
      labels: metric.labels ? JSON.stringify(metric.labels) : null,
      timestamp: new Date(),
    }));

    // Batch insert using Drizzle's insert().values() pattern
    await this.telemetryDatabase.insert(telemetryMetrics).values(rows);

    // For very large batches, this could be chunked, but batchMaxSize keeps it manageable
  }

  /**
   * Write a single alert event to the telemetry_alert table.
   *
   * @param alert — alert payload
   */
  public async writeAlert(alert: AlertWritePayload): Promise<void> {
    await this.telemetryDatabase.insert(telemetryAlerts).values({
      id: crypto.randomUUID(),
      machineId: alert.machineId,
      monitorName: alert.monitorName,
      metricName: alert.metricName,
      thresholdValue: alert.thresholdValue,
      actualValue: alert.actualValue,
      severity: alert.severity,
      acknowledged: false,
      triggeredKillSwitch: alert.triggeredKillSwitch,
      timestamp: new Date(),
    });
  }

  /**
   * Query the most recent metric value for a specific monitor/metric combination.
   * Useful for delta calculations and deduplication reference.
   *
   * @param monitorName — monitor identifier
   * @param metricName — metric identifier
   * @returns the most recent metric value, or null if none found
   */
  public async getLatestMetricValue(
    monitorName: string,
    metricName: string,
  ): Promise<number | null> {
    const rows = await this.telemetryDatabase
      .select({
        value: telemetryMetrics.metricValue,
      })
      .from(telemetryMetrics)
      .where(
        and(
          eq(telemetryMetrics.monitorName, monitorName),
          eq(telemetryMetrics.metricName, metricName),
        ),
      )
      .orderBy(desc(telemetryMetrics.timestamp))
      .limit(1);

    return rows.length > 0 ? rows[0].value : null;
  }
}
