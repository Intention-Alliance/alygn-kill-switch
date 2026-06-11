#!/usr/bin/env node

/**
 * score-content.ts — STAGE 3 SCORE
 *
 * Reads drafts from --input, scores each 0-100 against brand voice criteria.
 * Threshold: items scoring ≥ threshold get "auto-publish"; below get "queue-for-review".
 * Hard-fail: any draft with NDA leak gets score 0 and decision "queue-for-review".
 *
 * Usage:
 *   npx tsx scripts/andler-develops/content/score-content.ts --input=/tmp/andler-dev-drafts-<id>.json --threshold=92 --run=<id>
 *   npx tsx scripts/andler-develops/content/score-content.ts --input=/tmp/andler-dev-drafts-<id>.json --threshold=85 --run=test-001 --dry-run
 *
 * CLI flags (per lobster):
 *   --input=<path>       Path to drafts JSON
 *   --threshold=<n>      Score threshold for auto-publish (default: 92)
 *   --run=<run_id>       Run identifier
 *   --dry-run            Log what would happen; don't write output
 *   --help               Print this help and exit 0
 */

import { readFile, writeFile } from 'node:fs/promises';
import type {
  DraftOutput,
  DraftedItem,
  ScoredOutput,
  ScoredItem,
  ScoreBreakdown,
  Decision,
  Platform,
} from './types.js';
import { hasNdaViolation } from './types.js';

// ── Arg parser ─────────────────────────────────────────────────────────

interface Args {
  input: string;
  threshold: number;
  run: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { input: '', threshold: 92, run: '', dryRun: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--input=')) {
      args.input = arg.slice('--input='.length);
    } else if (arg.startsWith('--threshold=')) {
      args.threshold = parseInt(arg.slice('--threshold='.length), 10) || 92;
    } else if (arg.startsWith('--run=')) {
      args.run = arg.slice('--run='.length);
    } else if (arg === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    } else if (arg === '--threshold' && argv[i + 1]) {
      args.threshold = parseInt(argv[++i], 10) || 92;
    } else if (arg === '--run' && argv[i + 1]) {
      args.run = argv[++i];
    }
  }

  return args;
}

function printHelp(): void {
  console.error(`score-content.ts — STAGE 3: SCORE

Usage:
  npx tsx scripts/andler-develops/content/score-content.ts --input=<path> --run=<id> [options]

Options:
  --input=<path>       Path to drafts JSON from draft-content
  --threshold=<n>      Score threshold for auto-publish (default: 92, range: 0-100)
  --run=<run_id>       Run identifier (required)
  --dry-run            Log what would happen; don't write output
  --help, -h           Show this help

Scoring dimensions (total 100):
  Brand voice match    0-25   Tone, no banned tokens, em-dash free
  Length               0-15   Platform-appropriate length
  Hashtag quality      0-10   Count matches platform guideline
  CTA present          0-15   Clear, platform-appropriate CTA
  Technical density    0-15   Specifics > generalities
  NDA filter           0-20   Zero if any restricted patterns found (hard fail)
`);
}

// ── Scoring engine ─────────────────────────────────────────────────────

interface PlatformConstraints {
  maxLen: number;
  minLen: number;
  minHashtags: number;
  maxHashtags: number;
}

const PLATFORM_CONSTRAINTS: Record<Platform, PlatformConstraints> = {
  'x-single': { maxLen: 280, minLen: 80, minHashtags: 1, maxHashtags: 2 },
  'x-thread': { maxLen: 2000, minLen: 400, minHashtags: 1, maxHashtags: 3 },
  linkedin: { maxLen: 1500, minLen: 800, minHashtags: 3, maxHashtags: 5 },
  tiktok: { maxLen: 600, minLen: 100, minHashtags: 1, maxHashtags: 3 },
  youtube: { maxLen: 2000, minLen: 400, minHashtags: 1, maxHashtags: 3 },
  instagram: { maxLen: 2200, minLen: 300, minHashtags: 8, maxHashtags: 12 },
};

function scoreBrandVoice(body: string): number {
  let score = 25;

  // Deduct for em dashes
  if (body.includes('—')) score -= 5;
  if (body.includes('--')) score -= 3;

  // Deduct for "not X but Y"
  if (/\bnot\s+\w+[,.]?\s*(?:but|it's|it\s+is)\s+\w+/gi.test(body)) score -= 5;

  // Deduct for filler transitions
  const fillerCount = (body.match(/\b(?:delve into|leverage|game-changer|revolutionary|disruptive|in today's|in order to|it's important to note)\b/gi) || []).length;
  score -= Math.min(fillerCount * 3, 10);

  return Math.max(0, score);
}

function scoreLength(body: string, platform: Platform): number {
  const constraints = PLATFORM_CONSTRAINTS[platform];
  const len = body.length;

  // Perfect: within 10% of max
  if (len >= constraints.minLen && len <= constraints.maxLen) return 15;

  // Slightly over/under
  if (len >= constraints.minLen * 0.8 && len <= constraints.maxLen * 1.2) return 10;

  // Way off
  if (len >= constraints.minLen * 0.5 && len <= constraints.maxLen * 1.5) return 5;

  return 2;
}

function scoreHashtags(hashtags: string[], platform: Platform): number {
  const constraints = PLATFORM_CONSTRAINTS[platform];
  const count = hashtags.length;

  if (count >= constraints.minHashtags && count <= constraints.maxHashtags) return 10;
  if (count > 0 && count <= constraints.maxHashtags + 2) return 7;
  if (count > 0) return 4;
  return 0;
}

function scoreCta(body: string, platform: Platform): number {
  const lower = body.toLowerCase();
  let score = 0;

  switch (platform) {
    case 'x-single':
      if (lower.includes('@andlerdev') || lower.includes('andler.dev')) score = 15;
      else if (lower.includes('http') || lower.includes('link') || lower.includes('more')) score = 8;
      break;
    case 'x-thread':
      if (lower.includes('@andlerdev') && (lower.includes('andler.dev') || lower.includes('link'))) score = 15;
      else if (lower.includes('@andlerdev') || lower.includes('andler.dev')) score = 10;
      break;
    case 'linkedin':
      if (lower.includes('dm') || lower.includes('comment') || lower.includes('thoughts?')) score = 15;
      else if (lower.includes('link') || lower.includes('more')) score = 8;
      break;
    case 'tiktok':
      if (lower.includes('andler.dev') || lower.includes('link in bio')) score = 15;
      else if (lower.includes('full') || lower.includes('more')) score = 8;
      break;
    default:
      if (lower.includes('andler.dev') || lower.includes('link') || lower.includes('more')) score = 10;
  }

  return score;
}

function scoreTechnicalDensity(body: string): number {
  const signalWords = [
    'architecture', 'throughput', 'latency', 'cold start', 'federated',
    'edge-hub', 'zero-trust', 'sudo policy', 'crdt', 'state engine',
    'audit trail', 'deployment', 'node', 'cluster', 'orchestration',
    'consensus', 'replication', 'configuration drift', 'immutable',
    'reproducible', 'deterministic', 'benchmark', 'p99', 'throughput',
    'schema', 'migration', 'rollback', 'canary', 'blue/green',
  ];

  const lower = body.toLowerCase();
  const hitCount = signalWords.filter((w) => lower.includes(w)).length;

  if (hitCount >= 5) return 15;
  if (hitCount >= 3) return 12;
  if (hitCount >= 1) return 8;
  return 3;
}

function scoreNdaFilter(body: string): number {
  return hasNdaViolation(body) ? 0 : 20;
}

function scoreItem(draft: DraftedItem): ScoredItem {
  const breakdown: ScoreBreakdown = {
    brandVoice: scoreBrandVoice(draft.body),
    length: scoreLength(draft.body, draft.platform),
    hashtags: scoreHashtags(draft.hashtags, draft.platform),
    cta: scoreCta(draft.body, draft.platform),
    technicalDensity: scoreTechnicalDensity(draft.body),
    ndaFilter: scoreNdaFilter(draft.body),
  };

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const score = Math.min(total, 100);

  // NDA fail = auto queue
  const decision: Decision = breakdown.ndaFilter === 0 ? 'queue-for-review' : 'auto-publish';

  return {
    ...draft,
    score,
    scoreBreakdown: breakdown,
    decision,
    scoredAt: new Date().toISOString(),
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
    console.error('[score-content] ERROR: --input=<path> is required');
    printHelp();
    process.exit(1);
  }

  if (!args.run) {
    console.error('[score-content] ERROR: --run=<run_id> is required');
    printHelp();
    process.exit(1);
  }

  console.error(`[score-content] STAGE 3: SCORE — run=${args.run} input=${args.input} threshold=${args.threshold}${args.dryRun ? ' DRY-RUN' : ''}`);

  let drafts: DraftOutput;
  try {
    const raw = await readFile(args.input, 'utf-8');
    drafts = JSON.parse(raw);
  } catch (err: any) {
    console.error(`[score-content] ERROR: Cannot read input file: ${err.message}`);
    process.exit(1);
  }

  if (!drafts.drafts || drafts.drafts.length === 0) {
    console.error('[score-content] WARNING: No drafts found. Output will be empty.');
  }

  const items = drafts.drafts || [];
  const scored = items.map(scoreItem);

  // Check threshold — items below threshold get queued regardless of initial decision
  for (const item of scored) {
    if (item.decision === 'auto-publish' && item.score < args.threshold) {
      item.decision = 'queue-for-review';
    }
  }

  const autoCount = scored.filter((s) => s.decision === 'auto-publish').length;
  const queueCount = scored.filter((s) => s.decision === 'queue-for-review').length;
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : 0;

  const output: ScoredOutput = {
    run_id: args.run,
    generated_at: new Date().toISOString(),
    threshold: args.threshold,
    scored,
  };

  const outputPath = `/tmp/andler-dev-scored-${args.run}.json`;

  if (args.dryRun) {
    console.error(`[score-content] DRY-RUN: Would score ${scored.length} drafts → ${autoCount} auto-publish, ${queueCount} queue (avg score: ${avgScore})`);
    for (const s of scored.slice(0, 3)) {
      console.error(`[score-content]   ${s.id}: score=${s.score} decision=${s.decision} [${s.platform}]`);
    }
  } else {
    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.error(`[score-content] Wrote ${scored.length} scored items to ${outputPath}`);
    console.error(`[score-content]   ${autoCount} auto-publish, ${queueCount} queue-for-review (avg: ${avgScore}/100, threshold: ${args.threshold})`);
  }

  process.stdout.write(JSON.stringify({
    status: 'ok',
    total: scored.length,
    autoPublish: autoCount,
    queue: queueCount,
    avgScore,
    path: outputPath,
    dryRun: args.dryRun,
  }) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('[score-content] FATAL:', err);
  process.exit(1);
});
