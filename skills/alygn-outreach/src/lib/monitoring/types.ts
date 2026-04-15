/**
 * Shared types for the monitoring subsystem
 */

export enum HealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Unhealthy = 'unhealthy',
  Unknown = 'unknown',
}

export interface HealthCheckResult {
  service: ServiceName;
  status: HealthStatus;
  latencyMs: number;
  message: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export type ServiceName = 'supabase' | 'notion' | 'email' | 'redis' | 'x-api';

export interface HealthHistoryEntry extends HealthCheckResult {
  /** Monotonic sequence number within a service's history */
  seq: number;
}

export interface HealthSnapshot {
  services: Record<ServiceName, HealthCheckResult | null>;
  overall: HealthStatus;
  checkedAt: number;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, { count: number; sum: number; min: number; max: number; last: number }>;
  windowStart: number;
  windowEnd: number;
}

export interface Alert {
  id: string;
  rule: string;
  severity: 'warning' | 'critical';
  message: string;
  timestamp: number;
  service?: ServiceName;
  details?: Record<string, unknown>;
  acknowledged: boolean;
}

export interface AlertRule {
  name: string;
  description: string;
  severity: 'warning' | 'critical';
  evaluate: (snapshot: HealthSnapshot, metrics: MetricsSnapshot, context?: AlertContext) => Alert | null;
}

/** Evaluation context provided by MonitoringSystem to AlertManager */
export interface AlertContext {
  /** Number of consecutive unhealthy checks per service */
  consecutiveCounts?: Partial<Record<ServiceName, number>>;
}