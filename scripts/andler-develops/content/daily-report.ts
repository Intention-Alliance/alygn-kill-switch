#!/usr/bin/env node

/**
 * daily-report.ts — STAGE 5 REPORT
 *
 * Reads a run's output files from /tmp, computes summary metrics, and posts
 * a Discord message to #branding (channel 1481025610192257134).
 *
 * Usage:
 *   npx tsx scripts/andler-develops/content/daily-report.ts --run=<id>
 *   npx tsx scripts/andler-develops/content/daily-report.ts --run=test-001 --dry-run
 *
 * CLI flags (per lobster):
 *   --run=<run_id>       Run identifier (required)
 *   --dry-run            Log the report instead of posting to Discord
 *   --channel=<id>       Override Discord channel (default: 1481025610192257134)
 *   --help               Print this help and exit 0
 */

import { readFile } from 'node:fs/promises';
import type {
  CuratedOutput,
  DraftOutput,
  ScoredOutput,
  PublishedOutput,
  QueuedOutput,
} from './types.js';

// ── Arg parser ─────────────────────────────────────────────────────────

interface Args {
  run: string;
  dryRun: boolean;
  channel: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { run: '', dryRun: false, channel: '1481025610192257134', help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--run=')) {
      args.run = arg.slice('--run='.length);
    } else if (arg.startsWith('--channel=')) {
      args.channel = arg.slice('--channel='.length);
    } else if (arg === '--run' && argv[i + 1]) {
      args.run = argv[++i];
    } else if (arg === '--channel' && argv[i + 1]) {
      args.channel = argv[++i];
    }
  }

  return args;
}

function printHelp(): void {
  console.error(`daily-report.ts — STAGE 5: REPORT

Usage:
  npx tsx scripts/andler-develops/content/daily-report.ts --run=<id> [options]

Options:
  --run=<run_id>       Run identifier (required)
  --dry-run            Log the report; don't post to Discord
  --channel=<id>       Discord channel ID (default: 1481025610192257134, #branding)
  --help, -h           Show this help

Report includes:
  - Items curated
  - Drafts generated
  - Auto-published (score ≥ threshold)
  - Queued for human review (score < threshold)
  - Platform breakdown (X, LinkedIn, TikTok, YouTube, Instagram)
  - Avg score
  - Top topic
`);
}

// ── File loading ───────────────────────────────────────────────────────

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── Metrics ────────────────────────────────────────────────────────────

interface ReportMetrics {
  run_id: string;
  generated_at: string;
  items_curated: number;
  drafts_generated: number;
  x_auto_published: number;
  x_pending_approval: number;
  linkedin_queued: number;
  youtube_queued: number;
  tiktok_queued: number;
  ig_carousels_queued: number;
  rejected_for_nda: number;
  avg_score: number;
  top_topic: string;
  by_platform: Record<string, number>;
}

async function computeMetrics(run: string): Promise<ReportMetrics> {
  const curated = await loadJson<CuratedOutput>(`/tmp/andler-dev-curated-${run}.json`);
  const drafts = await loadJson<DraftOutput>(`/tmp/andler-dev-drafts-${run}.json`);
  const scored = await loadJson<ScoredOutput>(`/tmp/andler-dev-scored-${run}.json`);
  const published = await loadJson<PublishedOutput>(`/tmp/andler-dev-published-${run}.json`);
  const queued = await loadJson<QueuedOutput>(`/tmp/andler-dev-queued-${run}.json`);

  const scoredItems = scored?.scored || [];
  const publishedItems = published?.published || [];
  const queuedItems = queued?.queued || [];

  // Platform breakdown from scored
  const byPlatform: Record<string, number> = {};
  for (const item of scoredItems) {
    byPlatform[item.platform] = (byPlatform[item.platform] || 0) + 1;
  }

  // Topic frequency
  const topicCount: Record<string, number> = {};
  for (const item of scoredItems) {
    topicCount[item.topic] = (topicCount[item.topic] || 0) + 1;
  }
  const topTopic = Object.entries(topicCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // NDA rejects
  const ndaRejects = scoredItems.filter((s) => s.scoreBreakdown.ndaFilter === 0).length;

  // Compute avg score
  const totalScores = scoredItems.reduce((sum, s) => sum + s.score, 0);
  const avgScore = scoredItems.length > 0 ? Math.round(totalScores / scoredItems.length) : 0;

  // Queued by platform
  const linkedinQueued = queuedItems.filter((q) => q.platform === 'linkedin').length;
  const youtubeQueued = queuedItems.filter((q) => q.platform === 'youtube').length;
  const tiktokQueued = queuedItems.filter((q) => q.platform === 'tiktok').length;
  const igQueued = queuedItems.filter((q) => q.platform === 'instagram').length;

  return {
    run_id: run,
    generated_at: new Date().toISOString(),
    items_curated: curated?.items?.length ?? 0,
    drafts_generated: drafts?.drafts?.length ?? 0,
    x_auto_published: publishedItems.length,
    x_pending_approval: scoredItems.filter((s) => s.platform.startsWith('x-') && s.decision === 'queue-for-review').length,
    linkedin_queued: linkedinQueued,
    youtube_queued: youtubeQueued,
    tiktok_queued: tiktokQueued,
    ig_carousels_queued: igQueued,
    rejected_for_nda: ndaRejects,
    avg_score: avgScore,
    top_topic: topTopic,
    by_platform: byPlatform,
  };
}

// ── Discord report format ──────────────────────────────────────────────

function formatDiscordMessage(metrics: ReportMetrics): string {
  const date = new Date().toISOString().split('T')[0];
  const lines: string[] = [
    `**Andler Dev Daily** — ${date}`,
    `📥 Curated: ${metrics.items_curated}`,
    `✏️ Drafted: ${metrics.drafts_generated}`,
    `⭐ Auto-published: ${metrics.x_auto_published}`,
    `📋 Queued for review: ${metrics.x_pending_approval + metrics.linkedin_queued + metrics.youtube_queued + metrics.tiktok_queued + metrics.ig_carousels_queued}`,
    '',
    `**Breakdown:**`,
    `• X auto-published: ${metrics.x_auto_published}`,
    `• X pending: ${metrics.x_pending_approval}`,
    `• LinkedIn queued: ${metrics.linkedin_queued}`,
    `• YouTube queued: ${metrics.youtube_queued}`,
    `• TikTok queued: ${metrics.tiktok_queued}`,
    `• IG queued: ${metrics.ig_carousels_queued}`,
    `• NDA blocked: ${metrics.rejected_for_nda}`,
    '',
    `📊 Avg score: ${metrics.avg_score}/100`,
    `🏷️ Top topic: ${metrics.top_topic}`,
    `🔢 Run: \`${metrics.run_id}\``,
  ];
  return lines.join('\n');
}

function formatTerminalMessage(metrics: ReportMetrics): string {
  return formatDiscordMessage(metrics);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.run) {
    console.error('[daily-report] ERROR: --run=<run_id> is required');
    printHelp();
    process.exit(1);
  }

  console.error(`[daily-report] STAGE 5: REPORT — run=${args.run} channel=${args.channel}${args.dryRun ? ' DRY-RUN' : ''}`);

  const metrics = await computeMetrics(args.run);

  const message = formatDiscordMessage(metrics);

  if (args.dryRun) {
    console.error(`[daily-report] DRY-RUN: Would post to Discord #branding (${args.channel}):`);
    console.error(message);
    console.error(`[daily-report] DRY-RUN summary: curated=${metrics.items_curated} drafted=${metrics.drafts_generated} published=${metrics.x_auto_published} queued=${metrics.x_pending_approval + metrics.linkedin_queued + metrics.youtube_queued + metrics.tiktok_queued + metrics.ig_carousels_queued} avgScore=${metrics.avg_score} topTopic=${metrics.top_topic}`);
  } else {
    // TODO(stub): Post to Discord via OpenClaw message tool or webhook
    // Real implementation will post to andler-develops #branding (1481025610192257134)
    console.error(`[daily-report] STUB: Discord post not yet implemented (channel: ${args.channel})`);
    console.error(message);
  }

  // Print metrics as JSON to stdout for pipeline consumers
  process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('[daily-report] FATAL:', err);
  process.exit(1);
});
