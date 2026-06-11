#!/usr/bin/env node

/**
 * publish-x.ts — STAGE 4 APPROVE (auto-publish X)
 *
 * Reads scored JSON, filters to X-platform drafts with score ≥ threshold,
 * and publishes via X API v2 (stubbed). Writes published URLs back.
 *
 * Usage:
 *   npx tsx scripts/andler-develops/content/publish-x.ts --input=/tmp/andler-dev-scored-<id>.json --auto-only --run=<id>
 *   npx tsx scripts/andler-develops/content/publish-x.ts --input=/tmp/andler-dev-scored-<id>.json --run=test-001 --dry-run
 *
 * CLI flags (per lobster):
 *   --input=<path>       Path to scored JSON
 *   --auto-only          Only publish items scored for auto-publish (score ≥ threshold)
 *   --dry-run            Log what would happen; don't call X API or write output
 *   --run=<run_id>       Run identifier
 *   --help               Print this help and exit 0
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { ScoredOutput, PublishedOutput, PublishedItem } from './types.js';

// ── Arg parser ─────────────────────────────────────────────────────────

interface Args {
  input: string;
  autoOnly: boolean;
  dryRun: boolean;
  run: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { input: '', autoOnly: true, dryRun: false, run: '', help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--auto-only') {
      args.autoOnly = true;
    } else if (arg.startsWith('--input=')) {
      args.input = arg.slice('--input='.length);
    } else if (arg.startsWith('--run=')) {
      args.run = arg.slice('--run='.length);
    } else if (arg === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    } else if (arg === '--run' && argv[i + 1]) {
      args.run = argv[++i];
    }
  }

  return args;
}

function printHelp(): void {
  console.error(`publish-x.ts — STAGE 4: APPROVE (auto-publish X)

Usage:
  npx tsx scripts/andler-develops/content/publish-x.ts --input=<path> --run=<id> [options]

Options:
  --input=<path>       Path to scored JSON from score-content
  --auto-only          Only publish items with decision "auto-publish" (default: true)
  --dry-run            Log what would happen; don't call X API or write output
  --run=<run_id>       Run identifier (required)
  --help, -h           Show this help

Publishing rules:
  - Platforms: x-single, x-thread only
  - Decision: "auto-publish" only (--auto-only)
  - Handle: @andlerdev (id: 1453112399502974978)
  - Rate limit: 3 posts per run, 8 per day
  - Delay: 60-180s between posts with jitter
`);
}

// ── Publishing engine (stub) ───────────────────────────────────────────

// TODO(stub): Call X API v2 create-post endpoint.
// Real implementation will:
//   1. Use oauth-1.0a for X API v2 authentication
//   2. POST https://api.x.com/2/tweets for x-single
//   3. For x-thread, use reply-to-chain pattern
//   4. Rate limit: 3 posts/run, 8 posts/day, 60-180s delay with jitter
//   5. Write published_x_post_id + x_url back
//   6. Update Supabase andlerDev_content table

async function publishToX(
  _body: string,
  _draftId: string,
  _platform: string
): Promise<{ postId: string; url: string }> {
  // STUB: Return placeholder
  return {
    postId: `stub-${_draftId}`,
    url: `https://x.com/andlerdev/status/stub-${_draftId}`,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('[publish-x] ERROR: --input=<path> is required');
    printHelp();
    process.exit(1);
  }

  if (!args.run) {
    console.error('[publish-x] ERROR: --run=<run_id> is required');
    printHelp();
    process.exit(1);
  }

  console.error(`[publish-x] STAGE 4: PUBLISH X — run=${args.run} input=${args.input} auto-only=${args.autoOnly}${args.dryRun ? ' DRY-RUN' : ''}`);

  let scored: ScoredOutput;
  try {
    const raw = await readFile(args.input, 'utf-8');
    scored = JSON.parse(raw);
  } catch (err: any) {
    console.error(`[publish-x] ERROR: Cannot read input file: ${err.message}`);
    process.exit(1);
  }

  const allItems = scored.scored || [];

  // Filter: X platforms only
  const xItems = allItems.filter((s) => s.platform === 'x-single' || s.platform === 'x-thread');

  // Filter: auto-publish only
  const autoItems = args.autoOnly ? xItems.filter((s) => s.decision === 'auto-publish') : xItems;

  // Rate limit: max 3 per run
  const toPublish = autoItems.slice(0, 3);
  const skipped = autoItems.slice(3);

  console.error(`[publish-x] X drafts: ${xItems.length} total, ${autoItems.length} auto-publish, ${toPublish.length} publishing now, ${skipped.length} skipped (rate limit)`);

  const published: PublishedItem[] = [];

  for (let i = 0; i < toPublish.length; i++) {
    const item = toPublish[i];
    const now = new Date().toISOString();

    if (args.dryRun) {
      console.error(`[publish-x] DRY-RUN: Would publish ${item.id} (${item.platform}) — score=${item.score}`);
      published.push({
        ...item,
        publishedAt: now,
        publishedUrl: `https://x.com/andlerdev/status/stub-${item.id}`,
      });
    } else {
      console.error(`[publish-x] Publishing ${item.id} (${item.platform})...`);
      const result = await publishToX(item.body, item.id, item.platform);

      // TODO(stub): Update Supabase andlerDev_content row
      // await supabase.from('andlerDev_content').update({
      //   status: 'published',
      //   published_at: now,
      //   published_url: result.url,
      // }).eq('draft_id', item.id);

      published.push({
        ...item,
        publishedAt: now,
        publishedUrl: result.url,
      });

      console.error(`[publish-x]   → ${result.url}`);

      // Jitter delay between posts (except last)
      if (i < toPublish.length - 1 && !args.dryRun) {
        const delay = 60_000 + Math.floor(Math.random() * 120_000); // 60-180s
        console.error(`[publish-x] Waiting ${Math.round(delay / 1000)}s before next post...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const output: PublishedOutput = {
    run_id: args.run,
    generated_at: new Date().toISOString(),
    published,
  };

  const outputPath = `/tmp/andler-dev-published-${args.run}.json`;

  if (args.dryRun) {
    console.error(`[publish-x] DRY-RUN: Would publish ${published.length} posts to X, write to ${outputPath}`);
  } else {
    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.error(`[publish-x] Published ${published.length} posts, wrote to ${outputPath}`);
  }

  process.stdout.write(JSON.stringify({
    status: 'ok',
    published: published.length,
    skipped: skipped.length,
    path: outputPath,
    dryRun: args.dryRun,
  }) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('[publish-x] FATAL:', err);
  process.exit(1);
});
