/**
 * Dignity Verifier Dashboard — Job runner
 *
 * Triggers teaching pipelines (training / augment / calibrate) as
 * subprocesses and persists a run record in SQLite. Enforces one concurrent
 * run per type via an in-process lock (returns 409 when busy).
 *
 * Lifecycle: queued → running → succeeded | failed.
 *
 * Logging: stdout+stderr are streamed to reports/runs/{runId}.log (gitignored
 * via apps/dignity-verifier/.gitignore → reports/). A bounded tail (≤100
 * lines) is persisted on the run row for the UI.
 */

import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db-schema";
import type { RunParams, RunRecord, RunStatus, RunType } from "./run-types";
import type { BuiltCommand } from "./run-commands";

// ─── Constants ───────────────────────────────────────────────────────────

const MAX_LOG_TAIL_LINES = 100;
// Logs land in apps/dignity-verifier/reports/runs/ (gitignored via
// apps/dignity-verifier/reports/ in the repo root .gitignore). Overridable
// via DIGNITY_REPORTS_DIR.
const REPORTS_DIR = path.join(
  process.env.DIGNITY_REPORTS_DIR ||
    path.resolve(process.cwd(), "..", "reports"),
  "runs",
);

// ─── In-process lock (one concurrent run per type) ───────────────────────

const activeLocks = new Map<RunType, boolean>();

/**
 * Try to acquire the per-type lock. Returns true if acquired, false if the
 * type is already running.
 */
function tryAcquire(type: RunType): boolean {
  if (activeLocks.get(type)) return false;
  activeLocks.set(type, true);
  return true;
}

function release(type: RunType): void {
  activeLocks.set(type, false);
}

// ─── Log tail ring buffer ────────────────────────────────────────────────

/** Append a line to a bounded ring buffer (keeps the last N lines). */
function pushLine(buffer: string[], line: string): void {
  buffer.push(line);
  if (buffer.length > MAX_LOG_TAIL_LINES) {
    buffer.splice(0, buffer.length - MAX_LOG_TAIL_LINES);
  }
}

// ─── Row mapping ─────────────────────────────────────────────────────────

type RunRow = typeof schema.runs.$inferSelect;

function toRunRecord(row: RunRow): RunRecord {
  let params: RunParams = {};
  try {
    params = JSON.parse(row.params) as RunParams;
  } catch {
    params = {};
  }
  return {
    id: row.id,
    type: row.type as RunType,
    status: row.status as RunStatus,
    params,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    exitCode: row.exitCode,
    logTail: row.logTail,
    artifactPath: row.artifactPath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

export interface EnqueueResult {
  ok: true;
  runId: string;
}

export interface BusyResult {
  ok: false;
  reason: "busy";
}

export type EnqueueOutcome = EnqueueResult | BusyResult;

/**
 * Enqueue a teaching run. Persists a queued row, then spawns the subprocess
 * and drives it to completion. Returns immediately with the runId; the
 * subprocess runs in the background.
 *
 * Returns { ok: false, reason: "busy" } if the type already has a run in
 * flight (in-process lock).
 */
export async function enqueueRun(
  type: RunType,
  params: RunParams,
  command: BuiltCommand,
): Promise<EnqueueOutcome> {
  if (!tryAcquire(type)) {
    return { ok: false, reason: "busy" };
  }

  const db = await getDb();
  const runId = crypto.randomUUID();
  const now = new Date();

  try {
    await db.insert(schema.runs).values({
      id: runId,
      type,
      status: "queued",
      params: JSON.stringify(params),
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    release(type);
    throw err;
  }

  // Fire-and-forget the subprocess lifecycle.
  void runSubprocess(runId, type, command);

  return { ok: true, runId };
}

/**
 * Drive a subprocess to completion, updating the run row through its
 * lifecycle and streaming logs to reports/runs/{runId}.log.
 */
async function runSubprocess(
  runId: string,
  type: RunType,
  command: BuiltCommand,
): Promise<void> {
  const db = await getDb();
  const startedAt = new Date();
  const logPath = path.join(REPORTS_DIR, `${runId}.log`);
  const tail: string[] = [];

  try {
    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(logPath, "", "utf-8");

    await db
      .update(schema.runs)
      .set({ status: "running", startedAt, updatedAt: new Date() })
      .where(eq(schema.runs.id, runId));

    const proc = Bun.spawn(command.args, {
      cwd: command.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const writeChunk = async (chunk: string): Promise<void> => {
      await appendFile(logPath, chunk, "utf-8");
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.length > 0) pushLine(tail, line);
      }
    };

    const stdoutReader = proc.stdout.getReader();
    const stderrReader = proc.stderr.getReader();

    const pump = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
    ): Promise<void> => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writeChunk(new TextDecoder().decode(value));
        }
      }
    };

    await Promise.all([pump(stdoutReader), pump(stderrReader)]);
    const exitCode = await proc.exited;

    const finishedAt = new Date();
    const status: RunStatus = exitCode === 0 ? "succeeded" : "failed";

    await db
      .update(schema.runs)
      .set({
        status,
        finishedAt,
        exitCode,
        logTail: tail.join("\n"),
        artifactPath: logPath,
        updatedAt: new Date(),
      })
      .where(eq(schema.runs.id, runId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date();
    await db
      .update(schema.runs)
      .set({
        status: "failed",
        finishedAt,
        exitCode: 1,
        logTail: tail.join("\n") || message,
        artifactPath: logPath,
        updatedAt: new Date(),
      })
      .where(eq(schema.runs.id, runId));
  } finally {
    release(type);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────

/** List runs, newest first, filtered by type. */
export async function listRuns(
  type: RunType | undefined,
  limit: number,
): Promise<RunRecord[]> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(limit, 100));

  const query = db
    .select()
    .from(schema.runs)
    .orderBy(desc(schema.runs.createdAt))
    .limit(safeLimit);

  const rows = type
    ? await query.where(eq(schema.runs.type, type))
    : await query;

  return rows.map(toRunRecord);
}

/** Fetch a single run by id, or null if not found. */
export async function getRun(runId: string): Promise<RunRecord | null> {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, runId))
    .get();
  return row ? toRunRecord(row) : null;
}
