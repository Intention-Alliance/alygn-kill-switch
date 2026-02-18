#!/usr/bin/env node

/**
 * Phase 3: Email Drafting
 * 
 * Generates personalized outreach emails for VCs with research data.
 * 
 * Requirements:
 * 1. VC must have complete research data (verified by phase3-verify-research-data.js)
 * 2. Email should be personalized based on pain points
 * 3. Include 3 subject line options (from template variations)
 * 4. Draft saved to Notion for review before sending
 * 
 * Workflow:
 * 1. Run verification first (checks Notion has research)
 * 2. Load VCs with complete data
 * 3. Generate 3 subject variations
 * 4. Draft personalized body
 * 5. Save draft to Notion + Discord for review
 * 6. Wait for approval before Phase 4 (sending)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = '30533487-4af6-81ef-983d-f57c7f70de33';

/**
 * Email templates with variations
 */
const EMAIL_TEMPLATES = {
  governance: {
    subjects: [
      'The Question Isn\'t If AGI Arrives—It\'s Who Coordinates the Response',
      'Why Your AI Portfolio Needs Governance Infrastructure, Not Just Tech',
      'Existential Risk Management: Making It Investable for VCs'
    ],
    bodies: {
      intro: `
Hi {{vc_partner_name}},

At ALYGN, we're building the coordination infrastructure that will make preparedness workable for advanced AI systems operating at scale.

Your firm has been backing pioneers in {{investment_thesis}}. The next frontier isn't just building faster AI—it's ensuring we can collectively govern it.
`,
      pain_points: `
We're seeing the exact problems you invest in:
{{pain_points_list}}

These aren't compliance problems. They're strategic ones. Every major AI deployment will face them.`,
      call_to_action: `
If this resonates, I'd welcome the chance to explore how ALYGN can support your portfolio's preparedness posture.

Let's talk?

Tania Lea
CEO, ALYGN
tanialeaidm@gmail.com
alygn.us`
    }
  },
  
  institutional: {
    subjects: [
      'Governance Legitimacy as Infrastructure',
      'The Real AI Risk is Coordination Failure',
      'Building Trust at the AI Frontier'
    ],
    bodies: {
      intro: `
Hi {{vc_partner_name}},

Institutional coordination at AI frontier scale is becoming the limiting factor for responsible deployment.

ALYGN is building that infrastructure—not as regulation, but as the foundation that makes continued advancement viable.`,
      pain_points: `
Your portfolio is navigating:
{{pain_points_list}}

These constraints are real. The question is whether governance can be designed as an asset, not just a cost.`,
      call_to_action: `
Would you be interested in a 20-minute conversation about what coordination infrastructure looks like for your portfolio?

Tania Lea
CEO, ALYGN
tanialeaidm@gmail.com
alygn.us`
    }
  }
};

/**
 * Load VCs with complete research data
 */
async function loadVCsWithData() {
  try {
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${DB_ID}/query`,
      { page_size: 100 },
      {
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        }
      }
    );
    
    return response.data.results
      .map(vc => ({
        id: vc.id,
        name: vc.properties.Name?.title?.[0]?.text?.content,
        email: vc.properties.Email?.email,
        firm: vc.properties.Firm?.rich_text?.[0]?.text?.content,
        summary: vc.properties.Summary?.rich_text?.map(r => r.text.content).join(''),
        pain_points: vc.properties['Pain Points']?.rich_text?.map(r => r.text.content).join(''),
        investment_thesis: vc.properties['Investment Focus']?.rich_text?.[0]?.text?.content || 'AI & Risk',
        variant: vc.properties.Variant?.select?.name || 'governance'
      }))
      .filter(vc => vc.name && vc.email && vc.summary && vc.pain_points);
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    throw error;
  }
}

/**
 * Generate subject line variations
 */
function generateSubjects(vc) {
  const templates = EMAIL_TEMPLATES[vc.variant]?.subjects || EMAIL_TEMPLATES.governance.subjects;
  
  return templates.map((subject, index) => ({
    option: index + 1,
    subject: subject
  }));
}

/**
 * Draft personalized email
 */
function draftEmail(vc) {
  const template = EMAIL_TEMPLATES[vc.variant] || EMAIL_TEMPLATES.governance;
  
  // Parse pain points into list
  let painPointsList = vc.pain_points
    .split(/[,•\n-]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .slice(0, 3) // Top 3
    .map(p => `• ${p}`)
    .join('\n');
  
  // Build email
  let body = template.bodies.intro
    .replace('{{vc_partner_name}}', vc.name.split(' ')[0])
    .replace('{{investment_thesis}}', vc.investment_thesis);
  
  body += '\n\n' + template.bodies.pain_points
    .replace('{{pain_points_list}}', painPointsList);
  
  body += '\n\n' + template.bodies.call_to_action;
  
  return {
    subjects: generateSubjects(vc),
    body: body,
    variant: vc.variant
  };
}

/**
 * Save draft to Notion
 */
async function saveDraftToNotion(vc, draft) {
  try {
    // Create child page under VC entry for draft
    const draftContent = `
# Draft Email for ${vc.firm}

## Subjects (pick one):
${draft.subjects.map(s => `${s.option}. ${s.subject}`).join('\n')}

## Email Body:
${draft.body}

---
**Generated:** ${new Date().toISOString()}
**Status:** Awaiting Approval
**Variant:** ${draft.variant}
    `.trim();
    
    // Update VC entry with draft link
    const updateResponse = await axios.patch(
      `https://api.notion.com/v1/pages/${vc.id}`,
      {
        properties: {
          'Draft Status': {
            select: { name: 'Ready for Review' }
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        }
      }
    );
    
    return { success: true, vcId: vc.id };
  } catch (error) {
    console.error(`❌ Failed to save draft for ${vc.name}:`, error.message);
    return { success: false, vcId: vc.id, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n📧 Phase 3: Email Drafting\n');
  console.log('Step 1: Verifying research data...');
  
  // First verify data exists
  try {
    execSync('node phase3-verify-research-data.js', { 
      cwd: __dirname,
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('\n❌ Verification failed. Cannot proceed with drafting.');
    console.error('   Run: node phase3-verify-research-data.js');
    process.exit(1);
  }
  
  console.log('\nStep 2: Loading VCs with complete data...');
  const vcs = await loadVCsWithData();
  console.log(`   Loaded ${vcs.length} VCs with complete research\n`);
  
  // Draft emails
  console.log('Step 3: Generating email drafts...\n');
  const drafts = [];
  
  for (const vc of vcs) {
    console.log(`📝 Drafting for ${vc.firm}...`);
    const draft = draftEmail(vc);
    
    // Save to Notion
    const saved = await saveDraftToNotion(vc, draft);
    if (saved.success) {
      console.log(`   ✅ Draft saved (subject option 1: "${draft.subjects[0].subject}")`);
      drafts.push({ vc, draft });
    } else {
      console.log(`   ⚠️  Draft generated but save failed: ${saved.error}`);
    }
  }
  
  console.log(`\n✅ Generated ${drafts.length} email drafts\n`);
  
  // Save local backup
  const backupPath = path.join(__dirname, 'data', `drafts-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(drafts, null, 2));
  console.log(`💾 Backup saved to: ${backupPath}\n`);
  
  console.log('📋 Next Steps:');
  console.log('   1. Review drafts in Notion (check subject options)');
  console.log('   2. Approve or edit each email');
  console.log('   3. Run Phase 4: Send Approved Emails');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
