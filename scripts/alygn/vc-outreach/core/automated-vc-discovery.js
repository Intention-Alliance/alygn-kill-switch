/**
 * ALYGN Automated VC Discovery & Research
 * 
 * Purpose: Daily cron job to discover, research, and add new AI safety/governance VCs
 * 
 * Workflow:
 * 1. Web search for VCs matching AI safety/governance keywords
 * 2. Research each VC (portfolio, thesis, partners, pain points)
 * 3. Score relevance (1-10)
 * 4. Validate emails before adding to Notion
 * 5. Add high-scoring VCs (7+) to Notion database with proper status
 * 6. Report summary to Discord/WhatsApp
 * 
 * Status Flow:
 *   Discovered → Validated → Researched → Ready for outreach → Sent
 * 
 * Schedule: Daily at 10 AM (via cron)
 * 
 * Usage:
 *   node automated-vc-discovery.js [--limit=20] [--dry-run] [--validator=zerobounce|regex-mx]
 * 
 * Created: Feb 12, 2026
 * Updated: Mar 19, 2026 - Fixed status transitions, added proper Notion updates
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
const execAsync = promisify(exec);

import { getClient, queryDatabase } from "../../../shared/notion-client.js";
import { EmailValidatorFactory } from "../../lib/email/validators/EmailValidatorFactory.js";

// Load database ID from config
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
  databaseId: loadDatabaseId(),
  minRelevanceScore: 7,
  defaultLimit: 20,
  searchQueries: [
    'AI safety seed stage investors',
    'AI governance venture capital',
    'AI alignment funding',
    'existential risk investors',
    'AGI preparedness venture capital'
  ],
  discordChannel: '1471206314435809431',
};

// Relevance scoring criteria
const RELEVANCE_KEYWORDS = {
  high: ['AI safety', 'AI alignment', 'existential risk', 'AGI governance', 'AI oversight'],
  medium: ['AI governance', 'AI ethics', 'responsible AI', 'AI policy', 'AI regulation'],
  low: ['AI', 'machine learning', 'deep tech', 'frontier tech']
};

const notion = getClient();

/**
 * Search web for VCs (using OpenClaw web_search)
 */
async function searchVCs(query, limit = CONFIG.defaultLimit) {
  console.log(`🔍 Searching: "${query}"...`);
  
  try {
    const { stdout } = await execAsync(
      `openclaw run "Search for: ${query} venture capital firms. Extract: firm names, websites, focus areas. Return JSON list." --json`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const result = JSON.parse(stdout);
    console.log(`   Found ${result.length || 0} potential VCs`);
    
    return result;
  } catch (error) {
    console.error(`   ❌ Search failed: ${error.message}`);
    return [];
  }
}

/**
 * Research a single VC firm
 */
async function researchVC(vcName, website = null) {
  console.log(`📚 Researching: ${vcName}...`);
  
  try {
    const researchPrompt = `
Research VC firm: ${vcName} ${website ? `(${website})` : ''}

Extract:
1. Investment thesis (1-2 sentences)
2. Recent AI/governance investments (list 3-5)
3. Partner names (key decision makers)
4. AI safety/governance interest signals
5. Top 3 governance pain points they care about
6. Primary contact email if available

Return JSON:
{
  "name": "${vcName}",
  "website": "url",
  "email": "contact@example.com or null",
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
  
  const focusText = (vcData.focusAreas || []).join(' ').toLowerCase();
  
  if (RELEVANCE_KEYWORDS.high.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 4;
  } else if (RELEVANCE_KEYWORDS.medium.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 3;
  } else if (RELEVANCE_KEYWORDS.low.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 2;
  }
  
  const stageText = (vcData.stage || []).join(' ').toLowerCase();
  if (['seed', 'pre-seed', 'series a'].some(s => stageText.includes(s))) {
    score += 3;
  }
  
  if (vcData.governanceSignals && vcData.governanceSignals.length > 0) {
    score += 2;
  }
  
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
    // Use dataSources.query for the new Notion API
    const response = await notion.dataSources.query({
      data_source_id: CONFIG.databaseId,
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
    return false;
  }
}

/**
 * Update Notion page status
 */
async function updateNotionStatus(pageId, status, metadata = {}) {
  try {
    const properties = {
      'Status': {
        select: { name: status }
      }
    };
    
    // Add metadata to notes if available
    if (Object.keys(metadata).length > 0) {
      const existingPage = await notion.pages.retrieve({ page_id: pageId });
      const existingNotes = existingPage.properties.Notes?.rich_text?.[0]?.text?.content || '';
      const metadataNote = `\n\n[${new Date().toISOString()}] Status: ${status}`;
      let additionalInfo = '';
      
      if (metadata.validationResult) {
        additionalInfo += `\nValidation: ${metadata.validationResult}`;
      }
      if (metadata.researchComplete) {
        additionalInfo += `\nResearch: complete`;
      }
      if (metadata.approved !== undefined) {
        additionalInfo += `\nApproved: ${metadata.approved}`;
      }
      
      properties['Notes'] = {
        rich_text: [{ text: { content: existingNotes + metadataNote + additionalInfo } }]
      };
    }
    
    await notion.pages.update({
      page_id: pageId,
      properties
    });
    
    console.log(`   ✅ Notion status updated to "${status}"`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update Notion status:`, error.message);
  }
}

/**
 * Add VC to Notion database with proper status flow
 * Includes comprehensive error handling and retry logic
 */
async function addVCToNotion(vcData, retryCount = 0) {
  const MAX_RETRIES = 3;
  
  try {
    // Determine initial status based on validation
    let initialStatus = 'Discovered';
    
    if (vcData.emailValidation) {
      if (vcData.emailValidation.result === 'valid') {
        initialStatus = 'Validated';
      } else if (vcData.emailValidation.result === 'invalid') {
        initialStatus = 'Invalid email';
      } else {
        initialStatus = 'Discovered';
      }
    }
    
    // After research is complete (pain points extracted), status becomes 'Researched'
    if (vcData.painPoints && vcData.painPoints.length > 0) {
      initialStatus = 'Researched';
    }
    
    // If fully processed and validated, mark as Ready for outreach
    if (vcData.status === 'Ready for outreach' || 
        (vcData.alygnFitScore >= 7 && vcData.emailValidated)) {
      initialStatus = 'Ready for outreach';
    }
    
    const properties = {
      'Name': {
        title: [{ text: { content: vcData.name } }]
      },
      'Status': {
        select: { name: initialStatus }
      },
      'Relevance Score': {
        number: vcData.relevanceScore || vcData.alygnFitScore || 0
      }
    };
    
    if (vcData.website) {
      properties['Website'] = { url: vcData.website };
    }
    
    if (vcData.email) {
      properties['Email'] = { email: vcData.email };
    }
    
    // Handle partner name/title
    const partnerInfo = [];
    if (vcData.partnerName) {
      partnerInfo.push(vcData.partnerName);
      if (vcData.partnerTitle) {
        partnerInfo.push(`(${vcData.partnerTitle})`);
      }
    } else if (vcData.partners && vcData.partners.length > 0) {
      partnerInfo.push(vcData.partners.join(', '));
    }
    
    if (partnerInfo.length > 0) {
      properties['Partners'] = {
        rich_text: [{ text: { content: partnerInfo.join(' ') } }]
      };
    }
    
    // Handle focus areas / sector focus
    const focusAreas = vcData.focusAreas || vcData.sectorFocus || [];
    if (focusAreas.length > 0) {
      properties['Focus Areas'] = {
        multi_select: focusAreas.slice(0, 10).map(f => ({ name: f.substring(0, 100) }))
      };
    }
    
    // Handle stage focus
    const stages = vcData.stage || vcData.stageFocus || [];
    if (stages.length > 0) {
      properties['Stage'] = {
        multi_select: stages.map(s => ({ name: s }))
      };
    }
    
    // Handle geography / location
    const location = vcData.geography || vcData.location;
    if (location) {
      properties['Geography'] = {
        rich_text: [{ text: { content: location } }]
      };
    }
    
    // Handle pain points
    const painPoints = vcData.painPoints || [];
    if (painPoints.length > 0) {
      properties['Pain Points'] = {
        multi_select: painPoints.slice(0, 3).map(p => ({ name: p.substring(0, 100) }))
      };
    }
    
    // Build notes content
    let notesContent = '';
    if (vcData.thesis) {
      notesContent += `Thesis: ${vcData.thesis}\n\n`;
    }
    if (vcData.recentInvestments && vcData.recentInvestments.length > 0) {
      notesContent += `Recent investments: ${vcData.recentInvestments.join(', ')}\n\n`;
    }
    if (vcData.checkSizeMin || vcData.checkSizeMax) {
      const min = vcData.checkSizeMin ? `$${(vcData.checkSizeMin / 1000000).toFixed(1)}M` : 'N/A';
      const max = vcData.checkSizeMax ? `$${(vcData.checkSizeMax / 1000000).toFixed(1)}M` : 'N/A';
      notesContent += `Check size: ${min} - ${max}\n`;
    }
    if (vcData.source) {
      notesContent += `Source: ${vcData.source}\n`;
    }
    
    if (notesContent) {
      properties['Notes'] = {
        rich_text: [{ text: { content: notesContent.trim() } }]
      };
    }
    
    // Add email validation metadata
    if (vcData.emailValidation || vcData.emailValidated !== undefined) {
      const emailStatus = vcData.emailValidation?.result || 
                         (vcData.emailValidated ? 'valid' : 'unknown');
      properties['Email Status'] = {
        select: { name: emailStatus }
      };
    }
    
    const result = await notion.pages.create({
      parent: { database_id: CONFIG.databaseId },
      properties
    });
    
    console.log(`   ✅ Added to Notion: ${vcData.name} (Score: ${vcData.relevanceScore || vcData.alygnFitScore}, Status: ${initialStatus})`);
    
    // Update status with metadata (non-blocking)
    try {
      await updateNotionStatus(result.id, initialStatus, {
        validationResult: vcData.emailValidation?.result || (vcData.emailValidated ? 'valid' : 'unknown'),
        researchComplete: !!(vcData.painPoints && vcData.painPoints.length > 0),
        approved: initialStatus === 'Ready for outreach'
      });
    } catch (statusError) {
      console.log(`   ⚠️  Failed to update status metadata: ${statusError.message}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`   ❌ Failed to add ${vcData.name} to Notion:`, error.message);
    
    // Retry logic for rate limits and transient errors
    if (retryCount < MAX_RETRIES) {
      const isRateLimit = error.message?.includes('rate_limited') || 
                         error.message?.includes('Rate limit') ||
                         error.code === 'rate_limited';
      const isTransient = error.message?.includes('timeout') ||
                         error.message?.includes('network') ||
                         error.message?.includes('ECONNRESET') ||
                         error.message?.includes('ETIMEDOUT');
      
      if (isRateLimit || isTransient) {
        const delay = isRateLimit ? 1000 * (retryCount + 1) : 500 * (retryCount + 1);
        console.log(`   🔄 Retrying ${vcData.name} in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return addVCToNotion(vcData, retryCount + 1);
      }
    }
    
    // Log detailed error for debugging
    console.error(`   📋 Error details:`, {
      name: vcData.name,
      email: vcData.email,
      error: error.message,
      code: error.code,
      status: error.status
    });
    
    throw error;
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
    
    console.log(`\n✅ Summary sent to Discord`);
  } catch (error) {
    console.error(`\n⚠️  Failed to send Discord summary: ${error.message}`);
  }
}

/**
 * Generate timestamp for filenames
 */
function generateTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Main automated discovery workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const validatorArg = args.find(a => a.startsWith('--validator='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  const validatorType = validatorArg ? validatorArg.split('=')[1] : 'regex-mx';
  
  if (!CONFIG.databaseId) {
    console.error('❌ Error: Notion database ID not found!');
    console.error('\n📋 Run setup first:');
    console.error('   node setup-vc-notion-tracker.js\n');
    process.exit(1);
  }
  
  // Initialize validator
  const validatorConfig = validatorType === 'zerobounce' 
    ? { apiKey: process.env.ZEROBOUNCE_API_KEY }
    : {};
  const validator = EmailValidatorFactory.create(validatorType, validatorConfig);
  
  console.log('🚀 ALYGN Automated VC Discovery\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Database: ${CONFIG.databaseId}`);
  console.log(`   Limit: ${limit} VCs per query`);
  console.log(`   Min relevance: ${CONFIG.minRelevanceScore}`);
  console.log(`   Validator: ${validatorType}`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
  console.log(`\n   Status Flow: Discovered → Validated → Researched → Ready for outreach → Sent\n`);
  
  const stats = {
    searched: 0,
    researched: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    emailValidated: 0,
    emailRejected: 0
  };
  
  const newVCs = [];
  const dryRunOperations = [];
  
  // Search for VCs
  for (const query of CONFIG.searchQueries.slice(0, 2)) {
    console.log(`\n📋 Query: "${query}"\n`);
    
    const searchResults = await searchVCs(query, limit);
    stats.searched += searchResults.length;
    
    for (const result of searchResults.slice(0, 5)) {
      try {
        // Step 1: Discovery
        const exists = await vcExists(result.name);
        if (exists) {
          console.log(`   ⏭️  Skipped (already exists): ${result.name}`);
          stats.skipped++;
          continue;
        }
        
        // Mark as Discovered
        let vcData = {
          name: result.name,
          website: result.website,
          status: 'Discovered'
        };
        
        // Step 2: Research (pain points extraction)
        const researchedData = await researchVC(result.name, result.website);
        if (!researchedData) {
          stats.failed++;
          continue;
        }
        
        stats.researched++;
        vcData = { ...vcData, ...researchedData };
        vcData.relevanceScore = scoreRelevance(vcData);
        
        // Skip low relevance VCs
        if (vcData.relevanceScore < CONFIG.minRelevanceScore) {
          console.log(`   ⏭️  Skipped (low relevance): ${vcData.name} (Score: ${vcData.relevanceScore})`);
          stats.skipped++;
          continue;
        }
        
        // Step 3: Email validation (status: Validated or Invalid email)
        if (vcData.email) {
          console.log(`   🔍 Validating email: ${vcData.email}`);
          const validation = await validator.validate(vcData.email);
          vcData.emailValidation = validation;
          
          if (validation.result === 'valid') {
            console.log(`   ✅ Email validated`);
            stats.emailValidated++;
            vcData.status = 'Validated';
          } else if (validation.result === 'invalid') {
            console.log(`   ❌ Email validation failed: ${validation.result}`);
            stats.emailRejected++;
            vcData.status = 'Invalid email';
            
            // Don't skip - still add to Notion with "Invalid email" status
          } else {
            console.log(`   ⚠️  Email validation uncertain: ${validation.result}`);
            vcData.status = 'Discovered';
          }
        } else {
          console.log(`   ⚠️  No email found for validation`);
          vcData.emailValidation = { result: 'unknown', reason: 'no_email' };
        }
        
        // Step 4: Mark as Researched (pain points extracted)
        if (vcData.painPoints && vcData.painPoints.length > 0) {
          vcData.status = 'Researched';
          console.log(`   ✅ Pain points extracted, status: Researched`);
        }
        
        // Add to dry-run operations
        if (dryRun) {
          dryRunOperations.push({
            type: 'vc_discovered',
            entity: {
              name: vcData.name,
              email: vcData.email,
              website: vcData.website
            },
            action: 'add_to_notion',
            payload: {
              name: vcData.name,
              email: vcData.email,
              relevanceScore: vcData.relevanceScore,
              status: vcData.status,
              emailValidation: vcData.emailValidation?.result,
              focusAreas: vcData.focusAreas,
              painPoints: vcData.painPoints
            },
            wouldSucceed: vcData.relevanceScore >= CONFIG.minRelevanceScore
          });
          
          console.log(`   [DRY RUN] Would add: ${vcData.name} (Score: ${vcData.relevanceScore}, Status: ${vcData.status})`);
          if (vcData.email) {
            console.log(`             Email: ${vcData.email} (${vcData.emailValidation?.result || 'no email'})`);
          }
        } else {
          await addVCToNotion(vcData);
          stats.added++;
        }
        
        newVCs.push(vcData);
      } catch (error) {
        console.error(`   ❌ Failed to process: ${error.message}`);
        stats.failed++;
      }
    }
  }
  
  // Save to temp file
  const timestamp = generateTimestamp();
  const outputFile = `/tmp/alygn-vc-discovered-${timestamp}.json`;
  
  if (!dryRun && newVCs.length > 0) {
    fs.writeFileSync(outputFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      count: newVCs.length,
      vcs: newVCs
    }, null, 2));
    console.log(`\n💾 Saved to: ${outputFile}`);
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
- Emails validated: ${stats.emailValidated}
- Emails rejected: ${stats.emailRejected}

**Status Flow:**
${newVCs.length > 0 ? newVCs.map(vc => `- ${vc.name}: ${vc.status} (${vc.emailValidation?.result || 'no email'})`).join('\n') : 'No new VCs added.'}

Database: https://www.notion.so/${CONFIG.databaseId}
  `.trim();
  
  if (dryRun) {
    // Output dry-run JSON to stdout
    const dryRunReport = {
      dryRun: true,
      timestamp: new Date().toISOString(),
      script: 'automated-vc-discovery.js',
      summary: {
        total: stats.searched,
        wouldAdd: dryRunOperations.length,
        wouldSkip: stats.skipped,
        wouldFail: stats.failed,
        emailValidated: stats.emailValidated,
        emailRejected: stats.emailRejected
      },
      operations: dryRunOperations,
      files: {
        wouldCreate: newVCs.length > 0 ? [outputFile] : []
      },
      statusFlow: 'Discovered → Validated → Researched → Ready for outreach → Sent'
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('\nDRY RUN OUTPUT:\n');
    console.log(JSON.stringify(dryRunReport, null, 2));
    console.log('='.repeat(60) + '\n');
  } else {
    console.log('\n' + '='.repeat(60));
    console.log('\n' + summary + '\n');
    console.log('='.repeat(60) + '\n');
    
    if (stats.added > 0) {
      await sendDiscordSummary(summary);
    }
    
    console.log('✅ Discovery complete!\n');
  }
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { addVCToNotion, researchVC, scoreRelevance, searchVCs, updateNotionStatus };
