/**
 * ALYGN Find VCs for Research
 * Find VCs in Notion with personal partner emails
 */

import { Client } from '@notionhq/client';
import { getNotionKey } from './shared/load-credentials.js';

const notion = new Client({ auth: getNotionKey() });
const DATABASE_ID = '30533487-4af6-81e7-ad64-000bbd4829ff';

const GENERIC_PATTERNS = ['info@', 'hello@', 'contact@', 'press@', 'media@', 'support@', 'team@'];

async function getAllVCs() {
  console.log('📦 Querying Notion for all VCs...\n');

  try {
    const response = await notion.dataSources.query({
      data_source_id: DATABASE_ID,
      filter: {
        property: 'Status',
        select: {
          equals: 'Ready for outreach'
        }
      },
      page_size: 100,
      sorts: [
        {
          property: 'Relevance Score',
          direction: 'descending'
        }
      ]
    });

    const vcs = response.results.map(page => {
      const props = page.properties;
      return {
        pageId: page.id,
        id: props.ID?.rich_text?.[0]?.text?.content || page.id,
        name: props.Name?.title?.[0]?.text?.content || 'Unknown',
        email: props.Email?.email,
        website: props.Website?.url || null,
        partners: props.Partners?.rich_text?.[0]?.text?.content || null,
        focusAreas: props['Focus Areas']?.multi_select?.map(opt => opt.name) || [],
        relevanceScore: props['Relevance Score']?.number || 0,
        draftStatus: props['Draft Status']?.select?.name || 'Not drafted',
      };
    });

    console.log(`   Found ${vcs.length} total VCs\n`);
    return vcs;
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    return [];
  }
}

function analyzeEmail(email) {
  if (!email) return { type: 'missing', isPersonal: false };
  
  const emailLower = email.toLowerCase();
  
  // Check for generic patterns
  for (const pattern of GENERIC_PATTERNS) {
    if (emailLower.startsWith(pattern)) {
      return { type: 'generic', isPersonal: false, pattern };
    }
  }
  
  // Check for personal email patterns
  const localPart = emailLower.split('@')[0];
  
  // Firstname@domain.com
  if (/^[a-z]+$/.test(localPart) && localPart.length >= 2 && localPart.length <= 12) {
    return { type: 'firstName', isPersonal: true, localPart };
  }
  
  // Firstname.lastname@domain.com or firstname_lastname@domain.com
  if (/^[a-z]+[._][a-z]+$/.test(localPart)) {
    return { type: 'firstNameLastName', isPersonal: true, localPart };
  }
  
  // Initials like jm@domain.com
  if (/^[a-z]{2,3}$/.test(localPart)) {
    return { type: 'initials', isPersonal: true, localPart };
  }
  
  return { type: 'other', isPersonal: false, localPart };
}

async function main() {
  console.log('🚀 ALYGN Find VCs for Research\n');
  console.log(`   Date: ${new Date().toISOString()}\n`);

  const vcs = await getAllVCs();

  if (vcs.length === 0) {
    console.log('⚠️  No VCs found!\n');
    return;
  }

  // Categorize VCs
  const withPersonalEmail = [];
  const withGenericEmail = [];
  const noEmail = [];
  const alreadySent = [];

  for (const vc of vcs) {
    if (vc.draftStatus === 'Sent') {
      alreadySent.push(vc);
      continue;
    }
    
    if (!vc.email) {
      noEmail.push(vc);
      continue;
    }
    
    const analysis = analyzeEmail(vc.email);
    
    if (analysis.isPersonal) {
      withPersonalEmail.push({ ...vc, emailAnalysis: analysis });
    } else {
      withGenericEmail.push({ ...vc, emailAnalysis: analysis });
    }
  }

  console.log('='.repeat(60));
  console.log('\n📊 VC ANALYSIS:\n');
  console.log(`   ✅ With personal emails: ${withPersonalEmail.length}`);
  console.log(`   ⚠️  With generic emails: ${withGenericEmail.length}`);
  console.log(`   ❌ No email: ${noEmail.length}`);
  console.log(`   📤 Already sent: ${alreadySent.length}`);
  console.log(`   📊 Total: ${vcs.length}\n`);

  // Show VCs with personal emails
  if (withPersonalEmail.length > 0) {
    console.log('='.repeat(60));
    console.log('\n✅ VCs WITH PERSONAL EMAILS (Ready to draft/send):\n');
    
    withPersonalEmail.slice(0, 10).forEach((vc, i) => {
      console.log(`${i + 1}. ${vc.name}`);
      console.log(`   ID: ${vc.id}`);
      console.log(`   Email: ${vc.email} (${vc.emailAnalysis.type})`);
      console.log(`   Partners: ${vc.partners || 'N/A'}`);
      console.log(`   Relevance Score: ${vc.relevanceScore}`);
      console.log(`   Draft Status: ${vc.draftStatus}`);
      console.log('');
    });
  }

  // Show VCs with generic emails (need research)
  if (withGenericEmail.length > 0) {
    console.log('='.repeat(60));
    console.log('\n⚠️  VCs WITH GENERIC EMAILS (Need personal email research):\n');
    
    withGenericEmail.slice(0, 10).forEach((vc, i) => {
      console.log(`${i + 1}. ${vc.name}`);
      console.log(`   ID: ${vc.id}`);
      console.log(`   Current email: ${vc.email} (${vc.emailAnalysis.type})`);
      console.log(`   Partners: ${vc.partners || 'N/A'}`);
      console.log(`   Website: ${vc.website || 'N/A'}`);
      console.log(`   Relevance Score: ${vc.relevanceScore}`);
      console.log('');
    });
  }

  // Show VCs with no email (need research)
  if (noEmail.length > 0) {
    console.log('='.repeat(60));
    console.log('\n❌ VCs WITH NO EMAIL (Need research):\n');
    
    noEmail.slice(0, 5).forEach((vc, i) => {
      console.log(`${i + 1}. ${vc.name}`);
      console.log(`   ID: ${vc.id}`);
      console.log(`   Partners: ${vc.partners || 'N/A'}`);
      console.log(`   Website: ${vc.website || 'N/A'}`);
      console.log(`   Relevance Score: ${vc.relevanceScore}`);
      console.log('');
    });
  }

  console.log('='.repeat(60) + '\n');

  // Return top 3 VCs with personal emails
  console.log('🎯 TOP 3 VCs WITH PERSONAL EMAILS:\n');
  withPersonalEmail.slice(0, 3).forEach((vc, i) => {
    console.log(`${i + 1}. ${vc.name}`);
    console.log(`   ID: ${vc.id}`);
    console.log(`   Email: ${vc.email}`);
    console.log(`   Partners: ${vc.partners || 'N/A'}`);
    console.log(`   Score: ${vc.relevanceScore}`);
    console.log('');
  });

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `${process.env.HOME}/.openclaw/workspace/reports/alygn/vc-analyze/alygn-vc-analysis-${timestamp}.json`;
  const fs = await import('fs');
  fs.writeFileSync(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: vcs.length,
      withPersonalEmail: withPersonalEmail.length,
      withGenericEmail: withGenericEmail.length,
      noEmail: noEmail.length,
      alreadySent: alreadySent.length
    },
    withPersonalEmail: withPersonalEmail.slice(0, 10),
    withGenericEmail: withGenericEmail.slice(0, 10),
    noEmail: noEmail.slice(0, 5)
  }, null, 2));
  console.log(`💾 Analysis saved to: ${outputFile}\n`);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
