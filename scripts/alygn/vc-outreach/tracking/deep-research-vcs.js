/**
 * ALYGN VC Deep Research Script
 *
 * Purpose: Fill missing data for VCs in Notion database
 *
 * Workflow:
 * 1. Load VCs from Notion with incomplete data
 * 2. Deep research each VC:
 *    - Find partner emails (website, LinkedIn scraping)
 *    - Portfolio analysis (AI safety companies)
 *    - Partner backgrounds (LinkedIn, blog posts)
 *    - Investment thesis extraction
 *    - Top 3 pain points (Grok analysis)
 *    - Governance signals (quotes, investments)
 * 3. Update Notion with full personalization data
 * 4. Mark as "Ready for outreach" when complete
 *
 * Usage:
 *   node deep-research-vcs.js [--vc-name="Khosla Ventures"] [--limit=5] [--dry-run]
 *
 * Examples:
 *   node deep-research-vcs.js --limit=5           # Research top 5 incomplete VCs
 *   node deep-research-vcs.js --vc-name="Lux"     # Research specific VC
 *   node deep-research-vcs.js --dry-run           # Show what would be researched
 *
 * Created: Feb 12, 2026
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
const execAsync = promisify(exec);

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const SHARED_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/shared');

// Dynamic imports with absolute paths
const notionClient = await import(path.join(SHARED_DIR, 'notion-client.js'));

const { getClient, queryDatabase, retrievePage, updatePage } = notionClient;

// Load database ID from config
function loadDatabaseId(dataSource = false) {
  try {
    const configPath = path.resolve(WORKSPACE_ROOT, 'scripts/alygn/vc-outreach/notion-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return dataSource ? config.dataSourceId : config.databaseId;
    }
  } catch (error) {
    console.error('⚠️  Failed to load database ID from config:', error.message);
  }
  return null;
}

// Configuration
const CONFIG = {
  databaseId: loadDatabaseId(),
  dataSourceId: loadDatabaseId(true),
  defaultLimit: 5,
  dryRun: false
};

const notion = getClient();

/**
 * Get VCs needing research from Notion
 */
async function getVCsNeedingResearch(limit = CONFIG.defaultLimit, vcName = null) {
  console.log('📦 Loading VCs needing research...\n');
  
  try {
    const filter = {
      and: [
        {
          property: 'Status',
          select: {
            equals: 'Not contacted'
          }
        }
      ]
    };
    
    if (vcName) {
      filter.and.push({
        property: 'Name',
        title: {
          contains: vcName
        }
      });
    }
    
    const response = await queryDatabase(notion, CONFIG.databaseId, {
      filter,
      page_size: limit
    });
    
    const vcs = response.results.map(page => {
      const props = page.properties;
      
      return {
        pageId: page.id,
        name: props.Name?.title?.[0]?.text?.content || 'Unknown',
        email: props.Email?.email || null,
        website: props.Website?.url || null,
        partners: props.Partners?.rich_text?.[0]?.text?.content || null,
        focusAreas: props['Focus Areas']?.multi_select?.map(opt => opt.name) || [],
        painPoints: props['Pain Points']?.multi_select?.map(opt => opt.name) || [],
        notes: props.Notes?.rich_text?.[0]?.text?.content || null,
        relevanceScore: props['Relevance Score']?.number || 0
      };
    }).filter(vc => !vc.email); // Only VCs without email
    
    console.log(`   Found ${vcs.length} VCs needing research\n`);
    return vcs;
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    throw error;
  }
}

/**
 * Research VC using Grok
 */
async function researchVCWithGrok(vc) {
  console.log(`   🔍 Researching ${vc.name}...`);
  
  const prompt = `
Research ${vc.name} venture capital firm. Focus on:
1. Partner names and contact info (LinkedIn, email patterns)
2. Portfolio companies in AI safety/governance
3. Investment thesis and recent focus areas
4. Partner backgrounds and governance signals
5. Top 3 pain points/challenges they face

Return structured data as JSON:
{
  "partners": ["name (role)", ...],
  "emails": ["email@domain.com", ...],
  "portfolio": ["company name", ...],
  "focusAreas": ["area", ...],
  "painPoints": ["pain point", ...],
  "governanceSignals": ["signal", ...],
  "relevanceScore": 1-10
}
  `.trim();
  
  try {
    const { stdout } = await execAsync(
      `openclaw llm-task --prompt "${prompt.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const result = JSON.parse(stdout);
    console.log(`   ✅ Research complete (Score: ${result.relevanceScore}/10)\n`);
    return result;
  } catch (error) {
    console.error(`   ⚠️  Research failed: ${error.message}`);
    return null;
  }
}

/**
 * Update VC in Notion
 */
async function updateVCInNotion(pageId, research) {
  try {
    const properties = {};
    
    if (research.emails && research.emails.length > 0) {
      properties['Email'] = {
        email: research.emails[0]
      };
    }
    
    if (research.partners && research.partners.length > 0) {
      properties['Partners'] = {
        rich_text: [{ text: { content: research.partners.join(', ') } }]
      };
    }
    
    if (research.focusAreas && research.focusAreas.length > 0) {
      properties['Focus Areas'] = {
        multi_select: research.focusAreas.map(area => ({ name: area }))
      };
    }
    
    if (research.painPoints && research.painPoints.length > 0) {
      properties['Pain Points'] = {
        multi_select: research.painPoints.map(point => ({ name: point }))
      };
    }
    
    if (research.relevanceScore) {
      properties['Relevance Score'] = {
        number: research.relevanceScore
      };
    }
    
    // Add research notes
    const researchNote = `
Research ${new Date().toISOString()}:
- Portfolio: ${research.portfolio?.join(', ') || 'N/A'}
- Governance Signals: ${research.governanceSignals?.join(', ') || 'N/A'}
    `.trim();
    
    const existingPage = await notion.pages.retrieve({ page_id: pageId });
    const existingNotes = existingPage.properties.Notes?.rich_text?.[0]?.text?.content || '';
    
    properties['Notes'] = {
      rich_text: [{ text: { content: existingNotes + '\n\n' + researchNote } }]
    };
    
    await notion.pages.update({
      page_id: pageId,
      properties
    });
    
    console.log(`   ✅ Updated Notion\n`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update Notion:`, error.message);
  }
}

/**
 * Main research workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const vcNameArg = args.find(a => a.startsWith('--vc-name='));
  
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  const vcName = vcNameArg ? vcNameArg.split('=')[1].replace(/"/g, '') : null;
  
  if (!CONFIG.databaseId) {
    console.error('❌ Error: Notion database ID not found!');
    process.exit(1);
  }
  
  console.log('🚀 ALYGN VC Deep Research\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Database: ${CONFIG.databaseId}`);
  console.log(`   Limit: ${limit} VCs`);
  if (vcName) console.log(`   Filter: "${vcName}"`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}\n`);
  
  const vcs = await getVCsNeedingResearch(limit, vcName);
  
  if (vcs.length === 0) {
    console.log('⚠️  No VCs needing research!\n');
    return;
  }
  
  console.log('🔍 VCs to research:\n');
  vcs.forEach((vc, i) => {
    console.log(`   ${i + 1}. ${vc.name} (Score: ${vc.relevanceScore || 'N/A'})`);
    console.log(`      Website: ${vc.website || 'N/A'}`);
    console.log(`      Partners: ${vc.partners || 'N/A'}`);
  });
  console.log('');
  
  const stats = {
    researched: 0,
    updated: 0,
    failed: 0
  };
  
  for (const vc of vcs) {
    console.log('='.repeat(60));
    console.log('');
    
    if (dryRun) {
      console.log(`   [DRY RUN] Would research: ${vc.name}\n`);
      stats.researched++;
      continue;
    }
    
    const research = await researchVCWithGrok(vc);
    
    if (research) {
      stats.researched++;
      await updateVCInNotion(vc.pageId, research);
      stats.updated++;
    } else {
      stats.failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Research complete!`);
  console.log(`   Researched: ${stats.researched}`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log('='.repeat(60) + '\n');
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { getVCsNeedingResearch, researchVCWithGrok, updateVCInNotion };