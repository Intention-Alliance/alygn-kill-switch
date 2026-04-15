import { readdir, readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { BackupManagerOptions, BackupEntry, BackupMetadata, BackupInfo } from './types.js';
import { compress, decompress } from './compress.js';

const DEFAULT_OPTIONS: Partial<BackupManagerOptions> = {
  sourceDirs: [
    'sent-emails',
    'unsubscribe-list',
    'email-queue',
    'webhook-logs',
    'alerts',
    'metrics',
  ],
  backupDir: 'data/backups',
  dataDir: 'data',
  retention: 7,
  intervalMs: 6 * 60 * 60 * 1000, // 6h
};

export class BackupManager {
  private readonly opts: BackupManagerOptions;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: Partial<BackupManagerOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts } as BackupManagerOptions;
  }

  // ── Public API ────────────────────────────────────────────────

  /** Create a backup now and return the backup file path */
  async backup(): Promise<string> {
    await mkdir(this.opts.backupDir, { recursive: true });

    const entries = await this.collectEntries();
    const metadata: BackupMetadata = {
      createdAt: new Date().toISOString(),
      entryCount: entries.length,
      uncompressedSize: entries.reduce((sum, e) => sum + Buffer.byteLength(e.content, 'utf-8'), 0),
      sourceDirs: this.opts.sourceDirs,
    };

    // JSONL: one JSON line per entry, plus a metadata line at the end
    const metadataLine = JSON.stringify({ __meta: metadata });
    const lines = entries.map((e) => JSON.stringify(e));
    lines.push(metadataLine);

    const raw = lines.join('\n');
    const compressed = await compress(Buffer.from(raw, 'utf-8'));

    const filename = `backup-${this.timestamp()}.jsonl.gz`;
    const filepath = join(this.opts.backupDir, filename);
    await writeFile(filepath, compressed);

    await this.enforceRetention();

    return filepath;
  }

  /** Start scheduled backups */
  startSchedule(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.backup().catch((err) => {
        console.error('[BackupManager] scheduled backup failed:', err);
      });
    }, this.opts.intervalMs);
    // Don't prevent process exit
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  /** Stop scheduled backups */
  stopSchedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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

  /** Read metadata from a backup file without full decompression */
  async readMetadata(backupPath: string): Promise<BackupMetadata | null> {
    try {
      const raw = await decompress(await readFile(backupPath));
      const lines = raw.toString('utf-8').split('\n');
      const lastLine = lines[lines.length - 1] || lines[lines.length - 2];
      if (!lastLine) return null;
      const parsed = JSON.parse(lastLine);
      return parsed.__meta ?? null;
    } catch {
      return null;
    }
  }

  // ── Internal ──────────────────────────────────────────────────

  private async collectEntries(): Promise<BackupEntry[]> {
    const entries: BackupEntry[] = [];

    for (const dir of this.opts.sourceDirs) {
      const absDir = join(this.opts.dataDir, dir);
      await this.walkDir(absDir, this.opts.dataDir, entries);
    }

    return entries;
  }

  private async walkDir(dir: string, root: string, entries: BackupEntry[]): Promise<void> {
    let items: string[];
    try {
      items = await readdir(dir);
    } catch {
      // Directory doesn't exist — skip silently
      return;
    }

    for (const item of items) {
      const full = join(dir, item);
      const s = await stat(full);
      if (s.isDirectory()) {
        await this.walkDir(full, root, entries);
      } else if (s.isFile()) {
        const rel = relative(root, full);
        const content = await readFile(full, 'utf-8');
        entries.push({ path: rel, content });
      }
    }
  }


  private async enforceRetention(): Promise<void> {
    const backups = await this.listBackups();
    if (backups.length <= this.opts.retention) return;

    const toRemove = backups.slice(this.opts.retention);
    for (const b of toRemove) {
      try {
        await unlink(b.path);
      } catch {
        // best-effort
      }
    }
  }

  private timestamp(): string {
    const d = new Date();
    return d.toISOString().replace(/[:.]/g, '-');
  }
}