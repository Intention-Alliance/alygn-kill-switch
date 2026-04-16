/**
 * BusinessContinuityManager — H-111
 *
 * Manages business continuity plans: creation, dependency tracking,
 * impact assessment, and continuity reporting. Integrates with
 * AuditLogger for immutable audit trails.
 *
 * Methods:
 *   createPlan(name, criticalFunctions, maxDowntime)
 *   addDependency(planId, dependency)
 *   assessImpact(planId)
 *   getActivePlans()
 *   generateContinuityReport()
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────

export type ContinuityPlanStatus = 'draft' | 'active' | 'suspended' | 'deprecated';

export type ImpactLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface CriticalFunction {
  /** Function name */
  name: string;
  /** Priority rank (1 = highest) */
  priority: number;
  /** Estimated revenue impact per hour of downtime (USD) */
  revenueImpactPerHour: number;
}

export interface Dependency {
  /** Dependency name (e.g. "AWS us-east-1", "Stripe API") */
  name: string;
  /** Type of dependency */
  type: 'infrastructure' | 'service' | 'vendor' | 'personnel' | 'data';
  /** How critical this dependency is to the plan */
  criticality: ImpactLevel;
  /** Fallback or mitigation if this dependency fails */
  fallback: string;
}

export interface ImpactAssessment {
  /** ISO-8601 timestamp of the assessment */
  assessedAt: string;
  /** Overall impact level */
  overallImpact: ImpactLevel;
  /** Maximum tolerable downtime in minutes */
  maxDowntimeMinutes: number;
  /** Estimated total revenue at risk (USD) */
  revenueAtRisk: number;
  /** Number of critical dependencies without fallbacks */
  unmitigatedDependencies: number;
  /** Per-function impact breakdown */
  functionImpacts: Array<{
    function: string;
    impact: ImpactLevel;
    revenueAtRisk: number;
    dependenciesAtRisk: number;
  }>;
  /** Recommendations for reducing risk */
  recommendations: string[];
}

export interface ContinuityPlan {
  /** Unique plan identifier (uuid v4) */
  id: string;
  /** Human-readable plan name */
  name: string;
  /** Current plan status */
  status: ContinuityPlanStatus;
  /** Critical business functions covered by this plan */
  criticalFunctions: CriticalFunction[];
  /** Maximum tolerable downtime in minutes */
  maxDowntimeMinutes: number;
  /** Dependencies tracked for this plan */
  dependencies: Dependency[];
  /** Impact assessments (most recent last) */
  impactAssessments: ImpactAssessment[];
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last-update timestamp */
  updatedAt: string;
}

export interface ContinuityReport {
  /** ISO-8601 generation timestamp */
  generatedAt: string;
  /** Total number of plans */
  totalPlans: number;
  /** Number of active plans */
  activePlans: number;
  /** Plans by status */
  plansByStatus: Record<ContinuityPlanStatus, number>;
  /** Overall risk summary */
  overallRisk: ImpactLevel;
  /** Total revenue at risk across all active plans */
  totalRevenueAtRisk: number;
  /** Plans with unmitigated critical dependencies */
  plansWithGaps: Array<{
    planId: string;
    planName: string;
    unmitigatedCount: number;
  }>;
  /** Plans that need reassessment (>30 days since last assessment) */
  stalePlans: Array<{
    planId: string;
    planName: string;
    daysSinceLastAssessment: number | null;
  }>;
  /** Top recommendations across all plans */
  topRecommendations: string[];
}

export interface BusinessContinuityManagerOptions {
  /** AuditLogger for recording continuity events */
  auditLogger?: AuditLogger;
}

// ── Constants ──────────────────────────────────────────────────────────

const IMPACT_ORDER: Record<ImpactLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Days before a plan is considered stale (needs reassessment) */
const STALE_THRESHOLD_DAYS = 30;

// ── Implementation ────────────────────────────────────────────────────

export class BusinessContinuityManager {
  private readonly plans: Map<string, ContinuityPlan> = new Map();
  private readonly auditLogger: AuditLogger | null;

  constructor(opts: BusinessContinuityManagerOptions = {}) {
    this.auditLogger = opts.auditLogger ?? null;
  }

  /** Inject or replace the AuditLogger */
  setAuditLogger(logger: AuditLogger): void {
    (this as unknown as { auditLogger: AuditLogger | null }).auditLogger = logger;
  }

  // ── Core Methods ────────────────────────────────────────────────

  /**
   * Create a new business continuity plan.
   * Requires at least one critical function and a positive maxDowntime.
   */
  async createPlan(
    name: string,
    criticalFunctions: CriticalFunction[],
    maxDowntime: number,
  ): Promise<ContinuityPlan> {
    if (!name || name.trim().length === 0) {
      throw new Error('Plan name must be a non-empty string');
    }
    if (!Array.isArray(criticalFunctions) || criticalFunctions.length === 0) {
      throw new Error('At least one critical function is required');
    }
    if (!Number.isInteger(maxDowntime) || maxDowntime <= 0) {
      throw new Error('Max downtime must be a positive integer (minutes)');
    }

    // Validate critical functions
    for (const fn of criticalFunctions) {
      if (!fn.name || fn.name.trim().length === 0) {
        throw new Error('Critical function name must be a non-empty string');
      }
      if (typeof fn.priority !== 'number' || fn.priority < 1) {
        throw new Error(`Critical function '${fn.name}' priority must be >= 1`);
      }
      if (typeof fn.revenueImpactPerHour !== 'number' || fn.revenueImpactPerHour < 0) {
        throw new Error(`Critical function '${fn.name}' revenueImpactPerHour must be >= 0`);
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const plan: ContinuityPlan = {
      id,
      name: name.trim(),
      status: 'draft',
      criticalFunctions: criticalFunctions.map((fn) => ({
        name: fn.name.trim(),
        priority: fn.priority,
        revenueImpactPerHour: fn.revenueImpactPerHour,
      })),
      maxDowntimeMinutes: maxDowntime,
      dependencies: [],
      impactAssessments: [],
      createdAt: now,
      updatedAt: now,
    };

    this.plans.set(id, plan);

    await this.auditLog('bc.plan.created', id, {
      name: plan.name,
      criticalFunctionCount: plan.criticalFunctions.length,
      maxDowntimeMinutes: maxDowntime,
    });

    return {
      ...plan,
      criticalFunctions: [...plan.criticalFunctions],
      dependencies: [...plan.dependencies],
      impactAssessments: [...plan.impactAssessments],
    };
  }

  /**
   * Add a dependency to a continuity plan.
   * Dependencies represent external systems, vendors, or resources
   * that the plan's critical functions rely on.
   */
  async addDependency(
    planId: string,
    dependency: Dependency,
  ): Promise<ContinuityPlan> {
    const plan = this.getPlanOrThrow(planId);

    if (!dependency.name || dependency.name.trim().length === 0) {
      throw new Error('Dependency name must be a non-empty string');
    }
    if (!['infrastructure', 'service', 'vendor', 'personnel', 'data'].includes(dependency.type)) {
      throw new Error(
        `Invalid dependency type: '${dependency.type}'. ` +
        `Must be one of: infrastructure, service, vendor, personnel, data`,
      );
    }
    if (!IMPACT_ORDER.hasOwnProperty(dependency.criticality)) {
      throw new Error(`Invalid dependency criticality: '${dependency.criticality}'`);
    }

    const dep: Dependency = {
      name: dependency.name.trim(),
      type: dependency.type,
      criticality: dependency.criticality,
      fallback: dependency.fallback?.trim() ?? '',
    };

    plan.dependencies.push(dep);
    plan.updatedAt = new Date().toISOString();

    await this.auditLog('bc.plan.dependencyAdded', planId, {
      dependencyName: dep.name,
      dependencyType: dep.type,
      criticality: dep.criticality,
      hasFallback: dep.fallback.length > 0,
    });

    return {
      ...plan,
      criticalFunctions: [...plan.criticalFunctions],
      dependencies: [...plan.dependencies],
      impactAssessments: [...plan.impactAssessments],
    };
  }

  /**
   * Assess the impact of a disruption to the plan's critical functions.
   * Evaluates dependencies, revenue at risk, and produces recommendations.
   * Stores the assessment in the plan's history.
   */
  async assessImpact(planId: string): Promise<ImpactAssessment> {
    const plan = this.getPlanOrThrow(planId);

    if (plan.criticalFunctions.length === 0) {
      throw new Error(`Cannot assess plan '${plan.name}' — no critical functions defined`);
    }

    // Calculate per-function impacts
    const functionImpacts: ImpactAssessment['functionImpacts'] = plan.criticalFunctions.map((fn) => {
      // Find dependencies relevant to this function (all deps affect all functions for now)
      const depsAtRisk = plan.dependencies.filter(
        (d) => IMPACT_ORDER[d.criticality] >= IMPACT_ORDER.high && !d.fallback,
      ).length;

      const revenueAtRisk = fn.revenueImpactPerHour * (plan.maxDowntimeMinutes / 60);

      // Determine impact level based on priority, revenue, and unmitigated deps
      let impact: ImpactLevel = 'low';
      if (fn.priority === 1 && revenueAtRisk > 10000) {
        impact = 'critical';
      } else if (fn.priority <= 2 && revenueAtRisk > 5000) {
        impact = 'high';
      } else if (revenueAtRisk > 1000 || depsAtRisk > 0) {
        impact = 'medium';
      }

      return {
        function: fn.name,
        impact,
        revenueAtRisk,
        dependenciesAtRisk: depsAtRisk,
      };
    });

    // Aggregate totals
    const totalRevenueAtRisk = functionImpacts.reduce((sum, fi) => sum + fi.revenueAtRisk, 0);
    const unmitigatedDeps = plan.dependencies.filter(
      (d) => IMPACT_ORDER[d.criticality] >= IMPACT_ORDER.high && !d.fallback,
    ).length;

    // Determine overall impact
    const maxFunctionImpact = functionImpacts.reduce(
      (max, fi) => (IMPACT_ORDER[fi.impact] > max ? IMPACT_ORDER[fi.impact] : max),
      IMPACT_ORDER.none,
    );

    let overallImpact: ImpactLevel;
    if (unmitigatedDeps > 0 && maxFunctionImpact >= IMPACT_ORDER.high) {
      overallImpact = 'critical';
    } else if (maxFunctionImpact >= IMPACT_ORDER.high || unmitigatedDeps > 2) {
      overallImpact = 'high';
    } else if (maxFunctionImpact >= IMPACT_ORDER.medium || unmitigatedDeps > 0) {
      overallImpact = 'medium';
    } else if (maxFunctionImpact >= IMPACT_ORDER.low) {
      overallImpact = 'low';
    } else {
      overallImpact = 'none';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (unmitigatedDeps > 0) {
      recommendations.push(
        `Add fallback strategies for ${unmitigatedDeps} high/critical dependencies without fallbacks`,
      );
    }

    const highImpactFns = functionImpacts.filter((fi) => IMPACT_ORDER[fi.impact] >= IMPACT_ORDER.high);
    if (highImpactFns.length > 0) {
      recommendations.push(
        `Review and reduce exposure for high-impact functions: ${highImpactFns.map((fi) => fi.function).join(', ')}`,
      );
    }

    if (totalRevenueAtRisk > 50000) {
      recommendations.push(
        `Revenue at risk ($${totalRevenueAtRisk.toFixed(2)}) exceeds $50,000 — consider additional redundancy`,
      );
    }

    if (plan.dependencies.length === 0) {
      recommendations.push('No dependencies mapped — identify and document all critical dependencies');
    }

    if (recommendations.length === 0) {
      recommendations.push('Plan appears well-mitigated — continue regular reassessments');
    }

    const assessment: ImpactAssessment = {
      assessedAt: new Date().toISOString(),
      overallImpact,
      maxDowntimeMinutes: plan.maxDowntimeMinutes,
      revenueAtRisk: totalRevenueAtRisk,
      unmitigatedDependencies: unmitigatedDeps,
      functionImpacts,
      recommendations,
    };

    plan.impactAssessments.push(assessment);
    plan.updatedAt = new Date().toISOString();

    // Auto-activate draft plans after a favorable assessment
    if (plan.status === 'draft' && overallImpact !== 'critical') {
      plan.status = 'active';
    }

    await this.auditLog('bc.plan.assessed', planId, {
      overallImpact,
      revenueAtRisk: totalRevenueAtRisk,
      unmitigatedDependencies: unmitigatedDeps,
      recommendationCount: recommendations.length,
    });

    return { ...assessment, functionImpacts: [...functionImpacts], recommendations: [...recommendations] };
  }

  /**
   * Get all active (non-deprecated, non-suspended) continuity plans.
   * Returns shallow copies sorted by name.
   */
  getActivePlans(): ContinuityPlan[] {
    const active: ContinuityPlan[] = [];
    for (const plan of this.plans.values()) {
      if (plan.status === 'active' || plan.status === 'draft') {
        active.push({
          ...plan,
          criticalFunctions: [...plan.criticalFunctions],
          dependencies: [...plan.dependencies],
          impactAssessments: [...plan.impactAssessments],
        });
      }
    }

    active.sort((a, b) => a.name.localeCompare(b.name));
    return active;
  }

  /**
   * Generate a comprehensive continuity report across all plans.
   * Summarizes risk levels, revenue exposure, gaps, and recommendations.
   */
  async generateContinuityReport(): Promise<ContinuityReport> {
    const allPlans = Array.from(this.plans.values());

    // Count by status
    const plansByStatus: Record<ContinuityPlanStatus, number> = {
      draft: 0,
      active: 0,
      suspended: 0,
      deprecated: 0,
    };

    for (const plan of allPlans) {
      plansByStatus[plan.status]++;
    }

    const activePlans = allPlans.filter(
      (p) => p.status === 'active' || p.status === 'draft',
    );

    // Calculate overall risk from latest assessments
    let overallRisk: ImpactLevel = 'none';
    const allRecommendations: string[] = [];

    for (const plan of activePlans) {
      const lastAssessment = plan.impactAssessments.length > 0
        ? plan.impactAssessments[plan.impactAssessments.length - 1]
        : null;

      if (lastAssessment) {
        if (IMPACT_ORDER[lastAssessment.overallImpact] > IMPACT_ORDER[overallRisk]) {
          overallRisk = lastAssessment.overallImpact;
        }
        allRecommendations.push(...lastAssessment.recommendations);
      } else {
        // Unassessed plans are at least medium risk
        if (IMPACT_ORDER.medium > IMPACT_ORDER[overallRisk]) {
          overallRisk = 'medium';
        }
        allRecommendations.push(`Plan '${plan.name}' has never been assessed — run impact assessment`);
      }
    }

    // Revenue at risk (from latest assessments)
    const totalRevenueAtRisk = activePlans.reduce((sum, plan) => {
      const last = plan.impactAssessments.length > 0
        ? plan.impactAssessments[plan.impactAssessments.length - 1]
        : null;
      return sum + (last?.revenueAtRisk ?? 0);
    }, 0);

    // Plans with unmitigated critical dependencies
    const plansWithGaps: ContinuityReport['plansWithGaps'] = [];
    for (const plan of activePlans) {
      const unmitigated = plan.dependencies.filter(
        (d) => IMPACT_ORDER[d.criticality] >= IMPACT_ORDER.high && !d.fallback,
      ).length;
      if (unmitigated > 0) {
        plansWithGaps.push({
          planId: plan.id,
          planName: plan.name,
          unmitigatedCount: unmitigated,
        });
      }
    }

    // Stale plans (no assessment in >30 days)
    const stalePlans: ContinuityReport['stalePlans'] = [];
    for (const plan of activePlans) {
      const lastAssessment = plan.impactAssessments.length > 0
        ? plan.impactAssessments[plan.impactAssessments.length - 1]
        : null;

      let daysSinceLastAssessment: number | null = null;
      if (lastAssessment) {
        const assessedDate = new Date(lastAssessment.assessedAt);
        const now = new Date();
        daysSinceLastAssessment = Math.floor(
          (now.getTime() - assessedDate.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      if (!lastAssessment || (daysSinceLastAssessment !== null && daysSinceLastAssessment > STALE_THRESHOLD_DAYS)) {
        stalePlans.push({
          planId: plan.id,
          planName: plan.name,
          daysSinceLastAssessment,
        });
      }
    }

    // Deduplicate and limit top recommendations
    const uniqueRecommendations = [...new Set(allRecommendations)];
    const topRecommendations = uniqueRecommendations.slice(0, 10);

    const report: ContinuityReport = {
      generatedAt: new Date().toISOString(),
      totalPlans: allPlans.length,
      activePlans: activePlans.length,
      plansByStatus,
      overallRisk,
      totalRevenueAtRisk,
      plansWithGaps,
      stalePlans,
      topRecommendations,
    };

    await this.auditLog('bc.report.generated', 'continuity-report', {
      totalPlans: report.totalPlans,
      activePlans: report.activePlans,
      overallRisk,
      totalRevenueAtRisk,
      plansWithGaps: plansWithGaps.length,
      stalePlans: stalePlans.length,
    });

    return report;
  }

  // ── Accessors ───────────────────────────────────────────────────

  /** Get a single plan by id (returns null if not found) */
  getPlan(id: string): ContinuityPlan | null {
    const plan = this.plans.get(id);
    if (!plan) return null;
    return {
      ...plan,
      criticalFunctions: [...plan.criticalFunctions],
      dependencies: [...plan.dependencies],
      impactAssessments: [...plan.impactAssessments],
    };
  }

  /** Get all plans (including deprecated/suspended) */
  getAllPlans(): ContinuityPlan[] {
    return Array.from(this.plans.values()).map((p) => ({
      ...p,
      criticalFunctions: [...p.criticalFunctions],
      dependencies: [...p.dependencies],
      impactAssessments: [...p.impactAssessments],
    }));
  }

  // ── Private Helpers ────────────────────────────────────────────

  private getPlanOrThrow(id: string): ContinuityPlan {
    const plan = this.plans.get(id);
    if (!plan) {
      throw new Error(`Business continuity plan not found: ${id}`);
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
        'BusinessContinuityManager',
        action,
        target,
        details,
        'success',
      );
    } catch {
      // Audit write failure must not block continuity operations
    }
  }
}

export default BusinessContinuityManager;