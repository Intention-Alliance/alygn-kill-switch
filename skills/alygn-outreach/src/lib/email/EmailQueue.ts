/**
 * EmailQueue
 * Priority-based email queue with rate limiting, retry logic, and disk persistence
 */
import fs from 'fs';
import path from 'path';
import { RateLimiter, type RateLimiterConfig } from './RateLimiter';

// ── Types ──────────────────────────────────────────────────────────────

export type EmailPriority = 'high' | 'medium' | 'low';

export interface QueuedEmail {
  id: string;
  payload: {
    to: string;
    from?: string;
    subject: string;
    html: string;
    text?: string;
    cc?: string;
  };
  priority: EmailPriority;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'dead';
  attempts: number;
  maxRetries: number;
  nextRetryAt: string | null;   // ISO timestamp
  createdAt: string;
  lastAttemptAt: string | null;
  error: string | null;
  result: {
    success: boolean;
    messageId?: string;
    provider?: string;
  } | null;
}

export interface DeadLetterEntry {
  email: QueuedEmail;
  deadAt: string;
  reason: string;
}

export interface EmailQueueConfig {
  concurrency?: number;         // parallel sends (default: 1)
  emailsPerMinute?: number;     // fallback rate limit when no RateLimiter (default: 20)
  maxRetries?: number;          // per email (default: 3)
  backoffMs?: number[];         // delays between retries (default: [5000, 15000, 45000])
  persistenceDir?: string;      // disk path (default: data/email-queue/)
  autoPersist?: boolean;        // persist after every mutation (default: true)
  rateLimiter?: RateLimiterConfig; // spam-filter-aware rate limiter config
}

type SendFn = (payload: QueuedEmail['payload']) => Promise<{ success: boolean; messageId?: string; provider?: string; error?: string }>;

// ── Priority ordering ──────────────────────────────────────────────────

const PRIORITY_ORDER: Record<EmailPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function prioritySort(a: QueuedEmail, b: QueuedEmail): number {
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

// ── Queue class ────────────────────────────────────────────────────────

export class EmailQueue {
  private queue: QueuedEmail[] = [];
  private deadLetter: DeadLetterEntry[] = [];
  private processing = false;
  private sendFn: SendFn | null = null;
  private concurrency: number;
  private emailsPerMinute: number;
  private maxRetries: number;
  private backoffMs: number[];
  private persistenceDir: string;
  private autoPersist: boolean;
  private rateLimiter: RateLimiter | null = null;
  private sendTimestamps: number[] = [];   // fallback sliding window (used only when rateLimiter is null)
  private activeCount = 0;
  private drainResolves: (() => void)[] = [];
  private ticking = false;

  constructor(config: EmailQueueConfig = {}) {
    this.concurrency = config.concurrency ?? 1;
    this.emailsPerMinute = config.emailsPerMinute ?? 20;
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffMs = config.backoffMs ?? [5000, 15000, 45000];
    this.persistenceDir = config.persistenceDir ?? path.resolve(__dirname, '../../../data/email-queue');
    this.autoPersist = config.autoPersist ?? true;

    // Initialize RateLimiter if config provided, otherwise fall back to simple sliding window
    if (config.rateLimiter) {
      this.rateLimiter = new RateLimiter(config.rateLimiter);
    }

    this.loadFromDisk();
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Register the actual send function (called by EmailService).
   */
  setSendFn(fn: SendFn): void {
    this.sendFn = fn;
  }

  /**
   * Enqueue an email for sending.
   */
  async enqueue(
    payload: QueuedEmail['payload'],
    priority: EmailPriority = 'medium',
  ): Promise<string> {
    const id = `eq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email: QueuedEmail = {
      id,
      payload,
      priority,
      status: 'pending',
      attempts: 0,
      maxRetries: this.maxRetries,
      nextRetryAt: null,
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      error: null,
      result: null,
    };
    this.queue.push(email);
    if (this.autoPersist) await this.persist();
    return id;
  }

  /**
   * Start processing the queue. Returns a promise that resolves when the queue is drained.
   */
  async drain(): Promise<void> {
    if (this.processing) {
      // Already draining — wait for existing drain to finish
      return new Promise<void>(resolve => {
        this.drainResolves.push(resolve);  // Fix 2: push to array instead of chaining
      });
    }

    this.processing = true;
    return new Promise<void>(resolve => {
      this.drainResolves.push(resolve);  // Fix 2: push to array
      this.tick();
    });
  }

  /**
   * Stop processing after current in-flight sends complete.
   */
  stop(): void {
    this.processing = false;
  }

  /**
   * Get queue snapshot (for monitoring / admin).
   */
  getStatus(): {
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    dead: number;
    queue: QueuedEmail[];
    deadLetter: DeadLetterEntry[];
  } {
    const pending = this.queue.filter(e => e.status === 'pending' || e.status === 'processing').length;
    return {
      pending,
      processing: this.activeCount,
      sent: this.queue.filter(e => e.status === 'sent').length,
      failed: this.queue.filter(e => e.status === 'failed').length,
      dead: this.deadLetter.length,
      queue: [...this.queue],
      deadLetter: [...this.deadLetter],
    };
  }

  /**
   * Retry a dead-letter email by re-enqueuing it.
   */
  async retryDeadLetter(emailId: string): Promise<boolean> {
    const idx = this.deadLetter.findIndex(d => d.email.id === emailId);
    if (idx === -1) return false;
    const entry = this.deadLetter.splice(idx, 1)[0];
    entry.email.status = 'pending';
    entry.email.attempts = 0;
    entry.email.nextRetryAt = null;
    entry.email.error = null;
    entry.email.result = null;
    this.queue.push(entry.email);
    if (this.autoPersist) await this.persist();
    return true;
  }

  /**
   * Clear completed/failed items from the in-memory queue (keeps dead letter).
   */
  async compact(): Promise<void> {
    this.queue = this.queue.filter(e => e.status === 'pending' || e.status === 'processing');
    if (this.autoPersist) await this.persist();
  }

  // ── Internal ────────────────────────────────────────────────────────

  // Fix 1: Serialized tick — only one tick runs at a time
  private tick(): void {
    // Prevent concurrent ticks
    if (this.ticking) return;
    this.ticking = true;

    if (!this.processing) {
      this.ticking = false;
      this.finishDrain();
      return;
    }

    // Fill available slots — status is set to 'processing' in pickNext() BEFORE activeCount increments
    while (this.activeCount < this.concurrency) {
      const next = this.pickNext();
      if (!next) break;
      this.activeCount++;
      this.processOne(next).then(() => {
        this.activeCount--;
        this.ticking = false;
        this.tick();
      });
    }

    this.ticking = false;

    // If nothing left and nothing in-flight, we're done
    if (this.activeCount === 0 && !this.hasMoreWork()) {
      this.finishDrain();
    }
  }

  private pickNext(): QueuedEmail | null {
    const now = Date.now();
    const candidates = this.queue
      .filter(e => e.status === 'pending')
      .filter(e => !e.nextRetryAt || new Date(e.nextRetryAt).getTime() <= now)
      .sort(prioritySort);

    if (candidates.length === 0) return null;

    // Use RateLimiter if available, otherwise fall back to simple sliding window
    if (this.rateLimiter) {
      const check = this.rateLimiter.canSend(candidates[0].payload.to);
      if (!check.allowed) {
        // Schedule a delayed tick so the queue doesn't stall
        if (check.waitMs > 0) {
          setTimeout(() => { this.ticking = false; this.tick(); }, Math.min(check.waitMs, 60_000));
        }
        return null;
      }
    } else {
      if (!this.canSendNow()) return null;
    }

    const email = candidates[0];
    email.status = 'processing';
    return email;
  }

  private hasMoreWork(): boolean {
    const now = Date.now();
    return this.queue.some(
      e => e.status === 'pending' && (!e.nextRetryAt || new Date(e.nextRetryAt).getTime() <= now)
    );
  }

  /**
   * Get the RateLimiter instance (for external integration, e.g. WebhookHandler bounce signals).
   * Returns null if no RateLimiter was configured.
   */
  getRateLimiter(): RateLimiter | null {
    return this.rateLimiter;
  }

  /**
   * Set or replace the RateLimiter at runtime.
   */
  setRateLimiter(rateLimiter: RateLimiter): void {
    this.rateLimiter = rateLimiter;
  }

  private canSendNow(): boolean {
    const oneMinuteAgo = Date.now() - 60_000;
    this.sendTimestamps = this.sendTimestamps.filter(t => t > oneMinuteAgo);
    return this.sendTimestamps.length < this.emailsPerMinute;
  }

  private async processOne(email: QueuedEmail): Promise<void> {
    if (!this.sendFn) {
      email.status = 'failed';
      email.error = 'No send function registered';
      this.moveToDeadLetter(email, 'No send function registered');
      if (this.autoPersist) await this.persist();
      return;
    }

    // Wait for rate limit slot
    if (this.rateLimiter) {
      // Spam-filter-aware rate limiting
      const check = this.rateLimiter.canSend(email.payload.to);
      if (!check.allowed && check.waitMs > 0) {
        await this.sleep(Math.min(check.waitMs, 60_000)); // cap wait at 1 minute per check
      }
      // Re-check after waiting — max 60 iterations (~60s) to avoid blocking forever
      let iterations = 0;
      const MAX_WAIT_ITERATIONS = 60;
      while (!this.rateLimiter.canSend(email.payload.to).allowed) {
        iterations++;
        if (iterations >= MAX_WAIT_ITERATIONS) {
          email.status = 'failed';
          email.error = 'rate_limit_exceeded';
          this.moveToDeadLetter(email, 'Rate limit wait exceeded: unable to send after 60s');
          if (this.autoPersist) await this.persist();
          return;
        }
        await this.sleep(1000);
      }
      this.rateLimiter.recordSend(email.payload.to);
    } else {
      // Fallback: simple sliding window
      while (!this.canSendNow()) {
        await this.sleep(1000);
      }
      this.sendTimestamps.push(Date.now());
    }
    email.attempts++;
    email.lastAttemptAt = new Date().toISOString();

    try {
      const result = await this.sendFn(email.payload);

      if (result.success) {
        email.status = 'sent';
        email.result = { success: true, messageId: result.messageId, provider: result.provider };
      } else {
        email.error = result.error ?? 'Send failed';
        this.handleFailure(email);
      }
    } catch (err) {
      email.error = (err as Error).message;
      this.handleFailure(email);
    }

    if (this.autoPersist) await this.persist();
  }

  private handleFailure(email: QueuedEmail): void {
    if (email.attempts >= email.maxRetries) {
      this.moveToDeadLetter(email, `Failed after ${email.attempts} attempts: ${email.error}`);
      return;
    }

    // Schedule retry with exponential backoff
    email.status = 'pending';
    const delay = this.backoffMs[Math.min(email.attempts - 1, this.backoffMs.length - 1)];
    email.nextRetryAt = new Date(Date.now() + delay).toISOString();
  }

  private moveToDeadLetter(email: QueuedEmail, reason: string): void {
    email.status = 'dead';
    this.deadLetter.push({ email, deadAt: new Date().toISOString(), reason });
    this.queue = this.queue.filter(e => e.id !== email.id);
  }

  private finishDrain(): void {
    this.processing = false;
    // Fix 2: resolve ALL pending drain callbacks
    const resolves = this.drainResolves;
    this.drainResolves = [];
    for (const resolve of resolves) {
      resolve();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Persistence ─────────────────────────────────────────────────────

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.persistenceDir)) {
        fs.mkdirSync(this.persistenceDir, { recursive: true });
      }

      const queueFile = path.join(this.persistenceDir, 'queue.json');
      if (fs.existsSync(queueFile)) {
        const data = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        this.queue = data.queue ?? [];
        this.deadLetter = data.deadLetter ?? [];
      }
    } catch (e) {
      console.error('[EmailQueue] Failed to load from disk:', (e as Error).message);
      this.queue = [];
      this.deadLetter = [];
    }
  }

  async persist(): Promise<void> {
    try {
      if (!fs.existsSync(this.persistenceDir)) {
        fs.mkdirSync(this.persistenceDir, { recursive: true });
      }
      const queueFile = path.join(this.persistenceDir, 'queue.json');
      const data = {
        queue: this.queue,
        deadLetter: this.deadLetter,
        persistedAt: new Date().toISOString(),
      };
      fs.writeFileSync(queueFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[EmailQueue] Failed to persist:', (e as Error).message);
    }
  }
}

export default EmailQueue;