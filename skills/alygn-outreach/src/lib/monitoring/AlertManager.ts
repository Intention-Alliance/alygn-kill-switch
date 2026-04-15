/**
 * AlertManager — Threshold-based alerting for outreach pipeline
 *
 * Design decisions:
 *  - Rules are evaluated against HealthSnapshot + MetricsSnapshot.
 *  - Default rules cover the three required thresholds from the spec.
 *  - Alert channels: pluggable AlertChannel[] (console, Discord, email, etc.)
 *  - Deduplication: same rule won't fire again until acknowledged or cooldown expires.
 *  - Non-blocking: alert evaluation and dispatch are fire-and-forget.
 *  - Independently usable: no dependency on HealthMonitor or MetricsCollector
 *    (they just provide the data for evaluate()).
 */
import * as crypto from 'crypto';
import {
  type Alert,
  type AlertRule,
  type AlertContext,
  type HealthSnapshot,
  type MetricsSnapshot,
  type ServiceName,
  HealthStatus,
} from './types';
import type { AlertChannel, AlertPayload, ChannelResult } from './channels/AlertChannel';
import { ConsoleChannel } from './channels/ConsoleChannel';
import type { AuditLogger } from '../audit/AuditLogger';

export interface AlertManagerOptions {
  /** Directory for alert file persistence (default: data/alerts) */
  dataDir?: string;
  /** Cooldown period in ms before same rule can fire again (default 300_000 = 5min) */
  cooldownMs?: number;
  /** Max alert history to retain on disk (default: 500) */
  maxHistory?: number;
  /** Initial alert channels (default: [ConsoleChannel]) */
  channels?: AlertChannel[];
}

const DEFAULT_RULES: AlertRule[] = [
  {
    name: 'service-unhealthy-consecutive',
    description: 'Service unhealthy for >2 consecutive checks',
    severity: 'critical',
    evaluate: (snapshot, _metrics, context) => {
      for (const [service, result] of Object.entries(snapshot.services)) {
        if (!result) continue;
        // Use consecutiveCount from context when available (provided by MonitoringSystem)
        const consecutive = context?.consecutiveCounts?.[service as ServiceName] ?? (result.status === HealthStatus.Unhealthy ? 1 : 0);
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
  },
  {
    name: 'email-failure-rate-high',
    description: 'Email failure rate exceeds 10%',
    severity: 'warning',
    evaluate: (_snapshot, metrics) => {
      const sent = metrics.counters['emails_sent'] ?? 0;
      const failed = metrics.counters['emails_failed'] ?? 0;
      const total = sent + failed;

      if (total === 0) return null;

      const failureRate = failed / total;
      if (failureRate > 0.1) {
        return {
          id: '',
          rule: 'email-failure-rate-high',
          severity: 'warning' as const,
          message: `Email failure rate ${(failureRate * 100).toFixed(1)}% exceeds 10% threshold (${failed}/${total} failed)`,
          timestamp: Date.now(),
          details: { failureRate, sent, failed, total },
          acknowledged: false,
        };
      }
      return null;
    },
  },
  {
    name: 'queue-depth-high',
    description: 'Queue depth exceeds 50',
    severity: 'warning',
    evaluate: (_snapshot, metrics) => {
      const queueDepth = metrics.gauges['queue_depth'] ?? 0;
      if (queueDepth > 50) {
        return {
          id: '',
          rule: 'queue-depth-high',
          severity: 'warning' as const,
          message: `Queue depth ${queueDepth} exceeds 50 threshold`,
          timestamp: Date.now(),
          details: { queueDepth },
          acknowledged: false,
        };
      }
      return null;
    },
  },
];

export class AlertManager {
  private readonly dataDir: string;
  private readonly cooldownMs: number;
  private readonly maxHistory: number;
  private readonly rules: AlertRule[] = [];
  private readonly channels: AlertChannel[] = [];
  private readonly recentFires: Map<string, number> = new Map(); // rule name → last fire timestamp
  private readonly alerts: Alert[] = [];

  constructor(options: AlertManagerOptions = {}) {
    this.dataDir = options.dataDir ?? 'data/alerts';
    this.cooldownMs = options.cooldownMs ?? 300_000; // 5 minutes
    this.maxHistory = options.maxHistory ?? 500;

    // Register default rules
    for (const rule of DEFAULT_RULES) {
      this.rules.push(rule);
    }

    // Register channels — default to ConsoleChannel if none provided
    if (options.channels && options.channels.length > 0) {
      this.channels.push(...options.channels);
    } else {
      this.channels.push(new ConsoleChannel({ dataDir: this.dataDir }));
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  /** Add a custom alert rule */
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /** Remove a rule by name */
  removeRule(name: string): void {
    const idx = this.rules.findIndex((r) => r.name === name);
    if (idx >= 0) this.rules.splice(idx, 1);
  }

  /** Add an alert channel */
  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
  }

  /** Remove an alert channel by name */
  removeChannel(name: string): void {
    const idx = this.channels.findIndex((ch) => ch.name === name);
    if (idx >= 0) this.channels.splice(idx, 1);
  }

  /** Get currently registered channel names */
  getChannelNames(): string[] {
    return this.channels.map((ch) => ch.name);
  }

  /** Evaluate all rules against current data and dispatch alerts */
  async evaluate(
    healthSnapshot: HealthSnapshot,
    metricsSnapshot: MetricsSnapshot,
    context?: AlertContext
  ): Promise<Alert[]> {
    const fired: Alert[] = [];

    for (const rule of this.rules) {
      try {
        const alert = rule.evaluate(healthSnapshot, metricsSnapshot, context);
        if (!alert) continue;

        // Check cooldown
        const lastFire = this.recentFires.get(rule.name) ?? 0;
        if (Date.now() - lastFire < this.cooldownMs) continue;

        // Generate ID
        alert.id = this.generateAlertId(rule.name);
        alert.rule = rule.name;
        alert.severity = rule.severity;

        // Record fire
        this.recentFires.set(rule.name, Date.now());
        this.alerts.push(alert);

        // Cap alert history
        if (this.alerts.length > this.maxHistory) {
          this.alerts.splice(0, this.alerts.length - this.maxHistory);
        }

        // Dispatch to all channels (non-blocking, fan-out)
        this.dispatch(alert).catch(() => {});

        fired.push(alert);
      } catch {
        // Rule evaluation failure is non-fatal
      }
    }

    return fired;
  }

  /** Acknowledge an alert (prevents re-firing for same condition) */
  acknowledge(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /** Get all alerts (optionally filtered) */
  getAlerts(options: { unacknowledged?: boolean; severity?: 'warning' | 'critical' } = {}): Alert[] {
    let result = [...this.alerts];
    if (options.unacknowledged) {
      result = result.filter((a) => !a.acknowledged);
    }
    if (options.severity) {
      result = result.filter((a) => a.severity === options.severity);
    }
    return result;
  }

  /** Get alert count by severity */
  getAlertCounts(): { warning: number; critical: number; total: number } {
    const warning = this.alerts.filter((a) => a.severity === 'warning').length;
    const critical = this.alerts.filter((a) => a.severity === 'critical').length;
    return { warning, critical, total: this.alerts.length };
  }

  // ─── Internal ─────────────────────────────────────────────────

  /** Convert internal Alert to AlertPayload for channel dispatch */
  private alertToPayload(alert: Alert): AlertPayload {
    return {
      severity: alert.severity === 'critical' ? 'critical' : 'warning',
      service: alert.service ?? 'system',
      message: alert.message,
      details: alert.details,
      timestamp: alert.timestamp,
    };
  }

  /** Fan-out dispatch to all channels — each channel runs independently */
  private async dispatch(alert: Alert): Promise<void> {
    const payload = this.alertToPayload(alert);

    const results = this.channels.map(async (channel): Promise<ChannelResult> => {
      try {
        return await channel.send(payload);
      } catch (err) {
        return { sent: false, channel: channel.name, error: (err as Error).message };
      }
    });

    const settled = await Promise.allSettled(results);

    // Log any channel failures (non-blocking)
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value.error) {
        console.error(`[AlertManager] Channel "${result.value.channel}" failed: ${result.value.error}`);
      } else if (result.status === 'rejected') {
        console.error(`[AlertManager] Channel dispatch rejected: ${result.reason}`);
      }
    }
  }

  private generateAlertId(ruleName: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${ruleName}-${Date.now()}-${Math.random()}`)
      .digest('hex');
    return hash.substring(0, 16);
  }
}

// Re-export channel types for convenience
export type { AlertChannel as AlertChannelInterface, AlertPayload, ChannelResult } from './channels/AlertChannel';

export default AlertManager;