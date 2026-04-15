/**
 * WebhookHandler
 * Processes delivery status webhooks and updates SentEmailTracker
 * Supports SendGrid and generic webhook formats
 */
import fs from 'fs';
import path from 'path';
import { SentEmailTracker } from '../SentEmailTracker';
import { UnsubscribeManager } from './UnsubscribeManager';
import type { RateLimiter } from './RateLimiter';
import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'delivered'
  | 'bounced'
  | 'opened'
  | 'clicked'
  | 'deferred'
  | 'spam_report'
  | 'unsubscribed'
  | 'processed'
  | 'unknown';

export interface WebhookPayload {
  event: WebhookEvent;
  email: string;
  messageId?: string;
  timestamp?: string;
  url?: string;           // for 'clicked'
  bounceReason?: string;  // for 'bounced'
  userAgent?: string;     // for 'opened' / 'clicked'
  ip?: string;
  raw?: Record<string, unknown>; // original payload for audit
}

export interface WebhookLogEntry {
  id: string;
  receivedAt: string;
  source: string;
  payload: WebhookPayload;
  processed: boolean;
  error?: string;
}

export interface WebhookHandlerConfig {
  /** Directory for webhook event logs (default: data/webhook-logs/) */
  logDir?: string;
  /** Max log entries to keep in memory (default: 1000) */
  maxLogSize?: number;
  /** Whether to persist logs to disk (default: true) */
  persistLogs?: boolean;
  /** RateLimiter instance to notify on bounce events (optional) */
  rateLimiter?: RateLimiter;
}

// ── SendGrid event mapping ────────────────────────────────────────────────

const SENDGRID_EVENT_MAP: Record<string, WebhookEvent> = {
  delivered: 'delivered',
  bounce: 'bounced',
  open: 'opened',
  click: 'clicked',
  deferred: 'deferred',
  spam: 'spam_report',
  spam_report: 'spam_report',
  unsubscribe: 'unsubscribed',
  processed: 'processed',
};

// ── Implementation ────────────────────────────────────────────────────────

export class WebhookHandler {
  private tracker: SentEmailTracker;
  private unsubscribeManager: UnsubscribeManager;
  private rateLimiter: RateLimiter | null;
  private log: WebhookLogEntry[] = [];
  private readonly logDir: string;
  private readonly maxLogSize: number;
  private readonly persistLogs: boolean;
  private auditLogger: AuditLogger | null = null;

  // Sliding window bounce tracking
  private bounceWindow: { timestamp: number; type: 'sent' | 'bounce' }[] = [];
  private readonly bounceWindowMaxEntries = 1000;
  private readonly bounceWindowMaxAgeMs = 86_400_000; // 24 hours

  constructor(tracker: SentEmailTracker, unsubscribeManager?: UnsubscribeManager, config: WebhookHandlerConfig = {}) {
    this.tracker = tracker;
    this.unsubscribeManager = unsubscribeManager ?? new UnsubscribeManager();
    this.rateLimiter = config.rateLimiter ?? null;
    this.logDir = config.logDir ?? path.resolve(__dirname, '../../data/webhook-logs');
    this.maxLogSize = config.maxLogSize ?? 1000;
    this.persistLogs = config.persistLogs ?? true;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Process a raw webhook payload (auto-detects format)
   * Returns array of processed results
   */
  /** Inject AuditLogger for audit trail */
  setAuditLogger(logger: AuditLogger): void {
    this.auditLogger = logger;
  }

  async handleWebhook(
    rawBody: Record<string, unknown> | Record<string, unknown>[],
    source: 'sendgrid' | 'generic' = 'sendgrid',
  ): Promise<{ processed: number; failed: number; errors: string[] }> {
    const events = Array.isArray(rawBody) ? rawBody : [rawBody];
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const raw of events) {
      const payload = source === 'sendgrid'
        ? this.parseSendGridEvent(raw)
        : this.parseGenericEvent(raw);

      const logEntry = this.createLogEntry(source, payload);

      try {
        await this.updateTracker(payload);
        logEntry.processed = true;
        processed++;
      } catch (err) {
        logEntry.processed = false;
        logEntry.error = (err as Error).message;
        failed++;
        errors.push(logEntry.error!);
      }

      this.appendLog(logEntry);
    }

    // Audit log the batch result
    if (this.auditLogger) {
      await this.auditLogger.log(
        'WebhookHandler',
        'webhook.receive',
        source,
        { processed, failed, eventCount: events.length },
        failed === 0 ? 'success' : 'failure',
      ).catch(() => {});
    }

    if (this.persistLogs) {
      await this.persistLogToDisk();
    }

    return { processed, failed, errors };
  }

  /**
   * Get webhook event log
   */
  getLog(limit?: number): WebhookLogEntry[] {
    const entries = [...this.log].reverse(); // newest first
    return limit ? entries.slice(0, limit) : entries;
  }

  /**
   * Get delivery stats from webhook logs
   */
  getDeliveryStats(): Record<WebhookEvent, number> {
    const stats: Record<WebhookEvent, number> = {
      delivered: 0,
      bounced: 0,
      opened: 0,
      clicked: 0,
      deferred: 0,
      spam_report: 0,
      unsubscribed: 0,
      processed: 0,
      unknown: 0,
    };

    for (const entry of this.log) {
      stats[entry.payload.event]++;
    }

    return stats;
  }

  /**
   * Clear webhook logs
   */
  clearLog(): void {
    this.log = [];
  }

  // ── Internal: parsing ────────────────────────────────────────────────

  private parseSendGridEvent(raw: Record<string, unknown>): WebhookPayload {
    const sgEvent = String(raw.event ?? '').toLowerCase();
    const event = SENDGRID_EVENT_MAP[sgEvent] ?? 'unknown';

    return {
      event,
      email: String(raw.email ?? ''),
      messageId: raw['sg_message_id'] != null ? String(raw['sg_message_id']) : undefined,
      timestamp: raw.timestamp != null ? String(raw.timestamp) : undefined,
      url: raw.url != null ? String(raw.url) : undefined,
      bounceReason: raw.reason != null ? String(raw.reason) : undefined,
      userAgent: raw['useragent'] != null ? String(raw['useragent']) : undefined,
      ip: raw.ip != null ? String(raw.ip) : undefined,
      raw,
    };
  }

  private parseGenericEvent(raw: Record<string, unknown>): WebhookPayload {
    return {
      event: this.normalizeEvent(String(raw.event ?? '')),
      email: String(raw.email ?? ''),
      messageId: raw.messageId != null ? String(raw.messageId) : undefined,
      timestamp: raw.timestamp != null ? String(raw.timestamp) : undefined,
      url: raw.url != null ? String(raw.url) : undefined,
      bounceReason: raw.bounceReason != null ? String(raw.bounceReason) : undefined,
      userAgent: raw.userAgent != null ? String(raw.userAgent) : undefined,
      ip: raw.ip != null ? String(raw.ip) : undefined,
      raw,
    };
  }

  private normalizeEvent(raw: string): WebhookEvent {
    const lower = raw.toLowerCase();
    if (lower in SENDGRID_EVENT_MAP) return SENDGRID_EVENT_MAP[lower];
    const valid: WebhookEvent[] = ['delivered', 'bounced', 'opened', 'clicked', 'deferred', 'spam_report', 'unsubscribed', 'processed'];
    if (valid.includes(lower as WebhookEvent)) return lower as WebhookEvent;
    return 'unknown';
  }

  // ── Internal: tracker update ──────────────────────────────────────────

  private async updateTracker(payload: WebhookPayload): Promise<void> {
    if (!payload.email) return;

    // Find the matching entry in tracker (vc or municipal)
    const vcEntry = this.tracker.getSentEntry(payload.email);
    const muniEntry = this.tracker.getSentEntry(payload.email, undefined, 'municipal');
    const entry = vcEntry || muniEntry;
    const type = vcEntry ? 'vc' : 'municipal';

    if (!entry) {
      // No tracked email found — still log the webhook event
      return;
    }

    // Fix 3: Handle events properly — bounces get recordBounce(), not re-record
    switch (payload.event) {
      case 'delivered':
        this.pushBounceWindow('sent');
        this.tracker.recordSent({
          email: payload.email,
          name: entry.name,
          partnerName: entry.partnerName ?? undefined,
          vcName: entry.vcName,
          type,
          subject: entry.subject,
          sentAt: entry.sentAt,
          messageId: payload.messageId ?? entry.messageId,
        });
        break;

      case 'bounced':
        // Fix 3: Use recordBounce() instead of re-recording as sent
        this.tracker.recordBounce(
          payload.email,
          payload.bounceReason,
          entry.partnerName ?? undefined,
          type,
        );
        // Signal rate limiter about bounce
        this.pushBounceWindow('bounce');
        if (this.rateLimiter) {
          this.rateLimiter.recordBounce();
        }
        break;

      case 'opened':
        this.tracker.updateStatus(payload.email, 'opened', entry.partnerName ?? undefined, type);
        break;

      case 'clicked':
        this.tracker.updateStatus(payload.email, 'clicked', entry.partnerName ?? undefined, type);
        break;

      case 'unsubscribed':
        // Record unsubscribe via UnsubscribeManager — await to ensure durability (GDPR)
        if (payload.email) {
          await this.unsubscribeManager.unsubscribe(payload.email, 'webhook');
          // Also update tracker status
          this.tracker.updateStatus(payload.email, 'unsubscribed', entry?.partnerName ?? undefined, type);
        }
        break;

      // deferred, spam_report — just log; tracker doesn't have fields for these yet
      default:
        break;
    }
  }

  // ── Internal: logging ─────────────────────────────────────────────────

  private createLogEntry(source: string, payload: WebhookPayload): WebhookLogEntry {
    return {
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toISOString(),
      source,
      payload,
      processed: false,
    };
  }

  private appendLog(entry: WebhookLogEntry): void {
    this.log.push(entry);
    // Trim to max size
    if (this.log.length > this.maxLogSize) {
      this.log = this.log.slice(-this.maxLogSize);
    }
  }

  // Fix 4: Async file I/O — no blocking writes
  private async persistLogToDisk(): Promise<void> {
    try {
      await fs.promises.mkdir(this.logDir, { recursive: true });
      const file = path.join(this.logDir, `webhook-log-${new Date().toISOString().split('T')[0]}.json`);
      await fs.promises.writeFile(file, JSON.stringify(this.log, null, 2));
    } catch (err) {
      console.error('[WebhookHandler] Failed to persist log:', (err as Error).message);
    }
  }

  // ── Sliding window bounce tracking ────────────────────────────────────

  private pushBounceWindow(type: 'sent' | 'bounce'): void {
    this.pruneBounceWindow();
    this.bounceWindow.push({ timestamp: Date.now(), type });
  }

  private pruneBounceWindow(): void {
    const cutoff = Date.now() - this.bounceWindowMaxAgeMs;
    if (this.bounceWindow.length > this.bounceWindowMaxEntries) {
      this.bounceWindow = this.bounceWindow.slice(-this.bounceWindowMaxEntries);
    }
    this.bounceWindow = this.bounceWindow.filter(e => e.timestamp > cutoff);
  }
}

export default WebhookHandler;