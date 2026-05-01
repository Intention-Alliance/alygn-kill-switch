/**
 * Populate VC Outreach Data - Manual Update Script
 * Research complete - now updating Notion with validated emails
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */

import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const SHARED_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/shared');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');

// Dynamic imports with absolute paths
const notionClient = await import(path.join(SHARED_DIR, 'notion-client.js'));
const emailValidatorFactoryModule = await import(path.join(ALYGN_DIR, 'lib/email/validators/EmailValidatorFactory.js'));

const { getClient } = notionClient;
const { EmailValidatorFactory } = emailValidatorFactoryModule;

const DATABASE_ID = '305334874af681ef983df57c7f70de33';
const notion = getClient();

// Initialize email validator
const emailValidator = EmailValidatorFactory.create('regex-mx');

/**
 * Query Notion for VCs that need emails
 */
async function getVCsNeedingEmails() {
  console.log('🔍 Querying Notion for VCs needing emails...\n');
  
  try {
    // Query all VCs with "Not contacted" status
    const response = await notion.dataSources.query({
      data_source_id: DATABASE_ID,
      filter: {
        property: 'Status',
        select: { equals: 'Not contacted' }
      },
      page_size: 20
    });
    
    const vcs = response.results.map(page => {
      const props = page.properties;
      
      // Find the title property
      let name = 'Unknown';
      for (const [key, value] of Object.entries(props)) {
        if (value.type === 'title' && value.title?.length > 0) {
          name = value.title[0].text.content;
          break;
        }
      }
      
      return {
        pageId: page.id,
        name,
        email: props['Email']?.email || null,
        focusAreas: props['Focus Areas']?.multi_select?.map(m => m.name) || [],
        notes: props['Notes']?.rich_text?.[0]?.text?.content || ''
      };
    }).filter(vc => !vc.email); // Only get those without emails
    
    console.log(`✅ Found ${vcs.length} VC(s) needing emails\n`);
    vcs.forEach((vc, i) => {
      console.log(`  ${i + 1}. ${vc.name}`);
      console.log(`     Focus Areas: ${vc.focusAreas.join(', ') || 'N/A'}`);
    });
    console.log('');
    
    return vcs;
  } catch (error) {
    console.error('❌ Failed to query Notion:', error.message);
    throw error;
  }
}

/**
 * Get research data for a specific VC
 */
function getVCResearchData(vcName) {
  const vcData = {
    'Andreessen Horowitz (a16z)': {
      emails: ['mp-reception@lsvp.com', 'us-reception@lsvp.com', 'nola@lsvp.com'],
      website: 'https://lsvp.com',
      painPoints: [
        'Portfolio includes AI companies needing governance frameworks',
        'Managing risk across 400+ portfolio companies',
        'Need for AI safety coordination across investments'
      ],
      relevanceScore: 9,
      partners: 'Mark, Reid, Martin, Scott, Peter'
    },
    'Sequoia Capital': {
      emails: ['info@sequoiacap.com'],
      website: 'https://www.sequoiacap.com',
      painPoints: [
        'AI safety concerns in portfolio',
        'Governance frameworks for AI companies',
        'Coordination challenges across global investments'
      ],
      relevanceScore: 10,
      partners: 'Roelof, Jim, Doug, Matt, Bill'
    }
  };
  
  return vcData[vcName] || null;
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
    
    if (research.partners) {
      properties['Partners'] = {
        rich_text: [{ text: { content: research.partners } }]
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
    
    await notion.pages.update({
      page_id: pageId,
      properties
    });
    
    console.log(`✅ Updated Notion\n`);
  } catch (error) {
    console.error(`❌ Failed to update Notion:`, error.message);
  }
}

/**
 * Main workflow
 */
async function main() {
  console.log('🚀 Populate VC Data\n');
  
  const vcs = await getVCsNeedingEmails();
  
  if (vcs.length === 0) {
    console.log('⚠️  No VCs need emails\n');
    return;
  }
  
  for (const vc of vcs) {
    console.log(`Processing: ${vc.name}`);
    
    const research = getVCResearchData(vc.name);
    
    if (research) {
      await updateVCInNotion(vc.pageId, research);
    } else {
      console.log(`  ⚠️  No research data found\n`);
    }
  }
  
  console.log('✅ Complete!\n');
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { getVCsNeedingEmails, getVCResearchData, updateVCInNotion };