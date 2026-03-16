/**
 * Trend Discovery — Finds governance-relevant trends and conversations on X
 *
 * Searches for topics relevant to @humano's mandate:
 * AI governance, municipal AI, coordination, legitimacy, accountability
 *
 * Usage:
 *   node trend-discovery.js --project=humano
 *   node trend-discovery.js --project=humano --query="AI governance Costa Rica"
 *   node trend-discovery.js --project=humano --output=/tmp/trends.json
 *
 * Output format compatible with content-generator.js --trends=FILE
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClient } from './lib/x-client.js';
import { loadProject } from './load-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_QUERIES = [
  'AI governance legitimacy',
  'municipal artificial intelligence',
  'coordinación institucional IA',
  'algorithmic accountability',
  'gobernanza inteligencia artificial',
  'smart city accountability',
  'AI regulation municipalities',
];

/**
 * Search X for a single query. Returns tweet objects from xdk.
 */
async function searchQuery(client, query, limit = 10) {
  try {
    const result = await client.search.searchTweets({
      query: `${query} -is:retweet lang:es OR lang:en`,
      max_results: Math.min(limit, 20),
    });
    return (result.data ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      author_id: t.author_id,
      topic: query,
    }));
  } catch (err) {
    console.warn(`[trend-discovery] Search failed for "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Run discovery across all governance queries.
 * @param {object} config — Loaded project config
 * @param {object} opts
 * @param {string[]} [opts.queries]  — Override default queries
 * @param {number}  [opts.limit]     — Results per query
 * @param {boolean} [opts.mock]      — Skip API, return stub data
 */
async function discoverTrends(config, opts = {}) {
  const { queries = DEFAULT_QUERIES, limit = 10, mock = false } = opts;

  if (mock || !process.env.XAI_API_KEY) {
    console.log('⚠️  Mock mode — returning sample trends');
    return mockTrends(config);
  }

  const client = getClient();
  const allTweets = [];

  console.log(`🔍 Searching ${queries.length} governance queries...`);
  for (const query of queries) {
    const results = await searchQuery(client, query, limit);
    allTweets.push(...results);
    console.log(`   "${query}" → ${results.length} results`);
    // Brief pause between searches
    await new Promise((r) => setTimeout(r, 500));
  }

  // Deduplicate by tweet ID
  const seen = new Set();
  const unique = allTweets.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const output = {
    discoveredAt: new Date().toISOString(),
    project: config.name || 'humano',
    totalResults: unique.length,
    trends: queries.map((q) => ({
      topic: q,
      tweet_count: allTweets.filter((t) => t.topic === q).length,
      sample_tweets: allTweets
        .filter((t) => t.topic === q)
        .slice(0, 2)
        .map((t) => t.text),
    })),
    raw: unique,
  };

  return output;
}

function mockTrends(config) {
  return {
    discoveredAt: new Date().toISOString(),
    project: config.name || 'humano',
    totalResults: 4,
    trends: [
      {
        topic: 'AI governance legitimacy',
        tweet_count: 2,
        sample_tweets: [
          'Thread: why AI governance without institutional legitimacy will fail (1/7)',
          'The coordination failure at the heart of municipal AI adoption is a governance problem, not a tech problem.',
        ],
      },
      {
        topic: 'municipal artificial intelligence',
        tweet_count: 2,
        sample_tweets: [
          'Cities adopting AI tools without public consent processes are creating accountability gaps',
          'Excited to share: our city just published its first algorithmic impact assessment 🧵',
        ],
      },
    ],
    raw: [],
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const a = args.find((x) => x.startsWith(`--${flag}=`));
    return a ? a.split('=').slice(1).join('=') : null;
  };
  const has = (flag) => args.includes(`--${flag}`);

  const projectName = get('project') || 'humano';
  const queryOverride = get('query');
  const outputFile = get('output') || '/tmp/humano-trends.json';
  const mock = has('mock');
  const limit = parseInt(get('limit') || '10', 10);

  let config;
  try {
    config = loadProject(projectName);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const queries = queryOverride ? [queryOverride] : DEFAULT_QUERIES;

  discoverTrends(config, { queries, limit, mock })
    .then((output) => {
      fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
      console.log(`\n💾 Saved ${output.totalResults} results to ${outputFile}`);
      console.log(`   Top topics:`);
      output.trends.slice(0, 3).forEach((t) => console.log(`   • ${t.topic} (${t.tweet_count})`));
      console.log(`\nNext step:`);
      console.log(
        `  node content-generator.js --project=${projectName} --trends=${outputFile} [--mock]`
      );
    })
    .catch((err) => {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}

export { discoverTrends, searchQuery };
