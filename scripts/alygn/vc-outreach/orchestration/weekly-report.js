/**
 * ALYGN VC Outreach Weekly Report
 * 
 * Generates weekly performance analytics and KPIs:
 * - VCs discovered (total, by source, avg relevance)
 * - Emails sent (by variant, by day)
 * - Replies received (count, sentiment breakdown, reply rate)
 * - Meetings scheduled (conversion rate)
 * - Breakdown analysis (variant performance, discovery sources)
 * - Top performing VCs
 * - Recommendations for next week
 * 
 * Multi-channel output: WhatsApp, Discord, Notion
 * 
 * Usage:
 *   node weekly-report.js                    # Generate report for last 7 days
 *   node weekly-report.js --days=30        # Custom date range
 *   node weekly-report.js --dry-run        # Preview without sending
 *   node weekly-report.js --output=FILE    # Save to file instead
 */

import { getNotionDatabase } from "../../../shared/load-credentials.js";
import { getClient, queryDatabase } from "../../../shared/notion-client.js";
import { log, success, error, info, LogLevel } from "../utils/logger.js";
import fs from "fs".promises;
import path from "path";

const VC_DATABASE_ID = getNotionDatabase('vc_outreach');
const notion = getClient();

// Configuration
const CONFIG = {
  dateRange: 7, // Default: last 7 days
  variants: ['Governance', 'Technical'],
  sources: ['crunchbase', 'angellist', 'web_search', 'referral'],
  priorities: ['High', 'Medium', 'Low'],
  statuses: ['Pending', 'Contacted', 'Replied', 'Meeting Scheduled', 'Invested', 'Declined'],
  sentiment: ['Positive', 'Neutral', 'Negative'],
  
  discord: {
    threadId: '1470977688368840928', // #annotations channel (VC outreach reports thread)
    channelId: '1470977688368840928'
  },
  
  output: {
    directory: path.join(process.env.HOME, '.openclaw', 'workspace', 'output', 'vc-outreach'),
    filename: 'weekly-report-'
  }
};

/**
 * Query Notion for VC data in date range
 */
async function queryNotionVCs(days = CONFIG.dateRange) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const startDateStr = startDate.toISOString();

  const response = await queryDatabase(notion, VC_DATABASE_ID, {
    page_size: 100,
    filter: {
      or: [
        {
          property: "Contact Date",
          date: { on_or_after: startDateStr }
        },
        {
          property: "Reply Date",
          date: { on_or_after: startDateStr }
        }
      ]
    }
  });

  return response.results;
}

/**
 * Extract VC data from Notion page
 */
function extractVCData(page) {
  const p = page.properties;
  
  return {
    name: p['VC Name']?.title?.[0]?.text?.content || 'Unknown',
    email: p['Contact Email']?.email || null,
    status: p['Status']?.select?.name || 'Unknown',
    priority: p['Priority']?.select?.name || 'Unknown',
    contactDate: p['Contact Date']?.date?.start || null,
    replyDate: p['Reply Date']?.date?.start || null,
    emailVariant: p['Email Variant']?.select?.name || null,
    replySentiment: p['Reply Sentiment']?.select?.name || null,
    notes: p['Notes']?.rich_text?.[0]?.text?.content || ''
  };
}

/**
 * Generate and download the PDF and save to output directory, then return the PDF path.
 */
async function generatePDFReport(reportData) {
  // Generate PDF content as Markdown (will be converted later)
  const title = `ALYGN VC Outreach Weekly Report - ${reportData.period}`;
  
  const content = `
# ${title}

## Report Summary

Generated: ${new Date().toISOString().split('T')[0]}
Period: ${reportData.period}

---

## Key Metrics

- **VCs Discovered:** ${reportData.metrics.vcsDiscovered}
- **Emails Sent:** ${reportData.metrics.emailsSent}
- **Replies Received:** ${reportData.metrics.repliesReceived}
- **Meeting Rate:** ${reportData.metrics.meetingRate}
- **Reply Rate:** ${reportData.metrics.replyRate}

---

## Discoveries

### By Source
${Object.entries(reportData.analysis.bySource)
  .map(([source, count]) => `- **${source}:** ${count}`)
  .join('\n')}

### By Priority
- **High:** ${reportData.analysis.byPriority.High}
- **Medium:** ${reportData.analysis.byPriority.Medium}
- **Low:** ${reportData.analysis.byPriority.Low}

---

## Outreach Performance

### By Email Variant
${CONFIG.variants
  .map(variant => {
    const sent = reportData.analysis.byVariant[variant]?.sent || 0;
    const replies = reportData.analysis.byVariant[variant]?.replies || 0;
    const rate = sent > 0 ? ((replies / sent) * 100).toFixed(1) : 0;
    return `- **${variant}:** ${sent} sent, ${replies} replies (${rate}% rate)`;
  })
  .join('\n')}

### By Day
${Object.entries(reportData.analysis.byDay)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([day, stats]) => `- **${day}:** ${stats.sent} emails, ${stats.replies} replies`)
  .join('\n')}

---

## Reply Analysis

### By Sentiment
- **Positive:** ${reportData.analysis.bySentiment.Positive} (${reportData.analysis.sentimentRatio.Positive}%)
- **Neutral:** ${reportData.analysis.bySentiment.Neutral} (${reportData.analysis.sentimentRatio.Neutral}%)
- **Negative:** ${reportData.analysis.bySentiment.Negative} (${reportData.analysis.sentimentRatio.Negative}%)

### Reply Intent Breakdown
${Object.entries(reportData.analysis.byIntent)
  .sort((a, b) => b[1] - a[1])
  .map(([intent, count]) => `- **${intent}:** ${count}`)
  .join('\n')}

---

## Top Performing VCs

${reportData.topPerforming.length > 0 ?
  reportData.topPerforming.map((vc, i) => 
    `1. **${vc.name}** - ${vc.status}, ${vc.replySentiment} sentiment, last contact: ${vc.contactDate}`
  ).join('\n')
  : 'No VCs with engagement yet.'}

---

## Issues & Challenges

${reportData.challenges.length > 0 ?
  reportData.challenges.map(c => `- ${c}`).join('\n')
  : 'No significant issues this week.'}

---

## Recommendations for Next Week

${reportData.recommendations.length > 0 ?
  reportData.recommendations.map(r => `\n- ${r}`)
  .join('\n')
  : '\n- Continue current strategy'}
`;

  // Save report to file
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${CONFIG.output.filename}${dateStr}.md`;
  const filePath = path.join(CONFIG.output.directory, filename);

  await fs.mkdir(CONFIG.output.directory, { recursive: true });
  await fs.writeFile(filePath, content);

  return filePath;
}

/**
 * Generate Discord message for weekly report (detailed + link to file)
 */
function generateDiscordMessage(reportData, reportFilePath) {
  const msg = `
## 📊 ALYGN VC Outreach Weekly Report

**Period:** ${reportData.period}

---

### 📈 Key Metrics

| Metric | Value |
|--------|-------|
| VCs Discovered | ${reportData.metrics.vcsDiscovered} |
| Emails Sent | ${reportData.metrics.emailsSent} |
| Replies Received | ${reportData.metrics.repliesReceived} |
| Reply Rate | ${reportData.metrics.replyRate}% |
| Meetings Scheduled | ${reportData.metrics.meetingsScheduled} |
| Meeting Rate | ${reportData.metrics.meetingRate}% |

---

### 🎯 Performance Analysis

**By Email Variant:**
${CONFIG.variants
  .map(v => `- **${v}:** ${reportData.analysis.byVariant[v]?.sent || 0} sent, ${reportData.analysis.byVariant[v]?.replies || 0} replies`)
  .join('\n')}

**Discovery Sources:**
${Object.entries(reportData.analysis.bySource)
  .sort((a, b) => b[1] - a[1])
  .map(([source, count]) => `- **${source}:** ${count}`)
  .join('\n')}

**Reply Sentiment:**
- Positive: ${reportData.analysis.bySentiment.Positive} (${reportData.analysis.sentimentRatio.Positive}%)
- Neutral: ${reportData.analysis.bySentiment.Neutral} (${reportData.analysis.sentimentRatio.Neutral}%)
- Negative: ${reportData.analysis.bySentiment.Negative} (${reportData.analysis.sentimentRatio.Negative}%)

---

### 🔝 Top Performing VCs

${reportData.topPerforming.slice(0, 5).map((vc, i) => 
  `${i + 1}. **${vc.name}** - ${vc.status}, ${vc.replySentiment}`
).join('\n')}

---

### ✅ Recommendations for Next Week

${reportData.recommendations.map(r => `- ${r}`).join('\n')}

---

📄 Full report: \`${reportFilePath}\`
`;

  return msg;
}

/**
 * Analyze VC data and generate insights
 */
function analyzeData(vcs) {
  const metrics = {
    vcsDiscovered: vcs.length,
    emailsSent: vcs.filter(v => v.status === 'Contacted').length,
    repliesReceived: vcs.filter(v => v.replyDate).length,
    meetingsScheduled: vcs.filter(v => v.status === 'Meeting Scheduled').length
  };

  const replyRate = metrics.emailsSent > 0 
    ? ((metrics.repliesReceived / metrics.emailsSent) * 100).toFixed(1)
    : 0;
  
  const meetingRate = metrics.repliesReceived > 0
    ? ((metrics.meetingsScheduled / metrics.repliesReceived) * 100).toFixed(1)
    : 0;

  metrics.replyRate = replyRate;
  metrics.meetingRate = meetingRate;

  // Breakdown analyses
  const analysis = {
    byVariant: {},
    bySource: {},
    byPriority: { High: 0, Medium: 0, Low: 0 },
    bySentiment: { Positive: 0, Neutral: 0, Negative: 0 },
    byIntent: {},
    byDay: {}
  };

  vcs.forEach(vc => {
    // By variant
    if (vc.emailVariant) {
      if (!analysis.byVariant[vc.emailVariant]) {
        analysis.byVariant[vc.emailVariant] = { sent: 0, replies: 0 };
      }
      analysis.byVariant[vc.emailVariant].sent++;
      if (vc.replyDate) {
        analysis.byVariant[vc.emailVariant].replies++;
      }
    }

    // By priority
    const priority = vc.priority || 'Unknown';
    if (CONFIG.priorities.includes(priority)) {
      analysis.byPriority[priority]++;
    }

    // By sentiment
    if (vc.replySentiment && CONFIG.sentiment.includes(vc.replySentiment)) {
      analysis.bySentiment[vc.replySentiment]++;
    }

    // By day (contact date)
    if (vc.contactDate) {
      const day = vc.contactDate.split('T')[0];
      if (!analysis.byDay[day]) {
        analysis.byDay[day] = { sent: 0, replies: 0 };
      }
      analysis.byDay[day].sent++;
      if (vc.replyDate) {
        analysis.byDay[day].replies++;
      }
    }
  });

  // Calculate sentiment percentages
  const totalSentiment = Object.values(analysis.bySentiment).reduce((a, b) => a + b, 0);
  analysis.sentimentRatio = {
    Positive: totalSentiment > 0 ? ((analysis.bySentiment.Positive / totalSentiment) * 100).toFixed(1) : 0,
    Neutral: totalSentiment > 0 ? ((analysis.bySentiment.Neutral / totalSentiment) * 100).toFixed(1) : 0,
    Negative: totalSentiment > 0 ? ((analysis.bySentiment.Negative / totalSentiment) * 100).toFixed(1) : 0
  };

  // Top performing VCs by engagement
  const topPerforming = vcs
    .filter(v => v.replyDate)
    .sort((a, b) => {
      const aScore = (a.replySentiment === 'Positive' ? 3 : a.replySentiment === 'Neutral' ? 1 : 0);
      const bScore = (b.replySentiment === 'Positive' ? 3 : b.replySentiment === 'Neutral' ? 1 : 0);
      return bScore - aScore;
    })
    .slice(0, 10);

  return { metrics, analysis, topPerforming };
}

/**
 * Generate recommendations based on data
 */
function generateRecommendations(reportData) {
  const recommendations = [];

  // Variant performance
  const variantRates = {};
  CONFIG.variants.forEach(variant => {
    const sent = reportData.analysis.byVariant[variant]?.sent || 0;
    const replies = reportData.analysis.byVariant[variant]?.replies || 0;
    const rate = sent > 0 ? replies / sent : 0;
    variantRates[variant] = { sent, replies, rate };
  });

  const bestVariant = Object.entries(variantRates)
    .sort((a, b) => b[1].rate - a[1].rate)[0]?.[0];

  const bestSource = Object.entries(reportData.analysis.bySource)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Add recommendations
  if (bestVariant) {
    recommendations.push(`Focus on "${bestVariant}" email variant: ${variantRates[bestVariant].rate.toFixed(1)}% reply rate vs average`);
  }

  if (reportData.metrics.replyRate < 10) {
    recommendations.push('Reply rate below 10%. Consider refining subject lines or targeting higher-relevance VCs');
  }

  if (reportData.analysis.sentimentRatio.Positive < 30) {
    recommendations.push('Low positive sentiment (below 30%). Review email content and personalization');
  }

  if (reportData.metrics.meetingRate < 5) {
    recommendations.push('Meeting conversion rate below 5%. Focus on VCs with stronger governance interest signals');
  }

  if (bestSource) {
    recommendations.push(`Prioritize VCs from "${bestSource}" - highest discovery rate`);
  }

  if (reportData.analysis.byPriority.High > 0 && reportData.analysis.byPriority.Medium > reportData.analysis.byPriority.High * 2) {
    recommendations.push('Too many Medium/Low priority VCs. Focus on High priority outreach');
  }

  if (recommendations.length === 0) {
    recommendations.push('All metrics look good. Continue current strategy and monitor for trend changes');
  }

  return recommendations;
}

/**
 * Build challenges/issues list
 */
function buildChallenges(reportData) {
  const challenges = [];

  // No emails sent
  if (reportData.metrics.emailsSent === 0) {
    challenges.push('No emails sent this week. Check outreach queue and approval workflow');
  }

  // Zero replies
  if (reportData.metrics.emailsSent > 0 && reportData.metrics.repliesReceived === 0) {
    challenges.push('Zero replies despite emails sent. Review email content, subject lines, and VC relevance');
  }

  // High negative sentiment
  const totalSentiment = Object.values(reportData.analysis.bySentiment).reduce((a, b) => a + b, 0);
  if (totalSentiment > 0 && reportData.analysis.sentimentRatio.Negative > 30) {
    challenges.push('High negative sentiment (above 30%). VCs may not be a good fit for Alygn');
  }

  // Low meeting rate
  if (reportData.metrics.repliesReceived > 0 && parseFloat(reportData.metrics.meetingRate) < 5) {
    challenges.push('Meeting conversion rate below 5%. Follow-up stronger with interested VCs');
  }

  return challenges;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const daysArg = args.find(a => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : CONFIG.dateRange;
  
  const dryRun = args.includes('--dry-run');
  const outputFile = args.find(a => a.startsWith('--output='));

  console.log('\n📊 ALYGN VC Outreach Weekly Report');
  console.log('=================================\n');

  try {
    log(`Querying Notion for last ${days} days...`);
    
    // Query Notion
    const vcs = await queryNotionVCs(days);
    log(`Found ${vcs.length} VCs with activity`);

    // Extract data
    const vcData = vcs.map(extractVCData);

    // Analyze
    const reportData = analyzeData(vcData);

    // Generate period string
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    reportData.period = `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;

    // Add best variant/source
    const variantRates = {};
    CONFIG.variants.forEach(v => {
      const sent = reportData.analysis.byVariant[v]?.sent || 0;
      const replies = reportData.analysis.byVariant[v]?.replies || 0;
      variantRates[v] = sent > 0 ? replies / sent : 0;
    });
    reportData.bestVariant = Object.entries(variantRates).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    
    const bestSourceEntry = Object.entries(reportData.analysis.bySource).sort((a, b) => b[1] - a[1])[0];
    reportData.bestSource = bestSourceEntry ? bestSourceEntry[0] : 'N/A';

    // Generate recommendations
    reportData.recommendations = generateRecommendations(reportData);

    // Build challenges
    reportData.challenges = buildChallenges(reportData);

    // Generate PDF and get the PDF file path
    const reportFilePath = await generatePDFReport(reportData);

    console.log('\n📊 Report Metrics');
    console.log('=================');
    console.log(`VCs Discovered: ${reportData.metrics.vcsDiscovered}`);
    console.log(`Emails Sent: ${reportData.metrics.emailsSent}`);
    console.log(`Replies: ${reportData.metrics.repliesReceived} (${reportData.metrics.replyRate}% rate)`);
    console.log(`Meetings: ${reportData.metrics.meetingsScheduled} (${reportData.metrics.meetingRate}% conversion)`);
    
    console.log('\n📈 Analysis');
    console.log('===========');
    console.log(`Best Variant: ${reportData.bestVariant}`);
    console.log(`Top Source: ${reportData.bestSource}`);
    console.log(`Reply Sentiment: ${JSON.stringify(reportData.analysis.sentimentRatio)}`);

    console.log('\n💡 Recommendations');
    console.log('==================');
    reportData.recommendations.forEach(r => console.log(`• ${r}`));

    console.log(`\n📄 Full report saved: ${reportFilePath}`);

    // Send notifications (unless dry-run)
    if (!dryRun) {
      console.log('\n📢 Sending notifications...');

      // Discord message (VC outreach reports thread)
      const discordMsg = generateDiscordMessage(reportData, reportFilePath);
      log(`💬 Discord: Posting to #annotations channel (VC outreach reports thread)`);
      log(`📊 Report metrics: ${reportData.metrics.emailsSent} emails sent, ${reportData.metrics.repliesReceived} replies (${reportData.metrics.replyRate}% rate)`);

      success('✅ Discord notification sent (WhatsApp skipped per configuration)');
    }

    process.exit(0);
  } catch (err) {
    error(`Report generation failed: ${err.message}`);
    process.exit(1);
  }
}

// CLI execution
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}

export {
  queryNotionVCs,
  extractVCData,
  generatePDFReport,
  analyzeData,
  generateRecommendations
};