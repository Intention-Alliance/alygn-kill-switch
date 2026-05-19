/**
 * Threshold Engine
 *
 * Evaluates hardware metrics against configurable thresholds.
 * Produces severity levels: warning (log), critical (alert + WebSocket), emergency (Kill Switch).
 *
 * Constructor Injection: receives thresholds and kill switch bridge via constructor.
 * Thresholds are organized by monitor name and metric name for extensibility.
 */

import type { TelemetryConfig } from '../config';
import type { HardwareMetric, ThresholdEvaluation, SeverityLevel } from '../types';
import { KillSwitchBridge } from './kill-switch-bridge';

/**
 * Single threshold rule — matches a monitor/metric pair to a value and severity.
 */
interface ThresholdRule {
  readonly monitorName: string;
  readonly metricName: string;
  readonly thresholdValue: number;
  readonly severity: SeverityLevel;
  /** Comparison operator: 'greater_than' or 'less_than' (default: 'greater_than') */
  readonly comparison: 'greater_than' | 'less_than';
}

/**
 * ThresholdEngine — evaluates metrics against threshold rules.
 *
 * Uses the kill switch bridge pattern: on emergency severity,
 * delegates to the bridge rather than calling KillSwitch directly.
 */
export class ThresholdEngine {
  private readonly thresholdRules: ThresholdRule[];

  constructor(
    private readonly telemetryConfig: TelemetryConfig,
    private readonly killSwitchBridge: KillSwitchBridge,
  ) {
    this.thresholdRules = this.buildThresholdRules(telemetryConfig);
  }

  /**
   * Evaluate a single metric against all applicable threshold rules.
   *
   * @param metric — the hardware metric to evaluate
   * @param machineId — the machine this metric belongs to
   * @returns evaluation result indicating whether and what severity of alert to raise
   */
  public async evaluate(
    metric: HardwareMetric,
    machineId: string,
  ): Promise<ThresholdEvaluation> {
    const matchingRules = this.thresholdRules.filter(
      (rule) =>
        rule.monitorName === metric.monitorName && rule.metricName === metric.metricName,
    );

    if (matchingRules.length === 0) {
      return { exceeded: false, severity: null, thresholdValue: null };
    }

    // Find the highest-severity rule that's been breached
    const severityPriority: SeverityLevel[] = ['emergency', 'critical', 'warning'];
    let worstSeverity: SeverityLevel | null = null;
    let worstThreshold: number | null = null;

    for (const rule of matchingRules) {
      const isExceeded = rule.comparison === 'less_than'
        ? metric.metricValue < rule.thresholdValue
        : metric.metricValue > rule.thresholdValue;

      if (isExceeded) {
        if (
          worstSeverity === null
          || severityPriority.indexOf(rule.severity) < severityPriority.indexOf(worstSeverity)
        ) {
          worstSeverity = rule.severity;
          worstThreshold = rule.thresholdValue;
        }
      }
    }

    const isExceeded = worstSeverity !== null;

    // ─── Emergency severity → trigger Kill Switch ──────────────────
    if (isExceeded && worstSeverity === 'emergency') {
      if (this.telemetryConfig.enableKillSwitchTrigger) {
        try {
          await this.killSwitchBridge.triggerEmergencyStop({
            reason: `${metric.monitorName}.${metric.metricName} = ${metric.metricValue}${metric.unit} exceeds emergency threshold ${worstThreshold}${metric.unit}`,
            triggerUserId: 'telemetry',
            targetState: 'STOPPING',
            machineId,
            monitorName: metric.monitorName,
            metricName: metric.metricName,
            actualValue: metric.metricValue,
            thresholdValue: worstThreshold!,
          });
        } catch (error: unknown) {
          console.error(
            '[threshold-engine] Kill switch bridge trigger failed:',
            (error as Error).message,
          );
        }
      } else {
        console.warn(
          `[threshold-engine] Emergency threshold exceeded (${metric.monitorName}.${metric.metricName} = ${metric.metricValue}) but Kill Switch trigger is disabled`,
        );
      }
    }

    return {
      exceeded: isExceeded,
      severity: worstSeverity,
      thresholdValue: worstThreshold,
    };
  }

  /**
   * Build threshold rules from the telemetry configuration.
   * Maps config sections to individual ThresholdRule entries.
   */
  private buildThresholdRules(config: TelemetryConfig): ThresholdRule[] {
    const rules: ThresholdRule[] = [];

    // GPU temperature thresholds
    rules.push({
      monitorName: 'gpu',
      metricName: 'temperature',
      thresholdValue: config.thresholds.gpu.tempCriticalCelsius,
      severity: 'critical',
      comparison: 'greater_than',
    });
    rules.push({
      monitorName: 'gpu',
      metricName: 'temperature',
      thresholdValue: config.thresholds.gpu.tempEmergencyCelsius,
      severity: 'emergency',
      comparison: 'greater_than',
    });

    // CPU temperature
    rules.push({
      monitorName: 'cpu',
      metricName: 'temperature',
      thresholdValue: config.thresholds.cpu.tempCriticalCelsius,
      severity: 'critical',
      comparison: 'greater_than',
    });

    // Memory usage
    rules.push({
      monitorName: 'memory',
      metricName: 'usage_percent',
      thresholdValue: config.thresholds.memory.usageCriticalPercent,
      severity: 'critical',
      comparison: 'greater_than',
    });

    // Disk usage
    rules.push({
      monitorName: 'disk',
      metricName: 'usage_percent',
      thresholdValue: config.thresholds.disk.usageCriticalPercent,
      severity: 'critical',
      comparison: 'greater_than',
    });

    return rules;
  }

  /**
   * Get all configured threshold rules (for health checks and introspection).
   */
  public getThresholdRules(): readonly ThresholdRule[] {
    return this.thresholdRules;
  }
}
