#!/usr/bin/env node

/**
 * fetch-input.ts — STAGE 1 CURATE
 *
 * Ingests raw idea from a source (Discord annotations, manual input, stdin),
 * strips NDA content (Alygn/Bitcash mentions), tags with topic/audience,
 * and writes curated output to /tmp/andler-dev-curated-<run_id>.json.
 *
 * Usage:
 *   npx tsx scripts/andler-develops/content/fetch-input.ts --since=24h --source=discord-annotations --run=<id>
 *   npx tsx scripts/andler-develops/content/fetch-input.ts --since=24h --source=stdin --run=test-001 --dry-run < input.txt
 *
 * CLI flags (per lobster):
 *   --since=<duration>   Time window (default: 24h)
 *   --source=<name>      Input source (default: discord-annotations)
 *   --run=<run_id>       Run identifier (required)
 *   --dry-run            Log what would happen, don't write output
 *   --help               Print this help and exit 0
 */

import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { CuratedOutput, Audience } from './types.js';
import { hasNdaViolation } from './types.js';

// ── Arg parser ─────────────────────────────────────────────────────────

interface Args {
  since: string;
  source: string;
  run: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { since: '24h', source: 'discord-annotations', run: '', dryRun: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--since=')) {
      args.since = arg.slice('--since='.length);
    } else if (arg.startsWith('--source=')) {
      args.source = arg.slice('--source='.length);
    } else if (arg.startsWith('--run=')) {
      args.run = arg.slice('--run='.length);
    } else if (arg === '--since' && argv[i + 1]) {
      args.since = argv[++i];
    } else if (arg === '--source' && argv[i + 1]) {
      args.source = argv[++i];
    } else if (arg === '--run' && argv[i + 1]) {
      args.run = argv[++i];
    }
  }

  return args;
}

function printHelp(): void {
  console.error(`fetch-input.ts — STAGE 1: CURATE

Usage:
  npx tsx scripts/andler-develops/content/fetch-input.ts --run=<id> [options]

Options:
  --since=<duration>   Time window for input collection (default: 24h)
  --source=<name>      Input source: discord-annotations, stdin, manual-dump (default: discord-annotations)
  --run=<run_id>       Run identifier (required)
  --dry-run            Log what would happen; don't write output file
  --help, -h           Show this help

Examples:
  npx tsx scripts/andler-develops/content/fetch-input.ts --since=24h --source=discord-annotations --run=20260610-001
  npx tsx scripts/andler-develops/content/fetch-input.ts --source=stdin --run=test-001 --dry-run < input.txt
`);
}

// ── Topic detection ────────────────────────────────────────────────────

const TOPIC_KEYWORDS: Record<string, string> = {
  'edge compute': 'edge-compute',
  'edge computing': 'edge-compute',
  'federated compute': 'federated-compute',
  'distributed compute': 'distributed-compute',
  'git as state': 'git-state-engine',
  'git-driven': 'git-state-engine',
  'crdt': 'crdt-sync',
  'zero trust': 'zero-trust',
  'sudo policy': 'zero-trust',
  'gaslighting': 'ai-safety',
  'ai safety': 'ai-safety',
  'ai agent': 'ai-agents',
  'agent architecture': 'ai-agents',
  'web3': 'web3',
  'blockchain': 'web3',
  'solidity': 'web3',
  'smart contract': 'web3',
  'architecture': 'architecture',
  'system design': 'architecture',
  'scalability': 'scalability',
  'dx': 'dev-experience',
  'developer experience': 'dev-experience',
  'llm': 'llm-engineering',
  'rag': 'llm-engineering',
  'vector db': 'llm-engineering',
  'kubernetes': 'infrastructure',
  'docker': 'infrastructure',
  'pipeline': 'devops',
  'ci/cd': 'devops',
  'typescript': 'typescript',
};

function detectTopic(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, topic] of Object.entries(TOPIC_KEYWORDS)) {
    if (lower.includes(keyword)) return topic;
  }
  return 'architecture';
}

function detectAudience(text: string): Audience {
  const lower = text.toLowerCase();
  if (lower.includes('web3') || lower.includes('blockchain') || lower.includes('solidity') || lower.includes('defi')) {
    return 'web3';
  }
  if (lower.includes('cto') || lower.includes('founder') || lower.includes('startup') || lower.includes('leadership')) {
    return 'cto';
  }
  if (lower.includes('engineer') || lower.includes('senior') || lower.includes('architect') || lower.includes('staff engineer')) {
    return 'eng-lead';
  }
  return 'eng-lead';
}

// ── Input collection ───────────────────────────────────────────────────

async function collectStdin(): Promise<string> {
  const lines: string[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for await (const line of rl) {
    lines.push(line);
  }
  return lines.join('\n');
}

// TODO(stub): Fetch from Discord #annotations channel
// Real implementation will use discord.js client to fetch messages from
// channel 1466532145257255004 filtered by --since time window.
async function collectDiscordAnnotations(_since: string): Promise<string> {
  console.error('[fetch-input] STUB: Discord annotations collection not yet implemented');
  console.error('[fetch-input] Source=discord-annotations requires discord.js client + channel ID 1466532145257255004');
  // For now, read from stdin as fallback
  if (!process.stdin.isTTY) {
    return collectStdin();
  }
  return '';
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.run) {
    console.error('[fetch-input] ERROR: --run=<run_id> is required');
    printHelp();
    process.exit(1);
  }

  console.error(`[fetch-input] STAGE 1: CURATE — run=${args.run} since=${args.since} source=${args.source}${args.dryRun ? ' DRY-RUN' : ''}`);

  // Collect input
  let rawText: string;
  if (args.source === 'stdin' || args.source === 'manual-dump') {
    rawText = await collectStdin();
  } else if (args.source === 'discord-annotations') {
    rawText = await collectDiscordAnnotations(args.since);
  } else {
    console.error(`[fetch-input] ERROR: Unknown source '${args.source}'`);
    process.exit(1);
  }

  if (!rawText.trim()) {
    console.error('[fetch-input] WARNING: No input received. Output will be empty.');
  }

  // Split into paragraphs (each paragraph is a potential item)
  const paragraphs = rawText.split('\n\n').filter((p) => p.trim().length > 20);
  const curatedItems = paragraphs
    .filter((p) => {
      const violation = hasNdaViolation(p);
      if (violation) {
        console.error(`[fetch-input] NDA filter: SKIPPED item containing restricted pattern.`);
        console.error(`[fetch-input]   preview: ${p.slice(0, 80)}...`);
      }
      return !violation;
    })
    .map((raw, idx) => ({
      id: `${args.run}-${String(idx + 1).padStart(3, '0')}`,
      raw: raw.trim(),
      topic: detectTopic(raw),
      audience: detectAudience(raw),
      source: args.source,
      curatedAt: new Date().toISOString(),
    }));

  const output: CuratedOutput = {
    run_id: args.run,
    since: args.since,
    source: args.source,
    generated_at: new Date().toISOString(),
    items: curatedItems,
  };

  const outputPath = `/tmp/andler-dev-curated-${args.run}.json`;

  if (args.dryRun) {
    console.error(`[fetch-input] DRY-RUN: Would write ${curatedItems.length} items to ${outputPath}`);
    console.error(`[fetch-input] DRY-RUN preview: ${JSON.stringify(output, null, 2).slice(0, 500)}`);
  } else {
    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.error(`[fetch-input] Wrote ${curatedItems.length} curated items to ${outputPath}`);
  }

  // Always print JSON path to stdout for pipeline composition
  process.stdout.write(JSON.stringify({ status: 'ok', items: curatedItems.length, path: outputPath, dryRun: args.dryRun }) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('[fetch-input] FATAL:', err);
  process.exit(1);
});
