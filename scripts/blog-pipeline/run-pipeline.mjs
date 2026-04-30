#!/usr/bin/env node

/**
 * run-pipeline.mjs — Blog Pipeline Orchestrator (Task #57)
 *
 * Wires generate-assets.mjs and lint-content.mjs into a sequential pipeline.
 *
 * Pipeline Flow:
 *   1. Parse article metadata (title, category, tags)
 *   2. Step 1: Asset generation (generate-assets.mjs)
 *   3. Step 2: Content linting (lint-content.mjs)
 *   4. Step 3: Validation (assets exist + lint passed)
 *   5. Output report + exit code
 *
 * Usage:
 *   node run-pipeline.mjs \
 *     --input ./docs/developer-advocate/blog/article.md \
 *     --output-dir ./docs/developer-advocate/blog/final/ \
 *     --skip-assets       # Optional: skip asset generation
 *     --skip-lint         # Optional: skip linting (danger!)
 *     --dry-run           # Optional: validate without writing
 *
 * Exit codes:
 *   0 — Success (all gates passed)
 *   1 — Lint failed (violations remain)
 *   2 — Asset generation failed
 *   3 — Validation failed (missing assets)
 *   99 — Fatal error (script bug)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.mjs';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────

const GENERATE_SCRIPT = resolve(__dirname, 'generate-assets.mjs');
const LINT_SCRIPT = resolve(__dirname, 'lint-content.mjs');

const DEFAULT_CATEGORY = 'Deep Dive';
const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'docs/developer-advocate/assets');

// ── Helpers ───────────────────────────────────────────────────────────

/** Format elapsed ms → human-readable. */
function formatElapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

/** Resolve and ensure directory exists with logging. */
async function ensureDir(dir, log) {
  try {
    await mkdir(dir, { recursive: true });
    log?.debug('Directory ensured', { dir });
  } catch (err) {
    log?.error('Failed to create directory', { dir, error: err.message });
  }
  return dir;
}

// ── Article Metadata Parser ───────────────────────────────────────────

/**
 * Extract title, category, tags from markdown article metadata.
 * Supports:
 *   - Standard frontmatter (--- delimited YAML)
 *   - Inline metadata (**Key:** Value format)
 *
 * @param {string} content
 * @returns {{title: string, category: string, tags: string[]}}
 */
function parseArticleMeta(content) {
  const lines = content.split('\n');

  // Try YAML frontmatter first
  let title = null;
  let category = null;
  let tags = null;

  if (lines[0]?.trim() === '---') {
    // Find closing ---
    const closeIdx = lines.slice(1).findIndex((l) => l.trim() === '---');
    const frontmatter = lines.slice(1, closeIdx + 1).join('\n');

    const titleMatch = frontmatter.match(/^title:\s*(.+)$/im);
    const catMatch = frontmatter.match(/^category:\s*(.+)$/im);
    const tagsMatch = frontmatter.match(/^tags:\s*\[(.+)\]$/im);

    if (titleMatch) title = titleMatch[1].replace(/["']/g, '').trim();
    if (catMatch) category = catMatch[1].replace(/["']/g, '').trim();
    if (tagsMatch) tags = tagsMatch[1].split(',').map((t) => t.replace(/["']/g, '').trim());
  }

  // Fallback: parse inline metadata (**Key:** Value)
  // Also try # Heading as title
  if (!title) {
    // # Heading as title
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) title = h1Match[1].trim();

    // Inline metadata
    const catMatch = content.match(/^\*\*Category:\*\*\s*(.+)$/im);
    const tagsMatch = content.match(/^\*\*Tags:\*\*\s*(.+)$/im);

    if (catMatch && !category) category = catMatch[1].trim();
    if (tagsMatch && !tags) {
      tags = tagsMatch[1]
        .split(/[,#]/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);
    }
  }

  return {
    title: title || 'Untitled Article',
    category: category || DEFAULT_CATEGORY,
    tags: tags || [],
  };
}

// ── Step 1: Asset Generation ─────────────────────────────────────────

/**
 * Run generate-assets.mjs as a child process.
 * @param {{title: string, category: string, tags: string[]}} meta
 * @param {string} assetsDir
 * @param {object} log
 * @returns {Promise<{success: boolean, count: number, files: string[], errors: string[], json: object|null}>}
 */
async function generateAssets(meta, assetsDir, log) {
  const start = Date.now();
  const errors = [];
  let json = null;
  let files = [];

  log.info('Step 1/3: Asset Generation started', {
    title: meta.title,
    category: meta.category,
    tags: meta.tags,
    outputDir: assetsDir,
  });

  try {
    const tagsArg = meta.tags.join(',');
    const cmd = [
      `node "${GENERATE_SCRIPT}"`,
      `--title "${meta.title.replace(/"/g, '\\"')}"`,
      `--category "${meta.category}"`,
      `--tags "${tagsArg}"`,
      `--output-dir "${assetsDir}"`,
    ].join(' ');

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 120_000, // 2 min for image generation
      maxBuffer: 1024 * 1024, // 1MB
    });

    // stderr is the log stream; stdout is the JSON result
    if (stderr) process.stderr.write(stderr);

    try {
      json = JSON.parse(stdout.trim());
    } catch {
      errors.push('Failed to parse generate-assets JSON output');
      log.warn('Failed to parse generate-assets stdout', { stdout: stdout.slice(0, 200) });
    }

    if (json) {
      if (json.thumbnail) files.push(json.thumbnail);
      if (json.cover) files.push(json.cover);
      if (json.thumbnail_error) errors.push(`Thumbnail: ${json.thumbnail_error}`);
      if (json.cover_error) errors.push(`Cover: ${json.cover_error}`);
    }
  } catch (err) {
    const msg = err.stderr || err.message || String(err);
    errors.push(`Asset generation process error: ${msg.slice(0, 500)}`);
  }

  const success = !!json?.success && errors.length === 0;
  const elapsed = Date.now() - start;

  if (success) {
    log.info('Assets generated successfully', { duration_ms: elapsed, fileCount: files.length });
  } else {
    log.error('Asset generation failed', { duration_ms: elapsed, errorCount: errors.length, errors });
  }

  return { success, count: files.length, files, errors, json, elapsed };
}

// ── Step 2: Content Linting ──────────────────────────────────────────

/**
 * Run lint-content.mjs as a child process.
 * @param {string} input
 * @param {string} reportDir
 * @param {boolean} autoFix
 * @param {object} log
 * @returns {Promise<{success: boolean, violations: number, autoFixed: number, report: object|null, reportPath: string|null, errors: string[]}>}
 */
async function lintContent(input, reportDir, autoFix, log) {
  const start = Date.now();
  const errors = [];
  let report = null;
  let reportPath = null;

  log.info('Step 2/3: Content Linting started', {
    input,
    autoFix,
    reportDir,
  });

  const slug = basename(input, '.md');
  reportPath = resolve(reportDir, `${slug}-lint-report.json`);

  const fixFlag = autoFix ? '--auto-fix' : '';
  const cmd = [
    `node "${LINT_SCRIPT}"`,
    `--input "${input}"`,
    `--output "${reportPath}"`,
    fixFlag,
  ]
    .filter(Boolean)
    .join(' ');

  // lint-content exits 0 on pass, 1 on violations — always produces report
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    if (stderr) process.stderr.write(stderr);

    try {
      report = JSON.parse(stdout.trim());
    } catch {
      // Fallback: read from report file
      try {
        const reportContent = await readFile(reportPath, 'utf-8');
        report = JSON.parse(reportContent);
      } catch {
        errors.push('Failed to parse lint report from stdout or file');
        log.warn('Failed to parse lint report stdout', { stdout: stdout.slice(0, 200) });
      }
    }
  } catch (err) {
    // lint-content exits 1 on violations — stdout/stderr are on the error object
    if (err.stderr) process.stderr.write(err.stderr);

    if (err.stdout) {
      try {
        report = JSON.parse(err.stdout.trim());
      } catch {
        // Fallback: read from report file
        try {
          const reportContent = await readFile(reportPath, 'utf-8');
          report = JSON.parse(reportContent);
        } catch {
          errors.push('Failed to parse lint report from error output');
        }
      }
    } else {
      // Fallback: try reading from report file directly
      try {
        const reportContent = await readFile(reportPath, 'utf-8');
        report = JSON.parse(reportContent);
      } catch {
        const msg = err.stderr || err.message || String(err);
        errors.push(`Lint process error: ${msg.slice(0, 500)}`);
      }
    }
  }

  const violations = report?.stats?.totalViolations ?? 0;
  const autoFixed = report?.stats?.autoFixed ?? 0;
  const unfixed = report?.stats?.unfixed ?? 0;
  const pass = report?.pass ?? false;
  const elapsed = Date.now() - start;

  if (pass) {
    log.info('Lint passed', { duration_ms: elapsed, violations, autoFixed, unfixed });
  } else if (report) {
    log.error('Lint failed', {
      duration_ms: elapsed,
      violations,
      autoFixed,
      unfixed,
      requiresHuman: report.requiresHuman || false,
      reportPath,
    });
  } else {
    log.error('Lint failed — no report generated', { duration_ms: elapsed });
  }

  return {
    success: pass,
    violations,
    autoFixed,
    unfixed,
    report,
    reportPath,
    errors,
    elapsed,
  };
}

// ── Step 3: Validation ────────────────────────────────────────────────

/**
 * Validate pipeline outputs.
 * @param {object} assetResult
 * @param {object} lintResult
 * @param {object} options
 * @param {object} log
 * @returns {Promise<{success: boolean, missing: string[], warnings: string[]}>}
 */
async function validate(assetResult, lintResult, options, log) {
  const missing = [];
  const warnings = [];

  log.info('Step 3/3: Validation started');

  // Check assets exist on disk (unless skipped)
  if (!options.skipAssets) {
    if (!assetResult.success) {
      warnings.push('Asset generation flagged as failed — review errors above');
    }

    for (const file of assetResult.files) {
      try {
        await access(file);
      } catch {
        missing.push(`Asset file not found: ${file}`);
      }
    }

    if (assetResult.count === 0 && !options.skipAssets) {
      warnings.push('No assets were generated');
    }
  }

  // Check lint status (unless skipped)
  if (!options.skipLint) {
    if (!lintResult.success) {
      warnings.push('Lint failed — article may need human review before publish');
    }
    if (lintResult.report?.requiresHuman) {
      warnings.push('Article requires human review for remaining violations');
    }
    if (!lintResult.report && lintResult.errors.length === 0) {
      missing.push('Lint report not generated');
    }
  }

  // Check report file existence
  if (lintResult.reportPath) {
    try {
      await access(lintResult.reportPath);
    } catch {
      missing.push(`Lint report file not found: ${lintResult.reportPath}`);
    }
  }

  // Final summary
  const success = missing.length === 0;

  if (success) {
    log.info('Validation passed', { warningCount: warnings.length, warnings });
  } else {
    log.error('Validation failed', { missingCount: missing.length, missing, warningCount: warnings.length, warnings });
  }

  return { success, missing, warnings };
}

// ── Pipeline Orchestrator ─────────────────────────────────────────────

/**
 * Run the full blog pipeline.
 */
async function runPipeline(input, options, log) {
  const totalStart = Date.now();
  const pipelineTimer = log.timer('full-pipeline');
  const results = {
    input,
    timestamp: new Date().toISOString(),
    meta: null,
    assets: {
      success: false,
      count: 0,
      files: [],
      errors: [],
      skipped: false,
    },
    lint: {
      success: false,
      violations: 0,
      autoFixed: 0,
      unfixed: 0,
      errors: [],
      skipped: false,
    },
    validation: {
      success: false,
      missing: [],
      warnings: [],
    },
    exitCode: 0,
    totalElapsed: 0,
  };

  // Resolve paths
  const inputPath = resolve(input);
  const outputDir = resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const assetsDir = resolve(outputDir);
  const reportDir = resolve(outputDir, 'reports');

  log.info('Pipeline orchestrator initialized', {
    input: inputPath,
    outputDir,
    dryRun: options.dryRun,
    skipAssets: options.skipAssets,
    skipLint: options.skipLint,
  });

  // Read and parse article
  let content;
  try {
    content = await readFile(inputPath, 'utf-8');
  } catch (err) {
    log.fatal('Cannot read input file', { path: inputPath, error: err.message });
    results.exitCode = 99;
    return results;
  }

  results.meta = parseArticleMeta(content);
  log.info('Article metadata parsed', {
    title: results.meta.title,
    category: results.meta.category,
    tags: results.meta.tags,
  });

  // Create output directories
  if (!options.dryRun) {
    await ensureDir(assetsDir, log);
    await ensureDir(reportDir, log);
  } else {
    log.info('DRY RUN — no files will be written');
  }

  // ── Step 1: Asset Generation ──
  if (options.skipAssets) {
    log.info('Step 1/3: Asset Generation (SKIPPED)');
    results.assets.skipped = true;
    results.assets.success = true; // Not a failure
  } else {
    const assetTimer = log.timer('asset-generation');
    results.assets = await generateAssets(results.meta, assetsDir, log);
    assetTimer.end({ success: results.assets.success, fileCount: results.assets.count });
  }

  // ── Step 2: Content Linting ──
  if (options.skipLint) {
    log.warn('Step 2/3: Content Linting (SKIPPED) — article not linted!');
    results.lint.skipped = true;
    results.lint.success = true; // Not a failure
  } else {
    const lintTimer = log.timer('content-linting');
    results.lint = await lintContent(inputPath, reportDir, options.autoFix !== false, log);
    lintTimer.end({ success: results.lint.success, violations: results.lint.violations });
  }

  // ── Step 3: Validation ──
  results.validation = await validate(results.assets, results.lint, options, log);

  // ── Determine exit code ──
  if (!results.assets.success && !options.skipAssets) {
    results.exitCode = 2;
  } else if (!results.lint.success && !options.skipLint) {
    results.exitCode = 1;
  } else if (!results.validation.success) {
    results.exitCode = 3;
  } else {
    results.exitCode = 0;
  }

  results.totalElapsed = Date.now() - totalStart;
  pipelineTimer.end({ exitCode: results.exitCode });

  return results;
}

// ── Report Output ─────────────────────────────────────────────────────

/**
 * Print final pipeline summary and optionally write report file.
 */
async function reportResults(results, options, log) {
  const { exitCode, totalElapsed, meta, assets, lint, validation } = results;

  const statusIcons = {
    0: '✅ SUCCESS',
    1: '❌ LINT FAILED',
    2: '❌ ASSETS FAILED',
    3: '❌ VALIDATION FAILED',
    99: '💀 FATAL ERROR',
  };

  // Console banner (for humans — keeps the visual summary)
  console.error(`\n╔══════════════════════════════════════════════════════════╗`);
  console.error(`║              Pipeline Complete                           ║`);
  console.error(`╠══════════════════════════════════════════════════════════╣`);
  console.error(`║ Status:  ${statusIcons[exitCode] || 'UNKNOWN'}`);
  console.error(`║ Time:    ${formatElapsed(totalElapsed)}`);
  console.error(`╠══════════════════════════════════════════════════════════╣`);
  console.error(`║ Article: ${(meta?.title || 'N/A').slice(0, 37).padEnd(37)} ║`);
  console.error(`╠══════════════════════════════════════════════════════════╣`);
  console.error(`║ Assets:  ${assets.skipped ? 'SKIPPED' : assets.success ? '✅ PASS' : '❌ FAIL'}    Files: ${String(assets.count).padStart(2)}          ║`);
  console.error(`║ Lint:    ${lint.skipped ? 'SKIPPED' : lint.success ? '✅ PASS' : '❌ FAIL'}    Viols: ${String(lint.violations).padStart(3)} Fixed: ${String(lint.autoFixed).padStart(3)} ║`);
  console.error(`║ Valid:   ${validation.success ? '✅ PASS' : '❌ FAIL'}  Missing: ${String(validation.missing.length).padStart(2)} Warns: ${String(validation.warnings.length).padStart(3)}  ║`);
  console.error(`╚══════════════════════════════════════════════════════════╝`);

  // Write pipeline report JSON
  const reportPath = resolve(options.outputDir || DEFAULT_OUTPUT_DIR, 'reports', 'pipeline-report.json');
  if (!options.dryRun) {
    await ensureDir(dirname(reportPath), log);
    await writeFile(reportPath, JSON.stringify(results, null, 2), 'utf-8');
    log.info('Pipeline report written', { path: reportPath });
  }

  // Print JSON to stdout for consumers
  const json = JSON.stringify(results, null, 2);
  process.stdout.write(json + '\n');

  return json;
}

// ── CLI Argument Parser ───────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    input: null,
    outputDir: null,
    skipAssets: false,
    skipLint: false,
    dryRun: false,
    autoFix: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        args.input = argv[++i];
        break;
      case '--output-dir':
      case '-o':
        args.outputDir = argv[++i];
        break;
      case '--skip-assets':
        args.skipAssets = true;
        break;
      case '--skip-lint':
        args.skipLint = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--no-auto-fix':
        args.autoFix = false;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        break;
    }
  }

  return args;
}

// ── Help ──────────────────────────────────────────────────────────────

function printHelp() {
  console.error(`run-pipeline.mjs — Blog Pipeline Orchestrator

Usage:
  node run-pipeline.mjs --input <path> [options]

Options:
  --input, -i <path>     Article markdown file (required)
  --output-dir, -o <dir> Output directory (default: docs/developer-advocate/assets/)
  --skip-assets           Skip asset generation step
  --skip-lint             Skip content linting step (danger!)
  --dry-run               Validate without writing files or running generators
  --no-auto-fix           Disable auto-fix during linting
  --help, -h              Show this help

Pipeline:
  1. Parse article metadata (title, category, tags)
  2. Generate assets (thumbnail + cover images via OpenAI DALL-E)
  3. Lint content (Beautiful Prose quality gate)
  4. Validate outputs (asset existence + lint pass)

Exit codes:
  0 — Success (all gates passed)
  1 — Lint failed (violations remain)
  2 — Asset generation failed
  3 — Validation failed (missing assets or reports)
  99 — Fatal error (script bug, missing files)
`);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  // Build logger early so we can log argument parsing / setup
  const article = basename(args.input, '.md');
  const dateStr = new Date().toISOString().split('T')[0];
  const logFile = resolve(process.cwd(), 'logs', `pipeline-${dateStr}.jsonl`);

  const log = createLogger({
    article,
    step: 'orchestration',
    logFile,
  });

  log.info('Pipeline orchestrator starting', {
    version: '1.0.0',
    input: args.input,
    outputDir: args.outputDir,
    dryRun: args.dryRun,
    skipAssets: args.skipAssets,
    skipLint: args.skipLint,
    autoFix: args.autoFix,
    runId: log.runId,
  });

  const totalTimer = log.timer('pipeline-total');
  let exitCode = 99;

  try {
    const results = await runPipeline(args.input, args, log);
    await reportResults(results, args, log);
    exitCode = results.exitCode;
  } catch (err) {
    log.fatal('Pipeline crashed with unhandled error', {
      error: err.message,
      stack: err.stack,
    });
    exitCode = 99;
  }

  totalTimer.end({ exitCode });
  await log.summary();

  process.exit(exitCode);
}

main();
