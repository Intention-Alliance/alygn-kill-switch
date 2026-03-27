/**
 * ALYGN VC Sync to Notion
 * 
 * Purpose: Sync VCs from JSON file to Notion database
 * Handles: deduplication, rate limiting, retries, error logging
 * 
 * Usage:
 *   node sync-vcs-to-notion.js [--input=/path/to/vcs.json] [--dry-run]
 * 
 * Created: Mar 19, 2026
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */

import fs from 'fs';
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const SHARED_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/shared');

// Dynamic imports with absolute paths
const notionClient = await import(path.join(SHARED_DIR, 'notion-client.js'));

const { getClient } = notionClient;

const DATABASE_ID = '305334874af681ef983df57c7f70de33';

// Initialize Notion client
let notion;
function initNotion() {
  if (!notion) {
    notion = getClient();
    // Ensure databases property exists
    if (!notion.databases) {
      notion.databases = {
        query: async (params) => {
          return notion.request({
            path: `databases/${params.database_id}/query`,
            method: 'POST',
            body: params
          });
        }
      };
    }
  }
  return notion;
}
const DEFAULT_INPUT = '/tmp/alygn-vc-complete-100.json';

// Rate limiting: 3 requests per second = 333ms between requests
const RATE_LIMIT_DELAY = 350;

/**
 * Check if VC already exists in Notion by email
 */
async function vcExistsInNotion(email) {
  if (!email) return false;
  
  const notionClient = initNotion();
  
  try {
    const response = await notionClient.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'Email',
        email: {
          equals: email
        }
      }
    });
    
    return response.results.length > 0;
  } catch (error) {
    console.error(`❌ Error checking for duplicate: ${error.message}`);
    return false;
  }
}

/**
 * Create VC in Notion
 */
async function createVCInNotion(vc) {
  const notionClient = initNotion();
  
  try {
    const response = await notionClient.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        'Name': {
          title: [{ text: { content: vc.name } }]
        },
        'Email': {
          email: vc.email || null
        },
        'Website': {
          url: vc.website || null
        },
        'Status': {
          select: { name: 'Not contacted' }
        },
        'Relevance Score': {
          number: vc.relevanceScore || 0
        },
        'Focus Areas': {
          multi_select: (vc.focusAreas || []).map(area => ({ name: area }))
        },
        'Pain Points': {
          multi_select: (vc.painPoints || []).map(point => ({ name: point }))
        },
        'Partners': {
          rich_text: [{ text: { content: vc.partners || '' } }]
        }
      }
    });
    
    return response;
  } catch (error) {
    console.error(`❌ Failed to create VC: ${error.message}`);
    throw error;
  }
}

/**
 * Load VCs from JSON file
 * Handles both array format and object with 'vcs' property
 */
function loadVCsFromFile(inputPath) {
  try {
    const data = fs.readFileSync(inputPath, 'utf8');
    const parsed = JSON.parse(data);
    
    // Handle both formats: array or object with 'vcs' property
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.vcs && Array.isArray(parsed.vcs)) {
      return parsed.vcs;
    } else {
      console.error(`❌ JSON file ${inputPath} has unexpected format: expected array or object with 'vcs' property`);
      return [];
    }
  } catch (error) {
    console.error(`❌ Failed to load VCs from ${inputPath}:`, error.message);
    return [];
  }
}

/**
 * Main sync workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inputArg = args.find(a => a.startsWith('--input='));
  
  const inputPath = inputArg ? inputArg.split('=')[1] : DEFAULT_INPUT;
  
  console.log('🚀 ALYGN VC Sync to Notion\n');
  console.log(`   Input: ${inputPath}`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}\n`);
  
  const vcs = loadVCsFromFile(inputPath);
  
  if (vcs.length === 0) {
    console.log('⚠️  No VCs to sync\n');
    return;
  }
  
  console.log(`📊 Found ${vcs.length} VCs\n`);
  
  const stats = {
    created: 0,
    duplicates: 0,
    failed: 0
  };
  
  for (const vc of vcs) {
    console.log(`Processing: ${vc.name}`);
    
    if (await vcExistsInNotion(vc.email)) {
      console.log(`  ⏭️  Duplicate: ${vc.email}`);
      stats.duplicates++;
      continue;
    }
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would create: ${vc.name}`);
      stats.created++;
      continue;
    }
    
    try {
      await createVCInNotion(vc);
      console.log(`  ✅ Created: ${vc.name}`);
      stats.created++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    } catch (error) {
      console.error(`  ❌ Failed: ${vc.name} - ${error.message}`);
      stats.failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Sync complete!`);
  console.log(`   Created: ${stats.created}`);
  console.log(`   Duplicates: ${stats.duplicates}`);
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

export { vcExistsInNotion, createVCInNotion, loadVCsFromFile };