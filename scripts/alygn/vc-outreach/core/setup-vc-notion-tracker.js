/**
 * ALYGN VC Outreach Tracker - Notion Database Setup
 * 
 * Purpose: Create/update Notion database for VC outreach tracking
 * 
 * Database Schema:
 * - Name (title): VC firm name
 * - Email (email): Partner email
 * - Status (select): Not contacted, Contacted, Replied (Positive), Replied (Neutral), Passed, Meeting Scheduled, Negotiating, Archived
 * - Variant (select): Governance, Institutional
 * - Sent Date (date): When email was sent
 * - Reply Date (date): When reply received
 * - Sentiment (select): Positive, Neutral, Negative
 * - Relevance Score (number): 1-10 score
 * - Pain Points (multi-select): Extracted governance challenges
 * - Notes (text): Research notes, follow-up actions
 * - Website (url): VC firm website
 * - Partners (text): Partner names
 * - Focus Areas (multi-select): AI safety, AI governance, etc.
 * - Stage (multi-select): Seed, Pre-seed, Series A
 * - Geography (text): Location
 * 
 * Usage:
 *   node setup-vc-notion-tracker.js
 * 
 * Created: Feb 12, 2026
 */

import fs from "fs";
import path from "path";
import { getClient } from "../../../shared/notion-client.js";

// Configuration
const notion = getClient();

// Database: VC Outreach Tracker
const DATABASE_ID = '305334874af681ef983df57c7f70de33';

// Database schema
const DATABASE_SCHEMA = {
  title: [
    {
      type: 'text',
      text: { content: 'ALYGN VC Outreach Tracker' }
    }
  ],
  parent: {
    type: 'page_id',
    page_id: PARENT_PAGE_ID
  },
  properties: {
    'Name': {
      title: {}
    },
    'Email': {
      email: {}
    },
    'Status': {
      select: {
        options: [
          { name: 'Not contacted', color: 'gray' },
          { name: 'Contacted', color: 'blue' },
          { name: 'Replied (Positive)', color: 'green' },
          { name: 'Replied (Neutral)', color: 'yellow' },
          { name: 'Replied (Negative)', color: 'orange' },
          { name: 'Passed', color: 'red' },
          { name: 'Meeting Scheduled', color: 'purple' },
          { name: 'Negotiating', color: 'pink' },
          { name: 'Archived', color: 'default' }
        ]
      }
    },
    'Variant': {
      select: {
        options: [
          { name: 'Governance', color: 'blue' },
          { name: 'Institutional', color: 'purple' }
        ]
      }
    },
    'Sent Date': {
      date: {}
    },
    'Reply Date': {
      date: {}
    },
    'Sentiment': {
      select: {
        options: [
          { name: 'Positive', color: 'green' },
          { name: 'Neutral', color: 'gray' },
          { name: 'Negative', color: 'red' }
        ]
      }
    },
    'Relevance Score': {
      number: {
        format: 'number'
      }
    },
    'Pain Points': {
      multi_select: {
        options: [
          { name: 'AGI coordination', color: 'blue' },
          { name: 'AI governance frameworks', color: 'purple' },
          { name: 'Safety-first deployment', color: 'green' },
          { name: 'AI misalignment risk', color: 'red' },
          { name: 'Regulatory preparedness', color: 'orange' },
          { name: 'Public trust', color: 'yellow' },
          { name: 'Workforce displacement governance', color: 'pink' },
          { name: 'AI transparency', color: 'blue' },
          { name: 'Oversight mechanisms', color: 'purple' },
          { name: 'AI system accountability', color: 'green' },
          { name: 'Developer governance tools', color: 'blue' },
          { name: 'Safety testing infrastructure', color: 'purple' }
        ]
      }
    },
    'Notes': {
      rich_text: {}
    },
    'Website': {
      url: {}
    },
    'Partners': {
      rich_text: {}
    },
    'Focus Areas': {
      multi_select: {
        options: [
          { name: 'AI safety', color: 'red' },
          { name: 'AI governance', color: 'blue' },
          { name: 'AI alignment', color: 'purple' },
          { name: 'Existential risk', color: 'red' },
          { name: 'AGI preparedness', color: 'orange' },
          { name: 'AI infrastructure', color: 'green' },
          { name: 'Deep tech', color: 'blue' },
          { name: 'AI ethics', color: 'yellow' }
        ]
      }
    },
    'Stage': {
      multi_select: {
        options: [
          { name: 'Pre-seed', color: 'gray' },
          { name: 'Seed', color: 'blue' },
          { name: 'Series A', color: 'green' },
          { name: 'Series B', color: 'yellow' },
          { name: 'Growth', color: 'orange' }
        ]
      }
    },
    'Geography': {
      rich_text: {}
    }
  }
};

/**
 * Create VC Outreach Tracker database
 */
async function createDatabase() {
  console.log('🚀 Creating ALYGN VC Outreach Tracker database...\n');
  
  try {
    const database = await notion.databases.create(DATABASE_SCHEMA);
    
    console.log('✅ Database created successfully!\n');
    console.log(`   Database ID: ${database.id}`);
    console.log(`   URL: ${database.url}\n`);
    
    // Save database ID for future use
    const configPath = path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/notion-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      databaseId: database.id,
      databaseUrl: database.url,
      created: new Date().toISOString()
    }, null, 2));
    
    console.log(`📝 Config saved to: ${configPath}\n`);
    
    return database;
  } catch (error) {
    console.error('❌ Failed to create database:', error.message);
    throw error;
  }
}

/**
 * Add seed VCs to database (no contact info yet - just basic data)
 */
async function addSeedVCs(databaseId) {
  console.log('📦 Loading seed VCs...\n');
  
  const seedListPath = path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/seed-vc-list.json');
  
  if (!fs.existsSync(seedListPath)) {
    console.log('⚠️  Seed list not found, skipping import');
    return;
  }
  
  const seedList = JSON.parse(fs.readFileSync(seedListPath, 'utf8'));
  const vcs = seedList.vcs; // Import all VCs from seed list
  
  console.log(`   Importing ${vcs.length} VCs to Notion...\n`);
  
  let added = 0;
  let failed = 0;
  
  for (const vc of vcs) {
    try {
      // Build properties object (skip undefined fields)
      const properties = {
        'Name': {
          title: [{ text: { content: vc.name } }]
        },
        'Status': {
          select: { name: vc.status || 'Not contacted' }
        },
        'Relevance Score': {
          number: vc.relevanceScore
        }
      };
      
      // Add optional fields only if they exist
      if (vc.website) {
        properties['Website'] = { url: vc.website };
      }
      
      if (vc.partners && vc.partners.length > 0) {
        properties['Partners'] = {
          rich_text: [{ text: { content: vc.partners.join(', ') } }]
        };
      }
      
      if (vc.focus && vc.focus.length > 0) {
        properties['Focus Areas'] = {
          multi_select: vc.focus.map(f => ({ name: f }))
        };
      }
      
      if (vc.stage && vc.stage.length > 0) {
        properties['Stage'] = {
          multi_select: vc.stage.map(s => ({ name: s }))
        };
      }
      
      if (vc.geography) {
        properties['Geography'] = {
          rich_text: [{ text: { content: vc.geography } }]
        };
      }
      
      if (vc.painPoints && vc.painPoints.length > 0) {
        properties['Pain Points'] = {
          multi_select: vc.painPoints.slice(0, 3).map(p => ({ name: p }))
        };
      }
      
      if (vc.notes) {
        properties['Notes'] = {
          rich_text: [{ text: { content: vc.notes } }]
        };
      }
      
      // Create page in database
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties
      });
      
      console.log(`   ✅ Added: ${vc.name} (Score: ${vc.relevanceScore})`);
      added++;
    } catch (error) {
      console.error(`   ❌ Failed to add ${vc.name}:`, error.message);
      failed++;
    }
  }
  
  console.log(`\n✅ Seed VC import complete! (${added} added, ${failed} failed)`);
}

/**
 * Main setup workflow
 */
async function main() {
  console.log('🔧 ALYGN VC Outreach Tracker - Notion Setup\n');
  
  try {
    // Create new database
    console.log('📦 Creating new VC Outreach Tracker database...\n');
    console.log(`   Parent page: Organizations TODO Lists (${PARENT_PAGE_ID})\n`);
    
    const database = await createDatabase();
    
    console.log(`✅ Database created successfully!\n`);
    console.log(`   Database ID: ${database.id}`);
    console.log(`   URL: ${database.url}\n`);
    
    // Save database ID for future use
    const configPath = path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/notion-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      databaseId: database.id,
      databaseUrl: database.url,
      created: new Date().toISOString()
    }, null, 2));
    
    console.log(`📝 Config saved to: ${configPath}\n`);
    
    // Add seed VCs to new database
    await addSeedVCs(database.id);
    
    console.log('\n🎉 Setup complete!\n');
    console.log('Next steps:');
    console.log('   1. Open Notion database and verify entries');
    console.log('   2. Run vc-discovery-curation.js to analyze seed list');
    console.log('   3. Set up automated VC discovery cron job');
    console.log('   4. Begin personalization research for top 20 VCs\n');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}

export { addSeedVCs, createDatabase };

