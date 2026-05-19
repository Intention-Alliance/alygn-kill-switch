/**
 * Telemetry Handler — Internal Types
 *
 * Extends shared-types with telemetry-specific domain types.
 * HardwareMetric, SeverityLevel, and related interfaces used throughout the service.
 */

import type { KillSwitchState } from '@align/shared-types';

// ─── Hardware Metrics ──────────────────────────────────────────────

/**
 * A single metric data point collected from a hardware monitor.
 * Generic enough to represent CPU temp, GPU utilization, disk IOPS, etc.
 */
export interface HardwareMetric {
  /** Name of the hardware monitor (e.g., 'cpu', 'gpu', 'memory', 'disk', 'dpu', 'network') */
  readonly monitorName: string;
  /** Specific metric name within that monitor (e.g., 'temperature', 'usage_percent') */
  readonly metricName: string;
  /** Numeric value of the metric */
  readonly metricValue: number;
  /** Unit of measurement (e.g., 'celsius', 'percent', 'bytes', 'mbps') */
  readonly unit: string;
  /** Optional key-value labels for disambiguation (e.g., { core: '0', device: 'nvme0n1' }) */
  readonly labels?: Record<string, string>;
}

// ─── Thresholds & Alerting ─────────────────────────────────────────

/**
 * Severity levels for threshold violations.
 * Mirrors the database enum for type safety.
 */
export type SeverityLevel = 'warning' | 'critical' | 'emergency';

/**
 * Result of a threshold evaluation — whether an alert should be raised.
 */
export interface ThresholdEvaluation {
  /** Whether the metric exceeded any threshold */
  readonly exceeded: boolean;
  /** The severity level to assign (null if not exceeded) */
  readonly severity: SeverityLevel | null;
  /** The threshold value that was exceeded (null if not exceeded) */
  readonly thresholdValue: number | null;
}

// ─── Kill Switch Integration ───────────────────────────────────────

/**
 * Payload sent to the kill switch bridge when an emergency threshold is breached.
 */
export interface KillSwitchTriggerPayload {
  readonly reason: string;
  readonly triggerUserId: string;
  readonly targetState: KillSwitchState;
  readonly machineId: string;
  readonly monitorName: string;
  readonly metricName: string;
  readonly actualValue: number;
  readonly thresholdValue: number;
}

// ─── Collector State ───────────────────────────────────────────────

/**
 * Internal state used by the metric collector for deduplication tracking.
 */
export interface CollectorState {
  /** Map of metric key → last value for deduplication */
  readonly lastMetricValues: Map<string, number>;
  /** Queued metrics awaiting batch flush */
  pendingBatch: HardwareMetric[];
  /** Timestamp of last batch flush */
  lastFlushTimestamp: number;
}

// ─── Service Dependencies ──────────────────────────────────────────
// Re-exported for convenience; actual type definitions live in their modules.

export type { Database as BunSqliteDatabase } from 'bun:sqlite';
