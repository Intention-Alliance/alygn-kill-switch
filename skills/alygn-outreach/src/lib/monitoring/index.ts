/**
 * Monitoring index — Facade that wires HealthMonitor + MetricsCollector + AlertManager
 *
 * Provides a single entry point for the outreach pipeline to interact with
 * the monitoring subsystem. Each component is still independently usable.
 */
import { HealthMonitor } from './HealthMonitor';
import { MetricsCollector } from './MetricsCollector';
import { AlertManager } from './AlertManager';
import { CertificateMonitor } from './CertificateMonitor';
import { GatewayConfig } from './GatewayConfig';
import type { GatewayConfigOptions } from './GatewayConfig';
import type { HealthMonitorOptions } from './HealthMonitor';
import type { MetricsCollectorOptions } from './MetricsCollector';
import type { AlertManagerOptions } from './AlertManager';
import type { CertificateMonitorOptions, CertificateService } from './CertificateMonitor';
import type { HealthSnapshot, MetricsSnapshot, ServiceName } from './types';
import { HealthStatus } from './types';

export interface MonitoringSystemOptions {
  health?: HealthMonitorOptions;
  metrics?: MetricsCollectorOptions;
  alerts?: AlertManagerOptions;
  /** Certificate monitoring configuration */
  certificates?: CertificateMonitorOptions;
  /** Gateway remote URL configuration */
  gateway?: GatewayConfigOptions;
  /** Evaluate alerts on every health check cycle (default: true) */
  evaluateAlertsOnCheck?: boolean;
}

export class MonitoringSystem {
  readonly health: HealthMonitor;
  readonly metrics: MetricsCollector;
  readonly alerts: AlertManager;
  readonly certificates: CertificateMonitor;
  readonly gateway: GatewayConfig | null;
  private readonly evaluateAlertsOnCheck: boolean;

  constructor(options: MonitoringSystemOptions = {}) {
    this.health = new HealthMonitor(options.health);
    this.metrics = new MetricsCollector(options.metrics);
    this.alerts = new AlertManager(options.alerts);
    this.evaluateAlertsOnCheck = options.evaluateAlertsOnCheck ?? true;

    // Wire CertificateMonitor with AlertManager and HealthMonitor references
    const certOptions: CertificateMonitorOptions = {
      ...options.certificates,
      alertManager: this.alerts,
      healthMonitor: this.health,
    };
    this.certificates = new CertificateMonitor(certOptions);

    // Initialize GatewayConfig and register its health check (only if configured)
    if (options.gateway || process.env.GATEWAY_REMOTE_URL) {
      this.gateway = new GatewayConfig(options.gateway);
      this.health.registerCheck('gateway', this.gateway.asHealthCheck());
    } else {
      this.gateway = null;
    }

    // Override the service-unhealthy-consecutive rule to use
    // consecutiveCount from context (provided by MonitoringSystem)
    this.alerts.removeRule('service-unhealthy-consecutive');
    this.alerts.addRule({
      name: 'service-unhealthy-consecutive',
      description: 'Service unhealthy for >2 consecutive checks',
      severity: 'critical',
      evaluate: (snapshot: HealthSnapshot, _metrics: MetricsSnapshot, context) => {
        for (const [service, result] of Object.entries(snapshot.services)) {
          if (!result) continue;
          const consecutive = context?.consecutiveCounts?.[service as ServiceName] ?? 0;
          if (consecutive > 2) {
            return {
              id: '',
              rule: 'service-unhealthy-consecutive',
              severity: 'critical' as const,
              message: `Service ${service} unhealthy for ${consecutive} consecutive checks (>2 threshold): ${result.message}`,
              timestamp: Date.now(),
              service: service as ServiceName,
              details: { consecutive, status: result.status, message: result.message },
              acknowledged: false,
            };
          }
        }
        return null;
      },
    });
  }

  /** Start all monitoring subsystems */
  start(): void {
    this.health.start();
    this.metrics.startPersist();
    this.certificates.start();

    // Wire alert evaluation into health check cycle
    if (this.evaluateAlertsOnCheck) {
      const originalCheck = this.health.checkService.bind(this.health);

      // Poll-based evaluation: check alerts every 30s (aligned with health check interval)
      this._alertEvalTimer = setInterval(() => {
        const snapshot = this.health.getSnapshot();
        if (snapshot) {
          const metricsSnapshot = this.metrics.exportSnapshot();
          // Build consecutive counts context from HealthMonitor history
          const consecutiveCounts: Partial<Record<ServiceName, number>> = {};
          for (const svc of Object.keys(snapshot.services) as ServiceName[]) {
            consecutiveCounts[svc] = this.health.getConsecutiveUnhealthy(svc);
          }
          this.alerts.evaluate(snapshot, metricsSnapshot, { consecutiveCounts }).catch(() => {});
        }
      }, 30_000);
    }
  }

  /** Stop all monitoring subsystems */
  stop(): void {
    this.health.stop();
    this.metrics.stopPersist();
    this.certificates.stop();
    if (this._alertEvalTimer) {
      clearInterval(this._alertEvalTimer);
      this._alertEvalTimer = null;
    }
  }

  /** Convenience: record a pipeline stage execution with timing */
  async withMetrics<T>(stageName: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.metrics.recordPipelineTime(Date.now() - start);
      this.metrics.incrementCounter(`stage_${stageName}_success`);
      return result;
    } catch (err) {
      this.metrics.incrementCounter(`stage_${stageName}_failed`);
      throw err;
    }
  }

  private _alertEvalTimer: ReturnType<typeof setInterval> | null = null;
}

// Re-export all types and classes for independent usage
export { HealthMonitor } from './HealthMonitor';
export { MetricsCollector } from './MetricsCollector';
export { AlertManager } from './AlertManager';
export { CertificateMonitor } from './CertificateMonitor';
export { GatewayConfig, GatewayConfigError } from './GatewayConfig';
export * from './types';
export * from './channels';

export default MonitoringSystem;