import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VerifyResult, BackupMetadata } from './types.js';
import { decompress } from './compress.js';

export class BackupVerifier {
  /**
   * Verify a backup archive's integrity.
   * Checks: exists, non-zero, can decompress, contains expected files.
   */
  async verify(backupPath: string, expectedDirs?: string[]): Promise<VerifyResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. File exists and non-zero
    let fileSize: number;
    try {
      const s = await stat(backupPath);
      fileSize = s.size;
      if (!s.isFile()) {
        errors.push('Path is not a file');
      }
      if (fileSize === 0) {
        errors.push('Backup file is empty (0 bytes)');
      }
    } catch (err) {
      return { valid: false, errors: [`Backup file not found: ${backupPath}`], warnings: [] };
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings: [] };
    }

    // 2. Can decompress
    let raw: Buffer;
    try {
      raw = await decompress(await readFile(backupPath));
    } catch (err) {
      return { valid: false, errors: [`Decompression failed: ${(err as Error).message}`], warnings: [] };
    }

    // 3. Parse JSONL lines
    const text = raw.toString('utf-8');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      return { valid: false, errors: ['Backup contains no entries'], warnings: [] };
    }

    // 4. Validate each entry is valid JSON with a `path` field
    const paths: string[] = [];
    let metadata: BackupMetadata | null = null;

    for (let i = 0; i < lines.length; i++) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(lines[i]);
      } catch {
        errors.push(`Line ${i + 1}: invalid JSON`);
        continue;
      }

      // Check for metadata line
      if ('__meta' in parsed) {
        metadata = parsed.__meta as BackupMetadata;
        continue;
      }

      if (typeof parsed.path !== 'string' || !parsed.path) {
        errors.push(`Line ${i + 1}: missing or invalid "path" field`);
        continue;
      }

      if (typeof parsed.content !== 'string') {
        errors.push(`Line ${i + 1}: missing or invalid "content" field`);
        continue;
      }

      paths.push(parsed.path);
    }

    if (paths.length === 0 && !metadata) {
      errors.push('No valid file entries found in backup');
    }

    // 5. Check expected directories are represented
    if (expectedDirs && expectedDirs.length > 0 && paths.length > 0) {
      for (const dir of expectedDirs) {
        const hasEntry = paths.some((p) => p === dir || p.startsWith(dir + '/') || p.startsWith(dir + '\\'));
        if (!hasEntry) {
          // Not necessarily an error — dir might be empty/absent. Log as warning.
          warnings.push(`No entries found for expected directory: ${dir}`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

}