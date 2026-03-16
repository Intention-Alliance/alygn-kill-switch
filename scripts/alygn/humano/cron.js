/**
 * Cron — Automated @humano content cycle
 *
 * Runs on schedule defined in projects/humano.json:
 *   automation.cronSchedule  (default: "0 *\/3 * * *" — every 3h)
 *   automation.activeHours   (default: 8–20 America/Costa_Rica)
 *
 * Each cycle:
 *   1. Poll X for mentions and relevant following posts
 *   2. Run 3-agent chain (research → content → validation)
 *   3. Post approved content or reply
 *   4. Log results to logs/YYYY-MM-DD/
 *
 * Usage:
 *   node cron.js --project=humano [--dry-run] [--once]
 *   node cron.js --project=humano --once --dry-run   # Single test run
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgentChain } from './lib/agent-chain.js';
import { getFollowingPosts, getMentions } from './lib/x-client.js';
import { loadProject } from './load-project.js';
import { postContent } from './post.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── Lazy-load node-cron (optional dep) ─────────────────────────────────── */
async function getCron() {
  try {
    const { default: cron } = await import('node-cron');
    return cron;
  } catch {
    throw new Error('node-cron not installed. Run: bun add node-cron');
  }
}

/* ── Logging ─────────────────────────────────────────────────────────────── */
const LOGS_DIR = path.join(
  process.env.HOME,
  '.openclaw/workspace/logs'
);

function getLogFile(project) {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(LOGS_DIR, date);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${project}-automation.jsonl`);
}

function logEvent(project, event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
  fs.appendFileSync(getLogFile(project), line);
  console.log(`[cron:${project}]`, event.type, event.message ?? '');
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function isActiveHour(config) {
  const tz = config.automation?.timezone ?? 'America/Costa_Rica';
  const now = new Date();
  const hour = parseInt(
    now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
    10
  );
  const { start = 8, end = 20 } = config.automation?.activeHours ?? {};
  return hour >= start && hour < end;
}

function loadFollowingList(config) {
  const listFile = path.join(__dirname, config.automation?.followingListFile ?? 'config/humano-following.txt');
  if (!fs.existsSync(listFile)) return [];
  return fs
    .readFileSync(listFile, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function loadTemplate(config) {
  const tplFile = path.join(__dirname, config.automation?.templateFile ?? 'config/humano-template.json');
  if (!fs.existsSync(tplFile)) return null;
  return JSON.parse(fs.readFileSync(tplFile, 'utf8'));
}

/* ── Core cycle ──────────────────────────────────────────────────────────── */
async function runCycle(config, dryRun = false) {
  const projectName = config.name || 'humano';
  const handle = config.twitter?.handle?.replace('@', '') ?? 'humano';
  const followingList = loadFollowingList(config);
  const approvedTemplate = loadTemplate(config);
  const followingStr = followingList.join(', ');

  logEvent(projectName, { type: 'cycle_start', dryRun, following: followingList.length });

  // 1. Poll for activity
  const [mentions, followingPosts] = await Promise.allSettled([
    getMentions(handle, 3),
    getFollowingPosts(followingList, 3),
  ]).then((results) =>
    results.map((r) => (r.status === 'fulfilled' ? r.value : []))
  );

  const hasActivity = mentions.length > 0 || followingPosts.length > 0;
  logEvent(projectName, {
    type: 'poll_complete',
    mentions: mentions.length,
    followingPosts: followingPosts.length,
  });

  // Build context string for Agent 1
  const activityContext = hasActivity
    ? [
        mentions.length > 0
          ? `Recent mentions:\n${mentions.slice(0, 3).map((t) => `- "${t.text}"`).join('\n')}`
          : '',
        followingPosts.length > 0
          ? `Recent following posts:\n${followingPosts.slice(0, 3).map((t) => `- "${t.text}"`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';

  // 2. Run agent chain
  const mode = 'automated';
  const chainResult = await runAgentChain({
    mode,
    topic: activityContext || config.twitter?.topics?.[0] ?? 'AI governance',
    followingList: followingStr,
    approvedTemplate,
    verbose: false,
  });

  if (!chainResult.firstPassedOption) {
    logEvent(projectName, { type: 'no_approved_content', reason: chainResult.agent3?.regenerateReason });
    return;
  }

  const option = chainResult.firstPassedOption;

  // 3. Post
  if (hasActivity && mentions[0]) {
    // Reply to first mention
    const targetId = mentions[0].id;
    const replyText = option.reply?.text ?? option.mainPost?.text ?? '';
    if (replyText) {
      const result = await postContent({ text: replyText, replyTo: targetId, dryRun });
      logEvent(projectName, { type: 'reply_posted', targetId, url: result.url, dryRun });
    }
  } else {
    // Standalone post
    const postText = option.mainPost?.text;
    if (postText) {
      const result = await postContent({ text: postText, dryRun });
      logEvent(projectName, { type: 'tweet_posted', url: result.url, dryRun });
    }
  }

  logEvent(projectName, { type: 'cycle_complete' });
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const get = (flag) => {
  const a = args.find((x) => x.startsWith(`--${flag}=`));
  return a ? a.split('=').slice(1).join('=') : null;
};
const has = (flag) => args.includes(`--${flag}`);

const projectName = get('project') || 'humano';
const dryRun = has('dry-run');
const runOnce = has('once');

let config;
try {
  config = loadProject(projectName);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

if (runOnce) {
  // Single run (useful for testing)
  console.log(`▶️  Running single cycle for ${projectName} (dry-run: ${dryRun})`);
  runCycle(config, dryRun).catch((err) => {
    console.error(`❌ Cycle failed: ${err.message}`);
    process.exit(1);
  });
} else {
  // Scheduled cron
  const schedule = config.automation?.cronSchedule ?? '0 */3 * * *';
  const timezone = config.automation?.timezone ?? 'America/Costa_Rica';

  getCron().then((cron) => {
    console.log(`🕐 Cron scheduled: "${schedule}" (${timezone})`);
    console.log(`   Active hours: ${config.automation?.activeHours?.start ?? 8}h–${config.automation?.activeHours?.end ?? 20}h`);
    console.log(`   Dry-run: ${dryRun}`);

    cron.schedule(
      schedule,
      async () => {
        if (!isActiveHour(config)) {
          console.log('[cron] Outside active hours — skipping');
          return;
        }
        try {
          await runCycle(config, dryRun);
        } catch (err) {
          console.error('[cron] Cycle error:', err.message);
        }
      },
      { timezone }
    );
  });
}
