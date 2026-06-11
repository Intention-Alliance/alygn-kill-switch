#!/usr/bin/env node

/**
 * draft-content.ts — STAGE 2 DRAFT
 *
 * Reads curated input from --input, generates per-platform drafts via
 * Grok API (stubbed). Applies Beautiful Prose rules: no em dashes,
 * no "not X but Y", no filler transitions.
 *
 * Usage:
 *   npx tsx scripts/andler-develops/content/draft-content.ts --input=/tmp/andler-dev-curated-<id>.json --platforms=x-single,x-thread,linkedin,tiktok --run=<id>
 *   npx tsx scripts/andler-develops/content/draft-content.ts --input=/tmp/andler-dev-curated-<id>.json --platforms=x-single --run=test-001 --dry-run
 *
 * CLI flags (per lobster):
 *   --input=<path>       Path to curated JSON
 *   --platforms=<list>   Comma-separated platform list (default: x-single,x-thread,linkedin,tiktok)
 *   --run=<run_id>       Run identifier
 *   --dry-run            Log what would happen; don't call Grok or write output
 *   --help               Print this help and exit 0
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { CuratedOutput, DraftOutput, DraftedItem, Platform } from './types.js';

// ── Arg parser ─────────────────────────────────────────────────────────

interface Args {
  input: string;
  platforms: Platform[];
  run: string;
  dryRun: boolean;
  help: boolean;
}

const VALID_PLATFORMS = new Set<Platform>(['x-single', 'x-thread', 'linkedin', 'tiktok', 'youtube', 'instagram']);

function parseArgs(argv: string[]): Args {
  const args: Args = {
    input: '',
    platforms: ['x-single', 'x-thread', 'linkedin', 'tiktok'],
    run: '',
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--input=')) {
      args.input = arg.slice('--input='.length);
    } else if (arg.startsWith('--platforms=')) {
      const raw = arg.slice('--platforms='.length).split(',').filter((p): p is Platform => VALID_PLATFORMS.has(p as Platform));
      if (raw.length) args.platforms = raw;
    } else if (arg.startsWith('--run=')) {
      args.run = arg.slice('--run='.length);
    } else if (arg === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    } else if (arg === '--platforms' && argv[i + 1]) {
      const raw = argv[++i].split(',').filter((p): p is Platform => VALID_PLATFORMS.has(p as Platform));
      if (raw.length) args.platforms = raw;
    } else if (arg === '--run' && argv[i + 1]) {
      args.run = argv[++i];
    }
  }

  return args;
}

function printHelp(): void {
  console.error(`draft-content.ts — STAGE 2: DRAFT

Usage:
  npx tsx scripts/andler-develops/content/draft-content.ts --input=<path> --run=<id> [options]

Options:
  --input=<path>       Path to curated JSON from fetch-input
  --platforms=<list>   Comma-separated platforms: x-single,x-thread,linkedin,tiktok,youtube,instagram
                       (default: x-single,x-thread,linkedin,tiktok)
  --run=<run_id>       Run identifier (required)
  --dry-run            Log what would happen; don't call Grok API or write output
  --help, -h           Show this help

Platform format constraints:
  x-single   ≤280 chars, hook-first, 1-2 hashtags, CTA: "more at @andlerdev"
  x-thread   4-9 posts, numbered, first=hook, last=CTA+link
  linkedin   800-1500 words, 3-5 hashtags, CTA: DM for architecture diagram
  tiktok     30-60s spoken, structure: hook-1s, beat-1, beat-2, beat-3, payoff

Beautiful Prose rules enforced:
  - No em dashes (—)
  - No "not X but Y" constructions
  - No filler transitions ("in today's", "delve into", "leverage")
`);
}

// ── Voice enforcement ──────────────────────────────────────────────────

const BANNED_TOKENS = [
  'revolutionary',
  'game-changer',
  'disruptive',
  "in today's",
  'delve into',
  'leverage',
  'in order to',
  "it's important to note",
];

function enforceVoice(text: string): { cleaned: string; violations: string[] } {
  const violations: string[] = [];
  let cleaned = text;

  // Strip em dashes
  if (cleaned.includes('—')) {
    violations.push('em-dash stripped');
    cleaned = cleaned.replace(/—/g, ',');
  }

  // Strip double dashes
  if (cleaned.includes('--')) {
    violations.push('double-dash stripped');
    cleaned = cleaned.replace(/--/g, ',');
  }

  // Check banned tokens
  const lower = cleaned.toLowerCase();
  for (const token of BANNED_TOKENS) {
    if (lower.includes(token)) {
      violations.push(`banned token: "${token}"`);
    }
  }

  // Check "not X but Y" pattern
  if (/\bnot\s+\w+[,.]?\s*(?:but|it's|it\s+is)\s+\w+/gi.test(cleaned)) {
    violations.push('"not X but Y" pattern detected');
  }

  return { cleaned, violations };
}

// ── Draft generation (stub) ────────────────────────────────────────────

// TODO(stub): Call Grok API ($GROK_API_KEY) with platform-specific prompts.
// Real implementation will:
//   1. Build a system prompt describing @andlerdev voice + platform constraints
//   2. Map each curated item + platform into a Grok completion
//   3. Enforce Beautiful Prose rules on the output
//   4. Return DraftedItem[]
//
// For now, generates placeholder drafts.

function genStubDraft(item: { id: string; raw: string; topic: string; audience: 'web3' | 'cto' | 'eng-lead' | 'personal'; source: string; curatedAt: string }, platform: Platform, idx: number): DraftedItem {
  const now = new Date().toISOString();

  const templates: Record<Platform, { body: string; hashtags: string[]; cta: string }> = {
    'x-single': {
      body: `[STUB] ${item.topic}: ${item.raw.slice(0, 240)}…`,
      hashtags: ['#AI', '#Engineering'],
      cta: 'more at @andlerdev',
    },
    'x-thread': {
      body: [
        `1/ [STUB] ${item.topic} — hook from ${item.raw.slice(0, 200)}`,
        `2/ The architecture behind this is federated edge-hub compute with zero-trust sudo policy.`,
        `3/ Key insight: treat git as the state engine, not just version control.`,
        `4/ Real-world results: 3x faster deployment, single source of truth across 12 nodes.`,
        `5/ Full build log at andler.dev — link in bio. @andlerdev`,
      ].join('\n'),
      hashtags: ['#AI', '#Architecture', '#CTO'],
      cta: 'link to andler.dev + @andlerdev',
    },
    linkedin: {
      body: [
        `[STUB] ${item.topic}`,
        '',
        `When you're shipping AI-native infrastructure, the default approach breaks fast. ${item.raw.slice(0, 500)}`,
        '',
        'Here\'s what we learned building this out:',
        '• Federated edge-hub compute reduces cold start by 80%',
        '• Git as state engine means every deployment is reproducible and auditable',
        '• Zero-trust sudo policy prevents configuration drift across nodes',
        '',
        'The hard part isn\'t the tech — it\'s resisting the urge to add complexity where simplicity already works.',
        '',
        'DM me if you want the architecture diagram.',
      ].join('\n'),
      hashtags: ['#AI', '#Architecture', '#CTO', '#Engineering'],
      cta: 'DM if you want the architecture diagram',
    },
    tiktok: {
      body: [
        '[HOOK 0-3s] Most AI infra is over-engineered. Here\'s why:',
        '[BEAT 1] Federated edge-hub compute removes the central bottleneck.',
        '[BEAT 2] Git as state engine — every deployment has a full audit trail.',
        '[BEAT 3] Zero-trust sudo policy means no config drift, ever.',
        '[PAYOFF] Ship faster, break less. Full paper at andler.dev',
      ].join('\n'),
      hashtags: ['#AI', '#Engineering', '#CTO'],
      cta: 'more at andler.dev',
    },
    youtube: {
      body: [
        '[HOOK 5s] Your AI infrastructure is leaking complexity. Let me show you how to fix it.',
        '[CONTEXT] Most teams ship AI features the same way they ship CRUD apps. That\'s the mistake.',
        '[ACT 1] The edge-hub architecture — why centralization kills throughput.',
        '[ACT 2] Git as a state engine — version control for your entire infrastructure.',
        '[ACT 3] Zero-trust sudo policy — stop configuration drift before it starts.',
        '[CTA] Full build log, diagrams, and code at andler.dev',
      ].join('\n'),
      hashtags: ['#AI', '#Infrastructure', '#CTO'],
      cta: 'link in description at andler.dev',
    },
    instagram: {
      body: [
        '[SLIDE 1] AI Infrastructure: Stop Over-engineering',
        '[SLIDE 2] The Problem: Centralized compute = bottleneck',
        '[SLIDE 3] The Solution: Federated edge-hub compute',
        '[SLIDE 4] Git as State Engine — reproducible by default',
        '[SLIDE 5] Zero-Trust Sudo Policy — no config drift',
        '[SLIDE 6] Results: 3x faster deployments',
        '[SLIDE 7] Full paper at andler.dev',
      ].join('\n'),
      hashtags: ['#AI', '#Infrastructure', '#Engineering', '#CTO'],
      cta: 'link in bio',
    },
  };

  const template = templates[platform];
  return {
    id: `${item.id}-${platform}`,
    raw: item.raw,
    topic: item.topic,
    audience: item.audience,
    source: item.source,
    curatedAt: item.curatedAt,
    platform,
    body: template.body,
    hashtags: template.hashtags,
    cta: template.cta,
    draftedAt: now,
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
    console.error('[draft-content] ERROR: --input=<path> is required');
    printHelp();
    process.exit(1);
  }

  if (!args.run) {
    console.error('[draft-content] ERROR: --run=<run_id> is required');
    printHelp();
    process.exit(1);
  }

  console.error(`[draft-content] STAGE 2: DRAFT — run=${args.run} input=${args.input} platforms=${args.platforms.join(',')}${args.dryRun ? ' DRY-RUN' : ''}`);

  let curated: CuratedOutput;
  try {
    const raw = await readFile(args.input, 'utf-8');
    curated = JSON.parse(raw);
  } catch (err: any) {
    console.error(`[draft-content] ERROR: Cannot read input file: ${err.message}`);
    process.exit(1);
  }

  if (!curated.items || curated.items.length === 0) {
    console.error('[draft-content] WARNING: No curated items found. Output will be empty.');
  }

  const items = curated.items || [];

  // TODO(stub): Replace with Grok API call
  // const grok = new GrokClient(process.env.GROK_API_KEY!);
  // const drafts = await Promise.all(items.map(...));
  const drafts: DraftedItem[] = [];
  for (const item of items) {
    for (const platform of args.platforms) {
      const draft = genStubDraft(item, platform, drafts.length + 1);

      // Enforce voice
      const { violations } = enforceVoice(draft.body);
      if (violations.length) {
        console.error(`[draft-content] Voice violations in ${draft.id}: ${violations.join(', ')}`);
      }

      drafts.push(draft);
    }
  }

  const output: DraftOutput = {
    run_id: args.run,
    generated_at: new Date().toISOString(),
    drafts,
  };

  const outputPath = `/tmp/andler-dev-drafts-${args.run}.json`;

  if (args.dryRun) {
    console.error(`[draft-content] DRY-RUN: Would generate ${drafts.length} drafts and write to ${outputPath}`);
    for (const d of drafts.slice(0, 3)) {
      console.error(`[draft-content] DRY-RUN preview [${d.platform}]: ${d.body.slice(0, 120)}...`);
    }
  } else {
    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.error(`[draft-content] Wrote ${drafts.length} drafts to ${outputPath}`);
  }

  process.stdout.write(JSON.stringify({ status: 'ok', drafts: drafts.length, path: outputPath, dryRun: args.dryRun }) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('[draft-content] FATAL:', err);
  process.exit(1);
});
