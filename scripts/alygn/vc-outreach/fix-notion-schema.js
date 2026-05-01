#!/usr/bin/env node
/**
 * Fix Notion VC Database Schema Mapping
 * 
 * Problem: Scripts expect certain property names but Notion has different ones
 * 
 * Actual Notion properties (from search):
 * - Status ✓
 * - Stage (not Phase)
 * - Draft Status (not "Draft status")
 * - Email (not Emails)
 * - Pain Points ✓
 * - Sent Date (not Contacted At)
 * - Last Contacted (alternative date field)
 * - Reply Date
 * - Name ✓
 * - Website
 * - Focus Areas
 * - Partners
 * - Geography
 * - Relevance Score
 * - Sentiment
 * - Notes
 * - ID
 * - Variant ✓
 * 
 * Missing: "Email Sent" checkbox
 */

import fetch from 'node-fetch';
import fs from 'fs';

const NOTION_KEY = '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';
const DATABASE_ID = '30533487-4af6-81ef-983d-f57c7f70de33';

async function queryNotionDatabase() {
  const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      page_size: 100
    })
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function extractVCProperties(page) {
  const props = page.properties;
  
  // Map actual Notion properties to our expected schema
  return {
    id: page.id,
    name: props.Name?.title?.[0]?.plain_text || 'Unknown',
    status: props.Status?.select?.name || 'Unknown',
    stage: props.Stage?.select?.name || props.Phase?.select?.name || 'Unknown',
    draftStatus: props['Draft Status']?.select?.name || props['Draft status']?.select?.name || 'Unknown',
    variant: props.Variant?.select?.name || 'Unknown',
    email: props.Email?.rich_text?.[0]?.plain_text || props.Emails?.rich_text?.[0]?.plain_text || null,
    painPoints: props['Pain Points']?.rich_text?.[0]?.plain_text || null,
    contactedAt: props['Sent Date']?.date?.start || props['Last Contacted']?.date?.start || props['Contacted At']?.date?.start || null,
    replyDate: props['Reply Date']?.date?.start || null,
    emailSent: props['Email Sent']?.checkbox || (props.Status?.select?.name === 'Sent'),
    sentiment: props.Sentiment?.select?.name || 'Unknown',
    relevanceScore: props['Relevance Score']?.number || null,
    website: props.Website?.url || null,
    focusAreas: props['Focus Areas']?.multi_select?.map(s => s.name) || [],
    partners: props.Partners?.rich_text?.[0]?.plain_text || null,
    geography: props.Geography?.select?.name || null,
    notes: props.Notes?.rich_text?.[0]?.plain_text || null,
    url: page.url
  };
}

function analyzeVCs(vcs) {
  const analysis = {
    total: vcs.length,
    byStatus: {},
    byStage: {},
    withEmails: 0,
    withoutEmails: 0,
    withPainPoints: 0,
    withoutPainPoints: 0,
    contacted: [],
    readyForResearch: [],
    needEmailVerification: [],
    inconsistencies: []
  };

  vcs.forEach(vc => {
    // Count by status
    analysis.byStatus[vc.status] = (analysis.byStatus[vc.status] || 0) + 1;
    analysis.byStage[vc.stage] = (analysis.byStage[vc.stage] || 0) + 1;

    // Count emails
    if (vc.email) {
      analysis.withEmails++;
    } else {
      analysis.withoutEmails++;
    }

    // Count pain points
    if (vc.painPoints) {
      analysis.withPainPoints++;
    } else {
      analysis.withoutPainPoints++;
    }

    // Already contacted
    if (['Sent', 'Contacted', 'Reply received'].includes(vc.status)) {
      analysis.contacted.push(vc);
    }

    // Ready for deep research (no email, no pain points, not invalid/failed)
    if (!vc.email && !vc.painPoints && 
        !['Invalid email', 'Failed', 'Not a fit'].includes(vc.status)) {
      analysis.readyForResearch.push(vc);
    }

    // Need email verification (has email but not contacted)
    if (vc.email && !['Sent', 'Contacted', 'Reply received'].includes(vc.status)) {
      analysis.needEmailVerification.push(vc);
    }

    // Inconsistencies
    const issues = [];
    if (vc.status === 'Sent' && !vc.contactedAt) {
      issues.push('Status=Sent but no date');
    }
    if (vc.status === 'Contacted' && !vc.contactedAt) {
      issues.push('Status=Contacted but no date');
    }
    if (issues.length > 0) {
      analysis.inconsistencies.push({ ...vc, issues });
    }
  });

  return analysis;
}

function formatReport(analysis) {
  let report = `# VC Database Schema Analysis & Fix Plan\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Database:** ${DATABASE_ID}\n\n`;

  report += `## Summary\n\n`;
  report += `- **Total VCs:** ${analysis.total}\n`;
  report += `- **With Emails:** ${analysis.withEmails} (${(analysis.withEmails/analysis.total*100).toFixed(1)}%)\n`;
  report += `- **Without Emails:** ${analysis.withoutEmails} (${(analysis.withoutEmails/analysis.total*100).toFixed(1)}%)\n`;
  report += `- **With Pain Points:** ${analysis.withPainPoints}\n`;
  report += `- **Already Contacted:** ${analysis.contacted.length}\n`;
  report += `- **Ready for Deep Research:** ${analysis.readyForResearch.length}\n`;
  report += `- **Need Email Verification:** ${analysis.needEmailVerification.length}\n\n`;

  report += `## Status Distribution\n\n`;
  Object.entries(analysis.byStatus).forEach(([status, count]) => {
    report += `- ${status}: ${count}\n`;
  });
  report += `\n`;

  report += `## Stage Distribution\n\n`;
  Object.entries(analysis.byStage).forEach(([stage, count]) => {
    report += `- ${stage}: ${count}\n`;
  });
  report += `\n`;

  if (analysis.contacted.length > 0) {
    report += `## ✅ Already Contacted (${analysis.contacted.length})\n\n`;
    analysis.contacted.forEach(vc => {
      report += `- ${vc.name} (${vc.status}, ${vc.contactedAt || 'no date'}, email: ${vc.email || 'none'})\n`;
    });
    report += `\n`;
  }

  if (analysis.readyForResearch.length > 0) {
    report += `## 🔍 Ready for Deep Research (${analysis.readyForResearch.length})\n\n`;
    report += `These VCs need email discovery + pain points research:\n\n`;
    analysis.readyForResearch.slice(0, 20).forEach(vc => {
      report += `- ${vc.name} (${vc.status}) - [Notion](${vc.url})\n`;
    });
    if (analysis.readyForResearch.length > 20) {
      report += `\n_... and ${analysis.readyForResearch.length - 20} more_\n`;
    }
    report += `\n`;
  }

  if (analysis.needEmailVerification.length > 0) {
    report += `## ✉️ Need Email Verification (${analysis.needEmailVerification.length})\n\n`;
    report += `These have emails but aren't marked as contacted:\n\n`;
    analysis.needEmailVerification.slice(0, 15).forEach(vc => {
      report += `- ${vc.name}: ${vc.email} (${vc.status})\n`;
    });
    if (analysis.needEmailVerification.length > 15) {
      report += `\n_... and ${analysis.needEmailVerification.length - 15} more_\n`;
    }
    report += `\n`;
  }

  if (analysis.inconsistencies.length > 0) {
    report += `## ⚠️ Inconsistencies (${analysis.inconsistencies.length})\n\n`;
    analysis.inconsistencies.forEach(vc => {
      report += `- ${vc.name}: ${vc.issues.join(', ')}\n`;
    });
    report += `\n`;
  }

  report += `## 📋 Property Mapping (for script updates)\n\n`;
  report += `\`\`\`javascript\n`;
  report += `// Script expects → Notion actual\n`;
  report += `\`Phase\` → \`Stage\`\n`;
  report += `\`Draft status\` → \`Draft Status\`\n`;
  report += `\`Emails\` → \`Email\`\n`;
  report += `\`Contacted At\` → \`Sent Date\` or \`Last Contacted\`\n`;
  report += `\`Email Sent\` → MISSING (need to add checkbox or infer from Status)\n`;
  report += `\`\`\`\n\n`;

  report += `## 🔧 Recommended Actions\n\n`;
  report += `1. **Update scripts** to use correct property names\n`;
  report += `2. **Run deep research** on ${analysis.readyForResearch.length} VCs without emails\n`;
  report += `3. **Verify emails** for ${analysis.needEmailVerification.length} VCs\n`;
  report += `4. **Fix inconsistencies** for ${analysis.inconsistencies.length} VCs\n`;
  report += `5. **Add "Email Sent" checkbox** to Notion database (optional)\n`;

  return report;
}

async function main() {
  console.log('🔍 Querying Notion VC database...');
  
  const data = await queryNotionDatabase();
  const vcs = data.results.map(extractVCProperties);
  
  console.log(`Found ${vcs.length} VCs in database`);
  
  const analysis = analyzeVCs(vcs);
  const report = formatReport(analysis);
  
  // Save report
  const reportPath = '/tmp/notion-vc-schema-analysis.md';
  fs.writeFileSync(reportPath, report);
  
  // Save JSON data
  const jsonPath = '/tmp/notion-vc-full-data.json';
  fs.writeFileSync(jsonPath, JSON.stringify({ vcs, analysis }, null, 2));
  
  console.log(`\n📊 Analysis complete:`);
  console.log(`- Report: ${reportPath}`);
  console.log(`- JSON data: ${jsonPath}`);
  console.log(`\nKey findings:`);
  console.log(`- With emails: ${analysis.withEmails}`);
  console.log(`- Without emails (need research): ${analysis.withoutEmails}`);
  console.log(`- Already contacted: ${analysis.contacted.length}`);
  console.log(`- Ready for deep research: ${analysis.readyForResearch.length}`);
}

main().catch(console.error);
