/**
 * Secrets Loader — the heart of the kill-switch secret rotation system.
 *
 * Responsibilities:
 *  - On startup, load ~/.openclaw/secrets.json (mode 600) → set process.env for all managed keys
 *  - Throw on startup if file missing OR required env var missing (loud, no silent 401s)
 *  - SIGHUP handler re-reads file, updates process.env, logs reload to audit log
 *  - fs.watch on secrets.json re-reads on change, dedup by content hash
 *  - 24h poll re-reads file as paranoia fallback, dedup by content hash
 *  - Config-file write side: after rotation, write new value to each dependent config file
 *
 * Locked decisions:
 *  - Env var: OLLAMA_TAILSCALE_AUTH_TOKEN (legacy name, forward-compat)
 *  - Server-generated only (tsauth_<base64url-32-bytes> 256-bit)
 *  - Reload: fs.watch + SIGHUP + 24h poll, all three, dedup by content hash
 *
 * Agent/VPN-agnostic: which keys the loader manages is driven by a configurable
 * key marker (default `_SECRET_`), NOT a hardcoded vendor name. Legacy
 * `_TAILSCALE_` keys are still recognized for backward compatibility.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { watch, type FSWatcher } from 'node:fs';
import { readFile, writeFile, mkdir, chmod, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { EventEmitter } from 'node:events';

// ─── Types ─────────────────────────────────────────────────────────────

export interface SecretsFile {
  [key: string]: string;
}

export interface SecretsReloadResult {
  loaded: string[];
  skipped: boolean;
  reason?: string;
  hash: string;
}

export interface SecretsLoaderOptions {
  secretsPath?: string;
  requiredKeys?: string[];
  onReload?: (result: SecretsReloadResult) => void;
  enableFsWatch?: boolean;
  enableSighup?: boolean;
  pollIntervalMs?: number;
  /**
   * Substring marker that identifies which keys the loader manages.
   * Defaults to `_SECRET_` (agent/VPN-agnostic). Legacy `_TAILSCALE_` keys
   * are always recognized for backward compatibility. Overridable via the
   * `SECRETS_KEY_MARKER` env var.
   */
  keyMarker?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────

const DEFAULT_SECRETS_PATH = resolve(
  process.env.HOME || '/root',
  '.openclaw/secrets.json',
);

const DEFAULT_POLL_INTERVAL = 24 * 60 * 60 * 1000; // 24h

/**
 * Default key marker that identifies managed secrets. Agent/VPN-agnostic.
 * Overridable via the `SECRETS_KEY_MARKER` env var.
 */
const DEFAULT_KEY_MARKER = process.env.SECRETS_KEY_MARKER || '_SECRET_';

/**
 * Legacy marker still recognized for backward compatibility so existing
 * `*_TAILSCALE_*` deployments keep working during the transition.
 */
const LEGACY_KEY_MARKER = '_TAILSCALE_';

/**
 * Mask a secret value: first 4 + last 4 visible, middle bullets.
 * Example: tsauth_abcdef...1234 → tsau_••••••••1234
 * Never logs the full value.
 */
export function maskSecret(value: string): string {
  if (!value || value.length < 12) return '••••••••';
  const prefix = value.slice(0, 4);
  const suffix = value.slice(-4);
  return `${prefix}_••••••••${suffix}`;
}

/**
 * Generate a new 256-bit server-side secret.
 * Format: tsauth_<base64url-32-bytes>
 *
 * The `tsauth_` prefix is retained for backward compatibility with existing
 * consumers that key off it; the secret itself is vendor-agnostic.
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = Buffer.from(bytes).toString('base64url');
  return `tsauth_${b64}`;
}

/**
 * Compute SHA-256 hash of file content for dedup.
 */
function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Ensure file has mode 600. Throws on failure.
 */
async function ensureMode600(path: string): Promise<void> {
  await chmod(path, 0o600);
}

/**
 * Atomic write: write to .tmp, fsync, rename to target, chmod 600.
 * Never exposes partial content on crash.
 */
export async function atomicWriteFile(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });

  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmpPath, content, { encoding: 'utf-8', mode: 0o600 });
  // fsync via a separate handle — Bun supports openSync/fsync
  const { openSync, fsyncSync, closeSync } = await import('node:fs');
  const fd = openSync(tmpPath, 'r');
  fsyncSync(fd);
  closeSync(fd);

  await rename(tmpPath, path);
  await ensureMode600(path);
}

// ─── Secrets Loader ────────────────────────────────────────────────────

export class SecretsLoader extends EventEmitter {
  private secretsPath: string;
  private requiredKeys: string[];
  private currentHash: string = '';
  private fsWatcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sighupHandler: (() => void) | null = null;
  private enableFsWatch: boolean;
  private enableSighup: boolean;
  private pollIntervalMs: number;
  private onReloadCallback: ((result: SecretsReloadResult) => void) | null;
  private loadedKeys: string[] = [];
  private keyMarker: string;

  constructor(opts: SecretsLoaderOptions = {}) {
    super();
    this.secretsPath = opts.secretsPath || DEFAULT_SECRETS_PATH;
    this.requiredKeys = opts.requiredKeys || ['OLLAMA_TAILSCALE_AUTH_TOKEN'];
    this.enableFsWatch = opts.enableFsWatch !== false;
    this.enableSighup = opts.enableSighup !== false;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
    this.onReloadCallback = opts.onReload || null;
    this.keyMarker = opts.keyMarker || DEFAULT_KEY_MARKER;
  }

  /**
   * Whether a key is managed by this loader. Matches the configured marker
   * OR the legacy `_TAILSCALE_` marker (backward compat).
   */
  private isManagedKey(key: string): boolean {
    return key.includes(this.keyMarker) || key.includes(LEGACY_KEY_MARKER);
  }

  /**
   * Initial load — throws on missing file or missing required key.
   * This is the "loud, no silent 401s" guarantee.
   */
  async load(): Promise<SecretsReloadResult> {
    let content: string;
    try {
      content = await readFile(this.secretsPath, 'utf-8');
    } catch {
      throw new Error(
        `[secrets-loader] FATAL: secrets file not found at ${this.secretsPath}. ` +
        'Create it with mode 600 and the required managed secret keys.',
      );
    }

    const hash = contentHash(content);
    this.currentHash = hash;

    let secrets: SecretsFile;
    try {
      secrets = JSON.parse(content);
    } catch {
      throw new Error(
        `[secrets-loader] FATAL: secrets file at ${this.secretsPath} is not valid JSON.`,
      );
    }

    // Set all managed keys into process.env
    const loaded: string[] = [];
    for (const [key, value] of Object.entries(secrets)) {
      if (this.isManagedKey(key) && typeof value === 'string') {
        process.env[key] = value;
        loaded.push(key);
      }
    }

    // Validate required keys
    for (const required of this.requiredKeys) {
      if (!process.env[required]) {
        throw new Error(
          `[secrets-loader] FATAL: required key '${required}' not found in ${this.secretsPath}.`,
        );
      }
    }

    this.loadedKeys = loaded;

    const result: SecretsReloadResult = { loaded, skipped: false, hash };
    this.emit('loaded', result);
    return result;
  }

  /**
   * Re-read the file and update process.env.
   * Dedup by content hash — if unchanged, skip.
   */
  async reload(): Promise<SecretsReloadResult> {
    let content: string;
    try {
      content = await readFile(this.secretsPath, 'utf-8');
    } catch (err) {
      const result: SecretsReloadResult = {
        loaded: [],
        skipped: true,
        reason: `read error: ${(err as Error).message}`,
        hash: this.currentHash,
      };
      this.emit('reload-error', result);
      if (this.onReloadCallback) this.onReloadCallback(result);
      return result;
    }

    const hash = contentHash(content);
    if (hash === this.currentHash) {
      const result: SecretsReloadResult = {
        loaded: [],
        skipped: true,
        reason: 'content unchanged',
        hash,
      };
      return result;
    }

    this.currentHash = hash;

    let secrets: SecretsFile;
    try {
      secrets = JSON.parse(content);
    } catch (err) {
      const result: SecretsReloadResult = {
        loaded: [],
        skipped: true,
        reason: `JSON parse error: ${(err as Error).message}`,
        hash,
      };
      this.emit('reload-error', result);
      if (this.onReloadCallback) this.onReloadCallback(result);
      return result;
    }

    // Update process.env for all managed keys
    const loaded: string[] = [];
    for (const [key, value] of Object.entries(secrets)) {
      if (this.isManagedKey(key) && typeof value === 'string') {
        process.env[key] = value;
        loaded.push(key);
      }
    }

    this.loadedKeys = loaded;

    const result: SecretsReloadResult = { loaded, skipped: false, hash };
    this.emit('reloaded', result);
    if (this.onReloadCallback) this.onReloadCallback(result);
    return result;
  }

  /**
   * Start fs.watch on the secrets file.
   */
  startFsWatch(): void {
    if (!this.enableFsWatch) return;
    try {
      this.fsWatcher = watch(this.secretsPath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          // Debounce: fs.watch can fire multiple events for a single edit
          setTimeout(() => {
            this.reload().catch((err) => {
              this.emit('reload-error', { reason: err.message, loaded: [], skipped: true, hash: this.currentHash });
            });
          }, 100);
        }
      });
      this.fsWatcher.on('error', (err) => {
        this.emit('watch-error', err);
      });
    } catch (err) {
      this.emit('watch-error', err);
    }
  }

  /**
   * Start SIGHUP handler for manual reload signal.
   */
  startSighupHandler(): void {
    if (!this.enableSighup) return;
    this.sighupHandler = () => {
      this.reload().catch((err) => {
        this.emit('reload-error', { reason: err.message, loaded: [], skipped: true, hash: this.currentHash });
      });
    };
    process.on('SIGHUP', this.sighupHandler);
  }

  /**
   * Start 24h poll as paranoia fallback.
   */
  startPoll(): void {
    this.pollTimer = setInterval(() => {
      this.reload().catch((err) => {
        this.emit('reload-error', { reason: err.message, loaded: [], skipped: true, hash: this.currentHash });
      });
    }, this.pollIntervalMs);
    // Don't keep the event loop alive just for polling
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  /**
   * Start all reload mechanisms: fs.watch + SIGHUP + 24h poll.
   */
  startWatchers(): void {
    this.startFsWatch();
    this.startSighupHandler();
    this.startPoll();
  }

  /**
   * Stop all watchers (for graceful shutdown / tests).
   */
  stopWatchers(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.sighupHandler) {
      process.removeListener('SIGHUP', this.sighupHandler);
      this.sighupHandler = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Get the list of currently loaded managed key names.
   */
  getLoadedKeys(): string[] {
    return [...this.loadedKeys];
  }

  /**
   * Get the current content hash.
   */
  getCurrentHash(): string {
    return this.currentHash;
  }

  /**
   * Update the secrets file with a new value for a key.
   * Atomic write, mode 600, never logs the value.
   */
  async rotateKey(keyName: string): Promise<{ maskedValue: string; rotatedAt: string }> {
    const newValue = generateSecret();

    // Read current file — distinguish file-not-found (expected) from corrupt JSON (refuse to rotate)
    let secrets: SecretsFile = {};
    try {
      const content = await readFile(this.secretsPath, 'utf-8');
      try {
        secrets = JSON.parse(content);
      } catch {
        // File exists but is corrupt — refuse to rotate to prevent wiping all keys
        throw new Error(
          `[secrets-loader] REFUSED: secrets file at ${this.secretsPath} exists but is not valid JSON. ` +
          'Rotation refused to prevent data loss. Inspect or restore the file manually.',
        );
      }
    } catch (err: any) {
      // Re-throw if it's our own REFUSED error
      if (err.message?.includes('REFUSED')) throw err;
      // ENOENT — file doesn't exist yet, start fresh (expected on first run)
      if (err.code !== 'ENOENT') throw err;
    }

    // Set new value
    secrets[keyName] = newValue;

    // Atomic write with mode 600
    await atomicWriteFile(this.secretsPath, JSON.stringify(secrets, null, 2) + '\n');

    // Update process.env
    process.env[keyName] = newValue;

    // Update hash
    const content = JSON.stringify(secrets, null, 2) + '\n';
    this.currentHash = contentHash(content);

    // Update loaded keys
    if (!this.loadedKeys.includes(keyName)) {
      this.loadedKeys.push(keyName);
    }

    const maskedValue = maskSecret(newValue);
    const rotatedAt = new Date().toISOString();

    return { maskedValue, rotatedAt };
  }
}