/**
 * AuditLogger — Centralized structured audit logging
 *
 * Design:
 *  - JSONL format: one JSON object per line, append-only
 *  - Daily rotation: new file per day (audit-YYYY-MM-DD.jsonl)
 *  - 30-day retention: files older than 30 days are pruned on rotation
 *  - AuditQuery: search entries by actor, action, target, date range, result
 *  - Integration hooks for EmailService, WebhookHandler, AlertManager, BackupManager
 *
 * No new dependencies — uses only Node.js built-ins (fs/promises, path, crypto).
 */
import { appendFile, mkdir, readdir, unlink, readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

// ── Types ──────────────────────────────────────────────────────────────────

export type AuditResult = 'success' | 'failure' | 'error' | 'pending';

export interface AuditEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Who or what performed the action (user id, system service, etc.) */
  actor: string;
  /** What was done (e.g. 'email.send', 'webhook.receive', 'alert.fire') */
  action: string;
  /** What the action targeted (email address, alert id, backup id, etc.) */
  target: string;
  /** Arbitrary structured details about the action */
  details: Record<string, unknown>;
  /** Outcome of the action */
  result: AuditResult;
  /** Unique entry id (uuid v4) */
  id: string;
}

export interface AuditLoggerOptions {
  /** Directory for audit log files (default: data/audit) */
  dataDir?: string;
  /** Retention period in days (default: 30) */
  retentionDays?: number;
  /** Called when an audit write fails. Receives the error and the entry that failed. */
  onError?: (error: Error, entry: AuditEntry) => void;
}

export interface AuditQueryFilter {
  actor?: string;
  action?: string;
  target?: string;
  result?: AuditResult;
  /** Inclusive start date (YYYY-MM-DD) */
  from?: string;
  /** Inclusive end date (YYYY-MM-DD) */
  to?: string;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  /** Whether the result was truncated (queryLimit reached) */
  truncated: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_DATA_DIR = 'data/audit';
const DEFAULT_RETENTION_DAYS = 30;
const FILE_PREFIX = 'audit-';
const FILE_SUFFIX = '.jsonl';

// ── AuditLogger ───────────────────────────────────────────────────────────

export class AuditLogger extends EventEmitter {
  private readonly dataDir: string;
  private readonly retentionDays: number;
  private readonly errorCallback?: (error: Error, entry: AuditEntry) => void;
  /** Track the last date written to detect day-boundary rotation. */
  private lastWriteDate: string | null = null;

  constructor(opts: AuditLoggerOptions = {}) {
    super();
    this.errorCallback = opts.onError;

    // Resolve dataDir to an absolute path and validate against path traversal
    const rawDir = opts.dataDir ?? DEFAULT_DATA_DIR;
    const absDir = resolve(rawDir);
    const cwdRoot = resolve('.');
    const rel = relative(cwdRoot, absDir);
    if (rel.startsWith('..')) {
      throw new Error(
        `AuditLogger: dataDir "${rawDir}" resolves to "${absDir}", which escapes the project root "${cwdRoot}". Path traversal is not allowed.`,
      );
    }
    this.dataDir = absDir;
    this.retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
  }

  // ── Core Logging ────────────────────────────────────────────────

  /**
   * Log an audit entry. Appends a JSONL line to today's audit file.
   * Creates the directory on first write. Triggers retention prune on rotation.
   */
  async log(
    actor: string,
    action: string,
    target: string,
    details: Record<string, unknown> = {},
    result: AuditResult = 'success',
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      action,
      target,
      details,
      result,
    };

    try {
      await mkdir(this.dataDir, { recursive: true });
      const filePath = this.todayFilePath();
      const todayDate = this.formatDate(new Date());

      // Auto-prune on date boundary: when today's date differs from last write
      if (this.lastWriteDate !== null && this.lastWriteDate !== todayDate) {
        // Fire-and-forget prune — don't block the write on retention cleanup
        this.prune().catch(() => { /* prune failures are non-critical */ });
      }
      this.lastWriteDate = todayDate;

      const line = JSON.stringify(entry) + '\n';
      await appendFile(filePath, line, 'utf-8');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error, entry);
      this.errorCallback?.(error, entry);
      // Don't re-throw — audit failures must not crash the app
    }

    return entry;
  }

  /** Convenience: log a success */
  async success(actor: string, action: string, target: string, details?: Record<string, unknown>): Promise<AuditEntry> {
    return this.log(actor, action, target, details, 'success');
  }

  /** Convenience: log a failure */
  async failure(actor: string, action: string, target: string, details?: Record<string, unknown>): Promise<AuditEntry> {
    return this.log(actor, action, target, details, 'failure');
  }

  /** Convenience: log an error */
  async error(actor: string, action: string, target: string, details?: Record<string, unknown>): Promise<AuditEntry> {
    return this.log(actor, action, target, details, 'error');
  }

  // ── Retention ───────────────────────────────────────────────────

  /**
   * Prune audit files older than retentionDays.
   * Safe to call repeatedly — only deletes files matching the audit naming pattern.
   * Returns the number of files removed.
   */
  async prune(): Promise<number> {
    let removed = 0;
    try {
      const files = await readdir(this.dataDir);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.retentionDays);
      const cutoffStr = this.formatDate(cutoff);

      for (const file of files) {
        if (!file.startsWith(FILE_PREFIX) || !file.endsWith(FILE_SUFFIX)) continue;
        const dateStr = file.slice(FILE_PREFIX.length, -FILE_SUFFIX.length);
        if (dateStr < cutoffStr) {
          await unlink(join(this.dataDir, file));
          removed++;
        }
      }
    } catch {
      // Directory may not exist yet — nothing to prune
    }
    return removed;
  }

  // ── Query ───────────────────────────────────────────────────────

  /**
   * Search audit entries across daily files.
   * Reads files matching the date range, filters in memory.
   * Returns up to `limit` entries (default 1000).
   */
  async query(filter: AuditQueryFilter = {}, limit: number = 1000): Promise<AuditQueryResult> {
    const from = filter.from ?? this.formatDate(new Date(Date.now() - this.retentionDays * 86_400_000));
    const to = filter.to ?? this.formatDate(new Date());

    const files = await this.auditFilesInRange(from, to);
    const entries: AuditEntry[] = [];

    for (const file of files) {
      const content = await readFile(join(this.dataDir, file), 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry: AuditEntry = JSON.parse(line);
          if (this.matchesFilter(entry, filter)) {
            entries.push(entry);
            if (entries.length >= limit) {
              return { entries, total: entries.length, truncated: true };
            }
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    return { entries, total: entries.length, truncated: false };
  }

  // ── Integration Helpers ─────────────────────────────────────────

  /** Get the audit data directory (for BackupManager integration) */
  getAuditDir(): string {
    return this.dataDir;
  }

  /** Get today's audit file path (for external consumers) */
  getCurrentFilePath(): string {
    return this.todayFilePath();
  }

  // ── Private ─────────────────────────────────────────────────────

  private todayFilePath(): string {
    return join(this.dataDir, `${FILE_PREFIX}${this.formatDate(new Date())}${FILE_SUFFIX}`);
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private async auditFilesInRange(from: string, to: string): Promise<string[]> {
    try {
      const files = await readdir(this.dataDir);
      return files
        .filter(f => {
          if (!f.startsWith(FILE_PREFIX) || !f.endsWith(FILE_SUFFIX)) return false;
          const dateStr = f.slice(FILE_PREFIX.length, -FILE_SUFFIX.length);
          return dateStr >= from && dateStr <= to;
        })
        .sort();
    } catch {
      return [];
    }
  }

  private matchesFilter(entry: AuditEntry, filter: AuditQueryFilter): boolean {
    if (filter.actor && entry.actor !== filter.actor) return false;
    if (filter.action && entry.action !== filter.action) return false;
    if (filter.target && entry.target !== filter.target) return false;
    if (filter.result && entry.result !== filter.result) return false;
    return true;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance: AuditLogger | null = null;

/**
 * Get the shared AuditLogger instance.
 * Call once at app startup; all integrations use the same instance.
 */
export function getAuditLogger(opts?: AuditLoggerOptions): AuditLogger {
  if (!_instance) {
    _instance = new AuditLogger(opts);
  }
  return _instance;
}

/** Reset singleton (for testing) */
export function resetAuditLogger(): void {
  _instance = null;
}