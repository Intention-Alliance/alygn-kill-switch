/**
 * Daily Summary Generator - Aggregates results from all workflow phases
 * Posts summary to Discord thread
 */

import fs from 'fs';
import path from 'path';

/**
 * Aggregates results from all phase output files
 */
function aggregateResults() {
  const phases = [
    { id: 'phase1', file: '/tmp/x-growth-phase1-result.json', name: 'Pre-approved Post' },
    { id: 'phase2', file: '/tmp/x-growth-phase2-markdown.md', name: 'Content Generation' },
    { id: 'phase3', file: '/tmp/x-growth-phase3-workflow.json', name: 'Parsed Workflow' },
    { id: 'phase5', file: '/tmp/x-growth-phase5-formatted.json', name: 'Formatted Content' },
    { id: 'phase6', file: '/tmp/x-growth-phase6-results.json', name: 'Posted Content' },
    { id: 'phase7', file: '/tmp/x-growth-phase7-trends.json', name: 'Trend Discovery' },
    { id: 'phase8', file: '/tmp/x-growth-phase8-decisions.json', name: 'Engagement Decisions' },
    { id: 'phase9', file: '/tmp/x-growth-phase9-results.json', name: 'Engagement Results' }
  ];

  const results = {
    date: new Date().toISOString(),
    phases: {}
  };

  phases.forEach(phase => {
    try {
      if (fs.existsSync(phase.file)) {
        const content = fs.readFileSync(phase.file, 'utf8');
        const ext = path.extname(phase.file);
        
        if (ext === '.json') {
          results.phases[phase.id] = {
            name: phase.name,
            status: 'success',
            data: JSON.parse(content)
          };
        } else {
          results.phases[phase.id] = {
            name: phase.name,
            status: 'success',
            preview: content.substring(0, 500) + (content.length > 500 ? '...' : '')
          };
        }
      } else {
        results.phases[phase.id] = {
          name: phase.name,
          status: 'skipped',
          reason: 'File not found'
        };
      }
    } catch (error) {
      results.phases[phase.id] = {
        name: phase.name,
        status: 'error',
        error: error.message
      };
    }
  });

  return results;
}

/**
 * Generates Discord-friendly summary message
 */
function generateDiscordSummary(results) {
  const lines = [
    '📊 **Alygn X/Twitter Daily Summary**',
    `Date: ${new Date(results.date).toLocaleString('en-CR', { timeZone: 'America/Costa_Rica' })}`,
    ''
  ];

  let postsCount = 0;
  let repliesCount = 0;
  let quotesCount = 0;
  let followsCount = 0;

  // Phase-by-phase summary
  Object.entries(results.phases).forEach(([phaseId, phase]) => {
    const statusEmoji = phase.status === 'success' ? '✅' : phase.status === 'error' ? '❌' : '⏭️';
    lines.push(`${statusEmoji} **${phase.name}**: ${phase.status}`);
    
    if (phase.status === 'success' && phase.data) {
      // Count actions from phase6 and phase9
      if (phaseId === 'phase6' && phase.data.posts) {
        postsCount += phase.data.posts.length;
      }
      if (phaseId === 'phase9') {
        if (phase.data.replies) repliesCount += phase.data.replies.length;
        if (phase.data.quotes) quotesCount += phase.data.quotes.length;
        if (phase.data.follows) followsCount += phase.data.follows.length;
      }
    }
  });

  lines.push('');
  lines.push('📈 **Activity Summary**');
  lines.push(`• Posts: ${postsCount}`);
  lines.push(`• Replies: ${repliesCount}`);
  lines.push(`• Quotes: ${quotesCount}`);
  lines.push(`• Follows: ${followsCount}`);
  lines.push(`• Total actions: ${postsCount + repliesCount + quotesCount + followsCount}`);

  return lines.join('\n');
}

/**
 * Posts summary to Discord
 */
async function postToDiscord(summary) {
  // This would use Discord webhook or API
  // For now, just output to console
  console.log(summary);
  
  // In production, would POST to Discord webhook
  // const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  // await fetch(webhookUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ content: summary })
  // });
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const results = aggregateResults();
  const summary = generateDiscordSummary(results);
  
  // Save full results to file
  const resultsFile = `/tmp/x-growth-summary-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  
  console.log(`Summary saved to ${resultsFile}`);
  console.log('');
  console.log(summary);
  
  // Post to Discord (if configured)
  // postToDiscord(summary);
}

export {
  aggregateResults,
  generateDiscordSummary,
  postToDiscord
};
