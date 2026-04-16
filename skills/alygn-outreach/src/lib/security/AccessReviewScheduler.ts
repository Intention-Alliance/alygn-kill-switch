/**
 * AccessReviewScheduler — H-103
 * Schedules and tracks periodic access reviews for roles.
 * Integrates with TemplateAccessControl audit log and AuditLogger.
 *
 * No new dependencies — uses only Node.js built-ins.
 */

import type { AuditLogger } from '../audit/AuditLogger';
import type { Role } from '../email/TemplatePermissions';
import type { TemplateAccessControl, AuditEntry } from '../email/TemplateAccessControl';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Shape of an audit log entry consumed by AccessReviewScheduler.
 * Mirrors TemplateAccessControl.AuditEntry but is declared here so
 * syncFromAuditLog has an explicit contract independent of the source.
 */
export interface AuditLogEntry {
  /** Role that performed the access */
  role: Role;
  /** Template/resource name accessed */
  templateName: string;
  /** Operation performed (e.g. 'read', 'create') */
  action: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Whether access was granted */
  allowed: boolean;
}

/**
 * Validate that an entry has the minimum required fields for sync.
 * Returns the entry as AuditLogEntry if valid, or null if it should be skipped.
 */
function validateAuditEntry(entry: unknown): AuditLogEntry | null {
  if (entry == null || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  if (typeof e.role !== 'string' || typeof e.templateName !== 'string') return null;
  return {
    role: e.role as Role,
    templateName: e.templateName as string,
    action: typeof e.action === 'string' ? e.action : 'unknown',
    timestamp: typeof e.timestamp === 'string' ? e.timestamp : new Date().toISOString(),
    allowed: e.granted === true || e.allowed === true,
  };
}

export type ReviewStatus = 'pending' | 'completed' | 'overdue' | 'stale';

export interface ReviewItem {
  /** Role under review */
  role: Role;
  /** Resource identifier (template name, '*', etc.) */
  resource: string;
  /** Current access level for the role on this resource */
  currentAccess: string;
  /** ISO-8601 timestamp of last review completion */
  lastReviewed: string | null;
  /** Current review status */
  status: ReviewStatus;
}

export interface ReviewSchedule {
  /** Role this schedule applies to */
  role: Role;
  /** Interval in days between required reviews */
  intervalDays: number;
  /** ISO-8601 timestamp when the schedule was created */
  createdAt: string;
}

export interface ReviewReport {
  /** ISO-8601 timestamp of report generation */
  generatedAt: string;
  /** Total items in the report */
  totalItems: number;
  /** Breakdown by status */
  byStatus: Record<ReviewStatus, number>;
  /** Items requiring attention (pending + overdue + stale) */
  attentionItems: ReviewItem[];
  /** All items in the report */
  items: ReviewItem[];
}

// ── AccessReviewScheduler ──────────────────────────────────────────────────

export class AccessReviewScheduler {
  /** Active review schedules keyed by role */
  private schedules: Map<Role, ReviewSchedule> = new Map();
  /** Review items keyed by "role:resource" */
  private reviews: Map<string, ReviewItem> = new Map();
  /** Optional AuditLogger for audit trail */
  private auditLogger: AuditLogger | null;
  /** Optional TemplateAccessControl for audit log integration */
  private templateAccessControl: TemplateAccessControl | null;
  /** Timestamp of the most recent audit log scan (for incremental sync) */
  private _lastSyncTime: number = 0;
  /** Cached audit entries from the last full scan */
  private _cachedEntries: AuditLogEntry[] = [];

  constructor(opts?: { auditLogger?: AuditLogger; templateAccessControl?: TemplateAccessControl }) {
    this.auditLogger = opts?.auditLogger ?? null;
    this.templateAccessControl = opts?.templateAccessControl ?? null;
  }

  // ── Scheduling ─────────────────────────────────────────────────

  /**
   * Schedule periodic access reviews for a role.
   * Overwrites any existing schedule for the same role.
   * Returns the created schedule.
   */
  scheduleReview(role: Role, intervalDays: number): ReviewSchedule {
    if (intervalDays < 1) {
      throw new Error(`AccessReviewScheduler: intervalDays must be >= 1, got ${intervalDays}`);
    }

    const schedule: ReviewSchedule = {
      role,
      intervalDays,
      createdAt: new Date().toISOString(),
    };

    this.schedules.set(role, schedule);

    // Auto-create review items for existing resources the role has accessed
    this.syncFromAuditLog(role);

    return schedule;
  }

  // ── Queries ────────────────────────────────────────────────────

  /**
   * Get all review items that are pending, overdue, or stale.
   * If a role is specified, filters to that role only.
   */
  getPendingReviews(role?: Role): ReviewItem[] {
    const items = this.allReviewItems();
    const filtered = role ? items.filter(i => i.role === role) : items;
    return filtered.filter(i => i.status !== 'completed');
  }

  /**
   * Get all review items regardless of status.
   */
  getAllReviews(): ReviewItem[] {
    return this.allReviewItems();
  }

  /**
   * Get the schedule for a role, if one exists.
   */
  getSchedule(role: Role): ReviewSchedule | undefined {
    return this.schedules.get(role);
  }

  // ── Review Actions ─────────────────────────────────────────────

  /**
   * Mark a role's access to a resource as reviewed.
   * Sets status to 'completed' and updates lastReviewed timestamp.
   * Logs the review to AuditLogger if available.
   */
  async markReviewed(role: Role, resource: string): Promise<ReviewItem> {
    const key = this.reviewKey(role, resource);
    const existing = this.reviews.get(key);

    const item: ReviewItem = {
      role,
      resource,
      currentAccess: existing?.currentAccess ?? 'unknown',
      lastReviewed: new Date().toISOString(),
      status: 'completed',
    };

    this.reviews.set(key, item);

    // Audit log integration
    if (this.auditLogger) {
      await this.auditLogger.log(
        `role:${role}`,
        'access_review.completed',
        resource,
        { role, resource, previousStatus: existing?.status ?? 'new' },
        'success',
      );
    }

    return item;
  }

  // ── Stale Access Detection ─────────────────────────────────────

  /**
   * Flag review items where access hasn't been reviewed in maxDays.
   *
   * **Staleness** is an absolute cutoff: any item whose last review
   * is older than `maxDays` days is flagged, **regardless of its
   * per-role schedule**. This is intentionally different from
   * "overdue" (see {@link recalculateStatuses}), which uses each
   * role's `schedule.intervalDays` to determine whether a review
   * is past due.
   *
   * In short:
   * - **overdue** = review is past due per the role's schedule interval
   * - **stale**  = access hasn't been reviewed in N days, period
   *
   * Updates status to 'stale' for items exceeding the threshold.
   * Returns the newly-flagged stale items.
   */
  flagStaleAccess(maxDays: number): ReviewItem[] {
    if (maxDays < 1) {
      throw new Error(`AccessReviewScheduler: maxDays must be >= 1, got ${maxDays}`);
    }

    const cutoff = Date.now() - maxDays * 86_400_000;
    const flagged: ReviewItem[] = [];

    for (const [key, item] of this.reviews) {
      if (item.status === 'stale') continue;

      const lastReview = item.lastReviewed ? new Date(item.lastReviewed).getTime() : 0;
      if (lastReview < cutoff) {
        const updated: ReviewItem = { ...item, status: 'stale' };
        this.reviews.set(key, updated);
        flagged.push(updated);
      }
    }

    return flagged;
  }

  // ── Reports ────────────────────────────────────────────────────

  /**
   * Generate a comprehensive review report.
   * Includes status breakdown, attention items, and all review items.
   * Recalculates statuses based on current schedules before generating.
   */
  generateReport(): ReviewReport {
    // Refresh statuses before generating report
    this.recalculateStatuses();

    const items = this.allReviewItems();
    const byStatus: Record<ReviewStatus, number> = {
      pending: 0,
      completed: 0,
      overdue: 0,
      stale: 0,
    };

    for (const item of items) {
      byStatus[item.status]++;
    }

    const attentionItems = items.filter(i => i.status !== 'completed');

    return {
      generatedAt: new Date().toISOString(),
      totalItems: items.length,
      byStatus,
      attentionItems,
      items,
    };
  }

  // ── TemplateAccessControl Integration ──────────────────────────

  /**
   * Sync review items from TemplateAccessControl audit log.
   *
   * On the first call (or when `forceFullSync` is true), all entries
   * are scanned. On subsequent calls, only entries newer than the
   * last sync timestamp are processed (incremental sync).
   *
   * Each entry is validated at runtime: if it lacks `role` or
   * `templateName`, it is silently skipped.
   *
   * @param role - Optional role filter; only sync entries for this role
   * @param forceFullSync - If true, ignore cached state and rescan all entries
   * @returns Number of review items created or updated
   */
  syncFromAuditLog(role?: Role, forceFullSync: boolean = false): number {
    if (!this.templateAccessControl) return 0;

    // Full sync: reset cache and rescan everything
    if (forceFullSync) {
      this._lastSyncTime = 0;
      this._cachedEntries = [];
    }

    const rawEntries = this.templateAccessControl.getAuditLog();

    // Validate and convert entries
    const validated: AuditLogEntry[] = [];
    for (const raw of rawEntries) {
      const entry = validateAuditEntry(raw);
      if (entry !== null) validated.push(entry);
    }

    // Incremental: only process entries newer than last sync
    const newEntries = this._lastSyncTime > 0
      ? validated.filter(e => new Date(e.timestamp).getTime() > this._lastSyncTime)
      : validated;

    let synced = 0;

    for (const entry of newEntries) {
      if (role && entry.role !== role) continue;

      const key = this.reviewKey(entry.role, entry.templateName);
      const existing = this.reviews.get(key);

      if (!existing) {
        this.reviews.set(key, {
          role: entry.role,
          resource: entry.templateName,
          currentAccess: entry.allowed ? 'granted' : 'denied',
          lastReviewed: null,
          status: 'pending',
        });
        synced++;
      } else {
        // Update current access if changed
        const newAccess = entry.allowed ? 'granted' : 'denied';
        if (existing.currentAccess !== newAccess) {
          this.reviews.set(key, { ...existing, currentAccess: newAccess });
          synced++;
        }
      }
    }

    // Update cache and sync timestamp
    this._cachedEntries = validated;
    if (validated.length > 0) {
      const maxTs = Math.max(...validated.map(e => new Date(e.timestamp).getTime()));
      if (maxTs > this._lastSyncTime) {
        this._lastSyncTime = maxTs;
      }
    }

    return synced;
  }

  // ── Private Helpers ────────────────────────────────────────────

  private reviewKey(role: Role, resource: string): string {
    return `${role}:${resource}`;
  }

  private allReviewItems(): ReviewItem[] {
    return Array.from(this.reviews.values());
  }

  /**
   * Recalculate statuses based on per-role schedules.
   *
   * **Overdue detection** uses each role's `schedule.intervalDays`:
   * if the time since the last review exceeds the scheduled interval,
   * the item is marked 'overdue'. This is intentionally different
   * from "stale" (see {@link flagStaleAccess}), which applies an
   * absolute `maxDays` cutoff regardless of schedule.
   *
   * In short:
   * - **overdue** = review is past due per the role's schedule interval
   * - **stale**  = access hasn't been reviewed in N days, period
   *
   * Rules:
   * - Items with no schedule → keep current status
   * - Items past their review interval → 'overdue'
   * - Items never reviewed with a schedule → 'pending'
   */
  private recalculateStatuses(): void {
    for (const [key, item] of this.reviews) {
      const schedule = this.schedules.get(item.role);

      if (!schedule) continue;

      if (item.status === 'completed' && item.lastReviewed) {
        const lastReview = new Date(item.lastReviewed).getTime();
        const dueBy = lastReview + schedule.intervalDays * 86_400_000;

        if (Date.now() > dueBy) {
          this.reviews.set(key, { ...item, status: 'overdue' });
        }
      } else if (item.status === 'pending' && item.lastReviewed === null) {
        // Already pending — no change needed
      }
    }
  }
}

export default AccessReviewScheduler;