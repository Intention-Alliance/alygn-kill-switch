/**
 * ALYGN VC Sync to Notion - TypeScript version
 * Syncs VCs from JSON file to Notion database
 * Self-contained: uses local notion-client from skill's lib/external
 */
import fs from 'fs';
import path from 'path';

// Self-contained: use local notion-client
import { getClient } from '../lib/external/notion-client.js';

// Rate limiting: 3 requests per second = 333ms between requests
const RATE_LIMIT_DELAY = 350;

interface VC {
  name: string;
  email?: string;
  website?: string;
  relevanceScore?: number;
  focusAreas?: string[];
  painPoints?: string[];
  partners?: string;
}

interface SyncStats {
  created: number;
  duplicates: number;
  failed: number;
}

// Database ID - should be configured in notion-config.json
const getDatabaseId = () => {
  // Check environment variable first
  if (process.env.NOTION_VC_DATABASE_ID) {
    return process.env.NOTION_VC_DATABASE_ID;
  }
  // Fall back to hardcoded default (legacy)
  return '305334874af681ef983df57c7f70de33';
};

/**
 * Check if VC already exists in Notion by email
 */
async function vcExistsInNotion(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  
  try {
    const notion = getClient();
    const DATABASE_ID = getDatabaseId();
    
    const response = await notion.databases.query({
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
    console.error(`❌ Error checking for duplicate: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Create VC in Notion
 */
async function createVCInNotion(vc: VC): Promise<unknown> {
  const notion = getClient();
  
  try {
    const response = await notion.pages.create({
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
    console.error(`❌ Failed to create VC: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Load VCs from JSON file
 */
function loadVCsFromFile(inputPath: string): VC[] {
  try {
    const data = fs.readFileSync(inputPath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.vcs && Array.isArray(parsed.vcs)) {
      return parsed.vcs;
    } else {
      console.error(`❌ JSON file ${inputPath} has unexpected format`);
      return [];
    }
  } catch (error) {
    console.error(`❌ Failed to load VCs from ${inputPath}:`, (error as Error).message);
    return [];
  }
}

/**
 * Main sync workflow
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inputArg = args.find(a => a.startsWith('--input='));
  
  const DEFAULT_INPUT = '/tmp/alygn-vc-complete-100.json';
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
  
  const stats: SyncStats = {
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
      console.error(`  ❌ Failed: ${vc.name} - ${(error as Error).message}`);
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
main().catch(error => {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
});

export { vcExistsInNotion, createVCInNotion, loadVCsFromFile };
