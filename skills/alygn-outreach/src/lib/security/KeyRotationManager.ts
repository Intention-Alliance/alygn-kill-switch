/**
 * KeyRotationManager — Cryptographic key lifecycle with automatic rotation
 *
 * Design:
 *  - generateKey: creates a new key, marks it active, persists to store
 *  - rotateKey: generates new key, demotes current active → rotated
 *  - getActiveKey: returns the single active key (or throws)
 *  - getKey: lookup by id
 *  - revokeKey: mark a key revoked (cannot be used)
 *  - Automatic rotation via configurable schedule (check on init + periodic timer)
 *  - File persistence: JSONL key store in data/keys/
 *  - AuditLogger integration for every lifecycle event
 *
 * No new dependencies — uses only Node.js built-ins (fs/promises, path, crypto).
 */
import { appendFile, mkdir, readFile, unlink, rename } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────────

export type KeyStatus = 'active' | 'rotated' | 'revoked';

export interface KeyMetadata {
  /** Unique key id (uuid v4) */
  id: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 expiration timestamp (when rotation should occur) */
  expiresAt: string;
  /** Current lifecycle status */
  status: KeyStatus;
  /** Algorithm used to generate the key */
  algorithm: string;
  /** Key length in bits */
  bitLength: number;
  /** Optional human-readable label */
  label?: string;
}

export interface KeyRotationManagerOptions {
  /** Directory for key store files (default: data/keys) */
  dataDir?: string;
  /** Default key TTL in milliseconds (default: 30 days = 2_592_000_000) */
  defaultTtlMs?: number;
  /** Algorithm for key generation (default: 'aes-256-gcm') */
  algorithm?: string;
  /** Key length in bits (default: 256) */
  bitLength?: number;
  /** How often to check for rotation, in milliseconds (default: 1 hour) */
  rotationCheckIntervalMs?: number;
  /** AuditLogger instance for audit trail */
  auditLogger?: AuditLogger;
  /** Called when an operation fails. */
  onError?: (error: Error, context: string) => void;
}

export interface GenerateKeyOptions {
  /** Custom TTL in milliseconds (overrides default) */
  ttlMs?: number;
  /** Human-readable label for the key */
  label?: string;
  /** Algorithm override */
  algorithm?: string;
  /** Bit length override */
  bitLength?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_DATA_DIR = 'data/keys';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_ALGORITHM = 'aes-256-gcm';
const DEFAULT_BIT_LENGTH = 256;
const DEFAULT_ROTATION_CHECK_MS = 60 * 60 * 1000; // 1 hour
const STORE_FILE = 'key-store.json';

// ── KeyRotationManager ─────────────────────────────────────────────────────

export class KeyRotationManager extends EventEmitter {
  private readonly dataDir: string;
  private readonly defaultTtlMs: number;
  private readonly algorithm: string;
  private readonly bitLength: number;
  private readonly rotationCheckIntervalMs: number;
  private readonly auditLogger?: AuditLogger;
  private readonly errorCallback?: (error: Error, context: string) => void;

  /** In-memory key index for fast lookups. Persisted to disk on every mutation. */
  private keys: Map<string, KeyMetadata> = new Map();
  private loaded = false;
  private rotationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: KeyRotationManagerOptions = {}) {
    super();
    this.errorCallback = opts.onError;
    this.auditLogger = opts.auditLogger;

    const rawDir = opts.dataDir ?? DEFAULT_DATA_DIR;
    const absDir = resolve(rawDir);
    const cwdRoot = resolve('.');
    const rel = relative(cwdRoot, absDir);
    if (rel.startsWith('..')) {
      throw new Error(
        `KeyRotationManager: dataDir "${rawDir}" resolves outside the project root. Path traversal is not allowed.`,
      );
    }
    this.dataDir = absDir;
    this.defaultTtlMs = opts.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.algorithm = opts.algorithm ?? DEFAULT_ALGORITHM;
    this.bitLength = opts.bitLength ?? DEFAULT_BIT_LENGTH;
    this.rotationCheckIntervalMs = opts.rotationCheckIntervalMs ?? DEFAULT_ROTATION_CHECK_MS;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Initialize: load persisted keys and start the automatic rotation timer.
   * Must be called before any other method (or they will call it lazily).
   */
  async init(): Promise<void> {
    if (this.loaded) return;
    await this.loadStore();
    this.loaded = true;
    this.startRotationTimer();
  }

  /** Stop the rotation timer. Call on shutdown. */
  async shutdown(): Promise<void> {
    this.stopRotationTimer();
    if (this.loaded) {
      await this.persistStore();
    }
  }

  // ── Core Operations ────────────────────────────────────────────

  /**
   * Generate a new key and mark it active.
   * If another key is currently active, it remains active (use rotateKey to demote it).
   * Returns the key metadata (the raw secret is NOT stored — only metadata).
   */
  async generateKey(options: GenerateKeyOptions = {}): Promise<{ metadata: KeyMetadata; secret: string }> {
    await this.ensureLoaded();

    const algo = options.algorithm ?? this.algorithm;
    const bits = options.bitLength ?? this.bitLength;
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;

    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // Generate the actual cryptographic key material
    const byteLength = bits / 8;
    const secret = crypto.randomBytes(byteLength).toString('hex');

    const metadata: KeyMetadata = {
      id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active',
      algorithm: algo,
      bitLength: bits,
      label: options.label,
    };

    this.keys.set(id, metadata);
    await this.persistStore();

    await this.audit('key.generate', id, {
      algorithm: algo,
      bitLength: bits,
      expiresAt: metadata.expiresAt,
      label: options.label,
    });

    this.emit('keyGenerated', metadata);
    return { metadata, secret };
  }

  /**
   * Rotate keys: generate a new active key and demote the current active key to 'rotated'.
   * Returns the new key. The old key's secret is no longer valid for new operations.
   */
  async rotateKey(options: GenerateKeyOptions = {}): Promise<{ metadata: KeyMetadata; secret: string }> {
    await this.ensureLoaded();

    // Demote current active key(s) — there should be only one, but be safe
    const demoted: string[] = [];
    for (const [kid, meta] of this.keys) {
      if (meta.status === 'active') {
        meta.status = 'rotated';
        this.keys.set(kid, meta);
        demoted.push(kid);
        await this.audit('key.demoted', kid, { newStatus: 'rotated', reason: 'rotation' });
        this.emit('keyRotated', meta);
      }
    }

    // Generate the new active key
    const result = await this.generateKey(options);

    await this.audit('key.rotate', result.metadata.id, {
      demotedKeys: demoted,
      newKeyId: result.metadata.id,
    });

    return result;
  }

  /**
   * Get the currently active key metadata.
   * Throws if no active key exists.
   */
  async getActiveKey(): Promise<KeyMetadata> {
    await this.ensureLoaded();

    for (const meta of this.keys.values()) {
      if (meta.status === 'active') {
        return meta;
      }
    }
    throw new Error('KeyRotationManager: no active key available. Call generateKey() or rotateKey() first.');
  }

  /**
   * Get a specific key by id.
   * Returns undefined if not found.
   */
  async getKey(id: string): Promise<KeyMetadata | undefined> {
    await this.ensureLoaded();
    return this.keys.get(id);
  }

  /**
   * Revoke a key by id. Revoked keys cannot be used.
   * Cannot revoke the only active key without generating a replacement first.
   */
  async revokeKey(id: string): Promise<KeyMetadata> {
    await this.ensureLoaded();

    const meta = this.keys.get(id);
    if (!meta) {
      throw new Error(`KeyRotationManager: key "${id}" not found.`);
    }
    if (meta.status === 'revoked') {
      throw new Error(`KeyRotationManager: key "${id}" is already revoked.`);
    }
    if (meta.status === 'active') {
      // Count active keys — don't allow revoking the last one
      let activeCount = 0;
      for (const m of this.keys.values()) {
        if (m.status === 'active') activeCount++;
      }
      if (activeCount <= 1) {
        throw new Error(
          'KeyRotationManager: cannot revoke the only active key. Call rotateKey() first to create a replacement.',
        );
      }
    }

    const prevStatus = meta.status;
    meta.status = 'revoked';
    this.keys.set(id, meta);
    await this.persistStore();

    await this.audit('key.revoke', id, { previousStatus: prevStatus });
    this.emit('keyRevoked', meta);

    return meta;
  }

  /**
   * List all keys, optionally filtered by status.
   */
  async listKeys(status?: KeyStatus): Promise<KeyMetadata[]> {
    await this.ensureLoaded();
    const result: KeyMetadata[] = [];
    for (const meta of this.keys.values()) {
      if (!status || meta.status === status) {
        result.push(meta);
      }
    }
    return result;
  }

  // ── Automatic Rotation ─────────────────────────────────────────

  /**
   * Check all active keys for expiration and rotate if needed.
   * Called automatically by the rotation timer, but can also be invoked manually.
   * Returns the ids of keys that were auto-rotated.
   */
  async checkAndRotate(): Promise<string[]> {
    await this.ensureLoaded();

    const now = Date.now();
    const expired: string[] = [];

    for (const [id, meta] of this.keys) {
      if (meta.status === 'active' && new Date(meta.expiresAt).getTime() <= now) {
        expired.push(id);
      }
    }

    if (expired.length > 0) {
      // rotateKey handles demotion + new key generation
      await this.rotateKey({ label: 'auto-rotation' });
    }

    return expired;
  }

  // ── Persistence ─────────────────────────────────────────────────

  /** Get the data directory path (for external consumers) */
  getDataDir(): string {
    return this.dataDir;
  }

  // ── Private ─────────────────────────────────────────────────────

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.init();
    }
  }

  private startRotationTimer(): void {
    if (this.rotationTimer) return;
    this.rotationTimer = setInterval(() => {
      this.checkAndRotate().catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit('error', error);
        this.errorCallback?.(error, 'rotation-check');
      });
    }, this.rotationCheckIntervalMs);

    // Don't prevent process exit
    if (this.rotationTimer && typeof this.rotationTimer === 'object' && 'unref' in this.rotationTimer) {
      (this.rotationTimer as ReturnType<typeof setInterval> & { unref(): void }).unref();
    }
  }

  private stopRotationTimer(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  private async loadStore(): Promise<void> {
    const filePath = join(this.dataDir, STORE_FILE);
    try {
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as KeyMetadata[];
      this.keys.clear();
      for (const meta of data) {
        this.keys.set(meta.id, meta);
      }
    } catch {
      // File doesn't exist yet — start empty
      this.keys.clear();
    }
  }

  private async persistStore(): Promise<void> {
    try {
      await mkdir(this.dataDir, { recursive: true });
      const filePath = join(this.dataDir, STORE_FILE);
      const tmpPath = filePath + '.tmp';

      const data = Array.from(this.keys.values());
      const json = JSON.stringify(data, null, 2);

      // Atomic write: write to tmp, then rename
      const { writeFile } = await import('node:fs/promises');
      await writeFile(tmpPath, json, 'utf-8');
      await rename(tmpPath, filePath);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      this.errorCallback?.(error, 'persist');
      // Re-throw — persistence failure is critical
      throw error;
    }
  }

  private async audit(action: string, target: string, details: Record<string, unknown>): Promise<void> {
    if (!this.auditLogger) return;
    try {
      await this.auditLogger.log('KeyRotationManager', action, target, details);
    } catch {
      // Audit failures must not crash the key manager
    }
  }
}