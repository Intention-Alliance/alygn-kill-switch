#!/usr/bin/env node
/**
 * ALYGN Daily Signal Brief — Data Collection Module
 *
 * Collects data from: GitHub (andler-ops + Intention-Alliance), Notion (Grant + VC DataSources),
 * Supabase, Twitter/X, Gmail (alyyygn + outreach), and local work tracking (memory/brain)
 * Outputs JSON to stdout for piping into synthesize-report.js
 *
 * Usage: node collect-data.js [--date YYYY-MM-DD]
 */

const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────
const GITHUB_REPOS = ['AndlerRL/andler-ops', 'Intention-Alliance/align-core-infra'];
const NOTION_KEY = process.env.NOTION_KEY;
if (!NOTION_KEY) {
  console.error('❌ FATAL: NOTION_KEY environment variable not set');
  process.exit(1);
}
const NOTION_GRANT_DATA_SOURCE = process.env.NOTION_GRANT_DATA_SOURCE || '32c33487-4af6-8130-b265-de7464a51a72';
const NOTION_VC_DATA_SOURCE = process.env.NOTION_VC_DATA_SOURCE || '32c334874af68130b265de7464a51a72';
const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('❌ FATAL: SUPABASE_URL environment variable not set');
  process.exit(1);
}
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const KILL_SWITCH_URL = process.env.KILL_SWITCH_URL || '';
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || ''; // alyyygn@gmail.com (3 y's)
const OUTREACH_EMAIL_APP_PASSWORD = process.env.OUTREACH_EMAIL_APP_PASSWORD || ''; // outreach@alyygn.com (2 y's)
const GMAIL_ACCOUNT = 'alyyygn@gmail.com';
const OUTREACH_EMAIL_ACCOUNT = 'outreach@alyygn.com';

const ONE_DAY_AGO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function postJSON(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const payload = JSON.stringify(body);
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    };
    const req = mod.request(url, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim(); }
  catch (e) { return null; }
}

function safeAwait(promise, fallback = null) {
  return promise.catch((e) => { console.error(`⚠️  ${e.message}`); return fallback; });
}

// ─── GitHub ─────────────────────────────────────────────────────────────────
async function collectGitHub(since) {
  const result = { commits: 0, prsMerged: 0, issuesClosed: 0, repos: [], details: [], alygnIssues: [] };

  for (const repo of GITHUB_REPOS) {
    // Commits
    const commits = run(`gh api "repos/${repo}/commits?since=${since}&per_page=50" --jq '.[].sha' 2>/dev/null`);
    if (commits) {
      const commitList = commits.split('\n').filter(Boolean);
      result.commits += commitList.length;
    }

    // PRs merged
    const prs = run(`gh api "repos/${repo}/pulls?state=closed&per_page=20" --jq '.[] | select(.merged_at != null and .merged_at >= "${since}") | .title' 2>/dev/null`);
    if (prs) {
      const prList = prs.split('\n').filter(Boolean);
      result.prsMerged += prList.length;
      result.details.push(...prList.map(t => `[${repo.split('/')[1]}] PR merged: ${t}`));
    }

    // Issues closed (filter for alygn project tags)
    const issues = run(`gh api "repos/${repo}/issues?state=closed&since=${since}&per_page=20" --jq '.[] | select(.pull_request == null) | {title, labels: [.labels[].name]}' 2>/dev/null`);
    if (issues) {
      try {
        const issueList = JSON.parse(`[${issues.replace(/\n/g, ',')}]`);
        const alygnIssues = issueList.filter(i => 
          i.labels.some(l => l.toLowerCase().includes('alygn') || l.toLowerCase().includes('project'))
        );
        result.issuesClosed += alygnIssues.length;
        result.alygnIssues.push(...alygnIssues.map(i => ({
          repo: repo.split('/')[1],
          title: i.title,
          labels: i.labels
        })));
        result.details.push(...alygnIssues.map(i => `[${repo.split('/')[1]}] Issue closed: ${i.title}`));
      } catch (e) {
        console.error(`⚠️  GitHub issues parse: ${e.message}`);
      }
    }

    result.repos.push(repo.split('/')[1]);
  }

  return result;
}

// ─── Notion Grant Tracker (dataSource API) ─────────────────────────────────
async function collectNotionGrants() {
  const result = { grants: [], urgentDeadlines: [], dataSourceId: NOTION_GRANT_DATA_SOURCE };

  try {
    // Notion uses dataSource for tables (not database query)
    const data = await postJSON(
      'https://api.notion.com/v1/databases/' + NOTION_GRANT_DATA_SOURCE + '/query',
      { page_size: 100 },
      {
        'Authorization': `Bearer ${NOTION_KEY}`,
        'Notion-Version': '2022-06-28',
      }
    );

    if (!data.results) return result;

    const now = new Date();
    for (const page of data.results) {
      const props = page.properties || {};
      const name = props.Name?.title?.[0]?.plain_text
        || props['Grant Name']?.title?.[0]?.plain_text
        || props['Name']?.title?.[0]?.plain_text
        || 'Unknown';
      const status = props.Status?.status?.name
        || props.Status?.select?.name
        || props['Status']?.rich_text?.[0]?.plain_text
        || 'Unknown';
      const deadline = props.Deadline?.date?.start
        || props['Due Date']?.date?.start
        || null;

      const grant = { name, status, deadline };
      result.grants.push(grant);

      // Flag urgent deadlines (< 30 days)
      if (deadline) {
        const daysLeft = Math.ceil((new Date(deadline) - now) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0 && daysLeft < 30) {
          result.urgentDeadlines.push({
            name,
            deadlineDays: daysLeft,
            priority: daysLeft < 14 ? 'P1' : 'P2',
          });
        }
      }
    }
  } catch (e) {
    console.error(`⚠️  Notion Grant DataSource: ${e.message}`);
  }

  return result;
}

// ─── Notion VC Tracker (dataSource API) ─────────────────────────────────────
async function collectNotionVC() {
  const result = { sent: 0, replies: 0, meetings: 0, details: [] };

  try {
    const data = await postJSON(
      'https://api.notion.com/v1/databases/' + NOTION_VC_DATA_SOURCE + '/query',
      { page_size: 100 },
      {
        'Authorization': `Bearer ${NOTION_KEY}`,
        'Notion-Version': '2022-06-28',
      }
    );

    if (!data.results) return result;

    for (const page of data.results) {
      const props = page.properties || {};
      const status = props.Status?.status?.name
        || props.Status?.select?.name
        || 'Unknown';
      const name = props.Name?.title?.[0]?.plain_text || 'Unknown';

      if (status === 'Sent' || status === 'Contacted') {
        result.sent++;
      }
      if (status === 'Replied' || props['Last Contact']?.rich_text?.[0]?.plain_text?.includes('reply')) {
        result.replies++;
      }
      if (status === 'Meeting Scheduled' || props['Meeting']?.checkbox) {
        result.meetings++;
      }

      result.details.push(`${name}: ${status}`);
    }
  } catch (e) {
    console.error(`⚠️  Notion VC DataSource: ${e.message}`);
  }

  return result;
}

// ─── Supabase Municipal Pipeline ────────────────────────────────────────────
async function collectSupabase() {
  const result = { warmups: 0, approved: 0, sent: 0, responded: 0, details: [] };

  if (!SUPABASE_KEY) {
    console.error('⚠️  SUPABASE_KEY not set, skipping municipal data');
    return result;
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  try {
    // Query municipalities table (actual Supabase table name)
    const data = await fetchJSON(
      `${SUPABASE_URL}/rest/v1/municipalities?select=name,outreach_sent_at,replied_at,x_warmup_phase1_at,x_warmup_phase2_at,wave_number,priority_score&order=priority_score.desc&limit=100`,
      headers
    );

    if (Array.isArray(data)) {
      for (const row of data) {
        // Classify by pipeline state
        if (row.replied_at) {
          result.responded++;
        } else if (row.outreach_sent_at) {
          result.sent++;
        } else if (row.x_warmup_phase1_at || row.x_warmup_phase2_at) {
          result.warmups++;
        }
        // 'approved' = warmups ready to send (have warmup activity but no outreach_sent_at)
        if ((row.x_warmup_phase1_at || row.x_warmup_phase2_at) && !row.outreach_sent_at) {
          result.approved++;
        }
      }
      result.details = data.slice(0, 5).map(r => {
        const state = r.replied_at ? 'replied' : r.outreach_sent_at ? 'sent' : r.x_warmup_phase1_at ? 'warmup' : 'pending';
        return `${r.name}: ${state}`;
      });
    }
  } catch (e) {
    console.error(`⚠️  Supabase: ${e.message}`);
  }

  return result;
}

// ─── Twitter/X ─────────────────────────────────────────────────────────────
async function collectTwitter() {
  const result = { followers: 0, impressions: 0, topPost: 'N/A', followerDelta: 0 };

  if (!TWITTER_BEARER_TOKEN) {
    console.error('⚠️  TWITTER_BEARER_TOKEN not set, skipping Twitter data');
    return result;
  }

  try {
    // Get user metrics
    const userData = await fetchJSON(
      'https://api.twitter.com/2/users/by/username/alygn_org?user.fields=public_metrics',
      { 'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}` }
    );
    if (userData?.data?.public_metrics) {
      result.followers = userData.data.public_metrics.followers_count || 0;
    }
  } catch (e) {
    console.error(`⚠️  Twitter user: ${e.message}`);
  }

  // Note: Impressions and top posts require elevated API access
  // These will be populated when X API v2 analytics are available
  return result;
}

// ─── Kill Switch Health ─────────────────────────────────────────────────────
async function collectKillSwitch() {
  const result = { status: 'unknown', uptime: 'N/A', healthChecks: 0 };

  if (!KILL_SWITCH_URL) {
    console.error('⚠️  KILL_SWITCH_URL not set, skipping health check');
    return result;
  }

  try {
    const data = await fetchJSON(KILL_SWITCH_URL, { 'Accept': 'application/json' });
    result.status = data?.status || data?.healthy ? 'healthy' : 'degraded';
    result.uptime = data?.uptime || 'N/A';
    result.healthChecks = data?.checks?.length || 0;
  } catch (e) {
    console.error(`⚠️  Kill Switch: ${e.message}`);
    result.status = 'unreachable';
  }

  return result;
}

// ─── Gmail Email Tracking (IMAP) ────────────────────────────────────────────
async function collectEmails() {
  const result = {
    gmail: { sent: 0, received: 0, grantRelated: 0, details: [] },
    outreach: { sent: 0, received: 0, grantRelated: 0, details: [] }
  };

  // Note: IMAP requires node-imap or similar library
  // For now, we'll use a placeholder that can be enhanced later
  // In production, use: npm install imap

  if (!GMAIL_APP_PASSWORD) {
    console.error('⚠️  GMAIL_APP_PASSWORD not set, skipping Gmail tracking');
    return result;
  }

  // Placeholder for IMAP implementation
  // TODO: Implement proper IMAP connection for both accounts
  result.gmail.details.push('Email tracking requires IMAP implementation');
  result.outreach.details.push('Email tracking requires IMAP implementation');

  return result;
}

// ─── Local Work Tracking (Memory/Brain) ─────────────────────────────────────
async function collectLocalWork() {
  const result = { features: [], progress: [], continuation: [] };

  // Read from memory files to get recent local work
  try {
    const memoryDir = path.join(__dirname, '..', '..', '..', 'memory');
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Check today's and yesterday's memory files
    for (const dateFile of [`${today}.md`, `${yesterday}.md`]) {
      const memoryPath = path.join(memoryDir, dateFile);
      if (fs.existsSync(memoryPath)) {
        const content = fs.readFileSync(memoryPath, 'utf8');
        // Extract Alygn-related work items
        const alygnLines = content.split('\n').filter(line =>
          line.toLowerCase().includes('alygn') &&
          (line.includes('✅') || line.includes('shipped') || line.includes('complete') || line.includes('working on'))
        );
        result.features.push(...alygnLines.slice(0, 10));
      }
    }

    // Also check HEARTBEAT.md for active work streams
    const heartbeatPath = path.join(__dirname, '..', '..', '..', 'HEARTBEAT.md');
    if (fs.existsSync(heartbeatPath)) {
      const heartbeat = fs.readFileSync(heartbeatPath, 'utf8');
      const activeStreams = heartbeat.split('\n').filter(line =>
        line.includes('Stream') && line.includes('Alygn')
      );
      result.progress.push(...activeStreams.slice(0, 5));
    }
  } catch (e) {
    console.error(`⚠️  Local work tracking: ${e.message}`);
  }

  return result;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const dateArg = process.argv.find(a => a.startsWith('--date'));
  const date = dateArg ? dateArg.split('=')[1] || process.argv[process.argv.indexOf(dateArg) + 1] : new Date().toISOString().split('T')[0];
  const since = ONE_DAY_AGO();

  console.error(`📊 Collecting data for ${date} (since ${since})...`);

  const [github, notionGrants, notionVC, supabase, twitter, killSwitch, emails, localWork] = await Promise.all([
    safeAwait(collectGitHub(since), { commits: 0, prsMerged: 0, issuesClosed: 0, repos: [], details: [], alygnIssues: [] }),
    safeAwait(collectNotionGrants(), { grants: [], urgentDeadlines: [], dataSourceId: NOTION_GRANT_DATA_SOURCE }),
    safeAwait(collectNotionVC(), { sent: 0, replies: 0, meetings: 0, details: [] }),
    safeAwait(collectSupabase(), { warmups: 0, approved: 0, sent: 0, responded: 0, details: [] }),
    safeAwait(collectTwitter(), { followers: 0, impressions: 0, topPost: 'N/A', followerDelta: 0 }),
    safeAwait(collectKillSwitch(), { status: 'unknown', uptime: 'N/A', healthChecks: 0 }),
    safeAwait(collectEmails(), { gmail: { sent: 0, received: 0, grantRelated: 0, details: [] }, outreach: { sent: 0, received: 0, grantRelated: 0, details: [] } }),
    safeAwait(collectLocalWork(), { features: [], progress: [], continuation: [] }),
  ]);

  const output = {
    date,
    collectedAt: new Date().toISOString(),
    operations: {
      killSwitch: killSwitch,
      grants: notionGrants,
      vc: notionVC,
      github: github,
      localWork: localWork,
    },
    outreach: {
      vc: {
        sent: notionVC.sent,
        replies: notionVC.replies,
        meetings: notionVC.meetings,
        details: notionVC.details,
      },
      municipal: supabase,
      twitter: twitter,
      emails: emails,
    },
  };

  // Output JSON to stdout
  process.stdout.write(JSON.stringify(output, null, 2));
  console.error('\n✅ Data collection complete');
}

main().catch((e) => {
  console.error(`❌ Fatal error: ${e.message}`);
  process.exit(1);
});
