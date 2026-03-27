/**
 * ALYGN Research VC Contacts - Find personal partner emails
 */

import { Client } from '@notionhq/client';
import { getNotionKey } from './shared/load-credentials.js';

const notion = new Client({ auth: getNotionKey() });
const DATABASE_ID = '30533487-4af6-81e7-ad64-000bbd4829ff';

const GENERIC_PATTERNS = ['info@', 'hello@', 'contact@', 'press@', 'media@', 'support@', 'team@'];

async function getVCsNeedingContact(limit = 10) {
  console.log('📦 Querying Notion for VCs ready for outreach...\n');

  try {
    // Query VCs with "Ready for outreach" status and NOT "Sent"
    const response = await notion.dataSources.query({
      data_source_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: 'Status',
            select: {
              equals: 'Ready for outreach'
            }
          },
          {
            property: 'Email',
            email: {
              is_not_empty: true
            }
          },
          {
            or: [
              {
                property: 'Draft Status',
                select: {
                  is_empty: true
                }
              },
              {
                property: 'Draft Status',
                select: {
                  does_not_equal: 'Sent'
                }
              }
            ]
          }
        ]
      },
      page_size: limit * 2,
      sorts: [
        {
          property: 'Relevance Score',
          direction: 'descending'
        }
      ]
    });

    let vcs = response.results.map(page => {
      const props = page.properties;
      return {
        pageId: page.id,
        id: props.ID?.rich_text?.[0]?.text?.content || page.id,
        name: props.Name?.title?.[0]?.text?.content || 'Unknown',
        email: props.Email?.email,
        website: props.Website?.url || null,
        partners: props.Partners?.rich_text?.[0]?.text?.content || null,
        focusAreas: props['Focus Areas']?.multi_select?.map(opt => opt.name) || [],
        painPoints: props['Pain Points']?.multi_select?.map(opt => opt.name) || [],
        relevanceScore: props['Relevance Score']?.number || 0,
      };
    });

    // Filter out generic emails
    vcs = vcs.filter(vc => {
      if (!vc.email) return false;
      const emailLower = vc.email.toLowerCase();
      return !GENERIC_PATTERNS.some(pattern => emailLower.startsWith(pattern));
    });

    console.log(`   Found ${vcs.length} VCs with non-generic emails\n`);
    return vcs.slice(0, limit);
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    return [];
  }
}

async function searchForPartnerEmails(vc) {
  console.log(`\n🔍 Researching: ${vc.name}`);
  console.log(`   Current email: ${vc.email}`);
  console.log(`   Partners: ${vc.partners || 'Unknown'}`);
  console.log(`   Website: ${vc.website || 'Unknown'}`);

  // Parse partner names
  let partnerNames = [];
  if (vc.partners) {
    // Format: "Partner Name (Title), Partner Name (Title)"
    partnerNames = vc.partners.split(',').map(p => {
      const match = p.trim().match(/^([^\(]+)/);
      return match ? match[1].trim() : p.trim();
    });
  }

  console.log(`   Parsed partners: ${partnerNames.join(', ') || 'None'}`);

  // Return research data for further processing
  return {
    vc: vc.name,
    partnerNames,
    website: vc.website,
    currentEmail: vc.email,
    domain: vc.website ? new URL(vc.website).hostname.replace('www.', '') : null
  };
}

async function main() {
  console.log('🚀 ALYGN Research VC Contacts\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Database: ${DATABASE_ID}\n`);

  const vcs = await getVCsNeedingContact(10);

  if (vcs.length === 0) {
    console.log('⚠️  No VCs found ready for outreach with non-generic emails!\n');
    return;
  }

  console.log('📋 VCs to research:\n');
  vcs.forEach((vc, i) => {
    console.log(`   ${i + 1}. ${vc.name} (Score: ${vc.relevanceScore})`);
    console.log(`      Email: ${vc.email}`);
    console.log(`      Partners: ${vc.partners || 'N/A'}`);
  });
  console.log('');

  // Research each VC
  const researchData = [];
  for (const vc of vcs) {
    const data = await searchForPartnerEmails(vc);
    researchData.push({ ...data, vc });
  }

  // Output research targets
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 RESEARCH TARGETS (for web search):\n');

  researchData.forEach((data, i) => {
    console.log(`${i + 1}. ${data.vc.name}`);
    if (data.partnerNames.length > 0) {
      data.partnerNames.forEach(partner => {
        console.log(`   Query: "${partner} ${data.vc.name} email contact"`);
      });
    }
    if (data.website) {
      console.log(`   Website: ${data.website}`);
    }
    console.log('');
  });

  console.log('='.repeat(60) + '\n');

  // Save research data
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `/tmp/alygn-vc-research-${timestamp}.json`;
  const fs = await import('fs');
  fs.writeFileSync(outputFile, JSON.stringify(researchData, null, 2));
  console.log(`💾 Research data saved to: ${outputFile}\n`);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
