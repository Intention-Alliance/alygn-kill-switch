/**
 * IncidentResponseManager — H-106
 *
 * Manages security incident lifecycle: creation, updates, escalation,
 * resolution, and timeline tracking. Integrates with AuditLogger for
 * immutable audit trails and PolicyEnforcer for policy-driven responses.
 *
 * Methods:
 *   createIncident(type, severity, description)
 *   updateIncident(id, status, notes)
 *   escalateIncident(id, newSeverity)
 *   resolveIncident(id, resolution)
 *   getActiveIncidents()
 *   getIncidentTimeline(id)
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import type { AuditLogger } from '../audit/AuditLogger';
import type { PolicyEnforcer } from './PolicyEnforcer';

// ── Types ──────────────────────────────────────────────────────────────

export type IncidentType =
  | 'dataBreach'
  | 'unauthorizedAccess'
  | 'systemCompromise'
  | 'policyViolation'
  | 'suspiciousActivity';

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export type IncidentStatus =
  | 'open'
  | 'investigating'
  | 'contained'
  | 'resolved'
  | 'closed';

export interface Incident {
  /** Unique incident identifier (uuid v4) */
  id: string;
  /** Classification of the incident */
  type: IncidentType;
  /** Current severity level */
  severity: IncidentSeverity;
  /** Current status */
  status: IncidentStatus;
  /** Human-readable description */
  description: string;
  /** Resolution summary (set when resolved) */
  resolution: string | null;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last-update timestamp */
  updatedAt: string;
  /** ISO-8601 resolution timestamp */
  resolvedAt: string | null;
  /** Chronological timeline entries */
  timeline: IncidentTimelineEntry[];
}

export interface IncidentTimelineEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** What happened */
  event: string;
  /** Who or what triggered the event */
  actor: string;
  /** Additional structured details */
  details: Record<string, unknown>;
}

export interface IncidentResponseManagerOptions {
  /** AuditLogger for recording incident events */
  auditLogger?: AuditLogger;
  /** PolicyEnforcer for policy-driven escalation checks */
  policyEnforcer?: PolicyEnforcer;
}

// ── Constants ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['investigating', 'contained', 'resolved', 'closed'],
  investigating: ['contained', 'resolved', 'closed'],
  contained: ['investigating', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

// ── Implementation ────────────────────────────────────────────────────

export class IncidentResponseManager {
  private readonly incidents: Map<string, Incident> = new Map();
  private readonly auditLogger: AuditLogger | null;
  private readonly policyEnforcer: PolicyEnforcer | null;

  constructor(opts: IncidentResponseManagerOptions = {}) {
    this.auditLogger = opts.auditLogger ?? null;
    this.policyEnforcer = opts.policyEnforcer ?? null;
  }

  /** Inject or replace the AuditLogger */
  setAuditLogger(logger: AuditLogger): void {
    (this as unknown as { auditLogger: AuditLogger | null }).auditLogger = logger;
  }

  /** Inject or replace the PolicyEnforcer */
  setPolicyEnforcer(enforcer: PolicyEnforcer): void {
    (this as unknown as { policyEnforcer: PolicyEnforcer | null }).policyEnforcer = enforcer;
  }

  // ── Core Methods ────────────────────────────────────────────────

  /**
   * Create a new security incident.
   * Logs the creation to AuditLogger and checks PolicyEnforcer for
   * policy violations that may warrant automatic escalation.
   */
  async createIncident(
    type: IncidentType,
    severity: IncidentSeverity,
    description: string,
  ): Promise<Incident> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const incident: Incident = {
      id,
      type,
      severity,
      status: 'open',
      description,
      resolution: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      timeline: [
        {
          timestamp: now,
          event: 'incident.created',
          actor: 'system',
          details: { type, severity, description },
        },
      ],
    };

    this.incidents.set(id, incident);

    // Audit log the creation
    await this.auditLog('incident.created', id, {
      type,
      severity,
      description,
    });

    // Auto-escalate critical data breaches via PolicyEnforcer
    if (this.policyEnforcer && type === 'dataBreach' && severity === 'critical') {
      await this.policyEnforcerCheck(id, type, severity);
    }

    return { ...incident, timeline: [...incident.timeline] };
  }

  /**
   * Update an incident's status and/or add notes.
   * Validates status transitions and records the change in the timeline.
   */
  async updateIncident(
    id: string,
    status: IncidentStatus,
    notes?: string,
  ): Promise<Incident> {
    const incident = this.getIncidentOrThrow(id);

    // Validate status transition
    const allowed = VALID_TRANSITIONS[incident.status];
    if (!allowed.includes(status)) {
      throw new Error(
        `Invalid status transition: ${incident.status} → ${status}. ` +
        `Allowed from '${incident.status}': [${allowed.join(', ')}]`,
      );
    }

    const now = new Date().toISOString();
    const prevStatus = incident.status;
    incident.status = status;
    incident.updatedAt = now;

    incident.timeline.push({
      timestamp: now,
      event: 'incident.updated',
      actor: 'system',
      details: {
        previousStatus: prevStatus,
        newStatus: status,
        notes: notes ?? null,
      },
    });

    await this.auditLog('incident.updated', id, {
      previousStatus: prevStatus,
      newStatus: status,
      notes: notes ?? null,
    });

    return { ...incident, timeline: [...incident.timeline] };
  }

  /**
   * Escalate an incident to a higher severity.
   * Only allows escalation (not de-escalation). Records the change
   * and triggers PolicyEnforcer check for critical-level escalations.
   */
  async escalateIncident(
    id: string,
    newSeverity: IncidentSeverity,
  ): Promise<Incident> {
    const incident = this.getIncidentOrThrow(id);

    if (SEVERITY_ORDER[newSeverity] <= SEVERITY_ORDER[incident.severity]) {
      throw new Error(
        `Escalation must increase severity. Current: ${incident.severity} (${SEVERITY_ORDER[incident.severity]}), ` +
        `Requested: ${newSeverity} (${SEVERITY_ORDER[newSeverity]})`,
      );
    }

    const now = new Date().toISOString();
    const prevSeverity = incident.severity;
    incident.severity = newSeverity;
    incident.updatedAt = now;

    incident.timeline.push({
      timestamp: now,
      event: 'incident.escalated',
      actor: 'system',
      details: {
        previousSeverity: prevSeverity,
        newSeverity,
      },
    });

    await this.auditLog('incident.escalated', id, {
      previousSeverity: prevSeverity,
      newSeverity,
    });

    // PolicyEnforcer check on critical escalation
    if (this.policyEnforcer && newSeverity === 'critical') {
      await this.policyEnforcerCheck(id, incident.type, newSeverity);
    }

    return { ...incident, timeline: [...incident.timeline] };
  }

  /**
   * Resolve an incident with a resolution summary.
   * Sets status to 'resolved', records resolution, and timestamps.
   */
  async resolveIncident(
    id: string,
    resolution: string,
  ): Promise<Incident> {
    const incident = this.getIncidentOrThrow(id);

    if (incident.status === 'resolved' || incident.status === 'closed') {
      throw new Error(
        `Cannot resolve incident in '${incident.status}' status. Incident id: ${id}`,
      );
    }

    const now = new Date().toISOString();
    const prevStatus = incident.status;
    incident.status = 'resolved';
    incident.resolution = resolution;
    incident.resolvedAt = now;
    incident.updatedAt = now;

    incident.timeline.push({
      timestamp: now,
      event: 'incident.resolved',
      actor: 'system',
      details: {
        previousStatus: prevStatus,
        resolution,
      },
    });

    await this.auditLog('incident.resolved', id, {
      previousStatus: prevStatus,
      resolution,
    });

    return { ...incident, timeline: [...incident.timeline] };
  }

  /**
   * Get all active (non-closed, non-resolved) incidents.
   * Returns a shallow copy array sorted by severity (critical first),
   * then by creation date (newest first).
   */
  getActiveIncidents(): Incident[] {
    const active: Incident[] = [];
    for (const incident of this.incidents.values()) {
      if (incident.status !== 'resolved' && incident.status !== 'closed') {
        active.push({ ...incident, timeline: [...incident.timeline] });
      }
    }

    active.sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return active;
  }

  /**
   * Get the full timeline for an incident.
   * Returns a copy of the timeline entries in chronological order.
   */
  getIncidentTimeline(id: string): IncidentTimelineEntry[] {
    const incident = this.getIncidentOrThrow(id);
    return [...incident.timeline];
  }

  // ── Accessors ───────────────────────────────────────────────────

  /** Get a single incident by id (returns null if not found) */
  getIncident(id: string): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident) return null;
    return { ...incident, timeline: [...incident.timeline] };
  }

  /** Get all incidents (including resolved/closed) */
  getAllIncidents(): Incident[] {
    return Array.from(this.incidents.values()).map((i) => ({
      ...i,
      timeline: [...i.timeline],
    }));
  }

  // ── Private Helpers ────────────────────────────────────────────

  private getIncidentOrThrow(id: string): Incident {
    const incident = this.incidents.get(id);
    if (!incident) {
      throw new Error(`Incident not found: ${id}`);
    }
    return incident;
  }

  private async auditLog(
    action: string,
    target: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditLogger) return;

    try {
      await this.auditLogger.log(
        'IncidentResponseManager',
        action,
        target,
        details,
        'success',
      );
    } catch {
      // Audit write failure must not block incident operations
    }
  }

  /**
   * Check policy via PolicyEnforcer for critical incidents.
   * If the policy denies the action, log the denial but don't block
   * the incident operation — incidents must always be recordable.
   */
  private async policyEnforcerCheck(
    incidentId: string,
    type: IncidentType,
    severity: IncidentSeverity,
  ): Promise<void> {
    if (!this.policyEnforcer) return;

    try {
      const result = await this.policyEnforcer.enforce('api.write', {
        source: 'IncidentResponseManager',
        recipient: incidentId,
        metadata: { incidentType: type, incidentSeverity: severity },
      });

      if (!result.allowed) {
        await this.auditLog('incident.policyDenied', incidentId, {
          incidentType: type,
          incidentSeverity: severity,
          policyReason: result.policyResult.reason,
        });
      }
    } catch {
      // PolicyEnforcer failure must not block incident operations
    }
  }
}

export default IncidentResponseManager;