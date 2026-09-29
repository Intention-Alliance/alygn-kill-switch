/**
 * Dignity Verifier — SQLite Metadata Store
 *
 * Stores training-run and augmentation-run metadata. SQLite holds **metadata
 * only** — the dataset content itself lives in JSONL files (source of truth).
 *
 * Uses `bun:sqlite` (Bun-native), matching the kill-switch pattern
 * (`apps/server-kill-switch/src/db/index.ts`). WAL mode for concurrent reads.
 *
 * Owned by Zuldrak. Strict TypeScript, no `any`. All functions are async.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AugmentationRunMeta, TrainingRunMeta } from './types';

/** Default data directory (relative to this module). */
const DEFAULT_DATA_DIR = join(import.meta.dir, '..', 'data');

/** Default SQLite database path. */
const DEFAULT_DB_PATH = join(DEFAULT_DATA_DIR, 'dignity-verifier-metadata.sqlite');

/** A row in the training_runs table. */
interface TrainingRunRow {
  id: string;
  date: string;
  epochs: number;
  loss: number;
  eval_accuracy: number;
  example_count: number;
  config: string;
}

/** A row in the augmentation_runs table. */
interface AugmentationRunRow {
  id: string;
  date: string;
  input_count: number;
  output_count: number;
  dedup_count: number;
  config: string;
}

/** SQLite metadata store. */
export class MetadataStore {
  private readonly db: Database;

  /**
   * Construct a store. Accepts either an already-open `Database` (from
   * `MetadataStore.open()`) or a filesystem path string. When given a path,
   * the database is opened (created if absent), PRAGMAs are applied, and the
   * migration SQL files are run synchronously so the store is immediately
   * usable.
   */
  private constructor(dbOrPath: string | Database) {
    if (typeof dbOrPath === 'string') {
      mkdirSync(join(dbOrPath, '..'), { recursive: true });
      this.db = new Database(dbOrPath, { create: true });
      this.db.run('PRAGMA journal_mode=WAL');
      this.db.run('PRAGMA foreign_keys=ON');
      this.db.run('PRAGMA busy_timeout=5000');
      this.applyMigrationsSync();
    } else {
      this.db = dbOrPath;
    }
  }

  /** Apply migration SQL files synchronously (used when constructed with a path). */
  private applyMigrationsSync(): void {
    const migrationsDir = join(import.meta.dir, 'migrations');
    let files: string[];
    try {
      files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    } catch {
      return; // no migrations dir
    }
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      this.db.exec(sql);
    }
  }

  /**
   * Open (or create) the metadata store and ensure tables exist. Applies the
   * migration SQL files from `migrations/` if present.
   */
  static async open(dbPath: string = DEFAULT_DB_PATH): Promise<MetadataStore> {
    mkdirSync(join(dbPath, '..'), { recursive: true });
    const db = new Database(dbPath, { create: true });
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA foreign_keys=ON');
    db.run('PRAGMA busy_timeout=5000');

    const store = new MetadataStore(db);
    await store.applyMigrations();
    return store;
  }

  /** Apply migration SQL files from the migrations directory. */
  private async applyMigrations(): Promise<void> {
    const { readdir, readFile } = await import('node:fs/promises');
    const migrationsDir = join(import.meta.dir, 'migrations');
    let files: string[];
    try {
      files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    } catch {
      return; // no migrations dir
    }
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      this.db.exec(sql);
    }
  }

  /** Record a training run. Returns the stored metadata. */
  async recordTrainingRun(meta: TrainingRunMeta): Promise<TrainingRunMeta> {
    const id = meta.id ?? `run-${Date.now()}`;
    const exampleCount = meta.exampleCount ?? 0;
    this.db
      .prepare(
        `INSERT INTO training_runs (id, date, epochs, loss, eval_accuracy, example_count, config)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        meta.date,
        meta.epochs,
        meta.loss,
        meta.evalAccuracy,
        exampleCount,
        JSON.stringify(meta.config),
      );
    return { ...meta, id, exampleCount };
  }

  /** List all training runs, newest first. */
  async getTrainingRuns(): Promise<TrainingRunMeta[]> {
    const rows = this.db
      .prepare('SELECT * FROM training_runs ORDER BY date DESC')
      .all() as unknown as TrainingRunRow[];
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      epochs: r.epochs,
      loss: r.loss,
      evalAccuracy: r.eval_accuracy,
      exampleCount: r.example_count,
      config: JSON.parse(r.config) as Record<string, unknown>,
    }));
  }

  /** Record an augmentation run. Returns the stored metadata. */
  async recordAugmentationRun(meta: AugmentationRunMeta): Promise<AugmentationRunMeta> {
    this.db
      .prepare(
        `INSERT INTO augmentation_runs (id, date, input_count, output_count, dedup_count, config)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        meta.id,
        meta.date,
        meta.inputCount,
        meta.outputCount,
        meta.dedupCount,
        JSON.stringify(meta.config),
      );
    return meta;
  }

  /** List all augmentation runs, newest first. */
  async getAugmentationRuns(): Promise<AugmentationRunMeta[]> {
    const rows = this.db
      .prepare('SELECT * FROM augmentation_runs ORDER BY date DESC')
      .all() as unknown as AugmentationRunRow[];
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      inputCount: r.input_count,
      outputCount: r.output_count,
      dedupCount: r.dedup_count,
      config: JSON.parse(r.config) as Record<string, unknown>,
    }));
  }

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
  }
}
