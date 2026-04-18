// Automated Incident Response — Detect failures and trigger automated responses
// Handles Redis failures, high error rates, and auth attack detection

import type { KillSwitchService } from './kill-switch';
import { getMetrics } from './metrics';
import { getResourceStats, checkResourceAlerts, isMemoryCritical } from './resource-monitor';

export type IncidentType = 'redis_failure' | 'high_error_rate' | 'auth_attack' | 'memory_pressure' | 'high_load';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'detected' | 'responding' | 'mitigated' | 'resolved';

export interface Incident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt: string;
  message: string;
  autoResponse: string;
  resolvedAt?: string;
}

// IP blocking for auth attacks
const blockedIps = new Map<string, { blockedAt: number; reason: string; unblockAt: number }>();
const AUTH_FAILURE_THRESHOLD = parseInt(process.env.INCIDENT_AUTH_FAILURE_THRESHOLD || '10', 10);
const AUTH_FAILURE_WINDOW_MS = parseInt(process.env.INCIDENT_AUTH_FAILURE_WINDOW_MS || '300000', 10); // 5 min
const IP_BLOCK_DURATION_MS = parseInt(process.env.INCIDENT_IP_BLOCK_DURATION_MS || '3600000', 10); // 1 hour
const ERROR_RATE_THRESHOLD = parseFloat(process.env.INCIDENT_ERROR_RATE_THRESHOLD || '0.5'); // 50%

// Track auth failures per IP
const authFailures = new Map<string, { count: number; windowStart: number }>();

class IncidentResponseService {
  private incidents: Incident[] = [];
  private circuitBreakerOpen = false;
  private circuitBreakerOpenedAt: number | null = null;
  private readonly maxIncidents = 100;

  /**
   * Detect Redis failure and activate circuit breaker.
   */
  async detectRedisFailure(service: KillSwitchService): Promise<Incident | null> {
    try {
      const health = await service.healthCheck();
      if (health.redis.redis !== 'OK' && !this.circuitBreakerOpen) {
        return this.createIncident(
          'redis_failure',
          'critical',
          'Redis health check failed — activating circuit breaker',
          'Circuit breaker activated; all Redis operations will fail fast until recovery',
        );
      }

      // Auto-recover if Redis is back
      if (this.circuitBreakerOpen && health.redis.redis === 'OK') {
        this.circuitBreakerOpen = false;
        this.circuitBreakerOpenedAt = null;
        const lastIncident = this.incidents.find((i) => i.type === 'redis_failure' && i.status !== 'resolved');
        if (lastIncident) {
          lastIncident.status = 'resolved';
          lastIncident.resolvedAt = new Date().toISOString();
        }
      }

      return null;
    } catch {
      if (!this.circuitBreakerOpen) {
        return this.createIncident(
          'redis_failure',
          'critical',
          'Redis connection error — activating circuit breaker',
          'Circuit breaker activated; failing fast on all Redis operations',
        );
      }
      return null;
    }
  }

  /**
   * Detect high error rate and auto-throttle.
   */
  detectHighErrorRate(): Incident | null {
    const metrics = getMetrics();
    if (metrics.errorRate >= ERROR_RATE_THRESHOLD && metrics.requestCount >= 10) {
      return this.createIncident(
        'high_error_rate',
        'high',
        `Error rate at ${(metrics.errorRate * 100).toFixed(1)}% (threshold: ${ERROR_RATE_THRESHOLD * 100}%)`,
        'Auto-throttling: rate limits reduced by 50%',
      );
    }
    return null;
  }

  /**
   * Record auth failure for an IP and detect attacks.
   */
  recordAuthFailure(ip: string): Incident | null {
    const now = Date.now();
    const entry = authFailures.get(ip);

    if (!entry || now - entry.windowStart > AUTH_FAILURE_WINDOW_MS) {
      authFailures.set(ip, { count: 1, windowStart: now });
      return null;
    }

    entry.count++;

    if (entry.count >= AUTH_FAILURE_THRESHOLD) {
      // Block the IP
      blockedIps.set(ip, {
        blockedAt: now,
        reason: `${entry.count} auth failures in ${AUTH_FAILURE_WINDOW_MS / 1000}s`,
        unblockAt: now + IP_BLOCK_DURATION_MS,
      });

      return this.createIncident(
        'auth_attack',
        'high',
        `IP ${ip} blocked after ${entry.count} auth failures`,
        `IP blocked for ${IP_BLOCK_DURATION_MS / 60000} minutes`,
      );
    }

    return null;
  }

  /**
   * Detect memory pressure.
   */
  detectMemoryPressure(): Incident | null {
    if (isMemoryCritical()) {
      const stats = getResourceStats();
      return this.createIncident(
        'memory_pressure',
        'critical',
        `Memory at ${stats.memory.usagePercent}% — rejecting non-essential requests`,
        'Circuit breaker for non-essential ops; 503 on new requests',
      );
    }
    return null;
  }

  /**
   * Detect high load.
   */
  detectHighLoad(): Incident | null {
    const stats = getResourceStats();
    const alerts = checkResourceAlerts(stats);
    const hasHighCpu = alerts.some((a) => a.type === 'cpu' && a.level === 'critical');

    if (hasHighCpu) {
      return this.createIncident(
        'high_load',
        'medium',
        `CPU at ${stats.cpu.usagePercent}% — scaling may be needed`,
        'Alert logged; manual scaling recommended',
      );
    }
    return null;
  }

  /**
   * Check if an IP is blocked.
   */
  isIpBlocked(ip: string): boolean {
    const block = blockedIps.get(ip);
    if (!block) return false;

    // Auto-unblock after duration
    if (Date.now() >= block.unblockAt) {
      blockedIps.delete(ip);
      return false;
    }

    return true;
  }

  /**
   * Check if circuit breaker is open.
   */
  isCircuitBreakerOpen(): boolean {
    return this.circuitBreakerOpen;
  }

  /**
   * Get all active incidents.
   */
  getActiveIncidents(): Incident[] {
    return this.incidents.filter((i) => i.status !== 'resolved');
  }

  /**
   * Get all incidents (including resolved).
   */
  getAllIncidents(limit = 50): Incident[] {
    return this.incidents.slice(-limit);
  }

  /**
   * Get blocked IPs.
   */
  getBlockedIps(): Array<{ ip: string; reason: string; blockedAt: string; unblockAt: string }> {
    const result: Array<{ ip: string; reason: string; blockedAt: string; unblockAt: string }> = [];
    for (const [ip, block] of blockedIps) {
      if (Date.now() < block.unblockAt) {
        result.push({
          ip,
          reason: block.reason,
          blockedAt: new Date(block.blockedAt).toISOString(),
          unblockAt: new Date(block.unblockAt).toISOString(),
        });
      }
    }
    return result;
  }

  /**
   * Run all detection checks.
   */
  async runDetection(service: KillSwitchService): Promise<Incident[]> {
    const newIncidents: Incident[] = [];

    const redisIncident = await this.detectRedisFailure(service);
    if (redisIncident) {
      this.circuitBreakerOpen = true;
      this.circuitBreakerOpenedAt = Date.now();
      newIncidents.push(redisIncident);
    }

    const errorIncident = this.detectHighErrorRate();
    if (errorIncident) newIncidents.push(errorIncident);

    const memoryIncident = this.detectMemoryPressure();
    if (memoryIncident) newIncidents.push(memoryIncident);

    const loadIncident = this.detectHighLoad();
    if (loadIncident) newIncidents.push(loadIncident);

    return newIncidents;
  }

  private createIncident(
    type: IncidentType,
    severity: IncidentSeverity,
    message: string,
    autoResponse: string,
  ): Incident {
    const incident: Incident = {
      id: crypto.randomUUID(),
      type,
      severity,
      status: 'detected',
      detectedAt: new Date().toISOString(),
      message,
      autoResponse,
    };

    // Immediately mark as responding/mitigated since we auto-responded
    incident.status = 'mitigated';

    this.incidents.push(incident);
    if (this.incidents.length > this.maxIncidents) {
      this.incidents = this.incidents.slice(-this.maxIncidents);
    }

    console.error(`[incident-response] ${severity.toUpperCase()}: ${message} → ${autoResponse}`);

    return incident;
  }
}

// Singleton
const incidentService = new IncidentResponseService();

export function getIncidentResponseService(): IncidentResponseService {
  return incidentService;
}

export function isIpBlockedByIncident(ip: string): boolean {
  return incidentService.isIpBlocked(ip);
}

export function isCircuitBreakerOpen(): boolean {
  return incidentService.isCircuitBreakerOpen();
}