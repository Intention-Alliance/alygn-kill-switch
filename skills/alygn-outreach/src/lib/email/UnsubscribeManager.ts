/**
 * UnsubscribeManager — E-069
 * Manages email opt-out (unsubscribe) requests.
 * Persists to data/unsubscribe-list.json for durability.
 * Async I/O; reads are cached in memory for fast synchronous-style checks.
 */

import fs from 'fs';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface UnsubscribeEntry {
  email: string;
  unsubscribedAt: string;
  source?: string;
  reason?: string;
}

interface UnsubscribeData {
  entries: UnsubscribeEntry[];
  lastUpdated: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SKILL_DATA_DIR = path.resolve(__dirname, '../../data');
const UNSUBSCRIBE_FILE = path.resolve(SKILL_DATA_DIR, 'unsubscribe-list.json');

// ── UnsubscribeManager ──────────────────────────────────────────────────────

export class UnsubscribeManager {
  private data: UnsubscribeData;
  private emailSet: Set<string>;
  private dirty = false;

  constructor(private filePath: string = UNSUBSCRIBE_FILE) {
    this.data = this.load();
    this.emailSet = new Set(this.data.entries.map((e) => e.email.toLowerCase()));
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Check if an email address has unsubscribed.
   * Fast in-memory lookup (no I/O).
   */
  isUnsubscribed(email: string): boolean {
    if (!email) return false;
    const normalized = email.toLowerCase().trim();
    return this.emailSet.has(normalized);
  }

  /**
   * Record an unsubscribe request.
   * Persists to disk immediately.
   */
  async unsubscribe(email: string, source?: string, reason?: string): Promise<void> {
    if (!email) return;

    const normalized = email.toLowerCase().trim();

    // Idempotent — skip if already unsubscribed
    if (this.isUnsubscribed(normalized)) return;

    const entry: UnsubscribeEntry = {
      email: normalized,
      unsubscribedAt: new Date().toISOString(),
      source: source ?? undefined,
      reason: reason ?? undefined,
    };

    this.data.entries.push(entry);
    this.emailSet.add(normalized);
    this.data.lastUpdated = new Date().toISOString();
    this.dirty = true;

    await this.persist();
  }

  /**
   * Synchronous unsubscribe — use only when async is unavailable.
   * Prefer the async version.
   */
  unsubscribeSync(email: string, source?: string, reason?: string): void {
    if (!email) return;

    const normalized = email.toLowerCase().trim();
    if (this.isUnsubscribed(normalized)) return;

    const entry: UnsubscribeEntry = {
      email: normalized,
      unsubscribedAt: new Date().toISOString(),
      source: source ?? undefined,
      reason: reason ?? undefined,
    };

    this.data.entries.push(entry);
    this.emailSet.add(normalized);
    this.data.lastUpdated = new Date().toISOString();
    this.dirty = true;

    this.persistSync();
  }

  /**
   * Process a resubscribe request (removes from unsubscribe list).
   * Use with caution — typically you'd want manual verification.
   */
  async resubscribe(email: string): Promise<boolean> {
    if (!email) return false;

    const normalized = email.toLowerCase().trim();
    const index = this.data.entries.findIndex((e) => e.email.toLowerCase() === normalized);

    if (index === -1) return false;

    this.data.entries.splice(index, 1);
    this.emailSet.delete(normalized);
    this.data.lastUpdated = new Date().toISOString();
    this.dirty = true;

    await this.persist();
    return true;
  }

  /**
   * Get all unsubscribed email addresses.
   */
  getUnsubscribedEmails(): string[] {
    return this.data.entries.map((e) => e.email);
  }

  /**
   * Get full unsubscribe entry for an email.
   */
  getEntry(email: string): UnsubscribeEntry | undefined {
    if (!email) return undefined;
    const normalized = email.toLowerCase().trim();
    return this.data.entries.find((e) => e.email.toLowerCase() === normalized);
  }

  /**
   * Get count of unsubscribed emails.
   */
  getCount(): number {
    return this.data.entries.length;
  }

  /**
   * Reload data from disk (e.g., after external changes).
   */
  async reload(): Promise<void> {
    this.data = this.load();
    this.emailSet = new Set(this.data.entries.map((e) => e.email.toLowerCase()));
    this.dirty = false;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private load(): UnsubscribeData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw) as UnsubscribeData;
      }
    } catch (err) {
      console.error('[UnsubscribeManager] Failed to load unsubscribe list:', (err as Error).message);
    }
    return { entries: [], lastUpdated: null };
  }

  private async persist(): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch (err) {
      console.error('[UnsubscribeManager] Failed to persist unsubscribe list:', (err as Error).message);
    }
  }

  private persistSync(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch (err) {
      console.error('[UnsubscribeManager] Failed to persist (sync) unsubscribe list:', (err as Error).message);
    }
  }
}

export default UnsubscribeManager;