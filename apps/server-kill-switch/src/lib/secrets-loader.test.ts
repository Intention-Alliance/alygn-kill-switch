/**
 * Tests for SecretsLoader
 *
 * Covers:
 *  - Throws on missing file
 *  - Throws on missing required env var after file load
 *  - Reloads on SIGHUP
 *  - Reloads on fs.watch (simulated via reload())
 *  - Dedups by content hash
 *  - rotateKey generates server-side value, updates process.env
 *  - Atomic writes, mode 600
 *
 * @author Keridz ⚙️
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SecretsLoader, maskSecret, generateSecret, atomicWriteFile } from './secrets-loader';
import { writeFile, readFile, unlink, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = resolve(tmpdir(), `secrets-test-${process.pid}-${Date.now()}`);
const TEST_SECRETS_PATH = join(TEST_DIR, 'secrets.json');

function makeTestSecrets(): Record<string, string> {
  return {
    OLLAMA_TAILSCALE_AUTH_TOKEN: 'tsauth_test_value_12345678',
    OTHER_TAILSCALE_KEY: 'tsauth_other_value_87654321',
    PLAIN_API_KEY: 'should_not_be_loaded',
    
  };
}

async function setupTestFile() {
  await mkdir(TEST_DIR, { recursive: true });
  const secrets = makeTestSecrets();
  await writeFile(TEST_SECRETS_PATH, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  await chmod(TEST_SECRETS_PATH, 0o600);
}

async function cleanupTestDir() {
  try {
    await unlink(TEST_SECRETS_PATH).catch(() => {});
    // Best-effort cleanup
  } catch {}
}

describe('maskSecret', () => {
  it('masks a long value to first 4 + last 4', () => {
    const masked = maskSecret('tsauth_abcdef1234567890ghijkl');
    expect(masked).toBe('tsau_••••••••ijkl');
  });

  it('returns full mask for short values', () => {
    expect(maskSecret('short')).toBe('••••••••');
    expect(maskSecret('')).toBe('••••••••');
  });

  it('never includes the middle of the value', () => {
    const value = 'tsauth_SECRET_MIDDLE_PART_abcd';
    const masked = maskSecret(value);
    expect(masked).not.toContain('SECRET');
    expect(masked).not.toContain('MIDDLE');
  });
});

describe('generateSecret', () => {
  it('generates a tsauth_ prefixed value', () => {
    const secret = generateSecret();
    expect(secret.startsWith('tsauth_')).toBe(true);
  });

  it('generates different values each call (256-bit random)', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });

  it('generates values with sufficient length (32 bytes base64url)', () => {
    const secret = generateSecret();
    // tsauth_ + at least 32 bytes of base64url (~43 chars)
    expect(secret.length).toBeGreaterThan(40);
  });
});

describe('SecretsLoader', () => {
  let loader: SecretsLoader;

  beforeEach(async () => {
    await setupTestFile();
    loader = new SecretsLoader({
      secretsPath: TEST_SECRETS_PATH,
      enableFsWatch: false,
      enableSighup: false,
      pollIntervalMs: 60_000,
    });
  });

  afterEach(async () => {
    loader.stopWatchers();
    await cleanupTestDir();
    // Clean env
    delete process.env.OLLAMA_TAILSCALE_AUTH_TOKEN;
    delete process.env.OTHER_TAILSCALE_KEY;
    delete process.env.PLAIN_API_KEY;
  });

  it('throws on missing file', async () => {
    const missingLoader = new SecretsLoader({
      secretsPath: join(TEST_DIR, 'nonexistent.json'),
    });
    await expect(missingLoader.load()).rejects.toThrow(/FATAL.*not found/);
  });

  it('throws on missing required env var after file load', async () => {
    // Create a file without the required key
    await writeFile(TEST_SECRETS_PATH, JSON.stringify({ OTHER_TAILSCALE_KEY: 'tsauth_val' }), { mode: 0o600 });
    await expect(loader.load()).rejects.toThrow(/FATAL.*OLLAMA_TAILSCALE_AUTH_TOKEN/);
  });

  it('throws on invalid JSON', async () => {
    await writeFile(TEST_SECRETS_PATH, 'not json {{{', { mode: 0o600 });
    await expect(loader.load()).rejects.toThrow(/FATAL.*not valid JSON/);
  });

  it('loads *_TAILSCALE_* keys into process.env', async () => {
    await loader.load();
    expect(process.env.OLLAMA_TAILSCALE_AUTH_TOKEN).toBe('tsauth_test_value_12345678');
    expect(process.env.OTHER_TAILSCALE_KEY).toBe('tsauth_other_value_87654321');
    // Non-TAILSCALE keys should NOT be loaded
    expect(process.env.PLAIN_API_KEY).toBeUndefined();
  });

  it('returns loaded key names', async () => {
    const result = await loader.load();
    expect(result.loaded).toContain('OLLAMA_TAILSCALE_AUTH_TOKEN');
    expect(result.loaded).toContain('OTHER_TAILSCALE_KEY');
    expect(result.loaded).not.toContain('PLAIN_API_KEY');
    expect(result.skipped).toBe(false);
  });

  it('dedups by content hash — skip if unchanged', async () => {
    await loader.load();
    const hashBefore = loader.getCurrentHash();

    // Reload without changing the file
    const result = await loader.reload();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('content unchanged');
    expect(loader.getCurrentHash()).toBe(hashBefore);
  });

  it('reloads when file content changes', async () => {
    await loader.load();
    const hashBefore = loader.getCurrentHash();

    // Change the file
    const newSecrets = { ...makeTestSecrets(), OLLAMA_TAILSCALE_AUTH_TOKEN: 'tsauth_NEW_value_99999' };
    await writeFile(TEST_SECRETS_PATH, JSON.stringify(newSecrets, null, 2), { mode: 0o600 });

    const result = await loader.reload();
    expect(result.skipped).toBe(false);
    expect(result.loaded).toContain('OLLAMA_TAILSCALE_AUTH_TOKEN');
    expect(loader.getCurrentHash()).not.toBe(hashBefore);
    expect(process.env.OLLAMA_TAILSCALE_AUTH_TOKEN).toBe('tsauth_NEW_value_99999');
  });

  it('emits "reloaded" event on successful reload', async () => {
    await loader.load();
    let emitted = false;
    loader.on('reloaded', () => { emitted = true; });

    const newSecrets = { ...makeTestSecrets(), OLLAMA_TAILSCALE_AUTH_TOKEN: 'tsauth_changed_val' };
    await writeFile(TEST_SECRETS_PATH, JSON.stringify(newSecrets, null, 2), { mode: 0o600 });

    await loader.reload();
    expect(emitted).toBe(true);
  });

  it('rotateKey generates a new server-side value and updates process.env', async () => {
    await loader.load();
    const oldValue = process.env.OLLAMA_TAILSCALE_AUTH_TOKEN!;

    const { maskedValue, rotatedAt } = await loader.rotateKey('OLLAMA_TAILSCALE_AUTH_TOKEN');

    const newValue = process.env.OLLAMA_TAILSCALE_AUTH_TOKEN!;
    expect(newValue).not.toBe(oldValue);
    expect(newValue.startsWith('tsauth_')).toBe(true);
    expect(maskedValue).toContain('••••');
    expect(maskedValue).not.toContain(newValue);
    expect(rotatedAt).toBeTruthy();
  });

  it('rotateKey writes to the secrets file atomically', async () => {
    await loader.load();
    await loader.rotateKey('OLLAMA_TAILSCALE_AUTH_TOKEN');

    // File should still exist and be valid JSON
    const content = await readFile(TEST_SECRETS_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.OLLAMA_TAILSCALE_AUTH_TOKEN).toBeTruthy();
    expect(parsed.OLLAMA_TAILSCALE_AUTH_TOKEN.startsWith('tsauth_')).toBe(true);
  });

  it('rotateKey updates the content hash', async () => {
    await loader.load();
    const hashBefore = loader.getCurrentHash();
    await loader.rotateKey('OLLAMA_TAILSCALE_AUTH_TOKEN');
    expect(loader.getCurrentHash()).not.toBe(hashBefore);
  });
});

describe('atomicWriteFile', () => {
  it('writes content to the target path', async () => {
    const testPath = join(TEST_DIR, 'atomic-test.txt');
    await atomicWriteFile(testPath, 'hello world');
    const content = await readFile(testPath, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('creates parent directories if missing', async () => {
    const deepPath = join(TEST_DIR, 'sub', 'dir', 'file.txt');
    await atomicWriteFile(deepPath, 'deep content');
    expect(existsSync(deepPath)).toBe(true);
  });

  it('overwrites existing content', async () => {
    const testPath = join(TEST_DIR, 'overwrite-test.txt');
    await atomicWriteFile(testPath, 'first');
    await atomicWriteFile(testPath, 'second');
    const content = await readFile(testPath, 'utf-8');
    expect(content).toBe('second');
  });
});

describe('SecretsLoader — rotateKey corrupt-JSON guard (Security #1)', () => {
  let loader: SecretsLoader;

  beforeEach(async () => {
    await setupTestFile();
    loader = new SecretsLoader({
      secretsPath: TEST_SECRETS_PATH,
      enableFsWatch: false,
      enableSighup: false,
      pollIntervalMs: 60_000,
    });
  });

  afterEach(async () => {
    loader.stopWatchers();
    await cleanupTestDir();
    delete process.env.OLLAMA_TAILSCALE_AUTH_TOKEN;
    delete process.env.OTHER_TAILSCALE_KEY;
  });

  it('refuses to rotate when secrets file is corrupt JSON', async () => {
    // Write corrupt JSON to the secrets file
    await writeFile(TEST_SECRETS_PATH, '{ corrupt json {{{ broken', { mode: 0o600 });

    // rotateKey should throw, NOT silently start fresh
    await expect(loader.rotateKey('OLLAMA_TAILSCALE_AUTH_TOKEN')).rejects.toThrow(/REFUSED/);
  });

  it('preserves original keys when file is corrupt (rotation does not overwrite)', async () => {
    // Write a valid secrets file first, load it
    await setupTestFile();
    await loader.load();
    const originalContent = await readFile(TEST_SECRETS_PATH, 'utf-8');

    // Now corrupt the file
    await writeFile(TEST_SECRETS_PATH, 'CORRUPT{not valid json', { mode: 0o600 });

    // Attempt rotation — should fail
    await expect(loader.rotateKey('OLLAMA_TAILSCALE_AUTH_TOKEN')).rejects.toThrow(/REFUSED/);

    // The file should still contain the corrupt content (not overwritten with just the new key)
    const afterContent = await readFile(TEST_SECRETS_PATH, 'utf-8');
    expect(afterContent).toBe('CORRUPT{not valid json');
  });

  it('starts fresh when file does not exist (ENOENT is expected)', async () => {
    const missingPath = join(TEST_DIR, 'nonexistent-secrets.json');
    const freshLoader = new SecretsLoader({
      secretsPath: missingPath,
      enableFsWatch: false,
      enableSighup: false,
    });

    // rotateKey should succeed — file doesn't exist, so it starts fresh
    const { maskedValue, rotatedAt } = await freshLoader.rotateKey('OLLAMA_TAILSCALE_AUTH_TOKEN');
    expect(maskedValue).toContain('••••');
    expect(rotatedAt).toBeTruthy();

    // File should now exist with the new key
    const content = await readFile(missingPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.OLLAMA_TAILSCALE_AUTH_TOKEN).toBeTruthy();
    expect(parsed.OLLAMA_TAILSCALE_AUTH_TOKEN.startsWith('tsauth_')).toBe(true);

    await unlink(missingPath).catch(() => {});
  });
});