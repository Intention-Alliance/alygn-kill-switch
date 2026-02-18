#!/usr/bin/env node
/**
 * ALYGN Automated VC Discovery & Research
 * 
 * Purpose: Daily cron job to discover, research, and add new AI safety/governance VCs
 * 
 * Workflow:
 * 1. Web search for VCs matching AI safety/governance keywords
 * 2. Research each VC (portfolio, thesis, partners, pain points)
 * 3. Score relevance (1-10)
 * 4. Add high-scoring VCs (7+) to Notion database
 * 5. Report summary to Discord/WhatsApp
 * 
 * Schedule: Daily at 10 AM (via cron)
 * 
 * Usage:
 *   node automated-vc-discovery.js [--limit=20] [--dry-run]
 * 
 * Created: Feb 12, 2026
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Load database ID from config (created by setup-vc-notion-tracker.js)
function loadDatabaseId() {
  try {
    const configPath = path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/notion-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.databaseId;
    }
  } catch (error) {
    console.error('⚠️  Failed to load database ID from config:', error.message);
  }
  return null;
}

// Configuration
const CONFIG = {
  notionKey: process.env.NOTION_KEY || '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',
  notionVersion: '2022-06-28',
  databaseId: loadDatabaseId(), // Load from config file
  minRelevanceScore: 7,
  defaultLimit: 20,
  searchQueries: [
    'AI safety seed stage investors',
    'AI governance venture capital',
    'AI alignment funding',
    'existential risk investors',
    'AGI preparedness venture capital'
  ],
  discordChannel: '1471206314435809431', // #Alygn: VC Outreach Plan & Implementation
};

// Relevance scoring criteria
const RELEVANCE_KEYWORDS = {
  high: ['AI safety', 'AI alignment', 'existential risk', 'AGI governance', 'AI oversight'],
  medium: ['AI governance', 'AI ethics', 'responsible AI', 'AI policy', 'AI regulation'],
  low: ['AI', 'machine learning', 'deep tech', 'frontier tech']
};

/**
 * Make Notion API request
 */
function notionRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${CONFIG.notionKey}`,
        'Notion-Version': CONFIG.notionVersion,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Notion API error (${res.statusCode}): ${parsed.message || body}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Notion response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Search web for VCs (using OpenClaw web_search)
 */
async function searchVCs(query, limit = CONFIG.defaultLimit) {
  console.log(`🔍 Searching: "${query}"...`);
  
  try {
    // Use OpenClaw CLI to call web_search tool
    const { stdout } = await execAsync(
      `openclaw run "Search for: ${query} venture capital firms. Extract: firm names, websites, focus areas. Return JSON list." --json`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const result = JSON.parse(stdout);
    
    // Parse and extract VC data from response
    // This is a placeholder - actual implementation would parse Grok's response
    console.log(`   Found ${result.length || 0} potential VCs`);
    
    return result;
  } catch (error) {
    console.error(`   ❌ Search failed: ${error.message}`);
    return [];
  }
}

/**
 * Research a single VC firm (portfolio, thesis, partners, pain points)
 */
async function researchVC(vcName, website = null) {
  console.log(`📚 Researching: ${vcName}...`);
  
  try {
    // Use OpenClaw CLI to research VC
    const researchPrompt = `
Research VC firm: ${vcName} ${website ? `(${website})` : ''}

Extract:
1. Investment thesis (1-2 sentences)
2. Recent AI/governance investments (list 3-5)
3. Partner names (key decision makers)
4. AI safety/governance interest signals (blog posts, quotes)
5. Top 3 governance pain points they care about

Return JSON:
{
  "name": "${vcName}",
  "website": "url",
  "thesis": "...",
  "recentInvestments": ["Company A", "Company B"],
  "partners": ["Partner 1", "Partner 2"],
  "governanceSignals": ["signal 1", "signal 2"],
  "painPoints": ["pain 1", "pain 2", "pain 3"],
  "focusAreas": ["AI safety", ...],
  "stage": ["Seed", "Series A"],
  "geography": "US"
}
    `.trim();
    
    const { stdout } = await execAsync(
      `openclaw run "${researchPrompt}" --json`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const vcData = JSON.parse(stdout);
    console.log(`   ✅ Research complete`);
    
    return vcData;
  } catch (error) {
    console.error(`   ❌ Research failed: ${error.message}`);
    return null;
  }
}

/**
 * Score VC relevance (1-10)
 */
function scoreRelevance(vcData) {
  let score = 0;
  
  // Keyword matching in focus areas
  const focusText = (vcData.focusAreas || []).join(' ').toLowerCase();
  
  if (RELEVANCE_KEYWORDS.high.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 4;
  } else if (RELEVANCE_KEYWORDS.medium.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 3;
  } else if (RELEVANCE_KEYWORDS.low.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 2;
  }
  
  // Stage fit bonus
  const stageText = (vcData.stage || []).join(' ').toLowerCase();
  if (['seed', 'pre-seed', 'series a'].some(s => stageText.includes(s))) {
    score += 3;
  }
  
  // Governance signals bonus
  if (vcData.governanceSignals && vcData.governanceSignals.length > 0) {
    score += 2;
  }
  
  // Recent AI safety investments bonus
  if (vcData.recentInvestments && vcData.recentInvestments.length >= 3) {
    score += 1;
  }
  
  return Math.min(score, 10);
}

/**
 * Check if VC already exists in Notion database
 */
async function vcExists(vcName) {
  try {
    const response = await notionRequest('POST', '/v1/databases/' + CONFIG.databaseId + '/query', {
      filter: {
        property: 'Name',
        title: {
          contains: vcName
        }
      }
    });
    
    return response.results.length > 0;
  } catch (error) {
    console.error(`   ⚠️  Failed to check if VC exists: ${error.message}`);
    return false; // Assume doesn't exist if check fails
  }
}

/**
 * Add VC to Notion database
 */
async function addVCToNotion(vcData) {
  // Build properties object
  const properties = {
    'Name': {
      title: [{ text: { content: vcData.name } }]
    },
    'Status': {
      select: { name: 'Not contacted' }
    },
    'Relevance Score': {
      number: vcData.relevanceScore
    }
  };
  
  // Add optional fields
  if (vcData.website) {
    properties['Website'] = { url: vcData.website };
  }
  
  if (vcData.partners && vcData.partners.length > 0) {
    properties['Partners'] = {
      rich_text: [{ text: { content: vcData.partners.join(', ') } }]
    };
  }
  
  if (vcData.focusAreas && vcData.focusAreas.length > 0) {
    properties['Focus Areas'] = {
      multi_select: vcData.focusAreas.map(f => ({ name: f }))
    };
  }
  
  if (vcData.stage && vcData.stage.length > 0) {
    properties['Stage'] = {
      multi_select: vcData.stage.map(s => ({ name: s }))
    };
  }
  
  if (vcData.geography) {
    properties['Geography'] = {
      rich_text: [{ text: { content: vcData.geography } }]
    };
  }
  
  if (vcData.painPoints && vcData.painPoints.length > 0) {
    properties['Pain Points'] = {
      multi_select: vcData.painPoints.slice(0, 3).map(p => ({ name: p }))
    };
  }
  
  if (vcData.thesis) {
    properties['Notes'] = {
      rich_text: [{ text: { content: `Thesis: ${vcData.thesis}\n\nRecent investments: ${(vcData.recentInvestments || []).join(', ')}` } }]
    };
  }
  
  // Create page
  await notionRequest('POST', '/v1/pages', {
    parent: { database_id: CONFIG.databaseId },
    properties
  });
  
  console.log(`   ✅ Added to Notion: ${vcData.name} (Score: ${vcData.relevanceScore})`);
}

/**
 * Send summary to Discord
 */
async function sendDiscordSummary(summary) {
  try {
    const { stdout } = await execAsync(
      `openclaw message send --channel=discord --target="${CONFIG.discordChannel}" --message="${summary.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    console.log(`\n✅ Summary sent to Discord`);
  } catch (error) {
    console.error(`\n⚠️  Failed to send Discord summary: ${error.message}`);
  }
}

/**
 * Main automated discovery workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  
  // Check if database ID is loaded
  if (!CONFIG.databaseId) {
    console.error('❌ Error: Notion database ID not found!');
    console.error('\n📋 Run setup first:');
    console.error('   node setup-vc-notion-tracker.js\n');
    process.exit(1);
  }
  
  console.log('🚀 ALYGN Automated VC Discovery\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Database: ${CONFIG.databaseId}`);
  console.log(`   Limit: ${limit} VCs per query`);
  console.log(`   Min relevance: ${CONFIG.minRelevanceScore}`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}\n`);
  
  const stats = {
    searched: 0,
    researched: 0,
    added: 0,
    skipped: 0,
    failed: 0
  };
  
  const newVCs = [];
  
  // Search for VCs using multiple queries
  for (const query of CONFIG.searchQueries.slice(0, 2)) { // Limit to 2 queries per run
    console.log(`\n📋 Query: "${query}"\n`);
    
    const searchResults = await searchVCs(query, limit);
    stats.searched += searchResults.length;
    
    // Research each VC
    for (const result of searchResults.slice(0, 5)) { // Limit to 5 VCs per query
      try {
        // Check if already exists
        const exists = await vcExists(result.name);
        if (exists) {
          console.log(`   ⏭️  Skipped (already exists): ${result.name}`);
          stats.skipped++;
          continue;
        }
        
        // Research VC
        const vcData = await researchVC(result.name, result.website);
        if (!vcData) {
          stats.failed++;
          continue;
        }
        
        stats.researched++;
        
        // Score relevance
        vcData.relevanceScore = scoreRelevance(vcData);
        
        // Only add if meets minimum relevance score
        if (vcData.relevanceScore >= CONFIG.minRelevanceScore) {
          if (!dryRun) {
            await addVCToNotion(vcData);
            stats.added++;
          } else {
            console.log(`   [DRY RUN] Would add: ${vcData.name} (Score: ${vcData.relevanceScore})`);
          }
          
          newVCs.push(vcData);
        } else {
          console.log(`   ⏭️  Skipped (low relevance): ${vcData.name} (Score: ${vcData.relevanceScore})`);
          stats.skipped++;
        }
      } catch (error) {
        console.error(`   ❌ Failed to process: ${error.message}`);
        stats.failed++;
      }
    }
  }
  
  // Generate summary
  const summary = `
🔍 **Daily VC Discovery Report** (${new Date().toLocaleDateString()})

**Stats:**
- Searched: ${stats.searched} VCs
- Researched: ${stats.researched} VCs
- Added: ${stats.added} VCs
- Skipped: ${stats.skipped} VCs (duplicates/low relevance)
- Failed: ${stats.failed} VCs

${newVCs.length > 0 ? `**New VCs Added (Score ≥ ${CONFIG.minRelevanceScore}):**\n${newVCs.map(vc => `- ${vc.name} (Score: ${vc.relevanceScore}) - ${vc.focusAreas.join(', ')}`).join('\n')}` : 'No new VCs added today.'}

Database: https://www.notion.so/${CONFIG.databaseId}
  `.trim();
  
  console.log('\n' + '='.repeat(60));
  console.log('\n' + summary + '\n');
  console.log('='.repeat(60) + '\n');
  
  // Send summary to Discord
  if (!dryRun && stats.added > 0) {
    await sendDiscordSummary(summary);
  }
  
  console.log('✅ Discovery complete!\n');
}

// Run
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = { searchVCs, researchVC, scoreRelevance, addVCToNotion };
