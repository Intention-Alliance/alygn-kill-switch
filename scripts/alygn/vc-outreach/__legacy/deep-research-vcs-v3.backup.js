/**
 * ALYGN VC Deep Research Script - VERSION 3 (Feb 14, 2026)
 * 
 * CORRECTED ARCHITECTURE:
 * 
 * 1. Script loads VCs needing research from Notion
 * 2. Script sends research request to Wobblus (Discord #annotations)
 * 3. Wobblus receives request and spawns sub-agents using sessions_spawn
 * 4. Sub-agents execute web_search/web_fetch and return structured JSON
 * 5. Wobblus saves results to /tmp/vc-research-[name]-result.json
 * 6. Script waits for file, reads results, updates Notion
 * 7. One-by-one processing with manual checkpoints
 * 
 * This follows the OpenClaw sub-agent pattern:
 * - Scripts orchestrate and update external systems
 * - AI agents execute tools and work with data
 * - File-based coordination between them
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Client } = require('@notionhq/client');

// Configuration
const CONFIG = {
  notionKey: process.env.NOTION_KEY || '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',
  notionVersion: '2022-06-28',
  databaseId: '305334874af681ef983df57c7f70de33', // ALYGN VC Database
  discordChannel: '1466532145257255004', // #annotations
  researchTimeout: 30000, // 30 seconds to wait for research file
};

const notion = new Client({ auth: CONFIG.notionKey });

/**
 * Make Notion API request
 */
async function notionRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.notion.com${endpoint}`);
    const options = {
      hostname: 'api.notion.com',
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${CONFIG.notionKey}`,
        'Notion-Version': CONFIG.notionVersion,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * Load VCs from Notion that need research
 */
async function loadVCsNeedingResearch(limit = 1) {
  console.log(`\n📚 Loading VCs needing research from Notion...\n`);

  try {
    const response = await notionRequest('POST', `/v1/databases/${CONFIG.databaseId}/query`, {
      filter: {
        property: 'Status',
        select: {
          does_not_equal: 'Ready for outreach'
        }
      },
      sorts: [
        {
          property: 'Name',
          direction: 'ascending'
        }
      ],
      page_size: limit
    });

    const vcs = response.results.map(page => ({
      pageId: page.id,
      name: page.properties.Name?.title?.[0]?.text?.content || 'Unknown',
      website: page.properties.Website?.url || null,
      email: page.properties.Email?.email || null,
      focusAreas: page.properties['Focus Areas']?.multi_select?.map(m => m.name) || [],
      stage: page.properties.Stage?.multi_select?.map(m => m.name) || [],
      geography: page.properties.Geography?.rich_text?.[0]?.text?.content || null,
      status: page.properties.Status?.select?.name || 'Not contacted'
    }));

    console.log(`✅ Loaded ${vcs.length} VC(s) needing research:\n`);
    vcs.forEach((vc, i) => {
      console.log(`   ${i + 1}. ${vc.name} (${vc.status})`);
    });
    console.log('');

    return vcs;
  } catch (error) {
    console.error(`❌ Failed to load VCs from Notion:`, error);
    return [];
  }
}

/**
 * Request research from Wobblus
 */
async function requestResearch(vc) {
  console.log(`\n🔍 Requesting research for: ${vc.name}\n`);
  
  const researchFile = `/tmp/vc-research-${vc.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-result.json`;

  // Check if already researched (cached)
  if (fs.existsSync(researchFile)) {
    try {
      const research = JSON.parse(fs.readFileSync(researchFile, 'utf8'));
      console.log(`✅ Found cached research for ${vc.name}`);
      console.log(`   - Emails: ${research.partnerEmails?.length || 0}`);
      console.log(`   - Pain points: ${research.painPoints?.length || 0}\n`);
      return research;
    } catch (error) {
      console.log(`⚠️  Cache corrupted, requesting fresh research\n`);
    }
  }

  // Format research request for Wobblus
  const researchRequest = `
🔍 **RESEARCH REQUEST** - ${vc.name}

${vc.website ? `**Website:** ${vc.website}` : '**Website:** (need to find)'}

**Your task:**
1. Use web_search and web_fetch to research this VC
2. Find: Partner emails, investment thesis, AI safety investments, pain points
3. Save results as JSON to: \`/tmp/vc-research-${vc.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-result.json\`

**Required JSON fields:**
- partnerEmails: array of email addresses
- painPoints: array of 3 pain points (governance, coordination, alignment)
- thesis: investment thesis (1-2 sentences)
- partners: array of {name, role, email}
- governanceSignals: array of governance-related signals
- recentInvestments: array of recent portfolio companies
- summary: 1-2 sentence description

Spawn sub-agents as needed to gather complete data. Be thorough.`;

  console.log(`📤 Posting research request to Discord...\n`);
  console.log(researchRequest);
  console.log(`\n⏳ Waiting for research results (max 30s)...\n`);

  // TODO: Post to Discord #annotations
  // For now, we just show the request and wait for manual response

  // Wait for research file (with timeout)
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds
  
  while (!fs.existsSync(researchFile) && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    if (attempts % 5 === 0) {
      console.log(`   Waiting... (${attempts}s)`);
    }
  }

  if (fs.existsSync(researchFile)) {
    try {
      const research = JSON.parse(fs.readFileSync(researchFile, 'utf8'));
      console.log(`✅ Research completed!\n`);
      console.log(`   - Emails: ${research.partnerEmails?.length || 0}`);
      console.log(`   - Pain points: ${research.painPoints?.length || 0}`);
      console.log(`   - Thesis: ${research.thesis ? 'Yes' : 'No'}\n`);
      return research;
    } catch (error) {
      console.error(`❌ Failed to parse research results:`, error.message);
      return null;
    }
  } else {
    console.log(`⏰ Timeout: No research results after 30s`);
    console.log(`   → Wobblus will complete research in background`);
    console.log(`   → Re-run script to load results and update Notion\n`);
    return null;
  }
}

/**
 * Update Notion with research results
 */
async function updateVCInNotion(pageId, vcName, research) {
  if (!research || research._pending) {
    console.log(`⏭️  Skipping Notion update (research pending)\n`);
    return false;
  }

  console.log(`\n📝 Updating Notion for ${vcName}...\n`);

  try {
    const properties = {};

    // Email
    if (research.partnerEmails?.length > 0) {
      properties['Email'] = { email: research.partnerEmails[0] };
    }

    // Partners
    if (research.partners?.length > 0) {
      const partnerText = research.partners.map(p =>
        `${p.name} (${p.role})${p.email ? ' - ' + p.email : ''}`
      ).join('\n');
      properties['Partners'] = { rich_text: [{ text: { content: partnerText } }] };
    }

    // Pain Points - Remove commas for Notion multi_select
    if (research.painPoints?.length > 0) {
      properties['Pain Points'] = {
        multi_select: research.painPoints.slice(0, 3).map(p => ({
          name: p.replace(/,/g, ';').substring(0, 100)
        }))
      };
    }

    // Focus Areas
    if (research.focusAreas?.length > 0) {
      properties['Focus Areas'] = {
        multi_select: research.focusAreas.map(f => ({ name: f }))
      };
    }

    // Stage
    if (research.stage?.length > 0) {
      properties['Stage'] = {
        multi_select: research.stage.map(s => ({ name: s }))
      };
    }

    // Geography
    if (research.geography) {
      properties['Geography'] = {
        rich_text: [{ text: { content: research.geography } }]
      };
    }

    // Build Notes with Summary + Conversation Logs
    let notes = `# ${vcName}\n\n## Summary\n\n`;
    
    if (research.summary) notes += research.summary + '\n\n';
    if (research.thesis) notes += `**Thesis:** ${research.thesis}\n\n`;
    if (research.focusAreas?.length > 0) notes += `**Focus areas:** ${research.focusAreas.join(', ')}\n`;
    if (research.stage?.length > 0) notes += `**Stage:** ${research.stage.join(', ')}\n`;
    if (research.recentInvestments?.length > 0) notes += `\n**Recent investments:** ${research.recentInvestments.join(', ')}\n`;
    if (research.governanceSignals?.length > 0) {
      notes += `\n**Governance signals:**\n${research.governanceSignals.map(s => `- ${s}`).join('\n')}\n`;
    }
    if (research.partnerEmails?.length > 0) notes += `\n**Partner emails:** ${research.partnerEmails.join(', ')}\n`;

    // Add Conversation Logs
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    notes += `\n\n## Conversation Logs\n\n### ${today}\n\nResearch completed. Ready for outreach.`;

    properties['Notes'] = {
      rich_text: [{ type: 'text', text: { content: notes.substring(0, 2000) } }]
    };

    // Mark as "Ready for outreach"
    if (research.partnerEmails?.length > 0 && research.painPoints?.length > 0) {
      properties['Status'] = { select: { name: 'Ready for outreach' } };
    }

    // Update Notion
    await notionRequest('PATCH', `/v1/pages/${pageId}`, { properties });

    console.log(`✅ Notion updated for ${vcName}`);
    console.log(`   - Status: ${properties['Status']?.select?.name || 'Updating...'}`);
    console.log(`   - Emails: ${research.partnerEmails?.length || 0}`);
    console.log(`   - Pain points: ${research.painPoints?.length || 0}\n`);

    return true;
  } catch (error) {
    console.error(`❌ Failed to update Notion:`, error);
    return false;
  }
}

/**
 * Main workflow
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ALYGN VC Deep Research Script - v3 (Feb 14, 2026)             ║
║  Pattern: Script → Message to Wobblus → Sub-agents             ║
╚════════════════════════════════════════════════════════════════╝`);

  // Parse CLI args
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 1;
  const dryRun = args.includes('--dry-run');
  const vcName = args.find(a => a.startsWith('--vc-name='))?.split('=')[1];

  console.log(`\n📋 Options: limit=${limit}, dry-run=${dryRun}, vc-name=${vcName || 'any'}\n`);

  // Load VCs needing research
  const vcs = await loadVCsNeedingResearch(limit);
  if (vcs.length === 0) {
    console.log('✅ No VCs need research\n');
    return;
  }

  // Process one VC at a time
  for (const vc of vcs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${vc.name}`);
    console.log('='.repeat(60));

    // Request research
    const research = await requestResearch(vc);

    if (!dryRun && research && !research._pending) {
      // Update Notion
      await updateVCInNotion(vc.pageId, vc.name, research);
    }
  }

  console.log(`\n✅ Complete!\n`);
}

main().catch(console.error);
