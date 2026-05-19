/**
 * Telemetry Handler Drizzle SQLite Schema
 *
 * Time-series hardware metric storage and alert event tracking.
 * Extends the monorepo machines table (from server-kill-switch) with foreign key references.
 *
 * Tables:
 *  - telemetry_metric: time-series hardware data points
 *  - telemetry_alert: threshold violation events with severity tracking
 *
 * Dependencies: machines table from server-kill-switch's schema (imported via path alias)
 */

import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Telemetry metrics — time-series hardware data.
 * Each row is a single metric data point from a hardware monitor.
 */
export const telemetryMetrics = sqliteTable(
  'telemetry_metric',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    machineId: text('machine_id').notNull(),
    monitorName: text('monitor_name').notNull(),
    metricName: text('metric_name').notNull(),
    metricValue: real('metric_value').notNull(),
    unit: text('unit').notNull(),
    labels: text('labels'),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    machineTimeIdx: index('tm_machine_time_idx').on(table.machineId, table.timestamp),
    monitorTimeIdx: index('tm_monitor_time_idx').on(table.monitorName, table.timestamp),
    metricTimeIdx: index('tm_metric_time_idx').on(table.metricName, table.timestamp),
  }),
);

/**
 * Alert events from threshold violations.
 * Records when a hardware metric exceeds configured thresholds,
 * including whether it triggered a kill switch state change.
 */
export const telemetryAlerts = sqliteTable(
  'telemetry_alert',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    machineId: text('machine_id').notNull(),
    monitorName: text('monitor_name').notNull(),
    metricName: text('metric_name').notNull(),
    thresholdValue: real('threshold_value').notNull(),
    actualValue: real('actual_value').notNull(),
    severity: text('severity').notNull(),
    acknowledged: integer('acknowledged', { mode: 'boolean' }).default(false),
    triggeredKillSwitch: integer('triggered_kill_switch', { mode: 'boolean' }).default(false),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    severityTimeIdx: index('ta_severity_time_idx').on(table.severity, table.timestamp),
    machineTimeIdx: index('ta_machine_time_idx').on(table.machineId, table.timestamp),
    monitorTimeIdx: index('ta_monitor_time_idx').on(table.monitorName, table.timestamp),
  }),
);
