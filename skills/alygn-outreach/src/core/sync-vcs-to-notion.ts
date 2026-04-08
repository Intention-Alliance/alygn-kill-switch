/**
 * ALYGN VC Sync to Notion - TypeScript version
 * Syncs VCs from JSON file to Notion database
 * Self-contained: uses local notion-client from skill's lib/external
 */
import fs from 'fs';
import path from 'path';

// Self-contained: use local notion-client
import { getClient } from '../lib/external/notion-client';

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

interface SentEmailEntry {
  email: string;
  name: string;
  partnerName: string | null;
  vcName: string;
  subject: string;
  sentAt: string;
  messageId: string;
  status?: string;
  note?: string;
}

interface SentEmails {
  vcs: SentEmailEntry[];
  municipalities: SentEmailEntry[];
  lastUpdated: string | null;
}

interface ExistingVCResult {
  exists: boolean;
  source: 'sent-emails' | 'notion-name' | 'notion-email' | null;
  pageId?: string;
  vcName?: string;
  sentAt?: string;
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
 * Load sent-emails.json to check for existing sends
 */
function loadSentEmails(): SentEmails {
  // Self-contained: check skill's data directory first
  const skillDataPath = path.resolve(__dirname, '../../data/sent-emails.json');
  const legacyPath = path.join(process.env.HOME || '', '.openclaw/workspace/skills/alygn-outreach/data/sent-emails.json');
  
  try {
    if (fs.existsSync(skillDataPath)) {
      return JSON.parse(fs.readFileSync(skillDataPath, 'utf8')) as SentEmails;
    }
    if (fs.existsSync(legacyPath)) {
      return JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as SentEmails;
    }
  } catch (error) {
    console.warn(`   ⚠️  Could not load sent-emails.json: ${(error as Error).message}`);
  }
  
  return { vcs: [], municipalities: [], lastUpdated: null };
}

/**
 * Check if VC exists in sent-emails.json
 */
function vcExistsInSentEmails(sentEmails: SentEmails, vcName: string, email?: string): ExistingVCResult {
  // Check by email first
  if (email) {
    const byEmail = sentEmails.vcs.find(entry => 
      entry.email.toLowerCase() === email.toLowerCase()
    );
    if (byEmail) {
      return {
        exists: true,
        source: 'sent-emails',
        vcName: byEmail.vcName,
        sentAt: byEmail.sentAt
      };
    }
  }
  
  // Check by VC name
  const byName = sentEmails.vcs.find(entry => 
    entry.vcName.toLowerCase() === vcName.toLowerCase()
  );
  if (byName) {
    return {
      exists: true,
      source: 'sent-emails',
      vcName: byName.vcName,
      sentAt: byName.sentAt
    };
  }
  
  return { exists: false, source: null };
}

/**
 * Check if VC already exists in Notion by email
 * Returns the page ID if found
 */
async function vcExistsInNotionByEmail(email: string | undefined): Promise<ExistingVCResult> {
  if (!email) return { exists: false, source: null };
  
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
    
    if (response.results.length > 0) {
      const page = response.results[0] as { id: string; properties: Record<string, unknown> };
      // Extract VC Name from the page properties
      const nameProp = page.properties['Name'] as { title?: Array<{ text: { content: string } }> } | undefined;
      const vcName = nameProp?.title?.[0]?.text?.content;
      
      return {
        exists: true,
        source: 'notion-email',
        pageId: page.id,
        vcName
      };
    }
    
    return { exists: false, source: null };
  } catch (error) {
    console.error(`❌ Error checking Notion by email: ${(error as Error).message}`);
    return { exists: false, source: null };
  }
}

/**
 * Check if VC already exists in Notion by name
 * Returns the page ID if found
 */
async function vcExistsInNotionByName(vcName: string): Promise<ExistingVCResult> {
  if (!vcName) return { exists: false, source: null };
  
  try {
    const notion = getClient();
    const DATABASE_ID = getDatabaseId();
    
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'Name',
        title: {
          contains: vcName
        }
      }
    });
    
    // Check for exact match (case-insensitive)
    const exactMatch = response.results.find(result => {
      const page = result as { id: string; properties: Record<string, unknown> };
      const nameProp = page.properties['Name'] as { title?: Array<{ text: { content: string } }> } | undefined;
      const name = nameProp?.title?.[0]?.text?.content || '';
      return name.toLowerCase() === vcName.toLowerCase();
    });
    
    if (exactMatch) {
      const page = exactMatch as { id: string; properties: Record<string, unknown> };
      return {
        exists: true,
        source: 'notion-name',
        pageId: page.id,
        vcName
      };
    }
    
    return { exists: false, source: null };
  } catch (error) {
    console.error(`❌ Error checking Notion by name: ${(error as Error).message}`);
    return { exists: false, source: null };
  }
}

/**
 * COMPREHENSIVE DUPLICATE CHECK:
 * 1. Check sent-emails.json FIRST (local verification)
 * 2. Query Notion database by "VC Name" (remote verification)
 * 3. Query Notion database by email (remote verification)
 * Returns detailed result with source and pageId if found
 */
async function checkVCExists(vc: VC): Promise<ExistingVCResult> {
  // Step 1: Check sent-emails.json FIRST
  const sentEmails = loadSentEmails();
  const sentEmailResult = vcExistsInSentEmails(sentEmails, vc.name, vc.email);
  if (sentEmailResult.exists) {
    console.log(`   📋 Found in sent-emails.json (sent on ${new Date(sentEmailResult.sentAt || '').toLocaleDateString()})`);
    return sentEmailResult;
  }
  
  // Step 2: Check Notion by email (most reliable)
  if (vc.email) {
    const emailResult = await vcExistsInNotionByEmail(vc.email);
    if (emailResult.exists) {
      console.log(`   📊 Found in Notion by email (Page ID: ${emailResult.pageId})`);
      return emailResult;
    }
  }
  
  // Step 3: Check Notion by name
  const nameResult = await vcExistsInNotionByName(vc.name);
  if (nameResult.exists) {
    console.log(`   📊 Found in Notion by name (Page ID: ${nameResult.pageId})`);
    return nameResult;
  }
  
  return { exists: false, source: null };
}

/**
 * Create VC in Notion
 * If pageId is provided, updates the existing page instead of creating
 */
async function createVCInNotion(vc: VC, existingPageId?: string): Promise<{ id: string; created: boolean }> {
  const notion = getClient();
  const DATABASE_ID = getDatabaseId();
  
  const properties = {
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
  };
  
  try {
    // If we have an existing page ID, update instead of create
    if (existingPageId) {
      const response = await notion.pages.update({
        page_id: existingPageId,
        properties
      });
      console.log(`   📝 Updated existing Notion page: ${existingPageId}`);
      return { id: response.id, created: false };
    }
    
    // Create new page
    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties
    });
    
    return { id: response.id, created: true };
  } catch (error) {
    console.error(`❌ Failed to create/update VC: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Update VC status in Notion for bounced emails
 * Sets Status to "Passed" and adds bounce notes
 */
export async function updateVCBounceStatus(
  vcName: string,
  bounceReason: string,
  dryRun = false
): Promise<void> {
  const notion = getClient();
  
  console.log(`📧 Processing bounce for ${vcName}...`);
  console.log(`   Reason: ${bounceReason}`);
  
  // Find the VC in Notion by name
  const existingCheck = await vcExistsInNotionByName(vcName);
  
  if (!existingCheck.exists || !existingCheck.pageId) {
    console.warn(`   ⚠️  ${vcName} not found in Notion database`);
    return;
  }
  
  console.log(`   📝 Found Notion page: ${existingCheck.pageId}`);
  
  if (dryRun) {
    console.log(`   [DRY RUN] Would update ${vcName}:`);
    console.log(`     - Status: "Passed"`);
    console.log(`     - Notes: "${bounceReason}"`);
    console.log(`     - Draft Status: "Not Sent"`);
    return;
  }
  
  try {
    await notion.pages.update({
      page_id: existingCheck.pageId,
      properties: {
        'Status': {
          select: { name: 'Passed' }
        },
        'Notes': {
          rich_text: [{ text: { content: bounceReason } }]
        },
        'Draft Status': {
          select: { name: 'Not Sent' }
        }
      }
    });
    
    console.log(`   ✅ Updated ${vcName} in Notion:`);
    console.log(`     - Status: "Passed"`);
    console.log(`     - Notes: "${bounceReason}"`);
    console.log(`     - Draft Status: "Not Sent"`);
  } catch (error) {
    console.error(`   ❌ Failed to update ${vcName}: ${(error as Error).message}`);
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
  
  const DEFAULT_INPUT = `${process.env.HOME}/.openclaw/workspace/reports/alygn/alygn-vc-complete-${new Date().toISOString().split('T')[0]}.json`;
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
    
    // COMPREHENSIVE DUPLICATE CHECK
    const existingCheck = await checkVCExists(vc);
    
    if (existingCheck.exists) {
      console.log(`  ⏭️  DUPLICATE found (${existingCheck.source}): ${vc.name}`);
      if (existingCheck.sentAt) {
        console.log(`       Previously sent: ${new Date(existingCheck.sentAt).toLocaleDateString()}`);
      }
      if (existingCheck.pageId) {
        console.log(`       Notion Page ID: ${existingCheck.pageId}`);
      }
      stats.duplicates++;
      continue;
    }
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would create: ${vc.name}`);
      stats.created++;
      continue;
    }
    
    try {
      const result = await createVCInNotion(vc);
      if (result.created) {
        console.log(`  ✅ Created: ${vc.name} (ID: ${result.id})`);
      } else {
        console.log(`  📝 Updated existing: ${vc.name} (ID: ${result.id})`);
      }
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

export { 
  createVCInNotion, 
  loadVCsFromFile, 
  loadSentEmails,
  vcExistsInNotionByEmail,
  vcExistsInNotionByName,
  vcExistsInSentEmails,
  checkVCExists,
  updateVCBounceStatus,
  type ExistingVCResult,
  type SentEmails,
  type SentEmailEntry,
  type VC,
  type SyncStats
};
