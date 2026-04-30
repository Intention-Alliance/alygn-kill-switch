#!/usr/bin/env node

/**
 * logger.mjs — Structured Error Logging for Blog Pipeline (#59)
 *
 * Provides a lightweight, structured logger for the entire blog pipeline.
 * Each pipeline run gets a unique runId; log entries are enriched with
 * article, step, timestamp, and arbitrary data.
 *
 * Features:
 *   - JSONL file output (one log file per day, append-mode)
 *   - Colored console output (DEBUG/INFO/WARN/ERROR/FATAL)
 *   - Error aggregation (collects ERROR+FATAL for end-of-run summary)
 *   - Performance timers (log.timer → timer.end yields elapsed ms)
 *
 * Usage:
 *   import { createLogger } from './logger.mjs';
 *
 *   const log = createLogger({
 *     article: 'ai-safety',
 *     step: 'asset-generation',
 *     logFile: 'logs/pipeline-2026-04-30.jsonl',
 *   });
 *
 *   log.info('Starting', { input: 'article.md' });
 *   log.error('Oops', { error: err.message });
 *   log.summary();
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// ── Constants ─────────────────────────────────────────────────────────

/** Ordered log levels, low → high severity. */
const LEVELS = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
});

const LEVEL_NAMES = Object.keys(LEVELS);

/** ANSI escape codes for console output (terminal only). */
const COLORS = Object.freeze({
  DEBUG: '\x1b[90m',         // grey
  INFO: '\x1b[34m',          // blue
  WARN: '\x1b[33m',          // yellow
  ERROR: '\x1b[31m',         // red
  FATAL: '\x1b[31m\x1b[1m', // bold red
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
});

/** Detect whether stdout is a TTY — no colors when piped. */
const isTTY = process.stdout.isTTY;

// ── Helpers ───────────────────────────────────────────────────────────

/** Format elapsed ms → human-readable. */
function formatElapsed(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

/** Right-pad a string (or truncate + pad) to a fixed width. */
function pad(str, width) {
  const s = String(str);
  if (s.length > width) return s.slice(0, width - 1) + '…';
  return s.padEnd(width);
}

/**
 * Ensure the parent directory of `filePath` exists.
 * Silent no-op when directory already exists.
 */
async function ensureParentDir(filePath) {
  try {
    await mkdir(dirname(filePath), { recursive: true });
  } catch {
    // dir exists — fine
  }
}

/** Serialise data payload for the JSONL line. */
function serialiseData(data) {
  if (data === undefined || data === null) return {};
  if (data instanceof Error) {
    return { error: data.message, stack: data.stack };
  }
  return data;
}

// ── Exported Factory ──────────────────────────────────────────────────

/**
 * Create a structured logger bound to one article + step.
 *
 * @param {object} options
 * @param {string} options.article  — Article slug / identifier
 * @param {string} [options.step]   — Pipeline step name
 * @param {string} [options.logFile]— Path to JSONL log file (append mode)
 * @param {string} [options.level]  — Minimum console level (default "INFO")
 * @returns {object} Logger instance
 */
export function createLogger(options = {}) {
  const {
    article = 'unknown',
    step = 'pipeline',
    logFile = null,
    level = 'INFO',
  } = options;

  const runId = randomUUID();
  const minLevel = LEVELS[level] ?? LEVELS.INFO;
  const timers = new Map();   // label → start timestamp
  const errors = [];          // aggregated ERROR / FATAL entries

  /** Build a clean log entry object. */
  function makeEntry(levelName, message, data) {
    return {
      timestamp: new Date().toISOString(),
      level: levelName,
      article,
      step,
      runId,
      message,
      data: serialiseData(data),
    };
  }

  /**
   * Core log function.
   * - Prints to console (with colours when TTY)
   * - Appends JSONL line to logFile
   * - Collects ERROR / FATAL for summary
   */
  async function emit(levelName, message, data) {
    const entry = makeEntry(levelName, message, data);
    const lvl = LEVELS[levelName] ?? -1;

    // ── Console output ──
    const color = COLORS[levelName] || '';
    const reset = COLORS.RESET;

    const ts = new Date(entry.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    let dataStr = '';
    if (data && Object.keys(serialiseData(data)).length > 0) {
      const payload = serialiseData(data);
      // Keep console data compact
      dataStr = isTTY
        ? ` ${COLORS.DIM}${JSON.stringify(payload)}${reset}`
        : ` ${JSON.stringify(payload)}`;
    }

    const prefix = isTTY
      ? `${COLORS.DIM}${ts}${reset} ${color}${pad(levelName, 5)}${reset} ${pad(`[${step}]`, 24)}`
      : `${ts} ${pad(levelName, 5)} [${step}]`;

    const line = `${prefix}${message}${dataStr}`;

    // Only print when level ≥ configured minimum
    if (lvl >= minLevel) {
      if (lvl >= LEVELS.ERROR) {
        console.error(line);
      } else {
        console.log(line);
      }
    }

    // ── File output (always writes regardless of console min-level) ──
    if (logFile) {
      try {
        await ensureParentDir(logFile);
        await appendFile(logFile, JSON.stringify(entry) + '\n', 'utf-8');
      } catch {
        // File write failure shouldn't crash the pipeline —
        // fire a console warning so it's visible but not silent.
        console.error(`${COLORS.WARN}[WARN ]${COLORS.RESET} logger: failed to write to ${logFile}`);
      }
    }

    // ── Error aggregation ──
    if (lvl >= LEVELS.ERROR) {
      errors.push(entry);
    }

    return entry;
  }

  // ── Public API ────────────────────────────────────────────────────

  const api = {
    /** @type {Array} Collected ERROR / FATAL entries. */
    errors,

    /** Log at DEBUG level (only when --level DEBUG or lower). */
    debug: (msg, data) => emit('DEBUG', msg, data),

    /** Log at INFO level. */
    info: (msg, data) => emit('INFO', msg, data),

    /** Log at WARN level. */
    warn: (msg, data) => emit('WARN', msg, data),

    /** Log at ERROR level + aggregate. */
    error: (msg, data) => emit('ERROR', msg, data),

    /** Log at FATAL level + aggregate. */
    fatal: (msg, data) => emit('FATAL', msg, data),

    /**
     * Start a named timer.
     * @param {string} label  — timer name
     * @returns {{ end: (data?: object) => number }}
     */
    timer(label) {
      const start = Date.now();
      timers.set(label, start);

      return {
        /**
         * End the timer. Logs elapsed as INFO.
         * @param {object} [extraData] — merged into log data
         * @returns {number} elapsed ms
         */
        end: (extraData = {}) => {
          const duration = Date.now() - start;
          timers.delete(label);
          emit('INFO', `${label} completed`, {
            duration_ms: duration,
            duration_human: formatElapsed(duration),
            ...serialiseData(extraData),
          });
          return duration;
        },
      };
    },

    /**
     * Print a run summary with total errors and elapsed time.
     * Call once at the end of a pipeline run.
     */
    async summary() {
      // Gather all timers that weren't explicitly ended
      const now = Date.now();
      const openTimers = [];
      for (const [label, start] of timers) {
        openTimers.push({ label, elapsed: now - start });
      }

      const summaryEntry = makeEntry('INFO', 'Pipeline run summary', {
        totalErrors: errors.length,
        errorMessages: errors.map((e) => e.message),
        openTimers: openTimers.length > 0 ? openTimers : undefined,
      });

      // Write directly — bypasses minLevel guard so summary always prints
      const ts = new Date(summaryEntry.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const color = COLORS.INFO;
      const reset = COLORS.RESET;

      const line = isTTY
        ? `${COLORS.DIM}${ts}${reset} ${color}${pad('INFO', 5)}${reset} ${pad(`[${step}]`, 24)}Run summary — ${errors.length} error(s)`
        : `${ts} INFO  [${step}] Run summary — ${errors.length} error(s)`;

      console.error(line);

      for (const e of errors) {
        const errLine = isTTY
          ? `${COLORS.DIM}${ts}${reset} ${COLORS.ERROR}  ↳  ${reset}${e.message}`
          : `      ↳  ${e.message}`;
        console.error(errLine);
      }

      // File output
      if (logFile) {
        try {
          await ensureParentDir(logFile);
          await appendFile(logFile, JSON.stringify(summaryEntry) + '\n', 'utf-8');
        } catch {
          // silent
        }
      }
    },

    /**
     * Return the unique runId for this logger instance.
     */
    get runId() {
      return runId;
    },
  };

  return api;
}
