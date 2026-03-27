/**
 * SupabaseSimulator — Simulates Supabase database writes as JSON files
 * 
 * In Mode B dry-run, instead of calling supabase.from(table).upsert()
 * or .insert(), this module writes equivalent JSON files that match
 * the TypeScript row types defined in supabase-mappers.ts.
 */
import fs from 'fs';
import path from 'path';
import {
  MunicipalityInsert,
  LocalGovernmentRow,
  OutreachEmailInsert,
  PoliticalFigureInsert,
} from '../../entities/supabase-mappers';
import { getDryRunBaseDir, ensureDryRunDirs } from './DryRunSimulator';

/**
 * Record of a simulated Supabase operation, written to disk.
 */
export interface SimulatedSupabaseOperation {
  table: string;
  operation: 'insert' | 'upsert' | 'update' | 'delete';
  timestamp: string;
  rows: Record<string, unknown>[];
  dryRun: true;
  simulatedAt: string;
  /** Optional: link to related Notion simulation file */
  relatedNotionFiles?: string[];
}

/**
 * Generic table names supported by the simulator.
 */
export type SimulatedTable =
  | 'municipalities'
  | 'local_governments'
  | 'outreach_emails'
  | 'political_figures';

/**
 * Simulate a Supabase upsert (insert or update on conflict).
 * Writes rows to data/dry-run/supabase/{table}-{timestamp}.json
 * 
 * @param table - Target table name
 * @param rows - Row data matching the TypeScript types from supabase-mappers.ts
 */
export async function simulateSupabaseUpsert<T extends Record<string, unknown>>(
  table: SimulatedTable,
  rows: T[]
): Promise<{ data: T[]; error: null }> {
  const baseDir = getDryRunBaseDir();
  ensureDryRunDirs(baseDir);

  const timestamp = Date.now();
  const operation: SimulatedSupabaseOperation = {
    table,
    operation: 'upsert',
    timestamp: new Date().toISOString(),
    rows: rows as Record<string, unknown>[],
    dryRun: true,
    simulatedAt: new Date().toISOString(),
  };

  const filename = `${table}-${timestamp}.json`;
  const filepath = path.join(baseDir, 'supabase', filename);

  fs.writeFileSync(filepath, JSON.stringify(operation, null, 2));

  console.log(`[SUPABASE DRY RUN] Would upsert ${rows.length} row(s) to "${table}"`);
  console.log(`                   Saved to: ${filepath}`);

  return { data: rows, error: null };
}

/**
 * Simulate a Supabase insert.
 */
export async function simulateSupabaseInsert<T extends Record<string, unknown>>(
  table: SimulatedTable,
  rows: T[]
): Promise<{ data: T[]; error: null }> {
  const baseDir = getDryRunBaseDir();
  ensureDryRunDirs(baseDir);

  const timestamp = Date.now();
  const operation: SimulatedSupabaseOperation = {
    table,
    operation: 'insert',
    timestamp: new Date().toISOString(),
    rows: rows as Record<string, unknown>[],
    dryRun: true,
    simulatedAt: new Date().toISOString(),
  };

  const filename = `${table}-insert-${timestamp}.json`;
  const filepath = path.join(baseDir, 'supabase', filename);

  fs.writeFileSync(filepath, JSON.stringify(operation, null, 2));

  console.log(`[SUPABASE DRY RUN] Would insert ${rows.length} row(s) to "${table}"`);
  console.log(`                   Saved to: ${filepath}`);

  return { data: rows, error: null };
}

/**
 * Simulate a Supabase update.
 */
export async function simulateSupabaseUpdate<T extends Record<string, unknown>>(
  table: SimulatedTable,
  rows: T[],
  matchField: string = 'id'
): Promise<{ data: T[]; error: null }> {
  const baseDir = getDryRunBaseDir();
  ensureDryRunDirs(baseDir);

  const timestamp = Date.now();
  const operation: SimulatedSupabaseOperation = {
    table,
    operation: 'update',
    timestamp: new Date().toISOString(),
    rows: rows as Record<string, unknown>[],
    dryRun: true,
    simulatedAt: new Date().toISOString(),
  };

  const filename = `${table}-update-${timestamp}.json`;
  const filepath = path.join(baseDir, 'supabase', filename);

  fs.writeFileSync(filepath, JSON.stringify(operation, null, 2));

  console.log(`[SUPABASE DRY RUN] Would update ${rows.length} row(s) in "${table}"`);
  console.log(`                   Match field: ${matchField}`);
  console.log(`                   Saved to: ${filepath}`);

  return { data: rows, error: null };
}

// ─── Convenience wrappers with correct types ─────────────────────────────────

/**
 * Simulate upserting municipalities.
 */
export async function simulateMunicipalityUpsert(
  municipalities: MunicipalityInsert[]
) {
  return simulateSupabaseUpsert('municipalities', municipalities as unknown as Record<string, unknown>[]);
}

/**
 * Simulate upserting local governments.
 */
export async function simulateLocalGovernmentUpsert(
  localGovernments: Partial<LocalGovernmentRow>[]
) {
  return simulateSupabaseUpsert('local_governments', localGovernments as unknown as Record<string, unknown>[]);
}

/**
 * Simulate inserting outreach emails.
 */
export async function simulateOutreachEmailInsert(
  emails: OutreachEmailInsert[]
) {
  return simulateSupabaseInsert('outreach_emails', emails as unknown as Record<string, unknown>[]);
}

/**
 * Simulate inserting political figures.
 */
export async function simulatePoliticalFigureInsert(
  figures: PoliticalFigureInsert[]
) {
  return simulateSupabaseInsert('political_figures', figures as unknown as Record<string, unknown>[]);
}

export default {
  simulateSupabaseUpsert,
  simulateSupabaseInsert,
  simulateSupabaseUpdate,
  simulateMunicipalityUpsert,
  simulateLocalGovernmentUpsert,
  simulateOutreachEmailInsert,
  simulatePoliticalFigureInsert,
};
