/**
 * Lockout State Machine — sliding 60s window, 50 consecutive 401s → locked.
 *
 * Rules (locked decisions):
 *  - 50 consecutive 401s over 60s window triggers block
 *  - Auto-unlock after 48h
 *  - No manual unlock
 *  - Every 401 increments counter (in-memory + persisted to audit log)
 *  - Every successful auth (200) resets counter to 0
 *  - State persisted to ~/.openclaw/secrets.lockout.json (mode 600)
 *  - SIGHUP + fs.watch on the lockout-state file for cross-restart persistence
 *
 * @author Keridz ⚙️
 */

import { watch, type FSWatcher } from 'node:fs';
import { readFile, writeFile, chmod, rename, mkdir } from 'node:fs/promises';
import { openSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { EventEmitter } from 'node:events';

// ─── Types ─────────────────────────────────────────────────────────────

export type LockoutState = 'ok' | 'locked';

export interface LockoutEntry {
  timestamp: number;
  sourceIp: string;
}

export interface LockoutPersistedState {
  state: LockoutState;
  lockedAt: number | null;
  autoUnlockAt: number | null;
  recent401s: number;
  consecutive401s: number;
  events: LockoutEntry[];
  last401Source: string | null;
  lastEventAt: number | null;
}

export interface LockoutCheckResult {
  state: LockoutState;
  consecutive401s: number;
  recent401s: number;
  autoUnlockAt: number | null;
  last401Source: string | null;
  lastEventAt: number | null;
  locked: boolean;
  autoUnlockRemainingMs: number | null;
}

// ─── Constants ─────────────────────────────────────────────────────────

const DEFAULT_LOCKOUT_PATH = resolve(
  process.env.HOME || '/root',
  '.openclaw/secrets.lockout.json',
);

export const THRESHOLD_401_COUNT = 50;
export const WINDOW_MS = 60_000; // 60s sliding window
export const AUTO_UNLOCK_MS = 48 * 60 * 60 * 1000; // 48h

// ─── Helpers ───────────────────────────────────────────────────────────

async function atomicWriteFile(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmpPath, content, { encoding: 'utf-8', mode: 0o600 });
  const fd = openSync(tmpPath, 'r');
  fsyncSync(fd);
  closeSync(fd);
  await rename(tmpPath, path);
  await chmod(path, 0o600);
}

function defaultState(): LockoutPersistedState {
  return {
    state: 'ok',
    lockedAt: null,
    autoUnlockAt: null,
    recent401s: 0,
    consecutive401s: 0,
    events: [],
    last401Source: null,
    lastEventAt: null,
  };
}

// ─── LockoutStateMachine ────────────────────────────────────────────────

export class LockoutStateMachine extends EventEmitter {
  private state: LockoutPersistedState;
  private lockoutPath: string;
  private fsWatcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: { lockoutPath?: string; threshold?: number; windowMs?: number; autoUnlockMs?: number } = {}) {
    super();
    this.lockoutPath = opts.lockoutPath || DEFAULT_LOCKOUT_PATH;
    this.state = defaultState();
  }

  /**
   * Load persisted state from disk. If file missing or corrupt, start fresh.
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.lockoutPath, 'utf-8');
      const parsed = JSON.parse(content) as LockoutPersistedState;
      // Validate minimum fields
      if (typeof parsed.state === 'string' && typeof parsed.consecutive401s === 'number') {
        this.state = { ...defaultState(), ...parsed };
        // Re-evaluate auto-unlock on load
        this.checkAutoUnlock();
      } else {
        this.state = defaultState();
      }
    } catch {
      this.state = defaultState();
    }
  }

  /**
   * Persist current state to disk (atomic, mode 600).
   */
  async persist(): Promise<void> {
    await atomicWriteFile(this.lockoutPath, JSON.stringify(this.state, null, 2) + '\n');
  }

  /**
   * Record a 401 event. Increments counter, may trigger lockout.
   * Returns the updated check result.
   */
  async record401(sourceIp: string): Promise<LockoutCheckResult> {
    const now = Date.now();

    // Prune events outside the 60s sliding window
    this.state.events = this.state.events.filter(
      (e) => now - e.timestamp < WINDOW_MS,
    );

    // Add new event
    this.state.events.push({ timestamp: now, sourceIp });
    this.state.consecutive401s += 1;
    this.state.recent401s = this.state.events.length;
    this.state.last401Source = sourceIp;
    this.state.lastEventAt = now;

    // Check threshold
    if (this.state.consecutive401s >= THRESHOLD_401_COUNT && this.state.state !== 'locked') {
      this.state.state = 'locked';
      this.state.lockedAt = now;
      this.state.autoUnlockAt = now + AUTO_UNLOCK_MS;
      this.emit('locked', this.getCheckResult());
    }

    await this.persist();
    return this.getCheckResult();
  }

  /**
   * Record a successful auth (200). Resets counter to 0.
   */
  async record200(): Promise<LockoutCheckResult> {
    if (this.state.consecutive401s > 0 || this.state.events.length > 0) {
      this.state.consecutive401s = 0;
      this.state.events = [];
      this.state.recent401s = 0;
      // Do NOT reset a locked state — lockout only clears via auto-unlock
      if (this.state.state !== 'locked') {
        this.state.lastEventAt = Date.now();
      }
      await this.persist();
    }
    return this.getCheckResult();
  }

  /**
   * Check if auto-unlock should fire. Called by poll and on load.
   */
  checkAutoUnlock(): boolean {
    if (this.state.state === 'locked' && this.state.autoUnlockAt !== null) {
      if (Date.now() >= this.state.autoUnlockAt) {
        this.state.state = 'ok';
        this.state.lockedAt = null;
        this.state.autoUnlockAt = null;
        this.state.consecutive401s = 0;
        this.state.events = [];
        this.state.recent401s = 0;
        this.state.lastEventAt = Date.now();
        this.emit('unlocked', this.getCheckResult());
        return true;
      }
    }
    return false;
  }

  /**
   * Get current state snapshot.
   */
  getCheckResult(): LockoutCheckResult {
    const now = Date.now();
    let autoUnlockRemainingMs: number | null = null;
    if (this.state.state === 'locked' && this.state.autoUnlockAt !== null) {
      autoUnlockRemainingMs = Math.max(0, this.state.autoUnlockAt - now);
    }

    // Prune events for accurate recent401s
    const recentEvents = this.state.events.filter(
      (e) => now - e.timestamp < WINDOW_MS,
    );

    return {
      state: this.state.state,
      consecutive401s: this.state.consecutive401s,
      autoUnlockAt: this.state.autoUnlockAt,
      last401Source: this.state.last401Source,
      lastEventAt: this.state.lastEventAt,
      locked: this.state.state === 'locked',
      autoUnlockRemainingMs,
      recent401s: recentEvents.length,
    };
  }

  /**
   * Get lockout state label for API response.
   * 'ok' | 'locked' | 'auto-unlock-in-XXh'
   */
  getLockoutLabel(): string {
    if (this.state.state === 'ok') return 'ok';
    if (this.state.autoUnlockAt !== null) {
      const remaining = Math.max(0, this.state.autoUnlockAt - Date.now());
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      return `auto-unlock-in-${hours}h`;
    }
    return 'locked';
  }

  /**
   * Start fs.watch on the lockout state file for cross-process sync.
   */
  startFsWatch(): void {
    try {
      this.fsWatcher = watch(this.lockoutPath, { persistent: false }, () => {
        // Debounce
        setTimeout(() => {
          this.load().catch(() => {});
        }, 100);
      });
      this.fsWatcher.on('error', () => {});
    } catch {
      // File may not exist yet — safe to ignore
    }
  }

  /**
   * Start poll for auto-unlock evaluation (runs every 60s, plus 24h full re-eval).
   */
  startPoll(): void {
    // Short poll for auto-unlock checking
    this.pollTimer = setInterval(() => {
      if (this.checkAutoUnlock()) {
        this.persist().catch(() => {});
      }
    }, 60_000);
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  /**
   * Start all watchers.
   */
  startWatchers(): void {
    this.startFsWatch();
    this.startPoll();
  }

  /**
   * Stop all watchers.
   */
  stopWatchers(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Reset state to defaults (for tests).
   */
  reset(): void {
    this.state = defaultState();
  }
}