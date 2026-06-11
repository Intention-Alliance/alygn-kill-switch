#!/usr/bin/env node

/**
 * sync-notion-queue.ts — STAGE 4 APPROVE (human queue)
 *
 * Reads scored JSON, filters to drafts below threshold OR non-X platforms,
 * and creates pages in the "Andler Develops — Content Queue" Notion database
 * for human review.
 *
 * Usage:
 *   npx tsx scripts/andler-develops/content/sync-notion-queue.ts --input=/tmp/andler-dev-scored-<id>.json --queue=human-approval --run=<id>
 *   npx tsx scripts/andler-develops/content/sync-notion-queue.ts --input=/tmp/andler-dev-scored-<id>.json --queue=human-approval --run=test-001 --dry-run
 *
 * CLI flags (per lobster):
 *   --input=<path>       Path to scored JSON
 *   --queue=<name>       Queue name (default: human-approval)
 *   --run=<run_id>       Run identifier
 *   --dry-run            Log what would happen; don't call Notion API or write output
 *   --help               Print this help and exit 0
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { ScoredOutput, QueuedOutput, QueuedItem, ScoredItem } from './types.js';

// ── Arg parser ─────────────────────────────────────────────────────────

interface Args {
  input: string;
  queue: string;
  run: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { input: '', queue: 'human-approval', run: '', dryRun: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--input=')) {
      args.input = arg.slice('--input='.length);
    } else if (arg.startsWith('--queue=')) {
      args.queue = arg.slice('--queue='.length);
    } else if (arg.startsWith('--run=')) {
      args.run = arg.slice('--run='.length);
    } else if (arg === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    } else if (arg === '--queue' && argv[i + 1]) {
      args.queue = argv[++i];
    } else if (arg === '--run' && argv[i + 1]) {
      args.run = argv[++i];
    }
  }

  return args;
}

function printHelp(): void {
  console.error(`sync-notion-queue.ts — STAGE 4: APPROVE (human queue)

Usage:
  npx tsx scripts/andler-develops/content/sync-notion-queue.ts --input=<path> --run=<id> [options]

Options:
  --input=<path>       Path to scored JSON from score-content
  --queue=<name>       Queue target (default: human-approval)
  --run=<run_id>       Run identifier (required)
  --dry-run            Log what would happen; don't call Notion API or write output
  --help, -h           Show this help

Queuing rules:
  - Drafts with score < threshold (not auto-publish)
  - All non-X platforms (linkedin, tiktok, youtube, instagram) regardless of score
  - Creates pages in Notion "Andler Develops — Content Queue" database
  - Page properties: Name, Platform, Score, Body, Hashtags, CTA, Status
  - Posts reminder to Discord #branding (channel 1481025610192257134)
`);
}

// ── Notion sync (stub) ─────────────────────────────────────────────────

// TODO(stub): Create pages in Notion database.
// Real implementation will:
//   1. Use @notionhq/client to connect to Notion API
//   2. Database ID from process.env.ANDLER_DEV_NOTION_DB_ID
//   3. Create page per queued draft with properties:
//      - Name (title): draft topic
//      - Platform (select): x-single, x-thread, linkedin, tiktok, youtube, instagram
//      - Score (number): 0-100
//      - Body (rich_text): full draft body
//      - Hashtags (multi_select): hashtag array
//      - CTA (rich_text): call to action
//      - Status (select): "Draft" (default)
//   4. Store notion_page_id back on queued item
//   5. Update Supabase andlerDev_content row

// TODO(stub): Post Discord reminder to #branding (1481025610192257134)
// Real implementation will:
//   1. Use discord.js client or webhook
//   2. Channel ID: 1481025610192257134
//   3. Ping @andler with reminder cadence:
//      - 1h after queue
//      - 9am next day
//      - 24h later if not approved

async function createNotionPage(
  _item: ScoredItem,
  _dbId: string
): Promise<string> {
  // STUB: Return placeholder Notion page ID
  return `stub-notion-page-${_item.id}`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('[sync-notion-queue] ERROR: --input=<path> is required');
    printHelp();
    process.exit(1);
  }

  if (!args.run) {
    console.error('[sync-notion-queue] ERROR: --run=<run_id> is required');
    printHelp();
    process.exit(1);
  }

  console.error(`[sync-notion-queue] STAGE 4: QUEUE HUMAN — run=${args.run} input=${args.input} queue=${args.queue}${args.dryRun ? ' DRY-RUN' : ''}`);

  let scored: ScoredOutput;
  try {
    const raw = await readFile(args.input, 'utf-8');
    scored = JSON.parse(raw);
  } catch (err: any) {
    console.error(`[sync-notion-queue] ERROR: Cannot read input file: ${err.message}`);
    process.exit(1);
  }

  const allItems = scored.scored || [];

  // Filter: score < threshold OR non-X platform
  const toQueue = allItems.filter((s) => {
    const isNonX = !s.platform.startsWith('x-');
    const belowThreshold = s.decision === 'queue-for-review';
    return belowThreshold || isNonX;
  });

  console.error(`[sync-notion-queue] ${toQueue.length} drafts to queue (out of ${allItems.length} total)`);

  // Platform breakdown for reporting
  const byPlatform: Record<string, number> = {};
  for (const item of toQueue) {
    byPlatform[item.platform] = (byPlatform[item.platform] || 0) + 1;
  }

  const dbId = process.env.ANDLER_DEV_NOTION_DB_ID || 'stub-notion-db-id';

  const queued: QueuedItem[] = [];
  const now = new Date().toISOString();

  for (const item of toQueue) {
    if (args.dryRun) {
      console.error(`[sync-notion-queue] DRY-RUN: Would queue ${item.id} (${item.platform}) — score=${item.score}`);
      queued.push({
        ...item,
        notionPageId: `stub-notion-page-${item.id}`,
        queuedAt: now,
      });
    } else {
      console.error(`[sync-notion-queue] Creating Notion page for ${item.id} (${item.platform})...`);
      const pageId = await createNotionPage(item, dbId);

      // TODO(stub): Update Supabase andlerDev_content row
      // await supabase.from('andlerDev_content').update({
      //   status: 'queued',
      //   notion_page_id: pageId,
      // }).eq('draft_id', item.id);

      queued.push({
        ...item,
        notionPageId: pageId,
        queuedAt: now,
      });

      console.error(`[sync-notion-queue]   → Notion page: ${pageId}`);
    }
  }

  const output: QueuedOutput = {
    run_id: args.run,
    generated_at: new Date().toISOString(),
    queued,
  };

  const outputPath = `/tmp/andler-dev-queued-${args.run}.json`;

  if (args.dryRun) {
    console.error(`[sync-notion-queue] DRY-RUN: Would queue ${queued.length} drafts to Notion, write to ${outputPath}`);
    console.error(`[sync-notion-queue] DRY-RUN: Would post reminder to Discord #branding (1481025610192257134)`);
    console.error(`[sync-notion-queue] Platform breakdown: ${JSON.stringify(byPlatform)}`);
  } else {
    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.error(`[sync-notion-queue] Queued ${queued.length} drafts, wrote to ${outputPath}`);
    console.error(`[sync-notion-queue] Platform breakdown: ${JSON.stringify(byPlatform)}`);
  }

  process.stdout.write(JSON.stringify({
    status: 'ok',
    queued: queued.length,
    byPlatform,
    path: outputPath,
    dryRun: args.dryRun,
  }) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('[sync-notion-queue] FATAL:', err);
  process.exit(1);
});
