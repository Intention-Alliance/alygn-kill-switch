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
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { getClient, queryDatabase, retrievePage, updatePage } from '../../../shared/notion-client.js';
const execAsync = promisify(exec);

// Load database ID from config
function loadDatabaseId(dataSource = false) {
  try {
    const configPath = path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/notion-config.json');
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
  dataSourceId: loadDatabaseId(true),
  databaseId: loadDatabaseId(),
  defaultLimit: 5,
  discordChannel: '1466532145257255004', // #annotations
};

const notion = getClient();


/**
 * Load VCs from Notion that need research
 */
async function loadVCsNeedingResearch(limit = 1) {
  console.log(`\n📚 Loading VCs needing research from Notion...\n`);

  try {
    const response = await queryDatabase(notion, CONFIG.databaseId, {
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
 * Get VCs with incomplete data from Notion
 */
async function getIncompleteVCs(limit = CONFIG.defaultLimit, vcName = null) {
  console.log('📦 Loading VCs from Notion...\n');

  try {
    // Build filter
    const filter = {
      and: [
        {
          property: 'Status',
          select: {
            does_not_equal: 'Ready for outreach'
          }
        }
      ]
    };

    // Optional: Filter by VC name
    if (vcName) {
      filter.and.push({
        property: 'Name',
        title: {
          contains: vcName
        }
      });
    }

    const response = await notion.databases.query({ database_id: CONFIG.dataSourceId,
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
        stage: props.Stage?.multi_select?.map(opt => opt.name) || [],
        geography: props.Geography?.rich_text?.[0]?.text?.content || null,
        painPoints: props['Pain Points']?.multi_select?.map(opt => opt.name) || [],
        notes: props.Notes?.rich_text?.[0]?.text?.content || null,
        relevanceScore: props['Relevance Score']?.number || 0,
        status: props.Status?.select?.name || 'Not contacted'
      };
    });

    console.log(`   Found ${vcs.length} VCs with incomplete data\n`);

    return vcs;
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    throw error;
  }
}

/**
 * Deep research a single VC using OpenClaw native tools via sessions_send
 */
async function deepResearchVC(vc) {
  console.log(`📚 Deep research: ${vc.name}...\n`);

  const researchFile = path.join('/tmp', `vc-research-${vc.name.replace(/[^a-zA-Z0-9]/g, '-')}-result.json`);

  // Check cache first
  if (fs.existsSync(researchFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(researchFile, 'utf8'));
      console.log(`   ✅ Loaded from cache\n`);
      return cached;
    } catch (error) {
      console.log(`   ⚠️  Cache invalid: ${error.message}\n`);
    }
  }

  // Execute research via sub-agent using sessions_spawn
  console.log(`   🔍 Spawning research sub-agent...\n`);

  const researchTask = `Research ${vc.name} (${vc.website || 'lookup required'}).

CRITICAL: Execute these steps in order and return ONLY valid JSON at the end.

1. If ${vc.website ? 'website provided: ' + vc.website : 'no website provided, search for it first'}, use web_fetch to extract:
   - Partner/team emails
   - Investment thesis
   - Company description
   - Recent investments or portfolio companies

2. Use web_search to find additional data:
   - "${vc.name} partners contact email"
   - "${vc.name} AI safety investments governance"
   - "${vc.name} investment thesis AI"

3. Extract and analyze to identify top 3 pain points (governance, coordination, alignment challenges)

4. Return ONLY this JSON structure (no other text):
{
  "name": "${vc.name}",
  "summary": "1-2 sentence description from research",
  "partnerEmails": ["partner1@vc.com", "partner2@vc.com"],
  "thesis": "Investment thesis extracted from research",
  "recentInvestments": ["Company A", "Company B"],
  "partners": [{"name": "John Doe", "role": "Partner", "email": "john@vc.com"}],
  "painPoints": ["Pain point 1", "Pain point 2", "Pain point 3"],
  "governanceSignals": ["Signal 1", "Signal 2"],
  "focusAreas": ${JSON.stringify(vc.focusAreas || [])},
  "stage": ${JSON.stringify(vc.stage || [])},
  "geography": "${vc.geography || ''}"
}`;

  try {
    // Use sessions_spawn to run research in a sub-agent with web_search/web_fetch
    // The sub-agent may return JSON in stdout or write a /tmp result file.
    const { stdout } = await execAsync(
      `openclaw sessions spawn --task="${researchTask.replace(/"/g, '\\"')}" --timeout-seconds=180 2>&1`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 190000 }
    );

    console.log(`   ✅ Research sub-agent completed\n`);

    // Helper: robust JSON extraction from mixed stdout
    function extractJsonFromStdout(text) {
      if (!text) return null;

      // Priority 1: explicit delimiters
      const startMarker = '<json_content>\n';
      const endMarker = '\n</json_content>';
      const sIndex = text.indexOf(startMarker);
      const eIndex = text.indexOf(endMarker, sIndex >= 0 ? sIndex + startMarker.length : 0);
      if (sIndex >= 0 && eIndex > sIndex) {
        const j = text.substring(sIndex + startMarker.length, eIndex).trim();
        try { return JSON.parse(j); } catch (e) { /* fallthrough */ }
      }

      // Priority 2: try to find a JSON object that contains required keys
      const approx = text.match(/\{[\s\S]*\}/g);
      if (approx) {
        for (const candidate of approx) {
          if (candidate.includes('"name"') && candidate.includes('"painPoints"')) {
            try { return JSON.parse(candidate); } catch (e) { /* try next */ }
          }
        }
      }

      return null;
    }

    let research = null;
    research = extractJsonFromStdout(stdout);
    if (research) {
      console.log(`   → Extracted from response: Emails: ${research.partnerEmails?.length || 0}, Pain points: ${research.painPoints?.length || 0}\n`);
      return research;
    }

    // Fallback: wait for file to be saved with exponential backoff up to configured timeout
    const maxWaitMs = (CONFIG.researchTimeoutMs && Number(CONFIG.researchTimeoutMs)) || 120000; // default 2 minutes
    const start = Date.now();
    let delay = 1000;
    while (Date.now() - start < maxWaitMs) {
      if (fs.existsSync(researchFile)) {
        try {
          const content = fs.readFileSync(researchFile, 'utf8');
          research = JSON.parse(content);
          console.log(`   → Loaded from file: Emails: ${research.partnerEmails?.length || 0}, Pain points: ${research.painPoints?.length || 0}\n`);
          return research;
        } catch (fileErr) {
          console.log(`   ⚠️  Failed to parse file ${researchFile}: ${fileErr.message}. Will retry until timeout.`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 10000);
    }


    // If we got here, research didn't return usable data
    console.log(`   ⚠️  No valid research data found. Using partial data.\n`);
    return {
      name: vc.name,
      summary: 'Research in progress',
      partnerEmails: [],
      thesis: null,
      recentInvestments: [],
      partners: [],
      painPoints: [],
      governanceSignals: [],
      focusAreas: vc.focusAreas || [],
      stage: vc.stage || [],
      geography: vc.geography || null
    };

  } catch (error) {
    console.error(`   ❌ Research failed: ${error.message}\n`);
    return null;
  }
}

/**
 * Update Notion VC page with research data (preserves existing Conversation Logs)
 */
async function updateVCInNotion(pageId, researchData, markReady = true) {
  console.log(`📝 Updating Notion...\n`);

  try {
    // Step 1: Read existing page to preserve Conversation Logs
    let existingConversationLogs = '';
    
    try {
      const existingPage = await retrievePage(notion, pageId);
      const existingNotes = existingPage.properties?.Notes?.rich_text?.[0]?.text?.content || '';
      
      // Extract existing Conversation Logs section if it exists
      const conversationLogsMatch = existingNotes.match(/## Conversation Logs\n\n([\s\S]*)/);
      if (conversationLogsMatch) {
        existingConversationLogs = conversationLogsMatch[1];
        console.log(`   → Preserving existing conversation logs\n`);
      }
    } catch (error) {
      console.log(`   ⚠️  Could not read existing page: ${error.message}\n`);
    }
    
    // Step 2: Build properties update
    const properties = {};

    // Email (use first partner email if available)
    if (researchData.partnerEmails && researchData.partnerEmails.length > 0) {
      properties['Email'] = {
        email: researchData.partnerEmails[0]
      };
    } else if (researchData.partnerEmail) {
      properties['Email'] = {
        email: researchData.partnerEmail
      };
    }

    // Partners (formatted list with emails)
    if (researchData.partners && researchData.partners.length > 0) {
      const partnerText = researchData.partners.map(p =>
        `${p.name} (${p.role})${p.email ? ' - ' + p.email : ''}`
      ).join('\n');

      properties['Partners'] = {
        rich_text: [{ text: { content: partnerText } }]
      };
    }

    // Pain Points - Remove commas for Notion multi_select compatibility
    if (researchData.painPoints && researchData.painPoints.length > 0) {
      properties['Pain Points'] = {
        multi_select: researchData.painPoints.slice(0, 3).map(p => {
          // Notion multi_select can't contain commas - replace with semicolons
          const cleanName = p.replace(/,/g, ';').substring(0, 100);
          return { name: cleanName };
        })
      };
    }

    // Focus Areas
    if (researchData.focusAreas && researchData.focusAreas.length > 0) {
      properties['Focus Areas'] = {
        multi_select: researchData.focusAreas.map(f => ({ name: f }))
      };
    }

    // Stage
    if (researchData.stage && researchData.stage.length > 0) {
      properties['Stage'] = {
        multi_select: researchData.stage.map(s => ({ name: s }))
      };
    }

    // Geography
    if (researchData.geography) {
      properties['Geography'] = {
        rich_text: [{ text: { content: researchData.geography } }]
      };
    }

    // ALWAYS update Notes to REPLACE (not append) - Build from scratch every time
    // Format: Summary + Conversation Logs
    let notes = `# ${researchData.name || 'VC Firm'}\n\n## Summary\n\n`;
    
    // Summary content
    if (researchData.summary) {
      notes += researchData.summary + '\n\n';
    } else if (researchData.thesis) {
      notes += researchData.thesis + '\n\n';
    } else {
      notes += 'Research in progress...\n\n';
    }
    
    if (researchData.focusAreas && researchData.focusAreas.length > 0) {
      notes += `**Focus areas:** ${researchData.focusAreas.join(', ')}\n`;
    }
    
    if (researchData.stage && researchData.stage.length > 0) {
      notes += `**Stage:** ${researchData.stage.join(', ')}\n`;
    }
    
    if (researchData.recentInvestments && researchData.recentInvestments.length > 0) {
      notes += `\n**Recent investments:** ${researchData.recentInvestments.join(', ')}\n`;
    }
    
    if (researchData.governanceSignals && researchData.governanceSignals.length > 0) {
      notes += `\n**Governance signals:**\n${researchData.governanceSignals.map(s => `- ${s}`).join('\n')}\n`;
    }
    
    if (researchData.partnerEmails && researchData.partnerEmails.length > 0) {
      notes += `\n**Partner emails:** ${researchData.partnerEmails.join(', ')}\n`;
    }
    
    // Conversation Logs section - Preserve existing + add new entry if this is first run
    notes += `\n\n## Conversation Logs\n\n`;
    
    if (existingConversationLogs) {
      // Preserve all existing logs
      notes += existingConversationLogs;
    } else {
      // First run - add initial entry
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      notes += `### ${today}\n\nInitial research completed. Ready for outreach.\n`;
    }
    
    // ALWAYS set Notes to completely replace existing content
    properties['Notes'] = {
      rich_text: [{ 
        type: 'text',
        text: { content: notes.substring(0, 2000) } 
      }]
    };

    // Mark as "Ready for outreach" if research complete
    if (markReady && researchData.partnerEmails?.length > 0 && researchData.painPoints?.length > 0) {
      properties['Status'] = {
        select: { name: 'Ready for outreach' }
      };
    }

    // Update database item properties (including Notes with Summary + Conversation Logs)
    await updatePage(notion, pageId, properties);

    console.log(`   ✅ Notion updated (properties + Notes with Summary & Conversation Logs)\n`);

    return true;
  } catch (error) {
    console.error(`   ❌ Failed to update Notion: ${error.message}`);
    return false;
  }
}

/**
 * Create individual VC page in Notion with research data (OPTIMIZED)
 * Uses single rich_text block for all content (faster than multiple blocks)
 * Returns page ID for linking
 */
async function createVCPage(parentPageId, vc, researchData) {
  console.log(`   📄 Creating VC page in Notion (optimized)...\n`);

  try {
    // Create new page as child of parent
    const page = await notion.pages.create({
      parent: {
        page_id: parentPageId
      },
      properties: {
        title: [
          {
            text: {
              content: vc.name
            }
          }
        ]
      }
    });

    const pageId = page.id;

    // Build single rich_text block with all content (OPTIMIZED - 2 API calls instead of 6)
    let content = '';

    // Summary section
    if (researchData.summary) {
      content += `## Summary\n${researchData.summary}\n\n`;
    }

    // Investment Thesis
    if (researchData.thesis) {
      content += `## Investment Thesis\n${researchData.thesis}\n\n`;
    }

    // Focus Areas
    if (researchData.focusAreas && researchData.focusAreas.length > 0) {
      content += `## Focus Areas\n${researchData.focusAreas.join(', ')}\n\n`;
    }

    // Pain Points
    if (researchData.painPoints && researchData.painPoints.length > 0) {
      const painPoints = researchData.painPoints
        .slice(0, 3)
        .map(p => p.replace(/[;,]/g, ' '))
        .join('\n');
      content += `## Governance Pain Points\n${painPoints}\n\n`;
    }

    // Conversation Logs section (empty for now, for future communications)
    content += `## Conversation Logs\nPage created. Outreach communications will be logged here.`;

    // Add single rich_text block with all content
    // This is MUCH faster than adding 5+ individual blocks
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: content.substring(0, 2000) // Notion paragraph limit
                }
              }
            ]
          }
        }
      ]
    });

    console.log(`   ✅ VC page created: https://notion.so/${pageId.replace(/-/g, '')}\n`);

    return pageId;
  } catch (error) {
    console.error(`   ⚠️  Failed to create VC page: ${error.message}\n`);
    return null;
  }
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

    console.log(`\n✅ Summary sent to Discord (#annotations)`);
  } catch (error) {
    console.error(`\n⚠️  Failed to send Discord summary: ${error.message}`);
  }
}

/**
 * Main deep research workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const vcNameArg = args.find(a => a.startsWith('--vc-name='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  const vcName = vcNameArg ? vcNameArg.split('=')[1].replace(/"/g, '') : null;

  // Check if database ID is loaded
  if (!CONFIG.databaseId) {
    console.error('❌ Error: Notion database ID not found!');
    console.error('\n📋 Run setup first:');
    console.error('   node setup-vc-notion-tracker.js\n');
    process.exit(1);
  }

  console.log('🚀 ALYGN VC Deep Research\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Database: ${CONFIG.databaseId}`);
  console.log(`   Limit: ${limit} VCs`);
  if (vcName) console.log(`   Filter: "${vcName}"`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}\n`);

  const stats = {
    loaded: 0,
    researched: 0,
    updated: 0,
    readyForOutreach: 0,
    failed: 0
  };

  // Get VCs with incomplete data
  const vcs = await getIncompleteVCs(limit, vcName);
  stats.loaded = vcs.length;

  if (vcs.length === 0) {
    console.log('✅ No VCs need research - all complete!\n');
    return;
  }

  console.log('📋 VCs to research:\n');
  vcs.forEach((vc, i) => {
    console.log(`   ${i + 1}. ${vc.name} (Score: ${vc.relevanceScore})`);
    console.log(`      Missing: ${!vc.email ? 'Email' : ''} ${!vc.painPoints?.length ? 'Pain Points' : ''} ${!vc.partners ? 'Partners' : ''}`);
  });
  console.log('');

  // Research VCs in parallel (optimized for scalability)
  console.log('🔄 Starting parallel research (up to 3 simultaneous)...\n');
  
  const batchSize = 3;
  for (let i = 0; i < vcs.length; i += batchSize) {
    const batch = vcs.slice(i, i + batchSize);
    const batchPromises = batch.map(async (vc) => {
      try {
        console.log('='.repeat(60));
        console.log(`\n🔍 Processing: ${vc.name}\n`);
        console.log(`   Current status: ${vc.status}\n`);

        // Deep research
        const researchData = await deepResearchVC(vc);

        if (!researchData) {
          stats.failed++;
          return { success: false };
        }

        stats.researched++;

        // Update Notion (skip in dry run)
        if (!dryRun) {
          const updated = await updateVCInNotion(vc.pageId, researchData);
          if (updated) {
            stats.updated++;

            // Check if ready for outreach
            if (researchData.partnerEmails?.length > 0 && researchData.painPoints?.length > 0) {
              stats.readyForOutreach++;
              
              // Create individual VC page for ready VCs
              const vcPageId = await createVCPage(vc.pageId, vc, researchData);
              if (vcPageId) {
                console.log(`   📎 Linked VC page to database row\n`);
              }
            }
          }
        } else {
          console.log(`   [DRY RUN] Would update Notion with research data\n`);
        }

        return { success: true };
      } catch (error) {
        console.error(`❌ Failed to process ${vc.name}: ${error.message}`);
        stats.failed++;
        return { success: false };
      }
    });

    // Wait for batch to complete
    await Promise.all(batchPromises);
  }

  // Generate summary
  const summary = `
🔍 **VC Deep Research Report** (${new Date().toLocaleDateString()})

**Stats:**
- Loaded: ${stats.loaded} VCs
- Researched: ${stats.researched} VCs
- Updated: ${stats.updated} VCs
- Ready for outreach: ${stats.readyForOutreach} VCs
- Failed: ${stats.failed} VCs

**Next:** Email drafting for ${stats.readyForOutreach} VCs ready for outreach.

Database: https://www.notion.so/${CONFIG.databaseId}
  `.trim();

  console.log('\n' + '='.repeat(60));
  console.log('\n' + summary + '\n');
  console.log('='.repeat(60) + '\n');

  // Send summary to Discord
  if (!dryRun && stats.updated > 0) {
    await sendDiscordSummary(summary);
  }

  console.log('✅ Deep research complete!\n');
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { deepResearchVC, getIncompleteVCs, updateVCInNotion };

