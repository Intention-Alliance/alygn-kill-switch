/**
 * SecurityTrainingManager — H-108
 *
 * Manages security awareness training modules, assignments,
 * completion tracking, and compliance reporting across five
 * categories: phishing, dataHandling, incidentResponse,
 * accessControl, compliance.
 *
 * Tracks completion dates, scores, and renewal periods so
 * organizations can maintain audit-ready training records.
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type TrainingCategory =
  | 'phishing'
  | 'dataHandling'
  | 'incidentResponse'
  | 'accessControl'
  | 'compliance';

export type TrainingModuleStatus = 'draft' | 'active' | 'archived';
export type AssignmentStatus = 'assigned' | 'inProgress' | 'completed' | 'overdue';

export interface TrainingModule {
  /** Unique module id */
  id: string;
  /** Module title */
  title: string;
  /** Category */
  category: TrainingCategory;
  /** Human-readable description */
  description: string;
  /** Current lifecycle status */
  status: TrainingModuleStatus;
  /** Minimum passing score (0–100) */
  passingScore: number;
  /** Renewal period in days (0 = one-time, no renewal) */
  renewalPeriodDays: number;
  /** ISO-8601 timestamp of creation */
  createdAt: string;
  /** ISO-8601 timestamp of last update */
  updatedAt: string;
}

export interface TrainingAssignment {
  /** Unique assignment id */
  id: string;
  /** Module id */
  moduleId: string;
  /** User id this is assigned to */
  userId: string;
  /** Current status */
  status: AssignmentStatus;
  /** ISO-8601 date when the assignment was created */
  assignedAt: string;
  /** ISO-8601 deadline for completion (null = no deadline) */
  dueDate: string | null;
  /** ISO-8601 date when the user started the module (null if not started) */
  startedAt: string | null;
  /** ISO-8601 date when the user completed the module (null if not completed) */
  completedAt: string | null;
  /** Score achieved (0–100, null if not yet scored) */
  score: number | null;
  /** Whether the user passed (null if not yet completed) */
  passed: boolean | null;
  /** ISO-8601 date when the training expires and must be renewed (null if no renewal) */
  expiresAt: string | null;
}

export interface TrainingReport {
  /** ISO-8601 timestamp of report generation */
  generatedAt: string;
  /** Total active modules */
  totalModules: number;
  /** Total assignments across all users */
  totalAssignments: number;
  /** Breakdown by category */
  byCategory: Record<TrainingCategory, CategoryReport>;
  /** Breakdown by assignment status */
  byStatus: Record<AssignmentStatus, number>;
  /** Overall compliance rate (0–100) */
  complianceRate: number;
  /** Users with overdue training */
  overdueUsers: OverdueUserEntry[];
}

export interface CategoryReport {
  /** Number of active modules in this category */
  moduleCount: number;
  /** Total assignments in this category */
  totalAssignments: number;
  /** Completed assignments */
  completed: number;
  /** Overdue assignments */
  overdue: number;
  /** Average score among completed assignments */
  averageScore: number;
  /** Compliance rate for this category (0–100) */
  complianceRate: number;
}

export interface OverdueUserEntry {
  userId: string;
  moduleId: string;
  moduleTitle: string;
  category: TrainingCategory;
  assignedAt: string;
  dueDate: string | null;
  daysOverdue: number;
}

export interface SecurityTrainingManagerOptions {
  /** Optional callback invoked on assignment creation / status change */
  onAssignmentChange?: (assignment: TrainingAssignment) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

let _nextModuleId = 0;
let _nextAssignmentId = 0;

function nextModuleId(): string {
  return `mod-${Date.now()}-${++_nextModuleId}`;
}

function nextAssignmentId(): string {
  return `assign-${Date.now()}-${++_nextAssignmentId}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysBetween(earlier: string, later: string): number {
  const ms = new Date(later).getTime() - new Date(earlier).getTime();
  return Math.floor(ms / 86_400_000);
}

const ALL_CATEGORIES: TrainingCategory[] = [
  'phishing',
  'dataHandling',
  'incidentResponse',
  'accessControl',
  'compliance',
];

// ── SecurityTrainingManager ───────────────────────────────────────────

export class SecurityTrainingManager {
  private readonly modules = new Map<string, TrainingModule>();
  private readonly assignments = new Map<string, TrainingAssignment>();
  private readonly onAssignmentChange?: (assignment: TrainingAssignment) => void;

  constructor(opts: SecurityTrainingManagerOptions = {}) {
    this.onAssignmentChange = opts.onAssignmentChange;
  }

  // ── Module CRUD ──────────────────────────────────────────────────

  /**
   * Create a new training module.
   */
  createTrainingModule(data: {
    title: string;
    category: TrainingCategory;
    description: string;
    passingScore?: number;
    renewalPeriodDays?: number;
    status?: TrainingModuleStatus;
  }): TrainingModule {
    const now = isoNow();
    const mod: TrainingModule = {
      id: nextModuleId(),
      title: data.title,
      category: data.category,
      description: data.description,
      status: data.status ?? 'active',
      passingScore: data.passingScore ?? 80,
      renewalPeriodDays: data.renewalPeriodDays ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.modules.set(mod.id, mod);
    return mod;
  }

  /** Retrieve a module by id. */
  getModule(moduleId: string): TrainingModule | undefined {
    return this.modules.get(moduleId);
  }

  /** List all modules, optionally filtered by category and/or status. */
  listModules(filter?: { category?: TrainingCategory; status?: TrainingModuleStatus }): TrainingModule[] {
    let result = [...this.modules.values()];
    if (filter?.category !== undefined) {
      result = result.filter((m) => m.category === filter.category);
    }
    if (filter?.status !== undefined) {
      result = result.filter((m) => m.status === filter.status);
    }
    return result;
  }

  // ── Assignments ───────────────────────────────────────────────────

  /**
   * Assign a training module to a user.
   * If the module has a renewalPeriodDays > 0, the assignment's expiresAt
   * is set to assignedAt + renewalPeriodDays.
   */
  assignTraining(data: {
    moduleId: string;
    userId: string;
    dueDate?: string;
  }): TrainingAssignment {
    const mod = this.modules.get(data.moduleId);
    if (!mod) {
      throw new Error(`SecurityTrainingManager: module "${data.moduleId}" not found`);
    }
    if (mod.status !== 'active') {
      throw new Error(`SecurityTrainingManager: module "${data.moduleId}" is not active (status: ${mod.status})`);
    }

    const now = isoNow();
    const expiresAt = mod.renewalPeriodDays > 0 ? addDays(now, mod.renewalPeriodDays) : null;

    const assignment: TrainingAssignment = {
      id: nextAssignmentId(),
      moduleId: data.moduleId,
      userId: data.userId,
      status: 'assigned',
      assignedAt: now,
      dueDate: data.dueDate ?? null,
      startedAt: null,
      completedAt: null,
      score: null,
      passed: null,
      expiresAt,
    };

    this.assignments.set(assignment.id, assignment);
    this.onAssignmentChange?.(assignment);
    return assignment;
  }

  /**
   * Assign a training module to multiple users at once.
   */
  assignTrainingToMany(moduleId: string, userIds: string[], dueDate?: string): TrainingAssignment[] {
    return userIds.map((userId) => this.assignTraining({ moduleId, userId, dueDate }));
  }

  /** Retrieve a single assignment by id. */
  getAssignment(assignmentId: string): TrainingAssignment | undefined {
    return this.assignments.get(assignmentId);
  }

  /** List assignments, optionally filtered. */
  listAssignments(filter?: {
    userId?: string;
    moduleId?: string;
    category?: TrainingCategory;
    status?: AssignmentStatus;
  }): TrainingAssignment[] {
    let result = [...this.assignments.values()];

    if (filter?.userId !== undefined) {
      result = result.filter((a) => a.userId === filter.userId);
    }
    if (filter?.moduleId !== undefined) {
      result = result.filter((a) => a.moduleId === filter.moduleId);
    }
    if (filter?.category !== undefined) {
      result = result.filter((a) => {
        const mod = this.modules.get(a.moduleId);
        return mod?.category === filter.category;
      });
    }
    if (filter?.status !== undefined) {
      result = result.filter((a) => a.status === filter.status);
    }

    return result;
  }

  // ── Completion ───────────────────────────────────────────────────

  /**
   * Record completion of a training assignment.
   * Sets score, passed (based on module's passingScore), and status.
   * If the module has a renewal period, a new expiresAt is computed
   * from the completion date.
   */
  completeTraining(assignmentId: string, score: number): TrainingAssignment {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`SecurityTrainingManager: assignment "${assignmentId}" not found`);
    }

    const mod = this.modules.get(assignment.moduleId);
    if (!mod) {
      throw new Error(`SecurityTrainingManager: module "${assignment.moduleId}" not found`);
    }

    const now = isoNow();
    const passed = score >= mod.passingScore;

    // Update assignment
    assignment.status = passed ? 'completed' : assignment.status;
    assignment.completedAt = now;
    assignment.score = score;
    assignment.passed = passed;
    assignment.startedAt = assignment.startedAt ?? now;

    // If failed, keep status as inProgress so the user can retry
    if (!passed) {
      assignment.status = 'inProgress';
    }

    // Renewal: if the module requires renewal, set new expiry from completion date
    if (mod.renewalPeriodDays > 0) {
      assignment.expiresAt = addDays(now, mod.renewalPeriodDays);
    }

    this.onAssignmentChange?.(assignment);
    return assignment;
  }

  // ── Overdue ──────────────────────────────────────────────────────

  /**
   * Refresh overdue status for all assignments.
   * An assignment is overdue if:
   *  - status is 'assigned' or 'inProgress' AND dueDate is past, OR
   *  - status is 'completed' AND expiresAt is past (renewal due)
   */
  refreshOverdueStatus(): number {
    const now = isoNow();
    let overdueCount = 0;

    for (const assignment of this.assignments.values()) {
      const wasOverdue = assignment.status === 'overdue';

      if (assignment.status === 'assigned' || assignment.status === 'inProgress') {
        if (assignment.dueDate && new Date(assignment.dueDate) < new Date(now)) {
          assignment.status = 'overdue';
          overdueCount++;
        }
      } else if (assignment.status === 'completed') {
        if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date(now)) {
          assignment.status = 'overdue';
          overdueCount++;
        }
      }

      if (assignment.status === 'overdue' && !wasOverdue) {
        this.onAssignmentChange?.(assignment);
      }
    }

    return overdueCount;
  }

  /**
   * Get all overdue training assignments.
   * Automatically refreshes overdue status before returning.
   */
  getOverdueTraining(): OverdueUserEntry[] {
    this.refreshOverdueStatus();

    const now = isoNow();
    const overdue: OverdueUserEntry[] = [];

    for (const assignment of this.assignments.values()) {
      if (assignment.status !== 'overdue') continue;

      const mod = this.modules.get(assignment.moduleId);
      if (!mod) continue;

      // Determine days overdue
      const referenceDate = assignment.dueDate ?? assignment.expiresAt ?? assignment.assignedAt;
      const daysOverdue = Math.max(0, daysBetween(referenceDate, now));

      overdue.push({
        userId: assignment.userId,
        moduleId: assignment.moduleId,
        moduleTitle: mod.title,
        category: mod.category,
        assignedAt: assignment.assignedAt,
        dueDate: assignment.dueDate,
        daysOverdue,
      });
    }

    return overdue;
  }

  // ── Reporting ───────────────────────────────────────────────────

  /**
   * Generate a comprehensive training compliance report.
   */
  generateTrainingReport(): TrainingReport {
    this.refreshOverdueStatus();

    const now = isoNow();
    const allAssignments = [...this.assignments.values()];
    const activeModules = [...this.modules.values()].filter((m) => m.status === 'active');

    // By status
    const byStatus: Record<AssignmentStatus, number> = {
      assigned: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
    };
    for (const a of allAssignments) {
      byStatus[a.status]++;
    }

    // By category
    const byCategory = this.buildCategoryReports(allAssignments, activeModules);

    // Overdue users
    const overdueUsers = this.getOverdueTraining();

    // Overall compliance rate: completed / (completed + overdue + assigned + inProgress)
    const totalNonExpired = byStatus.completed + byStatus.overdue + byStatus.assigned + byStatus.inProgress;
    const complianceRate = totalNonExpired > 0
      ? Math.round((byStatus.completed / totalNonExpired) * 100)
      : 100;

    return {
      generatedAt: now,
      totalModules: activeModules.length,
      totalAssignments: allAssignments.length,
      byCategory,
      byStatus,
      complianceRate,
      overdueUsers,
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private buildCategoryReports(
    allAssignments: TrainingAssignment[],
    activeModules: TrainingModule[],
  ): Record<TrainingCategory, CategoryReport> {
    const report: Record<TrainingCategory, CategoryReport> = {} as Record<TrainingCategory, CategoryReport>;

    for (const cat of ALL_CATEGORIES) {
      const catModules = activeModules.filter((m) => m.category === cat);
      const catModuleIds = new Set(catModules.map((m) => m.id));
      const catAssignments = allAssignments.filter((a) => catModuleIds.has(a.moduleId));

      const completed = catAssignments.filter((a) => a.status === 'completed');
      const overdue = catAssignments.filter((a) => a.status === 'overdue');

      const scores = completed
        .map((a) => a.score)
        .filter((s): s is number => s !== null);

      const averageScore = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0;

      const totalNonExpired = catAssignments.length;
      const complianceRate = totalNonExpired > 0
        ? Math.round((completed.length / totalNonExpired) * 100)
        : 100;

      report[cat] = {
        moduleCount: catModules.length,
        totalAssignments: catAssignments.length,
        completed: completed.length,
        overdue: overdue.length,
        averageScore,
        complianceRate,
      };
    }

    return report;
  }
}

export default SecurityTrainingManager;