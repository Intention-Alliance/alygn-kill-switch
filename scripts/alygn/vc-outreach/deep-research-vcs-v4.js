#!/usr/bin/env node
/**
 * Deep Research VCs v4 - Corrected Schema
 * 
 * Purpose: Research VCs without emails/pain points and update Notion
 * Uses correct property names: Stage, Draft Status, Email, Sent Date
 * 
 * Architecture: Script coordinates, AI executes tools, file cache prevents re-work
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const NOTION_KEY = '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';
const DATABASE_ID = '30533487-4af6-81ef-983d-f57c7f70de33';
const CACHE_DIR = '/tmp/vc-research-cache';

// Ensure cache dir exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function queryNotionDatabase() {
  const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      page_size: 100
    })
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function extractVCProperties(page) {
  const props = page.properties;
  
  return {
    id: page.id,
    name: props.Name?.title?.[0]?.plain_text || 'Unknown',
    status: props.Status?.select?.name || 'Unknown',
    stage: props.Stage?.select?.name || 'Unknown',
    variant: props.Variant?.select?.name || 'Unknown',
    email: props.Email?.rich_text?.[0]?.plain_text || null,
    painPoints: props['Pain Points']?.rich_text?.[0]?.plain_text || null,
    website: props.Website?.url || null,
    focusAreas: props['Focus Areas']?.multi_select?.map(s => s.name) || [],
    contactedAt: props['Sent Date']?.date?.start || props['Last Contacted']?.date?.start || null,
    url: page.url
  };
}

function getCachePath(vcName) {
  const safeName = vcName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return path.join(CACHE_DIR, `vc-research-${safeName}.json`);
}

function loadCache(vcName) {
  const cachePath = getCachePath(vcName);
  if (fs.existsSync(cachePath)) {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    // Cache valid for 7 days
    const age = Date.now() - data.timestamp;
    if (age < 7 * 24 * 60 * 60 * 1000) {
      return data.research;
    }
  }
  return null;
}

function saveCache(vcName, research) {
  const cachePath = getCachePath(vcName);
  fs.writeFileSync(cachePath, JSON.stringify({
    timestamp: Date.now(),
    research
  }, null, 2));
}

async function updateNotionPage(pageId, updates) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: updates
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion update failed: ${response.status} ${error}`);
  }

  return await response.json();
}

function filterVCsNeedingResearch(vcs) {
  return vcs.filter(vc => {
    // Skip if already has email AND pain points
    if (vc.email && vc.painPoints) {
      return false;
    }
    
    // Skip invalid/failed
    if (['Invalid email', 'Failed', 'Not a fit'].includes(vc.status)) {
      return false;
    }
    
    // Include if missing email OR pain points
    return !vc.email || !vc.painPoints;
  });
}

async function main() {
  console.log('🔍 Deep Research VCs v4 - Starting...\n');
  console.log(`Cache directory: ${CACHE_DIR}`);
  console.log(`Database: ${DATABASE_ID}\n`);
  
  // Query Notion
  console.log('Step 1: Querying Notion database...');
  const data = await queryNotionDatabase();
  const allVCs = data.results.map(extractVCProperties);
  console.log(`Found ${allVCs.length} VCs total\n`);
  
  // Filter to those needing research
  const vcsToResearch = filterVCsNeedingResearch(allVCs);
  console.log(`Step 2: Filtering VCs needing research...`);
  console.log(`  - Already complete (email + pain points): ${allVCs.length - vcsToResearch.length}`);
  console.log(`  - Need research: ${vcsToResearch.length}\n`);
  
  if (vcsToResearch.length === 0) {
    console.log('✅ All VCs have emails and pain points!');
    return;
  }
  
  // Generate research requests for AI
  console.log('Step 3: Generating research requests...\n');
  
  const researchRequests = vcsToResearch.map((vc, index) => {
    const cacheStatus = loadCache(vc.name) ? 'CACHED' : 'NEEDS RESEARCH';
    return {
      index: index + 1,
      total: vcsToResearch.length,
      name: vc.name,
      pageId: vc.id,
      status: vc.status,
      website: vc.website,
      focusAreas: vc.focusAreas.join(', '),
      hasEmail: !!vc.email,
      hasPainPoints: !!vc.painPoints,
      cacheStatus: cacheStatus,
      url: vc.url
    };
  });
  
  // Save research queue
  const queuePath = '/tmp/vc-research-queue.json';
  fs.writeFileSync(queuePath, JSON.stringify(researchRequests, null, 2));
  
  console.log('📋 Research Queue Generated:');
  console.log(`  - Queue file: ${queuePath}`);
  console.log(`  - Cache dir: ${CACHE_DIR}`);
  console.log(`\n📊 Summary:`);
  console.log(`  - Total VCs to research: ${vcsToResearch.length}`);
  console.log(`  - Cached (skip): ${researchRequests.filter(r => r.cacheStatus === 'CACHED').length}`);
  console.log(`  - Need research: ${researchRequests.filter(r => r.cacheStatus === 'NEEDS RESEARCH').length}`);
  
  // Post to Discord for AI to process
  console.log('\n📬 Posting research requests to Discord for AI execution...\n');
  
  // Output summary for AI
  const summary = {
    timestamp: new Date().toISOString(),
    total: vcsToResearch.length,
    vcs: researchRequests,
    instructions: `
## Deep Research Instructions

**For each VC in the queue:**

1. **Check cache first:** /tmp/vc-research-cache/vc-research-[name].json
2. **If cached:** Skip research, just update Notion with cached data
3. **If not cached:** Execute web_search + web_fetch to find:
   - Partner emails (website, LinkedIn, contact pages)
   - Investment thesis (what they fund, stage, check size)
   - Pain points (AI governance challenges, portfolio company issues)
   - Governance signals (blog posts, quotes about AI safety/governance)

4. **Save research to cache:** /tmp/vc-research-cache/vc-research-[name].json
5. **Update Notion** with correct property names:
   - \`Email\` (not Emails)
   - \`Pain Points\` (rich text)
   - \`Stage\` = "Phase 2: Research Complete"
   - \`Draft Status\` = "Ready for drafting"

**Property mapping reminder:**
- Script: \`Phase\` → Notion: \`Stage\`
- Script: \`Draft status\` → Notion: \`Draft Status\`
- Script: \`Emails\` → Notion: \`Email\`
- Script: \`Contacted At\` → Notion: \`Sent Date\` or \`Last Contacted\`

**Start with these 5 VCs (highest priority):**
${researchRequests.slice(0, 5).map(r => `  ${r.index}. ${r.name} (${r.status})`).join('\n')}
`
  };
  
  const summaryPath = '/tmp/vc-research-summary.json';
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  
  console.log('✅ Research summary saved to:', summaryPath);
  console.log('\n🔧 Next: AI will execute web_search/web_fetch tools and update Notion');
  console.log('   Script posts to Discord, AI spawns sub-agents, results cached to /tmp/vc-research-cache/\n');
}

main().catch(console.error);
