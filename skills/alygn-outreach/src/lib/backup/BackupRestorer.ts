import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import type { RestoreResult, BackupInfo, BackupEntry } from './types.js';
import { BackupVerifier } from './BackupVerifier.js';
import { decompress } from './compress.js';

export interface RestoreOptions {
  /** Must be true to actually write files. Dry-run otherwise. */
  confirm: boolean;
  /** Root data directory to restore into */
  dataDir: string;
  /** Backup directory to scan */
  backupDir: string;
}

const DEFAULT_RESTORE_OPTS: Partial<RestoreOptions> = {
  dataDir: 'data',
  backupDir: 'data/backups',
};

export class BackupRestorer {
  private readonly opts: RestoreOptions;
  private readonly verifier: BackupVerifier;

  constructor(opts: Partial<RestoreOptions> = {}) {
    this.opts = { ...DEFAULT_RESTORE_OPTS, ...opts } as RestoreOptions;
    this.verifier = new BackupVerifier();
  }

  /** List available backups sorted newest-first */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const files = await readdir(this.opts.backupDir);
      const backups: BackupInfo[] = [];

      for (const f of files) {
        if (!f.startsWith('backup-') || !f.endsWith('.jsonl.gz')) continue;
        const fp = join(this.opts.backupDir, f);
        const s = await stat(fp);
        backups.push({
          filename: f,
          path: fp,
          size: s.size,
          createdAt: s.mtime.toISOString(),
        });
      }

      backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return backups;
    } catch {
      return [];
    }
  }

  /**
   * Restore a backup.
   * If confirm=false, performs a dry-run (validates + lists files but doesn't write).
   * If confirm=true, writes files to dataDir (existing files are backed up with .bak suffix).
   */
  async restore(backupPath: string, opts?: { confirm?: boolean }): Promise<RestoreResult> {
    const confirm = opts?.confirm ?? this.opts.confirm ?? false;
    const errors: string[] = [];
    const restoredFiles: string[] = [];
    const skippedFiles: string[] = [];

    // 1. Pre-restore validation
    const verifyResult = await this.verifier.verify(backupPath);
    if (!verifyResult.valid) {
      return {
        success: false,
        restoredFiles: [],
        skippedFiles: [],
        errors: [`Verification failed: ${verifyResult.errors.join('; ')}`],
      };
    }

    // 2. Decompress and parse
    let entries: BackupEntry[];
    try {
      const raw = await decompress(await readFile(backupPath));
      entries = this.parseEntries(raw.toString('utf-8'));
    } catch (err) {
      return {
        success: false,
        restoredFiles: [],
        skippedFiles: [],
        errors: [`Failed to read backup: ${(err as Error).message}`],
      };
    }

    if (entries.length === 0) {
      return {
        success: false,
        restoredFiles: [],
        skippedFiles: [],
        errors: ['Backup contains no file entries'],
      };
    }

    // 3. Dry-run mode — just report what would be restored
    if (!confirm) {
      return {
        success: true,
        restoredFiles: [],
        skippedFiles: entries.map((e) => e.path),
        errors: ['Dry-run: no files written. Set confirm=true to restore.'],
      };
    }

    // 4. Write files
    for (const entry of entries) {
      // ── Path traversal guard ──
      const resolvedTarget = resolve(this.opts.dataDir, entry.path);
      const resolvedDataDir = resolve(this.opts.dataDir);
      if (!resolvedTarget.startsWith(resolvedDataDir + '/') && resolvedTarget !== resolvedDataDir) {
        errors.push(`Path traversal rejected: ${entry.path}`);
        skippedFiles.push(entry.path);
        continue;
      }

      const targetPath = resolvedTarget;

      try {
        // Ensure parent directory exists
        await mkdir(dirname(targetPath), { recursive: true });

        // Back up existing file with .bak suffix
        try {
          const existing = await stat(targetPath);
          if (existing.isFile()) {
            await rename(targetPath, targetPath + '.bak');
          }
        } catch {
          // No existing file — fine
        }

        await writeFile(targetPath, entry.content, 'utf-8');
        restoredFiles.push(entry.path);
      } catch (err) {
        errors.push(`Failed to restore ${entry.path}: ${(err as Error).message}`);
        skippedFiles.push(entry.path);
      }
    }

    return {
      success: errors.length === 0,
      restoredFiles,
      skippedFiles,
      errors,
    };
  }

  // ── Internal ──────────────────────────────────────────────────

  private parseEntries(text: string): BackupEntry[] {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const entries: BackupEntry[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        // Skip metadata lines
        if ('__meta' in parsed) continue;
        if (typeof parsed.path === 'string' && typeof parsed.content === 'string') {
          entries.push({ path: parsed.path, content: parsed.content });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

}