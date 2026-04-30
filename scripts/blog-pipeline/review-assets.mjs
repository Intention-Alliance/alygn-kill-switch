#!/usr/bin/env node

/**
 * review-assets.mjs — Asset Review Quality Gate (Task #56)
 *
 * Automated quality checks for generated blog assets before they go live.
 *
 * Checks:
 *   - File size (min 1KB, max 10MB, warn > 5MB)
 *   - Image dimensions (blog portrait 1200x630, diagrams, infographics)
 *   - File format (PNG, JPG, WEBP, GIF)
 *   - Asset count (1-7 per article)
 *
 * Optional: thumbnail generation, auto-compression of large files.
 *
 * Usage:
 *   node review-assets.mjs \
 *     --article ./docs/developer-advocate/blog/article.md \
 *     --assets-dir ./docs/developer-advocate/assets/ \
 *     --output-report ./reports/asset-review.json \
 *     --generate-thumbnails \
 *     --auto-compress
 *
 * Exit codes:
 *   0 — All checks passed
 *   1 — Checks failed (assets invalid)
 *   2 — No assets found
 *   99 — Fatal error
 *
 * Deps: ImageMagick `identify` + `magick` on PATH (no npm deps).
 */

import { readFile, writeFile, stat, mkdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename, extname, dirname, join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ── Validation Config ─────────────────────────────────────────────────

const CHECKS = {
  fileSize: {
    min: 1024,            // 1KB minimum (no empty files)
    max: 10485760,        // 10MB max
    warnAt: 5242880,      // 5MB warn threshold
  },
  dimensions: {
    blogPortrait:  { width: 1200, height: 630,  tolerance: 10 },
    cover:         { width: 1920, height: 1080, tolerance: 15 },
    diagram:       { minWidth: 800,  minHeight: 600 },
    infographic:   { minWidth: 1000, minHeight: 1200 },
  },
  format: {
    allowed: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']),
  },
  count: {
    min: 1,
    max: 7,
  },
};

// Map directory names to dimension check profiles.
const DIR_PROFILES = {
  thumbnails: 'blogPortrait',
  portraits:  'blogPortrait',
  covers:     'cover',
  diagrams:   'diagram',
  infographics: 'infographic',
};

const HUMAN_PROFILE = {
  blogPortrait: 'Blog Portrait (1200×630)',
  cover:        'Cover (1920×1080)',
  diagram:      'Diagram (≥800×600)',
  infographic:  'Infographic (≥1000×1200)',
};

// ── Shell Helpers ─────────────────────────────────────────────────────

/**
 * Run `identify -format "%w %h %m %b" <file>` → { width, height, format, sizeHuman }.
 */
async function identifyImage(filePath) {
  try {
    const { stdout } = await execFileAsync('identify', [
      '-format', '%w\n%h\n%m\n%b',
      filePath,
    ], { timeout: 10_000 });

    const [w, h, fmt, sizeHuman] = stdout.trim().split('\n');
    return {
      width: parseInt(w, 10) || 0,
      height: parseInt(h, 10) || 0,
      format: (fmt || '').toLowerCase(),
      sizeHuman: sizeHuman || '',
    };
  } catch {
    return null;
  }
}

/**
 * Generate a thumbnail via `magick <src> -resize 360x <dst>`.
 */
async function generateThumbnail(srcPath, dstPath) {
  await mkdir(dirname(dstPath), { recursive: true });
  await execFileAsync('magick', [
    srcPath,
    '-resize', '360x',
    '-quality', '85',
    dstPath,
  ], { timeout: 30_000 });
}

/**
 * Compress a large PNG via `magick <src> -strip -quality 85 <dst>`.
 */
async function compressImage(srcPath, dstPath) {
  await execFileAsync('magick', [
    srcPath,
    '-strip',
    '-quality', '85',
    dstPath,
  ], { timeout: 30_000 });
}

// ── Resolution ────────────────────────────────────────────────────────

/**
 * Infer the dimension check profile for an asset based on dir + filename.
 */
function inferProfile(filePath, assetsRoot) {
  const rel = relative(assetsRoot, filePath);
  const dir = dirname(rel); // e.g. "thumbnails" or "." or "infographics"
  const name = basename(filePath, extname(filePath)).toLowerCase();

  // 1. Explicit subdirectory match
  const profileKey = DIR_PROFILES[dir];
  if (profileKey) return profileKey;

  // 2. Filename heuristics
  if (name.includes('-thumb') || name.includes('_thumb')) return 'blogPortrait';
  if (name.includes('-cover') || name.includes('_cover')) return 'cover';
  if (name.includes('-portrait') || name.includes('_portrait')) return 'blogPortrait';
  if (name.includes('infographic') || name.includes('infobae')) return 'infographic';
  if (name.includes('-diagram') || name.includes('architecture')) return 'diagram';

  // 3. Default: treat as blog portrait
  return 'blogPortrait';
}

// ── Checks ────────────────────────────────────────────────────────────

async function checkFileSize(filePath, fsStat) {
  const size = fsStat.size;
  const issues = [];

  if (size < CHECKS.fileSize.min) {
    issues.push(`Under minimum: ${size} bytes (min ${CHECKS.fileSize.min}B)`);
  }
  if (size > CHECKS.fileSize.max) {
    issues.push(`Over maximum: ${(size / 1e6).toFixed(2)} MB (max 10 MB)`);
  }
  const warnings = [];
  if (!issues.length && size > CHECKS.fileSize.warnAt) {
    warnings.push(`Large file: ${(size / 1e6).toFixed(2)} MB, consider compression`);
  }

  return { pass: issues.length === 0, issues, warnings, sizeKb: (size / 1024).toFixed(1) };
}

function checkFormat(filePath) {
  const ext = extname(filePath).replace('.', '').toLowerCase();
  const valid = CHECKS.format.allowed.has(ext);
  return {
    pass: valid,
    format: ext,
    issue: valid ? null : `Unsupported format: .${ext}`,
  };
}

function checkDimensions(info, profile) {
  const spec = CHECKS.dimensions[profile];
  if (!spec) {
    // No dimension spec for this profile — skip
    return { pass: true, actual: `${info.width}×${info.height}`, profile };
  }

  const result = {
    pass: true,
    actual: `${info.width}×${info.height}`,
    expected: HUMAN_PROFILE[profile],
    profile,
    issues: [],
  };

  if (spec.width && spec.height && spec.tolerance) {
    // Exact-ish (portrait, cover)
    const wOk = Math.abs(info.width - spec.width) <= spec.tolerance;
    const hOk = Math.abs(info.height - spec.height) <= spec.tolerance;
    if (!wOk || !hOk) {
      result.pass = false;
      result.issues.push(
        `Expected ${spec.width}×${spec.height} (±${spec.tolerance}px), got ${info.width}×${info.height}`,
      );
    }
  } else if (spec.minWidth || spec.minHeight) {
    // Minimums (diagrams, infographics)
    if (info.width < spec.minWidth) {
      result.issues.push(`Width ${info.width} < min ${spec.minWidth}`);
    }
    if (info.height < spec.minHeight) {
      result.issues.push(`Height ${info.height} < min ${spec.minHeight}`);
    }
    result.pass = result.issues.length === 0;
  }

  return result;
}

// ── Load Assets ───────────────────────────────────────────────────────

/**
 * Scan a directory recursively for image assets.
 * Returns [{ path, relative }].
 */
async function loadAssets(assetsDir) {
  if (!existsSync(assetsDir)) return [];

  const { readdir } = await import('node:fs/promises');
  const assets = [];
  const stack = [assetsDir];

  while (stack.length) {
    const dir = stack.pop();
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase().slice(1);
        if (CHECKS.format.allowed.has(ext)) {
          assets.push(full);
        }
      }
    }
  }

  return assets.sort();
}

// ── Main Review Pipeline ──────────────────────────────────────────────

async function reviewAssets(articlePath, options) {
  const assetsDir = resolve(options.assetsDir);
  const assets = await loadAssets(assetsDir);

  // Aggregate check state.
  const aggregate = {
    fileSize:   { pass: true, failures: [] },
    dimensions: { pass: true, failures: [] },
    format:     { pass: true, failures: [] },
    count:      { pass: true, actual: assets.length, min: CHECKS.count.min, max: CHECKS.count.max },
  };

  const assetResults = [];
  const warnings = [];

  // ── Asset-level checks ──
  for (const filePath of assets) {
    const rel = relative(assetsDir, filePath);
    let fsStat;
    try {
      fsStat = await stat(filePath);
    } catch {
      // Shouldn't happen, but guard
      assetResults.push({
        path: rel,
        error: 'Cannot stat file',
        checks: { fileSize: { pass: false, issue: 'stat failed' }, dimensions: {}, format: {} },
        pass: false,
      });
      continue;
    }

    const profile = inferProfile(filePath, assetsDir);

    // Size
    const sizeResult = await checkFileSize(filePath, fsStat);
    if (!sizeResult.pass) {
      aggregate.fileSize.pass = false;
      aggregate.fileSize.failures.push({ path: rel, issues: sizeResult.issues });
    }
    for (const w of sizeResult.warnings) warnings.push({ path: rel, message: w });

    // Format
    const fmtResult = checkFormat(filePath);
    if (!fmtResult.pass) {
      aggregate.format.pass = false;
      aggregate.format.failures.push({ path: rel, issue: fmtResult.issue });
      // Bail on further checks for bad formats
      assetResults.push({
        path: rel,
        profile,
        checks: { fileSize: sizeResult, format: fmtResult, dimensions: { pass: false, issue: fmtResult.issue } },
        pass: false,
      });
      continue;
    }

    // Dimensions (via identify)
    const ident = await identifyImage(filePath);
    let dimResult;
    if (!ident) {
      dimResult = { pass: false, issue: 'Cannot read image dimensions', actual: '?', expected: HUMAN_PROFILE[profile], profile };
      aggregate.dimensions.pass = false;
      aggregate.dimensions.failures.push({ path: rel, issue: 'Cannot read dimensions' });
    } else {
      dimResult = checkDimensions(ident, profile);
      if (!dimResult.pass) {
        aggregate.dimensions.pass = false;
        aggregate.dimensions.failures.push({ path: rel, issues: dimResult.issues });
      }
      for (const issue of dimResult.issues || []) {
        warnings.push({ path: rel, message: issue });
      }
    }

    const pass = sizeResult.pass && fmtResult.pass && dimResult.pass;

    const entry = {
      path: rel,
      profile,
      sizeKb: sizeResult.sizeKb,
      actualDims: dimResult.actual,
      expectedDims: dimResult.expected,
      format: fmtResult.format,
      pass,
      checks: {
        fileSize: sizeResult,
        format: fmtResult,
        dimensions: dimResult,
      },
    };
    assetResults.push(entry);
  }

  // ── Count check ──
  if (assets.length < CHECKS.count.min) {
    aggregate.count.pass = false;
    aggregate.count.reason = `Too few assets: ${assets.length} (min ${CHECKS.count.min})`;
  }
  if (assets.length > CHECKS.count.max) {
    aggregate.count.pass = false;
    aggregate.count.reason = `Too many assets: ${assets.length} (max ${CHECKS.count.max})`;
  }

  // ── Summary ──
  const passed = assetResults.filter((a) => a.pass).length;
  const failed = assetResults.length - passed;

  const summary = {
    total: assets.length,
    passed,
    failed,
    warnings: warnings.map((w) => `${w.path}: ${w.message}`),
    allPassed: Object.values(aggregate).every((c) => c.pass),
  };

  // ── Optional: Thumbnails ──
  let thumbnailDir = null;
  if (options.generateThumbnails && assets.length) {
    thumbnailDir = resolve(options.assetsDir, '_review-thumbnails');
    console.error(`[review-assets] 🖼  Generating thumbnails → ${thumbnailDir}…`);
    let count = 0;
    for (const filePath of assets) {
      const name = basename(filePath, extname(filePath));
      const dst = join(thumbnailDir, `${name}-thumb.jpg`);
      try {
        await generateThumbnail(filePath, dst);
        count++;
      } catch (err) {
        console.error(`[review-assets]   ⚠ thumbnail failed for ${basename(filePath)}: ${err.message}`);
      }
    }
    console.error(`[review-assets]   ✅ ${count}/${assets.length} thumbnails generated`);
  }

  // ── Optional: Auto-compress ──
  let compressResults = [];
  if (options.autoCompress) {
    console.error(`[review-assets] 🗜  Auto-compressing large files…`);
    for (const a of assetResults) {
      if (!a.pass) continue; // skip already-failing
      const sizeKb = parseFloat(a.sizeKb);
      const sizeB = sizeKb * 1024;
      if (sizeB <= CHECKS.fileSize.warnAt) continue;

      const srcPath = resolve(assetsDir, a.path);
      const compressedDir = resolve(assetsDir, '_compressed');
      const dstPath = join(compressedDir, a.path);

      try {
        await compressImage(srcPath, dstPath);
        const newStat = await stat(dstPath);
        compressResults.push({
          path: a.path,
          beforeKb: a.sizeKb,
          afterKb: (newStat.size / 1024).toFixed(1),
          savedKb: (sizeB - newStat.size) / 1024,
        });
      } catch (err) {
        compressResults.push({ path: a.path, error: err.message });
      }
    }
    console.error(`[review-assets]   ✅ ${compressResults.length} files compressed`);
  }

  const report = {
    article: articlePath ? relative(process.cwd(), articlePath) : null,
    reviewedAt: new Date().toISOString(),
    assetsDir: relative(process.cwd(), assetsDir),
    checks: aggregate,
    assets: assetResults,
    summary,
    thumbnails: thumbnailDir,
    compressions: compressResults.length ? compressResults : undefined,
  };

  return { report, exitCode: resolveExitCode(aggregate, assets.length) };
}

function resolveExitCode(aggregate, count) {
  if (count === 0) return 2;

  const allPassed =
    aggregate.fileSize.pass &&
    aggregate.dimensions.pass &&
    aggregate.format.pass &&
    aggregate.count.pass;

  return allPassed ? 0 : 1;
}

// ── HTML Preview ──────────────────────────────────────────────────────

function buildHtmlPreview(report) {
  const { assets, checks, summary } = report;

  const rows = assets
    .map(
      (a) => `
    <tr class="${a.pass ? 'pass' : 'fail'}">
      <td class="icon">${a.pass ? '✅' : '❌'}</td>
      <td class="path">${escapeHtml(a.path)}</td>
      <td>${escapeHtml(a.profile)}</td>
      <td>${a.format}</td>
      <td>${a.sizeKb} KB</td>
      <td>${escapeHtml(a.actualDims || '?')}</td>
      <td class="dim-expected">${escapeHtml(a.expectedDims || '-')}</td>
    </tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Asset Review — ${escapeHtml(report.article || 'unknown')}</title>
  <style>
    * { box-sizing:border-box;margin:0;padding:0 }
    body { font-family:ui-monospace,SFMono-Regular,monospace;background:#111;color:#eee;padding:2rem }
    h1 { font-size:1.5rem;margin-bottom:.75rem }
    h2 { font-size:1.1rem;margin:1.5rem 0 .5rem;border-bottom:1px solid #333;padding-bottom:.25rem }
    .summary { display:flex;gap:2rem;margin-bottom:1rem }
    .summary dl { display:flex;flex-direction:column;gap:.25rem }
    .summary dt { font-size:.75rem;color:#888 }
    .summary dd { font-size:1.25rem;font-weight:600 }
    .summary dd.pass { color:#4ade80 }
    .summary dd.fail { color:#f87171 }
    table { width:100%;border-collapse:collapse }
    th,td { padding:.5rem .75rem;text-align:left;font-size:.85rem }
    th { color:#888;text-transform:uppercase;font-size:.75rem }
    td { border-top:1px solid #222 }
    tr.pass td { color:#ccc }
    tr.fail td { color:#f87171;background:#1a0000 }
    .icon { width:2rem;text-align:center;font-size:1.1rem }
    .path { max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .dim-expected { color:#888 }
    .warn-block { background:#1a1800;border:1px solid #332;padding:.75rem 1rem;margin:.5rem 0;border-radius:4px;font-size:.85rem }
    .warn-block li { color:#facc15;margin:.2rem 0 }
  </style>
</head>
<body>
  <h1>📋 Asset Review — ${escapeHtml(report.article || 'Unspecified')}</h1>
  <p style="color:#888;font-size:.85rem">Reviewed: ${escapeHtml(report.reviewedAt)} · Dir: ${escapeHtml(report.assetsDir)}</p>

  <h2>Summary</h2>
  <div class="summary">
    <dl><dt>Total</dt><dd>${summary.total}</dd></dl>
    <dl><dt>Passed</dt><dd class="pass">${summary.passed}</dd></dl>
    <dl><dt>Failed</dt><dd class="fail">${summary.failed}</dd></dl>
  </div>

  <h2>Gates</h2>
  <table>
    <tr><th>Check</th><th>Status</th><th>Detail</th></tr>
    <tr><td>File Size</td><td>${checks.fileSize.pass ? '✅' : '❌'}</td><td>${checks.fileSize.failures.length ? checks.fileSize.failures.map(f=>f.path).join(', ') : 'OK'}</td></tr>
    <tr><td>Dimensions</td><td>${checks.dimensions.pass ? '✅' : '❌'}</td><td>${checks.dimensions.failures.length ? checks.dimensions.failures.map(f=>f.path).join(', ') : 'OK'}</td></tr>
    <tr><td>Format</td><td>${checks.format.pass ? '✅' : '❌'}</td><td>${checks.format.failures.length ? checks.format.failures.map(f=>f.path).join(', ') : 'OK'}</td></tr>
    <tr><td>Count</td><td>${checks.count.pass ? '✅' : '❌'}</td><td>${checks.count.actual}/${checks.count.min}–${checks.count.max}</td></tr>
  </table>

  ${summary.warnings.length ? `<h2>⚠ Warnings</h2><div class="warn-block"><ul>${summary.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('\n')}</ul></div>` : ''}

  <h2>Assets (${summary.total})</h2>
  <table>
    <tr><th></th><th>File</th><th>Kind</th><th>Fmt</th><th>Size</th><th>Dims</th><th>Expected</th></tr>
    ${rows}
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── CLI Arg Parser ────────────────────────────────────────────────────

function parseArgs(argv) {
  const result = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        result[key] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          result[key] = next;
          i++;
        } else {
          result[key] = true;
        }
      }
    } else if (arg.startsWith('-')) {
      result[arg] = true;
    } else {
      result._.push(arg);
    }
    i++;
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const articlePath = args.article ? resolve(args.article) : null;
  const assetsDir = args['assets-dir'] ?? args.assetsDir ?? './docs/developer-advocate/assets';
  const outputReportPath = args['output-report'] ?? args.outputReport ?? null;

  const options = {
    assetsDir,
    generateThumbnails: !!(args['generate-thumbnails'] ?? args.generateThumbnails),
    autoCompress: !!(args['auto-compress'] ?? args.autoCompress),
  };

  console.error(`[review-assets] 🔍 Scanning: ${assetsDir}`);
  console.error(`[review-assets]   article: ${articlePath ?? '(none)'}`);
  console.error(`[review-assets]   thumbnails: ${options.generateThumbnails}`);
  console.error(`[review-assets]   auto-compress: ${options.autoCompress}`);

  const { report, exitCode } = await reviewAssets(articlePath, options);

  // ── Output ──
  const json = JSON.stringify(report, null, 2);

  if (outputReportPath) {
    const absPath = resolve(outputReportPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, json);
    console.error(`[review-assets] 📄 Report → ${absPath}`);

    // Write companion HTML preview
    const htmlPath = absPath.replace(/\.json$/, '.html');
    const html = buildHtmlPreview(report);
    await writeFile(htmlPath, html);
    console.error(`[review-assets] 🌐 HTML preview → ${htmlPath}`);
  }

  // Dump JSON to stdout for pipeline consumers.
  process.stdout.write(json + '\n');

  // ── Status ──
  console.error('');
  console.error(`[review-assets] ── Summary ────────────────────────`);
  console.error(`[review-assets]   Assets: ${report.summary.total}`);
  console.error(`[review-assets]   Passed: ${report.summary.passed} ✅`);
  console.error(`[review-assets]   Failed: ${report.summary.failed} ❌`);
  if (report.summary.warnings.length) {
    console.error(`[review-assets]   Warnings: ${report.summary.warnings.length} ⚠`);
    for (const w of report.summary.warnings.slice(0, 5)) {
      console.error(`[review-assets]     · ${w}`);
    }
    if (report.summary.warnings.length > 5) {
      console.error(`[review-assets]     … and ${report.summary.warnings.length - 5} more`);
    }
  }
  console.error(`[review-assets]   Exit: ${exitCode}`);

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[review-assets] Fatal: ${err.message}`);
  process.exit(99);
});
