/**
 * post.js — Full automation driver for @humano (analogous to twitter-automation.js)
 *
 * This is what cron.js calls. It runs the complete pipeline:
 *   agent-prompts.js → agent-chain.js (Grok API) → x-client.js (X API)
 *
 * Two modes:
 *   1. Single-call  — one Grok call using config.grok.systemPrompt + a trends file
 *   2. Agent chain  — full 3-agent pipeline (Research → Content → Validation)
 *                     using the pre-approved template from config/humano-template.json
 *
 * Fase 1 (human, Grok Chat) produces content → human approves → saves template.
 * Fase 2 (cron) calls this script automatically using the saved template.
 * Fase 3 (on-demand) human triggers this directly via CLI with a topic.
 *
 * Usage:
 *   # Full agent chain — generate and save (Fase 2 / Fase 3)
 *   node post.js --project=humano --topic="AI governance legitimacy" --agent-chain
 *
 *   # Generate and immediately post
 *   node post.js --project=humano --topic="legitimacy" --agent-chain --post [--dry-run]
 *
 *   # On-demand with explicit mode
 *   node post.js --project=humano --topic="coordination failure" --agent-chain --mode=on-demand --post
 *
 *   # Single-call path (requires trends file from trend-discovery.js)
 *   node post.js --project=humano --trends=/tmp/trends.json [--mock] [--post]
 *
 * Output: JSON written to --output file (default /tmp/humano-content.json)
 * Credentials: loaded from .env in this folder
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseJSON, runAgentChain } from './lib/agent-chain.js';
import { reply, tweet } from './lib/x-client.js';
import { loadProject } from './load-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GROK_ENDPOINT = process.env.GROK_ENDPOINT || 'https://api.x.ai/v1';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-3';

// ── Direct posting helper (used by --post flag and cron.js) ───────────────

/**
 * Posts content directly to X.
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.mediaPath]
 * @param {string} [opts.replyTo]  — Tweet ID to reply to
 * @param {boolean} [opts.dryRun]
 */
async function postContent({ text, mediaPath = null, replyTo = null, dryRun = false }) {
  if (replyTo) {
    return await reply(text, replyTo, dryRun, mediaPath);
  }
  return await tweet(text, dryRun, mediaPath);
}

// ── Single-call path (uses config.grok.systemPrompt) ──────────────────────

/**
 * Builds user prompt from trends for single-call mode.
 */
function buildTrendsUserPrompt(config, trends) {
  const top = trends.slice(0, 5);
  return (
    `Generate Twitter content for ${config.twitter.handle} based on these trending topics:\n\n` +
    top
      .map(
        (t, i) =>
          `Trend #${i + 1}: ${t.topic}\n` +
          `- Tweet count: ${t.tweet_count?.toLocaleString?.() ?? 'N/A'}\n` +
          `- Sample: "${t.sample_tweets?.[0] ?? '(none)'}"\n`
      )
      .join('\n') +
    `\nReturn JSON with: { "posts": [{"content":"...","hashtags":["#..."]}], "replies": [...], "quotes": [...] }`
  );
}

async function generateSingleCall(config, trends, mock = false) {
  if (mock || !process.env.XAI_API_KEY) {
    console.log('⚠️  Mock mode — returning sample content');
    return generateMockContent(config, trends);
  }

  const systemPrompt = config.grok?.systemPrompt || 'You are a Twitter content writer.';
  const userPrompt = buildTrendsUserPrompt(config, trends);

  const response = await fetch(`${GROK_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.grok?.temperature ?? 0.5,
      max_tokens: config.grok?.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Grok API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return parseJSON(data.choices[0].message.content);
}

function generateMockContent(config, trends = []) {
  const hashtags = config.twitter?.hashtags?.slice(0, 2) ?? ['#AIGovernance'];
  const sig = config.twitter?.signature ?? 'more at @aialygn';
  const topic = trends[0]?.topic ?? 'AI governance';

  return {
    posts: [
      {
        content: `The hardest AI risks aren't technical—they're institutional. ${topic} reveals coordination failure as the real bottleneck. Legitimacy is the infrastructure nobody is building. ${hashtags.join(' ')}\n\n${sig}`,
        hashtags,
      },
    ],
    replies: [
      {
        content: `Exactly. Governance legitimacy must be built before the crisis, not improvised during one. ${hashtags[0]}\n\n${sig}`,
        targetUrl: trends[0]?.url ?? 'https://x.com/example/status/1',
      },
    ],
    quotes: [],
    metadata: { generated_at: new Date().toISOString(), mock: true, project: config.name },
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const arg = args.find((a) => a.startsWith(`--${flag}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
  };
  const has = (flag) => args.includes(`--${flag}`);

  const projectName = get('project') || 'humano';
  const trendsFile = get('trends');
  const topic = get('topic');
  const outputFile = get('output') || '/tmp/humano-content.json';
  const mock = has('mock');
  const agentChain = has('agent-chain');
  const shouldPost = has('post');
  const dryRun = has('dry-run');
  const mode = get('mode') || 'automated';
  const verbose = has('verbose');

  if (!trendsFile && !topic && !agentChain) {
    console.error(
      'Usage:\n' +
        '  node post.js --project=humano --topic="..." --agent-chain [--mode=on-demand] [--post] [--dry-run]\n' +
        '  node post.js --project=humano --trends=/tmp/trends.json [--mock] [--post]\n' +
        '\nFor on-demand single posts without generation, use x-client.js directly.'
    );
    process.exit(1);
  }

  let config;
  try {
    config = loadProject(projectName);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  // Load approved template if it exists
  let approvedTemplate = null;
  const templatePath = path.join(__dirname, config.automation?.templateFile ?? 'config/humano-template.json');
  if (fs.existsSync(templatePath)) {
    approvedTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    console.log(`📋 Loaded approved template from ${templatePath}`);
  }

  let runPromise;

  if (agentChain) {
    // Full 3-agent pipeline
    runPromise = runAgentChain({ mode, topic, humanRequest: topic, approvedTemplate, verbose }).then(
      (result) => {
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log(`\n💾 Saved to ${outputFile}`);
        console.log(`   Approved options: ${result.approved.length}`);
        if (result.agent3?.handoffDecision === 'regenerate') {
          console.warn(`   ⚠️  Agent 3 requests regeneration: ${result.agent3.regenerateReason}`);
        }
        if (result.firstPassedOption) {
          console.log('\n📝 First approved post:');
          console.log(`   "${result.firstPassedOption.mainPost?.text?.substring(0, 100)}..."`);
          console.log(`   CLI: ${result.firstPassedOption.cliCommand}`);
        }
        return result;
      }
    );
  } else {
    // Single-call path
    if (!trendsFile) {
      console.error('--trends=FILE is required for single-call mode. Use --agent-chain with --topic instead.');
      process.exit(1);
    }
    const trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'));
    const trendsList = Array.isArray(trends) ? trends : trends.trends ?? [];

    runPromise = generateSingleCall(config, trendsList, mock).then((workflow) => {
      fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
      console.log(`\n💾 Saved to ${outputFile}`);
      console.log(
        `   Posts: ${workflow.posts?.length ?? 0} | Replies: ${workflow.replies?.length ?? 0}`
      );
      if (workflow.posts?.[0]) {
        console.log(`\n   First post: "${workflow.posts[0].content.substring(0, 100)}..."`);
      }
      return workflow;
    });
  }

  runPromise
    .then(async (result) => {
      if (shouldPost) {
        const option = result.firstPassedOption;
        const textToPost = option?.mainPost?.text ?? result.posts?.[0]?.content;
        const mediaToPost = option?.mainPost?.mediaPath ?? result.posts?.[0]?.mediaPath ?? null;
        if (textToPost) {
          console.log('\n📤 Posting...');
          const posted = await postContent({ text: textToPost, mediaPath: mediaToPost, dryRun });
          console.log(`   URL: ${posted.url ?? '(dry-run)'}`);
        } else {
          console.warn('⚠️  No approved content to post.');
        }
      }
    })
    .catch((err) => {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}

export { generateMockContent, generateSingleCall, postContent };

