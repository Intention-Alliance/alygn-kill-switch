/**
 * ThreatIntelligenceMonitor — H-109
 *
 * Manages a threat indicator feed with auto-expiry, matching incoming
 * data against known indicators, and AuditLogger integration for
 * immutable audit trails.
 *
 * Methods:
 *   addThreatIndicator(type, value, severity)
 *   checkAgainstThreats(data)
 *   getActiveThreats()
 *
 * Indicator types: ip, domain, emailPattern, hash, keyword
 * Severity levels: critical, high, medium, low
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────

export type ThreatIndicatorType =
  | 'ip'
  | 'domain'
  | 'emailPattern'
  | 'hash'
  | 'keyword';

export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ThreatIndicator {
  /** Unique indicator identifier (uuid v4) */
  id: string;
  /** Category of the indicator */
  type: ThreatIndicatorType;
  /** The indicator value (IP address, domain, pattern, hash, keyword) */
  value: string;
  /** Severity level */
  severity: ThreatSeverity;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 expiry timestamp (null = never expires) */
  expiresAt: string | null;
  /** Source of the indicator (feed name, manual, etc.) */
  source: string;
  /** Additional structured metadata */
  metadata: Record<string, unknown>;
}

export interface ThreatMatch {
  /** The matched indicator */
  indicator: ThreatIndicator;
  /** Which field in the input data matched */
  matchedField: string;
  /** The specific value that triggered the match */
  matchedValue: string;
}

export interface ThreatCheckResult {
  /** Whether any threats were matched */
  hasThreats: boolean;
  /** Number of matches found */
  matchCount: number;
  /** Highest severity among matches (null if no matches) */
  highestSeverity: ThreatSeverity | null;
  /** All matches found */
  matches: ThreatMatch[];
  /** ISO-8601 timestamp of the check */
  checkedAt: string;
}

export interface ThreatIntelligenceMonitorOptions {
  /** AuditLogger for recording threat events */
  auditLogger?: AuditLogger;
  /** Default TTL in milliseconds for indicators without explicit expiry (default: 7 days) */
  defaultTtlMs?: number;
  /** Interval in milliseconds for auto-expiry cleanup (default: 60 000 ms) */
  cleanupIntervalMs?: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<ThreatSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const VALID_INDICATOR_TYPES: Set<ThreatIndicatorType> = new Set([
  'ip',
  'domain',
  'emailPattern',
  'hash',
  'keyword',
]);

const VALID_SEVERITIES: Set<ThreatSeverity> = new Set([
  'critical',
  'high',
  'medium',
  'low',
]);

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000; // 1 minute

// ── Helpers ────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = new Uint8Array(16);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback: manual UUID v4 from random bytes
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Implementation ─────────────────────────────────────────────────────

export class ThreatIntelligenceMonitor {
  private readonly indicators: Map<string, ThreatIndicator> = new Map();
  private readonly auditLogger: AuditLogger | null;
  private readonly defaultTtlMs: number;
  private readonly cleanupIntervalMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: ThreatIntelligenceMonitorOptions = {}) {
    this.auditLogger = opts.auditLogger ?? null;
    this.defaultTtlMs = opts.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.cleanupIntervalMs = opts.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.startCleanup();
  }

  /** Inject or replace the AuditLogger */
  setAuditLogger(logger: AuditLogger): void {
    (this as unknown as { auditLogger: AuditLogger | null }).auditLogger = logger;
  }

  // ── Core Methods ────────────────────────────────────────────────

  /**
   * Add a threat indicator to the feed.
   *
   * @param type  - Indicator category (ip, domain, emailPattern, hash, keyword)
   * @param value - The indicator value
   * @param severity - Threat severity level
   * @param opts - Optional: ttlMs, source, metadata, expiresAt
   * @returns The created ThreatIndicator
   */
  addThreatIndicator(
    type: ThreatIndicatorType,
    value: string,
    severity: ThreatSeverity,
    opts: {
      ttlMs?: number;
      source?: string;
      metadata?: Record<string, unknown>;
      expiresAt?: string;
    } = {},
  ): ThreatIndicator {
    if (!VALID_INDICATOR_TYPES.has(type)) {
      throw new Error(`Invalid indicator type: "${type}". Must be one of: ${[...VALID_INDICATOR_TYPES].join(', ')}`);
    }
    if (!value || value.trim().length === 0) {
      throw new Error('Indicator value must be a non-empty string');
    }
    if (!VALID_SEVERITIES.has(severity)) {
      throw new Error(`Invalid severity: "${severity}". Must be one of: ${[...VALID_SEVERITIES].join(', ')}`);
    }

    const createdAt = nowIso();
    let expiresAt: string | null;

    if (opts.expiresAt !== undefined) {
      expiresAt = opts.expiresAt;
    } else if (opts.ttlMs !== undefined) {
      expiresAt = new Date(Date.now() + opts.ttlMs).toISOString();
    } else {
      expiresAt = new Date(Date.now() + this.defaultTtlMs).toISOString();
    }

    const indicator: ThreatIndicator = {
      id: generateId(),
      type,
      value: value.trim(),
      severity,
      createdAt,
      expiresAt,
      source: opts.source ?? 'manual',
      metadata: opts.metadata ?? {},
    };

    this.indicators.set(indicator.id, indicator);

    this.logAudit('threat.indicator.add', indicator.id, {
      type,
      value: value.trim(),
      severity,
      expiresAt,
      source: indicator.source,
    }).catch(() => {
      // Audit write failure is non-fatal; already handled by AuditLogger.onError
    });

    return indicator;
  }

  /**
   * Check arbitrary data against the active threat indicators.
   *
   * The `data` object is scanned field-by-field. String values are matched
   * against indicators of the appropriate type:
   *  - Fields named like *ip*, *addr* → matched against ip indicators
   *  - Fields named like *domain*, *host*, *url* → matched against domain indicators
   *  - Fields named like *email*, *mail* → matched against emailPattern indicators
   *  - Fields named like *hash*, *digest*, *checksum* → matched against hash indicators
   *  - All string fields → matched against keyword indicators
   *
   * @param data - Arbitrary key-value data to scan
   * @returns ThreatCheckResult with all matches
   */
  checkAgainstThreats(data: Record<string, unknown>): ThreatCheckResult {
    const matches: ThreatMatch[] = [];
    const checkedAt = nowIso();

    // Collect active indicators by type
    const activeByType = new Map<ThreatIndicatorType, ThreatIndicator[]>();
    for (const indicator of this.indicators.values()) {
      if (isExpired(indicator.expiresAt)) continue;
      let list = activeByType.get(indicator.type);
      if (!list) {
        list = [];
        activeByType.set(indicator.type, list);
      }
      list.push(indicator);
    }

    // Scan each field
    for (const [field, raw] of Object.entries(data)) {
      if (typeof raw !== 'string') continue;
      const value = raw as string;
      const fieldLower = field.toLowerCase();

      // IP matching
      if (/ip|addr/i.test(fieldLower)) {
        const ipIndicators = activeByType.get('ip') ?? [];
        for (const ind of ipIndicators) {
          if (value === ind.value) {
            matches.push({ indicator: ind, matchedField: field, matchedValue: value });
          }
        }
      }

      // Domain matching
      if (/domain|host|url/i.test(fieldLower)) {
        const domainIndicators = activeByType.get('domain') ?? [];
        for (const ind of domainIndicators) {
          // Exact match or subdomain match
          if (
            value === ind.value ||
            value.endsWith('.' + ind.value)
          ) {
            matches.push({ indicator: ind, matchedField: field, matchedValue: value });
          }
        }
      }

      // Email pattern matching
      if (/email|mail/i.test(fieldLower)) {
        const emailIndicators = activeByType.get('emailPattern') ?? [];
        for (const ind of emailIndicators) {
          try {
            const re = new RegExp(ind.value, 'i');
            if (re.test(value)) {
              matches.push({ indicator: ind, matchedField: field, matchedValue: value });
            }
          } catch {
            // Invalid regex — treat as literal substring match
            if (value.toLowerCase().includes(ind.value.toLowerCase())) {
              matches.push({ indicator: ind, matchedField: field, matchedValue: value });
            }
          }
        }
      }

      // Hash matching
      if (/hash|digest|checksum/i.test(fieldLower)) {
        const hashIndicators = activeByType.get('hash') ?? [];
        for (const ind of hashIndicators) {
          if (value.toLowerCase() === ind.value.toLowerCase()) {
            matches.push({ indicator: ind, matchedField: field, matchedValue: value });
          }
        }
      }

      // Keyword matching — applies to ALL string fields
      const keywordIndicators = activeByType.get('keyword') ?? [];
      for (const ind of keywordIndicators) {
        const pattern = escapeRegExp(ind.value);
        try {
          const re = new RegExp(pattern, 'i');
          if (re.test(value)) {
            matches.push({ indicator: ind, matchedField: field, matchedValue: value });
          }
        } catch {
          // Should not happen since we escaped, but fallback
          if (value.toLowerCase().includes(ind.value.toLowerCase())) {
            matches.push({ indicator: ind, matchedField: field, matchedValue: value });
          }
        }
      }
    }

    // Deduplicate matches (same indicator + same field + same value)
    const seen = new Set<string>();
    const uniqueMatches = matches.filter((m) => {
      const key = `${m.indicator.id}:${m.matchedField}:${m.matchedValue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const highestSeverity = uniqueMatches.length > 0
      ? uniqueMatches.reduce<ThreatSeverity>((highest, m) => {
          return SEVERITY_ORDER[m.indicator.severity] > SEVERITY_ORDER[highest]
            ? m.indicator.severity
            : highest;
        }, uniqueMatches[0]!.indicator.severity)
      : null;

    const result: ThreatCheckResult = {
      hasThreats: uniqueMatches.length > 0,
      matchCount: uniqueMatches.length,
      highestSeverity,
      matches: uniqueMatches,
      checkedAt,
    };

    // Log threat check to audit
    this.logAudit('threat.check', 'all', {
      matchCount: uniqueMatches.length,
      highestSeverity,
      fieldsScanned: Object.keys(data).length,
    }).catch(() => {
      // Non-fatal
    });

    return result;
  }

  /**
   * Get all active (non-expired) threat indicators.
   *
   * @param opts - Optional filter by type and/or severity
   * @returns Array of active ThreatIndicators
   */
  getActiveThreats(opts?: {
    type?: ThreatIndicatorType;
    severity?: ThreatSeverity;
  }): ThreatIndicator[] {
    const result: ThreatIndicator[] = [];

    for (const indicator of this.indicators.values()) {
      if (isExpired(indicator.expiresAt)) continue;
      if (opts?.type !== undefined && indicator.type !== opts.type) continue;
      if (opts?.severity !== undefined && indicator.severity !== opts.severity) continue;
      result.push(indicator);
    }

    // Sort by severity descending, then by creation date descending
    result.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Remove a specific indicator by id.
   * Returns true if the indicator existed and was removed.
   */
  removeIndicator(id: string): boolean {
    const indicator = this.indicators.get(id);
    if (!indicator) return false;

    this.indicators.delete(id);

    this.logAudit('threat.indicator.remove', id, {
      type: indicator.type,
      value: indicator.value,
      severity: indicator.severity,
    }).catch(() => {
      // Non-fatal
    });

    return true;
  }

  /**
   * Manually trigger expiry cleanup.
   * Returns the number of expired indicators removed.
   */
  cleanup(): number {
    let removed = 0;

    for (const [id, indicator] of this.indicators) {
      if (isExpired(indicator.expiresAt)) {
        this.indicators.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.logAudit('threat.cleanup', 'all', { removed }).catch(() => {
        // Non-fatal
      });
    }

    return removed;
  }

  /**
   * Stop the auto-cleanup timer. Call when shutting down.
   */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Internals ──────────────────────────────────────────────────

  private startCleanup(): void {
    if (this.cleanupIntervalMs <= 0) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Prevent the timer from keeping the process alive
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  private async logAudit(
    action: string,
    target: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditLogger) return;

    try {
      await this.auditLogger.log(
        'ThreatIntelligenceMonitor',
        action,
        target,
        details,
        'success',
      );
    } catch {
      // Audit write failures are non-fatal; AuditLogger.onError handles reporting
    }
  }
}