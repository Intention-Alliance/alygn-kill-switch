/**
 * DryRunSimulator — Core dry-run execution context
 * 
 * Shared logic for determining which dry-run mode is active
 * and coordinating simulation across Notion and Supabase.
 */
import fs from 'fs';
import path from 'path';

export type DryRunMode = 'none' | 'A' | 'B';

/**
 * Determines the active dry-run mode from options and environment.
 * 
 * @param options.dryRun — CLI --dry-run flag
 * @param options.env — Environment variables (defaults to process.env)
 * 
 * @returns 'none' | 'A' | 'B'
 *   'none' = not a dry run
 *   'A'    = --dry-run only (mock data, no API calls)
 *   'B'    = --dry-run + USE_DIRECT_API=true (real APIs, simulated DB writes)
 */
export function getDryRunMode(options: { dryRun?: boolean; env?: Record<string, string | undefined> }): DryRunMode {
  const env = options.env || process.env;
  
  if (!options.dryRun) {
    return 'none';
  }
  
  const useDirectAPI = env.USE_DIRECT_API === 'true';
  return useDirectAPI ? 'B' : 'A';
}

/**
 * Returns true when Mode B is active: real APIs + simulated DB writes.
 */
export function isModeB(options: { dryRun?: boolean; env?: Record<string, string | undefined> }): boolean {
  return getDryRunMode(options) === 'B';
}

/**
 * Returns true when Mode A is active: mock data only, no external calls.
 */
export function isModeA(options: { dryRun?: boolean; env?: Record<string, string | undefined> }): boolean {
  return getDryRunMode(options) === 'A';
}

/**
 * Ensures the dry-run data directory structure exists.
 * Call once at startup; safe to call multiple times.
 */
export function ensureDryRunDirs(baseDir: string): void {
  const dirs = [
    path.join(baseDir, 'notion'),
    path.join(baseDir, 'supabase'),
    path.join(baseDir, 'reports'),
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Returns the configured dry-run base directory.
 * Defaults to data/dry-run relative to the skill root.
 */
export function getDryRunBaseDir(skillRoot?: string): string {
  if (skillRoot) {
    return path.join(skillRoot, 'data', 'dry-run');
  }
  // Resolve relative to this file (src/lib/dry-run/)
  return path.resolve(__dirname, '../../../data/dry-run');
}

export default {
  getDryRunMode,
  isModeB,
  isModeA,
  ensureDryRunDirs,
  getDryRunBaseDir,
};
