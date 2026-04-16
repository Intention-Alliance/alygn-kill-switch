/**
 * DisasterRecoveryManager — H-110
 *
 * Manages disaster recovery plans: creation, recovery steps, testing,
 * RPO/RTO compliance checking, and audit logging integration.
 *
 * Methods:
 *   createPlan(name, rpo, rto)
 *   addRecoveryStep(planId, step)
 *   testPlan(planId)
 *   getPlans()
 *   getLastTestDate(planId)
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────

/** Recovery Point Objective in minutes — maximum tolerable data loss */
export type RPO = number;

/** Recovery Time Objective in minutes — maximum tolerable downtime */
export type RTO = number;

export type PlanStatus = 'draft' | 'active' | 'deprecated';

export type ComplianceStatus = 'compliant' | 'at_risk' | 'non_compliant';

export interface RecoveryStep {
  /** Step order (1-based, auto-assigned if omitted) */
  order: number;
  /** Short human-readable title */
  title: string;
  /** Detailed description of the step */
  description: string;
  /** Estimated time to complete in minutes */
  estimatedMinutes: number;
  /** Who or what is responsible */
  responsible: string;
}

export interface RecoveryTestResult {
  /** ISO-8601 timestamp of the test */
  timestamp: string;
  /** Whether the test passed */
  passed: boolean;
  /** Actual recovery time in minutes */
  actualRecoveryTimeMinutes: number;
  /** Actual data loss in minutes */
  actualDataLossMinutes: number;
  /** Notes from the test run */
  notes: string;
  /** RPO compliance at test time */
  rpoCompliant: boolean;
  /** RTO compliance at test time */
  rtoCompliant: boolean;
}

export interface DisasterRecoveryPlan {
  /** Unique plan identifier (uuid v4) */
  id: string;
  /** Human-readable plan name */
  name: string;
  /** Current plan status */
  status: PlanStatus;
  /** Recovery Point Objective in minutes */
  rpo: RPO;
  /** Recovery Time Objective in minutes */
  rto: RTO;
  /** Ordered recovery steps */
  steps: RecoveryStep[];
  /** Test history (most recent last) */
  testHistory: RecoveryTestResult[];
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last-update timestamp */
  updatedAt: string;
}

export interface ComplianceCheckResult {
  /** Overall compliance status */
  status: ComplianceStatus;
  /** RPO compliance details */
  rpo: {
    objective: number;
    lastActual: number | null;
    compliant: boolean;
  };
  /** RTO compliance details */
  rto: {
    objective: number;
    lastActual: number | null;
    compliant: boolean;
  };
  /** Days since last test (null if never tested) */
  daysSinceLastTest: number | null;
  /** Whether the plan has been tested at all */
  hasBeenTested: boolean;
}

export interface DisasterRecoveryManagerOptions {
  /** AuditLogger for recording DR events */
  auditLogger?: AuditLogger;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum days between tests before a plan is considered non-compliant */
const MAX_TEST_INTERVAL_DAYS = 90;

// ── Implementation ────────────────────────────────────────────────────

export class DisasterRecoveryManager {
  private readonly plans: Map<string, DisasterRecoveryPlan> = new Map();
  private readonly auditLogger: AuditLogger | null;

  constructor(opts: DisasterRecoveryManagerOptions = {}) {
    this.auditLogger = opts.auditLogger ?? null;
  }

  /** Inject or replace the AuditLogger */
  setAuditLogger(logger: AuditLogger): void {
    (this as unknown as { auditLogger: AuditLogger | null }).auditLogger = logger;
  }

  // ── Core Methods ────────────────────────────────────────────────

  /**
   * Create a new disaster recovery plan.
   * RPO and RTO must be positive integers (minutes).
   */
  async createPlan(
    name: string,
    rpo: RPO,
    rto: RTO,
  ): Promise<DisasterRecoveryPlan> {
    if (!name || name.trim().length === 0) {
      throw new Error('Plan name must be a non-empty string');
    }
    if (!Number.isInteger(rpo) || rpo <= 0) {
      throw new Error('RPO must be a positive integer (minutes)');
    }
    if (!Number.isInteger(rto) || rto <= 0) {
      throw new Error('RTO must be a positive integer (minutes)');
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const plan: DisasterRecoveryPlan = {
      id,
      name: name.trim(),
      status: 'draft',
      rpo,
      rto,
      steps: [],
      testHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    this.plans.set(id, plan);

    await this.auditLog('dr.plan.created', id, {
      name: plan.name,
      rpo,
      rto,
    });

    return { ...plan, steps: [...plan.steps], testHistory: [...plan.testHistory] };
  }

  /**
   * Add a recovery step to a plan.
   * If step.order is omitted or <= 0, it is auto-assigned as the next order.
   */
  async addRecoveryStep(
    planId: string,
    step: Omit<RecoveryStep, 'order'> & { order?: number },
  ): Promise<DisasterRecoveryPlan> {
    const plan = this.getPlanOrThrow(planId);

    if (!step.title || step.title.trim().length === 0) {
      throw new Error('Recovery step title must be a non-empty string');
    }
    if (typeof step.estimatedMinutes !== 'number' || step.estimatedMinutes <= 0) {
      throw new Error('Recovery step estimatedMinutes must be a positive number');
    }

    const order = step.order && step.order > 0
      ? step.order
      : plan.steps.length + 1;

    const fullStep: RecoveryStep = {
      order,
      title: step.title.trim(),
      description: step.description?.trim() ?? '',
      estimatedMinutes: step.estimatedMinutes,
      responsible: step.responsible?.trim() ?? '',
    };

    // Insert step at the right position and re-index
    plan.steps.push(fullStep);
    plan.steps.sort((a, b) => a.order - b.order);
    // Re-index to ensure contiguous ordering
    for (let i = 0; i < plan.steps.length; i++) {
      plan.steps[i].order = i + 1;
    }

    plan.updatedAt = new Date().toISOString();

    await this.auditLog('dr.plan.stepAdded', planId, {
      stepOrder: fullStep.order,
      stepTitle: fullStep.title,
      estimatedMinutes: fullStep.estimatedMinutes,
    });

    return { ...plan, steps: [...plan.steps], testHistory: [...plan.testHistory] };
  }

  /**
   * Execute a test of a disaster recovery plan.
   * Records actual recovery time and data loss, checks RPO/RTO compliance.
   */
  async testPlan(
    planId: string,
    result?: {
      passed?: boolean;
      actualRecoveryTimeMinutes?: number;
      actualDataLossMinutes?: number;
      notes?: string;
    },
  ): Promise<RecoveryTestResult> {
    const plan = this.getPlanOrThrow(planId);

    if (plan.steps.length === 0) {
      throw new Error(`Cannot test plan '${plan.name}' — no recovery steps defined`);
    }

    const actualRecoveryTimeMinutes = result?.actualRecoveryTimeMinutes ?? 0;
    const actualDataLossMinutes = result?.actualDataLossMinutes ?? 0;

    const rpoCompliant = actualDataLossMinutes <= plan.rpo;
    const rtoCompliant = actualRecoveryTimeMinutes <= plan.rto;
    const passed = result?.passed ?? (rpoCompliant && rtoCompliant);

    const testResult: RecoveryTestResult = {
      timestamp: new Date().toISOString(),
      passed,
      actualRecoveryTimeMinutes,
      actualDataLossMinutes,
      notes: result?.notes?.trim() ?? '',
      rpoCompliant,
      rtoCompliant,
    };

    plan.testHistory.push(testResult);
    plan.updatedAt = new Date().toISOString();

    // Auto-activate draft plans after a successful test
    if (plan.status === 'draft' && passed) {
      plan.status = 'active';
    }

    await this.auditLog('dr.plan.tested', planId, {
      passed,
      rpoCompliant,
      rtoCompliant,
      actualRecoveryTimeMinutes,
      actualDataLossMinutes,
    });

    return { ...testResult };
  }

  /**
   * Get all disaster recovery plans.
   * Returns shallow copies sorted by name.
   */
  getPlans(): DisasterRecoveryPlan[] {
    const result = Array.from(this.plans.values()).map((p) => ({
      ...p,
      steps: [...p.steps],
      testHistory: [...p.testHistory],
    }));

    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }

  /**
   * Get the ISO-8601 date of the last test for a plan.
   * Returns null if the plan has never been tested.
   */
  getLastTestDate(planId: string): string | null {
    const plan = this.getPlanOrThrow(planId);

    if (plan.testHistory.length === 0) {
      return null;
    }

    return plan.testHistory[plan.testHistory.length - 1].timestamp;
  }

  // ── Compliance Checking ─────────────────────────────────────────

  /**
   * Check RPO/RTO compliance for a plan.
   * Evaluates last test results against objectives and test recency.
   */
  checkCompliance(planId: string): ComplianceCheckResult {
    const plan = this.getPlanOrThrow(planId);

    const lastTest = plan.testHistory.length > 0
      ? plan.testHistory[plan.testHistory.length - 1]
      : null;

    const rpoCompliant = lastTest ? lastTest.rpoCompliant : false;
    const rtoCompliant = lastTest ? lastTest.rtoCompliant : false;

    let daysSinceLastTest: number | null = null;
    if (lastTest) {
      const lastDate = new Date(lastTest.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - lastDate.getTime();
      daysSinceLastTest = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    const hasBeenTested = lastTest !== null;
    const testRecencyOk = daysSinceLastTest !== null && daysSinceLastTest <= MAX_TEST_INTERVAL_DAYS;

    // Determine overall status
    let status: ComplianceStatus;
    if (!hasBeenTested) {
      status = 'non_compliant';
    } else if (rpoCompliant && rtoCompliant && testRecencyOk) {
      status = 'compliant';
    } else if (rpoCompliant && rtoCompliant && !testRecencyOk) {
      status = 'at_risk';
    } else {
      status = 'non_compliant';
    }

    return {
      status,
      rpo: {
        objective: plan.rpo,
        lastActual: lastTest?.actualDataLossMinutes ?? null,
        compliant: rpoCompliant,
      },
      rto: {
        objective: plan.rto,
        lastActual: lastTest?.actualRecoveryTimeMinutes ?? null,
        compliant: rtoCompliant,
      },
      daysSinceLastTest,
      hasBeenTested,
    };
  }

  // ── Accessors ───────────────────────────────────────────────────

  /** Get a single plan by id (returns null if not found) */
  getPlan(id: string): DisasterRecoveryPlan | null {
    const plan = this.plans.get(id);
    if (!plan) return null;
    return { ...plan, steps: [...plan.steps], testHistory: [...plan.testHistory] };
  }

  // ── Private Helpers ────────────────────────────────────────────

  private getPlanOrThrow(id: string): DisasterRecoveryPlan {
    const plan = this.plans.get(id);
    if (!plan) {
      throw new Error(`Disaster recovery plan not found: ${id}`);
    }
    return plan;
  }

  private async auditLog(
    action: string,
    target: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditLogger) return;

    try {
      await this.auditLogger.log(
        'DisasterRecoveryManager',
        action,
        target,
        details,
        'success',
      );
    } catch {
      // Audit write failure must not block DR operations
    }
  }
}

export default DisasterRecoveryManager;