/**
 * Shared types for the backup subsystem
 */

export interface BackupEntry {
  /** Relative path within the data directory (e.g. "sent-emails/sent-emails.json") */
  path: string;
  /** File content as a UTF-8 string */
  content: string;
}

export interface BackupMetadata {
  /** ISO timestamp of when the backup was created */
  createdAt: string;
  /** Number of file entries in the backup */
  entryCount: number;
  /** Total uncompressed size in bytes */
  uncompressedSize: number;
  /** Data directories that were backed up */
  sourceDirs: string[];
}

export interface VerifyResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RestoreResult {
  success: boolean;
  restoredFiles: string[];
  skippedFiles: string[];
  errors: string[];
}

export interface BackupManagerOptions {
  /** Data directories to back up (relative to dataDir) */
  sourceDirs: string[];
  /** Directory where backups are stored */
  backupDir: string;
  /** Root data directory */
  dataDir: string;
  /** Number of backups to retain (default: 7) */
  retention: number;
  /** Backup interval in milliseconds (default: 6h) */
  intervalMs: number;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  createdAt: string;
  metadata?: BackupMetadata;
}