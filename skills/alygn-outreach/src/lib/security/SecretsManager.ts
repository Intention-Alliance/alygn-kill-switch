/**
 * SecretsManager — Secure credential storage with encryption at rest
 *
 * Design:
 *  - storeSecret(key, value, opts?): encrypt and persist
 *  - getSecret(key): decrypt and retrieve
 *  - rotateSecret(key, newValue): rotate with version tracking
 *  - deleteSecret(key): remove secret
 *  - listSecrets(): list keys only (never values)
 *  - AES-256-GCM encryption via Node.js crypto
 *  - Key derivation from master key (PBKDF2)
 *  - Metadata: createdAt, updatedAt, version
 *  - AuditLogger integration for all access
 *
 * No new dependencies — uses only Node.js built-ins (fs/promises, path, crypto).
 */
import { appendFile, mkdir, readFile, unlink, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as crypto from 'node:crypto';
import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SecretMetadata {
  /** Unique secret id (uuid v4) */
  id: string;
  /** Logical key name */
  key: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last update timestamp */
  updatedAt: string;
  /** Monotonically increasing version counter */
  version: number;
  /** Encryption algorithm used */
  algorithm: string;
  /** Key derivation salt (hex) */
  salt: string;
  /** Initialization vector (hex) */
  iv: string;
  /** GCM auth tag (hex) */
  authTag: string;
}

export interface StoredSecret {
  metadata: SecretMetadata;
  /** Encrypted ciphertext (hex) */
  ciphertext: string;
}

export interface StoreSecretOptions {
  /** Optional description for audit trail */
  description?: string;
  /** Actor for audit log (default: 'system') */
  actor?: string;
}

export interface SecretsManagerOptions {
  /** Master key used for key derivation (hex-encoded, 32+ bytes recommended) */
  masterKey: string;
  /** Directory for secret storage (default: data/secrets) */
  dataDir?: string;
  /** Key derivation iterations for PBKDF2 (default: 600_000) */
  pbkdf2Iterations?: number;
  /** AuditLogger instance for access logging */
  auditLogger?: AuditLogger;
  /** Called when an internal operation fails */
  onError?: (error: Error, context: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16;
const DEFAULT_PBKDF2_ITERATIONS = 600_000;
const DEFAULT_DATA_DIR = 'data/secrets';

// ── Implementation ─────────────────────────────────────────────────────────

export class SecretsManager {
  private readonly masterKey: string;
  private readonly dataDir: string;
  private readonly pbkdf2Iterations: number;
  private readonly auditLogger?: AuditLogger;
  private readonly onError?: (error: Error, context: string) => void;

  constructor(options: SecretsManagerOptions) {
    if (!options.masterKey) {
      throw new Error('SecretsManager: masterKey is required');
    }
    this.masterKey = options.masterKey;
    this.dataDir = resolve(options.dataDir ?? DEFAULT_DATA_DIR);
    this.pbkdf2Iterations = options.pbkdf2Iterations ?? DEFAULT_PBKDF2_ITERATIONS;
    this.auditLogger = options.auditLogger;
    this.onError = options.onError;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Encrypt and store a secret under the given key.
   * Overwrites if key already exists (version increments).
   */
  async storeSecret(
    key: string,
    value: string,
    opts?: StoreSecretOptions,
  ): Promise<SecretMetadata> {
    this.validateKey(key);

    const actor = opts?.actor ?? 'system';
    const now = new Date().toISOString();
    const existing = await this.readStoredSecret(key).catch(() => null);

    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = this.deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const metadata: SecretMetadata = {
      id: existing?.metadata.id ?? crypto.randomUUID(),
      key,
      createdAt: existing?.metadata.createdAt ?? now,
      updatedAt: now,
      version: (existing?.metadata.version ?? 0) + 1,
      algorithm: ALGORITHM,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };

    const record: StoredSecret = {
      metadata,
      ciphertext: encrypted.toString('hex'),
    };

    await this.ensureDir();
    const filePath = this.secretPath(key);
    const tmpPath = filePath + '.tmp';
    await this.writeAtomic(tmpPath, filePath, JSON.stringify(record, null, 2));

    await this.audit('secret.store', key, actor, 'success', {
      version: metadata.version,
      description: opts?.description,
    });

    return metadata;
  }

  /**
   * Decrypt and retrieve a secret by key.
   */
  async getSecret(key: string, actor?: string): Promise<string> {
    this.validateKey(key);
    const record = await this.readStoredSecret(key);

    const derivedKey = this.deriveKey(Buffer.from(record.metadata.salt, 'hex'));
    const iv = Buffer.from(record.metadata.iv, 'hex');
    const authTag = Buffer.from(record.metadata.authTag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'hex')),
      decipher.final(),
    ]);

    await this.audit('secret.get', key, actor ?? 'system', 'success', {
      version: record.metadata.version,
    });

    return decrypted.toString('utf8');
  }

  /**
   * Rotate a secret: store new value, increment version.
   */
  async rotateSecret(
    key: string,
    newValue: string,
    opts?: StoreSecretOptions,
  ): Promise<SecretMetadata> {
    this.validateKey(key);

    // Verify secret exists first
    await this.readStoredSecret(key);

    const metadata = await this.storeSecret(key, newValue, {
      ...opts,
      actor: opts?.actor ?? 'system',
    });

    await this.audit('secret.rotate', key, opts?.actor ?? 'system', 'success', {
      version: metadata.version,
    });

    return metadata;
  }

  /**
   * Delete a secret by key.
   */
  async deleteSecret(key: string, actor?: string): Promise<void> {
    this.validateKey(key);

    const filePath = this.secretPath(key);
    await unlink(filePath);

    await this.audit('secret.delete', key, actor ?? 'system', 'success', {});
  }

  /**
   * List all stored secret keys. Never returns values.
   */
  async listSecrets(): Promise<
    Pick<SecretMetadata, 'key' | 'createdAt' | 'updatedAt' | 'version'>[]
  > {
    await this.ensureDir();
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(this.dataDir);

    const results: Pick<
      SecretMetadata,
      'key' | 'createdAt' | 'updatedAt' | 'version'
    >[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.dataDir, file), 'utf8');
        const record: StoredSecret = JSON.parse(raw);
        results.push({
          key: record.metadata.key,
          createdAt: record.metadata.createdAt,
          updatedAt: record.metadata.updatedAt,
          version: record.metadata.version,
        });
      } catch {
        // Skip corrupted files silently
      }
    }

    await this.audit('secret.list', '*', 'system', 'success', {
      count: results.length,
    });

    return results;
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('SecretsManager: key must be a non-empty string');
    }
    if (key.includes('/') || key.includes('\\') || key.includes('..')) {
      throw new Error('SecretsManager: key contains invalid path characters');
    }
    if (key.length > 255) {
      throw new Error('SecretsManager: key exceeds 255 characters');
    }
  }

  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      this.pbkdf2Iterations,
      KEY_LENGTH,
      'sha256',
    );
  }

  private secretPath(key: string): string {
    // Sanitize key for filesystem safety
    const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.dataDir, `${safeName}.json`);
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
  }

  private async readStoredSecret(key: string): Promise<StoredSecret> {
    const filePath = this.secretPath(key);
    const raw = await readFile(filePath, 'utf8');
    const record: StoredSecret = JSON.parse(raw);
    if (!record.metadata || !record.ciphertext) {
      throw new Error(`SecretsManager: corrupted secret file for key "${key}"`);
    }
    return record;
  }

  private async writeAtomic(
    tmpPath: string,
    finalPath: string,
    content: string,
  ): Promise<void> {
    await appendFile(tmpPath, content);
    await rename(tmpPath, finalPath);
  }

  private async audit(
    action: string,
    target: string,
    actor: string,
    result: 'success' | 'failure' | 'error',
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditLogger) return;
    try {
      await this.auditLogger.log(actor, action, target, details, result);
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)), `audit:${action}`);
    }
  }
}