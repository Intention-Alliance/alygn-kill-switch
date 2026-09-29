/**
 * Dignity Verifier — Dataset Storage
 *
 * Reads/writes JSONL dataset files. JSONL is the **source of truth**; SQLite
 * (see `metadata.ts`) holds only training/augmentation run metadata.
 *
 * Owned by Zuldrak. Strict TypeScript, no `any`. All functions are async.
 *
 * Record shape (one JSONL line):
 *   { id?, prompt, output, verdict, reason, category, source?, parent_id? }
 *
 * Seed files store only (prompt, output, verdict, reason, category); `id` and
 * `source` are derived at read time. `id` is generated deterministically from
 * content so re-imports are idempotent.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Category,
  DatasetExample,
  DatasetFilter,
  DatasetSource,
  DatasetStats,
  Verdict,
} from './types';

/** Valid verdicts. */
const VERDICTS: readonly Verdict[] = ['SAFE', 'UNSAFE', 'REVIEW'] as const;

/** Type guard: is a string a valid Verdict? */
function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}

/** Valid sources. */
const SOURCES: readonly DatasetSource[] = ['seed', 'augmented', 'eval'] as const;

/** Default dataset root (relative to this module). */
const DEFAULT_DATASET_DIR = import.meta.dir;

/** Subdirectories scanned by readDataset, in order. */
const DATASET_SUBDIRS: readonly DatasetSource[] = ['seed', 'augmented', 'eval'] as const;

/** Maximum reason length in words. */
const MAX_REASON_WORDS = 5;

/** Error thrown for invalid dataset records. */
export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetValidationError';
  }
}

/** Error thrown when a requested example id does not exist. */
export class ExampleNotFoundError extends Error {
  constructor(id: string) {
    super(`Dataset example not found: ${id}`);
    this.name = 'ExampleNotFoundError';
  }
}

/** Options for reading a dataset directory. */
export interface ReadOptions {
  /** Directory containing JSONL files. Defaults to the dataset root. */
  dir?: string;
  /** Only read files matching this glob-ish suffix (e.g. `.jsonl`). */
  extension?: string;
}

/** A raw JSONL record as parsed from disk (before normalization). */
interface RawRecord {
  id?: unknown;
  prompt?: unknown;
  output?: unknown;
  verdict?: unknown;
  reason?: unknown;
  category?: unknown;
  source?: unknown;
  parent_id?: unknown;
  [key: string]: unknown;
}

/** Normalize a raw record into a validated DatasetExample. */
function normalizeRecord(raw: RawRecord, defaultSource: DatasetSource): DatasetExample {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  const output = typeof raw.output === 'string' ? raw.output.trim() : '';
  const verdict = typeof raw.verdict === 'string' ? (raw.verdict.toUpperCase() as Verdict) : '';
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  const category = typeof raw.category === 'string' ? (raw.category as Category) : '';
  const source = typeof raw.source === 'string' ? (raw.source as DatasetSource) : defaultSource;
  const parentId = typeof raw.parent_id === 'string' ? raw.parent_id : undefined;

  if (!prompt) throw new DatasetValidationError('Record missing non-empty "prompt"');
  if (!output) throw new DatasetValidationError('Record missing non-empty "output"');
  if (!isVerdict(verdict)) {
    throw new DatasetValidationError(`Invalid verdict "${String(raw.verdict)}" (expected SAFE|UNSAFE|REVIEW)`);
  }
  if (!reason) throw new DatasetValidationError('Record missing non-empty "reason"');
  if (reason.split(/\s+/).length > MAX_REASON_WORDS) {
    throw new DatasetValidationError(
      `Reason exceeds ${MAX_REASON_WORDS} words: "${reason}"`,
    );
  }
  if (!category) throw new DatasetValidationError('Record missing non-empty "category"');
  if (!SOURCES.includes(source)) {
    throw new DatasetValidationError(`Invalid source "${String(raw.source)}" (expected seed|augmented|eval)`);
  }

  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : deriveId(prompt, output);

  return { id, prompt, output, verdict, reason, category, source, parentId };
}

/** Derive a stable id from prompt+output content (idempotent re-imports). */
export function deriveId(prompt: string, output: string): string {
  const hash = createHash('sha1').update(`${prompt}\u0000${output}`).digest('hex').slice(0, 16);
  return `ex-${hash}`;
}

/** Read all JSONL files in the dataset subdirectories and return normalized examples. */
export async function readDataset(options: ReadOptions = {}): Promise<DatasetExample[]> {
  const dir = options.dir ?? DEFAULT_DATASET_DIR;
  const extension = options.extension ?? '.jsonl';

  const examples: DatasetExample[] = [];
  for (const subdir of DATASET_SUBDIRS) {
    const subPath = join(dir, subdir);
    let entries;
    try {
      entries = await readdir(subPath, { withFileTypes: true });
    } catch {
      continue; // subdir does not exist
    }
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(extension))
      .map((e) => e.name)
      .sort();

    for (const file of files) {
      const content = await readFile(join(subPath, file), 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let raw: RawRecord;
        try {
          raw = JSON.parse(trimmed) as RawRecord;
        } catch (err) {
          throw new DatasetValidationError(
            `Invalid JSON in ${subdir}/${file}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        examples.push(normalizeRecord(raw, subdir));
      }
    }
  }
  return examples;
}

/**
 * Read only the examples from a single JSONL file, normalized with the given
 * default source. Used by update/delete so they never touch other files.
 */
async function readDatasetFromFile(
  file: string,
  defaultSource: DatasetSource,
): Promise<DatasetExample[]> {
  const content = await readFile(file, 'utf8').catch(() => '');
  const examples: DatasetExample[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: RawRecord;
    try {
      raw = JSON.parse(trimmed) as RawRecord;
    } catch (err) {
      throw new DatasetValidationError(
        `Invalid JSON in ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    examples.push(normalizeRecord(raw, defaultSource));
  }
  return examples;
}

/** Serialize an example to a JSONL line. */
function serialize(example: DatasetExample): string {
  const record: Record<string, string> = {
    id: example.id,
    prompt: example.prompt,
    output: example.output,
    verdict: example.verdict,
    reason: example.reason,
    category: example.category,
    source: example.source,
  };
  if (example.parentId) record.parent_id = example.parentId;
  return JSON.stringify(record);
}

/** Apply a filter to an example. */
function matchesFilter(example: DatasetExample, filter: DatasetFilter): boolean {
  if (filter.verdict && example.verdict !== filter.verdict) return false;
  if (filter.category && example.category !== filter.category) return false;
  if (filter.source && example.source !== filter.source) return false;
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    if (
      !example.prompt.toLowerCase().includes(needle) &&
      !example.output.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  return true;
}

/** Detect duplicate prompt+output pairs (ignoring id/source). */
function findDuplicates(examples: DatasetExample[]): DatasetExample[] {
  const seen = new Map<string, DatasetExample>();
  const duplicates: DatasetExample[] = [];
  for (const ex of examples) {
    const key = `${ex.prompt}\u0000${ex.output}`;
    if (seen.has(key)) duplicates.push(ex);
    else seen.set(key, ex);
  }
  return duplicates;
}

/**
 * List examples, optionally filtered. Reads all JSONL files under the dataset
 * root (seed + augmented + eval) and applies the filter in memory.
 */
export async function listExamples(filter: DatasetFilter = {}): Promise<DatasetExample[]> {
  const examples = await readDataset();
  return examples.filter((ex) => matchesFilter(ex, filter));
}

/** Get a single example by id. Throws ExampleNotFoundError if absent. */
export async function getExample(id: string): Promise<DatasetExample> {
  const examples = await readDataset();
  const found = examples.find((ex) => ex.id === id);
  if (!found) throw new ExampleNotFoundError(id);
  return found;
}

/** Validate an example before write. Throws DatasetValidationError on failure. */
export function validateExample(example: DatasetExample): void {
  normalizeRecord(
    {
      id: example.id,
      prompt: example.prompt,
      output: example.output,
      verdict: example.verdict,
      reason: example.reason,
      category: example.category,
      source: example.source,
      parent_id: example.parentId,
    },
    example.source,
  );
}

/**
 * Add a new example. Writes to the appropriate JSONL file based on `source`
 * (seed → seed/seed-additions.jsonl, augmented → augmented/augmented.jsonl,
 * eval → eval/eval-additions.jsonl). Rejects duplicates (same prompt+output).
 */
export async function addExample(example: DatasetExample): Promise<DatasetExample> {
  validateExample(example);
  const existing = await listExamples();
  const dup = existing.find(
    (ex) => ex.prompt === example.prompt && ex.output === example.output,
  );
  if (dup) {
    throw new DatasetValidationError(
      `Duplicate example (prompt+output already exists as ${dup.id})`,
    );
  }
  const file = fileForSource(example.source);
  await appendLine(file, serialize(example));
  return example;
}

/** Update an example by id. Applies a partial patch and rewrites the file. */
export async function updateExample(
  id: string,
  patch: Partial<Omit<DatasetExample, 'id'>>,
): Promise<DatasetExample> {
  const target = await getExample(id);
  if (!target) throw new ExampleNotFoundError(id);

  const file = fileForSource(target.source);
  const examples = await readDatasetFromFile(file, target.source);
  const idx = examples.findIndex((ex) => ex.id === id);
  if (idx === -1) throw new ExampleNotFoundError(id);

  const updated: DatasetExample = { ...examples[idx]!, ...patch, id };
  validateExample(updated);

  examples[idx] = updated;
  await writeFile(file, examples.map(serialize).join('\n') + '\n', 'utf8');
  return updated;
}

/** Delete an example by id. Rewrites the containing file. */
export async function deleteExample(id: string): Promise<void> {
  const target = await getExample(id);
  if (!target) throw new ExampleNotFoundError(id);

  const file = fileForSource(target.source);
  const examples = await readDatasetFromFile(file, target.source);
  const remaining = examples.filter((ex) => ex.id !== id);
  if (remaining.length === examples.length) throw new ExampleNotFoundError(id);
  await writeFile(file, remaining.map(serialize).join('\n') + '\n', 'utf8');
}

/**
 * Import a JSONL file into the dataset. Each line is validated; invalid lines
 * are skipped and reported. Returns the count of imported examples.
 */
export async function importJsonl(
  filePath: string,
  source: DatasetSource = 'seed',
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const content = await readFile(filePath, 'utf8');
  const errors: string[] = [];
  const imported: DatasetExample[] = [];

  for (const [i, line] of content.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as RawRecord;
      imported.push(normalizeRecord(raw, source));
    } catch (err) {
      errors.push(`line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Deduplicate against existing dataset.
  const existing = await listExamples();
  const existingKeys = new Set(existing.map((ex) => `${ex.prompt}\u0000${ex.output}`));
  const fresh = imported.filter((ex) => !existingKeys.has(`${ex.prompt}\u0000${ex.output}`));
  const skipped = imported.length - fresh.length;

  if (fresh.length > 0) {
    const file = fileForSource(source);
    await appendLine(file, fresh.map(serialize).join('\n'));
  }

  return { imported: fresh.length, skipped, errors };
}

/**
 * Export examples (optionally filtered) to a JSONL file. Returns the path
 * written. If `filePath` is omitted, writes to `export.jsonl` in the dataset
 * root.
 */
export async function exportJsonl(
  filter: DatasetFilter = {},
  filePath?: string,
): Promise<string> {
  const examples = await listExamples(filter);
  const out = filePath ?? join(DEFAULT_DATASET_DIR, 'export.jsonl');
  await mkdir(join(out, '..'), { recursive: true });
  await writeFile(out, examples.map(serialize).join('\n') + '\n', 'utf8');
  return out;
}

/** Compute aggregate statistics over the dataset. */
export async function getStats(): Promise<DatasetStats> {
  const examples = await readDataset();

  const byVerdict: Record<Verdict, number> = { SAFE: 0, UNSAFE: 0, REVIEW: 0 };
  const byCategory = new Map<Category, number>();
  const bySource: Record<DatasetSource, number> = { seed: 0, augmented: 0, eval: 0 };

  for (const ex of examples) {
    byVerdict[ex.verdict] += 1;
    bySource[ex.source] += 1;
    byCategory.set(ex.category, (byCategory.get(ex.category) ?? 0) + 1);
  }

  const categoryRecord = Object.fromEntries(byCategory) as Record<Category, number>;
  const duplicates = findDuplicates(examples).length;

  return {
    total: examples.length,
    byVerdict,
    byCategory: categoryRecord,
    bySource,
    duplicates,
  };
}

/** Resolve the JSONL file path for a given source. */
function fileForSource(source: DatasetSource): string {
  switch (source) {
    case 'augmented':
      return join(DEFAULT_DATASET_DIR, 'augmented', 'augmented.jsonl');
    case 'eval':
      return join(DEFAULT_DATASET_DIR, 'eval', 'eval-additions.jsonl');
    case 'seed':
    default:
      return join(DEFAULT_DATASET_DIR, 'seed', 'seed-additions.jsonl');
  }
}

/** Append lines to a file, creating parent dirs as needed. */
async function appendLine(file: string, content: string): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true });
  const existing = await readFile(file, 'utf8').catch(() => '');
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  await writeFile(file, existing + separator + content + '\n', 'utf8');
}
