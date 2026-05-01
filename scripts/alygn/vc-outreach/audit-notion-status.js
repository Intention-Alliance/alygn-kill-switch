#!/usr/bin/env node
/**
 * Audit Notion VC Database - Verify Status & Draft Fields
 * 
 * Purpose: Check all VCs for status inconsistencies, missing sent emails,
 * and incorrect draft flags before retrying deep research.
 */

import fetch from 'node-fetch';

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
  
  return {
    id: page.id,
    name: props.Name?.title?.[0]?.plain_text || 'Unknown',
    status: props.Status?.select?.name || 'Unknown',
    draftStatus: props['Draft status']?.select?.name || 'Unknown',
    contactedAt: props['Contacted At']?.date?.start || null,
    emailSent: props['Email Sent']?.checkbox || false,
    phase: props.Phase?.select?.name || 'Unknown',
    variant: props.Variant?.select?.name || 'Unknown',
    emails: props.Emails?.rich_text?.[0]?.plain_text || null,
    painPoints: props['Pain Points']?.rich_text?.[0]?.plain_text || null,
    lastResearchDate: props['Last Research Date']?.date?.start || null,
    url: page.url
  };
}

function analyzeStatus(vcs) {
  const analysis = {
    total: vcs.length,
    byStatus: {},
    byDraftStatus: {},
    inconsistencies: [],
    missingSentEmails: [],
    readyForResearch: []
  };

  vcs.forEach(vc => {
    // Count by status
    analysis.byStatus[vc.status] = (analysis.byStatus[vc.status] || 0) + 1;
    analysis.byDraftStatus[vc.draftStatus] = (analysis.byDraftStatus[vc.draftStatus] || 0) + 1;

    // Check for inconsistencies
    const issues = [];

    // Status says "Sent" but no contactedAt date
    if (vc.status === 'Sent' && !vc.contactedAt) {
      issues.push('Status=Sent but no Contacted At date');
    }

    // Status says "Sent" but emailSent checkbox is false
    if (vc.status === 'Sent' && !vc.emailSent) {
      issues.push('Status=Sent but Email Sent checkbox unchecked');
    }

    // Draft status but no emails
    if (vc.draftStatus === 'Drafted' && !vc.emails) {
      issues.push('Draft status but no emails found');
    }

    // Contacted but phase is still 1-3
    if (vc.contactedAt && ['Phase 1', 'Phase 2', 'Phase 3'].includes(vc.phase)) {
      issues.push(`Contacted but still in ${vc.phase}`);
    }

    // Email Sent checkbox true but status not "Sent"
    if (vc.emailSent && vc.status !== 'Sent') {
      issues.push(`Email Sent checked but status=${vc.status}`);
    }

    if (issues.length > 0) {
      analysis.inconsistencies.push({ ...vc, issues });
    }

    // Missing sent emails (status=Sent but not in our tracking)
    if (vc.status === 'Sent' || vc.emailSent) {
      analysis.missingSentEmails.push(vc);
    }

    // Ready for deep research
    if (['Phase 1', 'Phase 2', 'Phase 3'].includes(vc.phase) && 
        vc.status === 'Not contacted' && 
        !vc.emails) {
      analysis.readyForResearch.push(vc);
    }
  });

  return analysis;
}

function formatReport(analysis, vcs) {
  let report = `# VC Outreach Database Audit Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Database:** ${DATABASE_ID}\n\n`;

  report += `## Summary\n\n`;
  report += `- **Total VCs:** ${analysis.total}\n`;
  report += `- **Inconsistencies Found:** ${analysis.inconsistencies.length}\n`;
  report += `- **Marked as Sent:** ${analysis.missingSentEmails.length}\n`;
  report += `- **Ready for Deep Research:** ${analysis.readyForResearch.length}\n\n`;

  report += `## Status Distribution\n\n`;
  Object.entries(analysis.byStatus).forEach(([status, count]) => {
    report += `- ${status}: ${count}\n`;
  });
  report += `\n`;

  report += `## Draft Status Distribution\n\n`;
  Object.entries(analysis.byDraftStatus).forEach(([draft, count]) => {
    report += `- ${draft}: ${count}\n`;
  });
  report += `\n`;

  if (analysis.inconsistencies.length > 0) {
    report += `## ⚠️ Inconsistencies Found\n\n`;
    analysis.inconsistencies.forEach((vc, i) => {
      report += `### ${i + 1}. ${vc.name}\n`;
      report += `- **Status:** ${vc.status}\n`;
      report += `- **Draft:** ${vc.draftStatus}\n`;
      report += `- **Phase:** ${vc.phase}\n`;
      report += `- **Contacted At:** ${vc.contactedAt || 'None'}\n`;
      report += `- **Email Sent:** ${vc.emailSent}\n`;
      report += `- **Issues:**\n`;
      vc.issues.forEach(issue => {
        report += `  - ${issue}\n`;
      });
      report += `- [View in Notion](${vc.url})\n\n`;
    });
  }

  if (analysis.missingSentEmails.length > 0) {
    report += `## ✅ Already Sent Emails (${analysis.missingSentEmails.length})\n\n`;
    analysis.missingSentEmails.forEach(vc => {
      report += `- ${vc.name} (${vc.status}, ${vc.contactedAt || 'no date'})\n`;
    });
    report += `\n`;
  }

  if (analysis.readyForResearch.length > 0) {
    report += `## 🔍 Ready for Deep Research (${analysis.readyForResearch.length})\n\n`;
    analysis.readyForResearch.forEach(vc => {
      report += `- ${vc.name} - [View in Notion](${vc.url})\n`;
    });
    report += `\n`;
  }

  return report;
}

async function main() {
  console.log('🔍 Querying Notion VC database...');
  
  const data = await queryNotionDatabase();
  const vcs = data.results.map(extractVCProperties);
  
  console.log(`Found ${vcs.length} VCs in database`);
  
  const analysis = analyzeStatus(vcs);
  const report = formatReport(analysis, vcs);
  
  // Save report
  const fs = await import('fs');
  const reportPath = '/tmp/notion-vc-audit-report.md';
  fs.writeFileSync(reportPath, report);
  
  console.log(`\n📊 Audit complete. Report saved to ${reportPath}`);
  console.log(`\nKey findings:`);
  console.log(`- Inconsistencies: ${analysis.inconsistencies.length}`);
  console.log(`- Already sent: ${analysis.missingSentEmails.length}`);
  console.log(`- Ready for research: ${analysis.readyForResearch.length}`);
  
  // Output JSON for further processing
  const jsonPath = '/tmp/notion-vc-audit-data.json';
  fs.writeFileSync(jsonPath, JSON.stringify({ vcs, analysis }, null, 2));
  console.log(`- JSON data: ${jsonPath}`);
}

main().catch(console.error);
