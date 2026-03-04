/**
 * Report Script - Generates daily/weekly summary reports
 * Posts to Discord or saves to file
 * 
 * Usage:
 *   node report.js --project=myproject --all-results
 *   node report.js --project=myproject --output=report.json
 */

const fs = require('fs');
const path = require('path');

const { loadProject } = require('./load-project');

/**
 * Generates summary report from all result files
 * @param {string} projectName - Project name
 * @param {Object} options - Report options
 * @returns {Object} Report object
 */
function generateReport(projectName, options = {}) {
  console.log(`📊 Generating report for ${projectName}...`);
  
  const config = loadProject(projectName);
  
  // Find all result files for this project
  const tmpDir = '/tmp';
  const resultFiles = fs.readdirSync(tmpDir)
    .filter(f => f.includes(`x-growth-${projectName}`) && f.endsWith('.json'))
    .map(f => path.join(tmpDir, f));
  
  const report = {
    generated_at: new Date().toISOString(),
    project: projectName,
    config: {
      handle: config.twitter?.handle,
      voice: config.twitter?.voice,
      topics: config.twitter?.topics
    },
    files: [],
    summary: {
      totalTrends: 0,
      totalContent: 0,
      totalPosts: 0,
      totalReplies: 0,
      totalQuotes: 0
    },
    trends: [],
    content: [],
    posts: []
  };
  
  // Load and aggregate all result files
  resultFiles.forEach(file => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      report.files.push({
        file: path.basename(file),
        type: detectFileType(data),
        timestamp: data.discovered_at || data.generated_at || data.posted_at
      });
      
      // Aggregate trends
      if (data.trends) {
        report.summary.totalTrends += data.trends.length;
        report.trends.push(...data.trends.slice(0, 5)); // Top 5 per file
      }
      
      // Aggregate content
      if (data.posts) report.summary.totalPosts += data.posts.length;
      if (data.replies) report.summary.totalReplies += data.replies.length;
      if (data.quotes) report.summary.totalQuotes += data.quotes.length;
      
      report.summary.totalContent = 
        report.summary.totalPosts + 
        report.summary.totalReplies + 
        report.summary.totalQuotes;
      
      // Store content samples
      if (data.posts) {
        report.content.push(...data.posts.slice(0, 3));
      }
    } catch (error) {
      console.warn(`⚠️  Error reading ${file}: ${error.message}`);
    }
  });
  
  console.log(`✅ Report generated from ${report.files.length} files`);
  
  return report;
}

/**
 * Detects type of result file
 */
function detectFileType(data) {
  if (data.trends) return 'trends';
  if (data.posts || data.replies || data.quotes) return 'content';
  if (data.metadata?.mock !== undefined) return 'posting-results';
  return 'unknown';
}

/**
 * Formats report for Discord
 */
function formatForDiscord(report) {
  const lines = [
    `📊 **X/Twitter Growth Report: ${report.project}**`,
    `Generated: ${new Date(report.generated_at).toLocaleString('en-CR', { timeZone: 'America/Costa_Rica' })}`,
    '',
    `**Account:** ${report.config.handle}`,
    `**Voice:** ${report.config.voice}`,
    `**Topics:** ${report.config.topics?.join(', ') || 'none'}`,
    '',
    '**Summary:**',
    `• Trends analyzed: ${report.summary.totalTrends}`,
    `• Content generated: ${report.summary.totalContent}`,
    `  - Posts: ${report.summary.totalPosts}`,
    `  - Replies: ${report.summary.totalReplies}`,
    `  - Quotes: ${report.summary.totalQuotes}`,
    '',
    `**Source files:** ${report.files.length}`
  ];
  
  // Add top trends
  if (report.trends.length > 0) {
    lines.push('', '**Top Trends:**');
    report.trends.slice(0, 3).forEach((trend, i) => {
      lines.push(`${i + 1}. ${trend.topic} (${trend.tweet_count?.toLocaleString() || 'N/A'} tweets)`);
    });
  }
  
  // Add content samples
  if (report.content.length > 0) {
    lines.push('', '**Content Samples:**');
    report.content.slice(0, 2).forEach((post, i) => {
      const preview = post.content?.substring(0, 100) || 'N/A';
      lines.push(`${i + 1}. "${preview}..."`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Saves report to file
 */
function saveReport(report, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  return report;
}

/**
 * Posts report to Discord (placeholder)
 */
async function postToDiscord(report, channelId) {
  const message = formatForDiscord(report);
  
  console.log('\n📱 Discord Message:');
  console.log(message);
  
  // In production, would POST to Discord webhook or API
  // const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  // await fetch(webhookUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ content: message })
  // });
  
  console.log('\n⚠️  Discord posting not implemented - would send to channel:', channelId);
  
  return { message, channelId };
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const projectArg = args.find(a => a.startsWith('--project='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const discordArg = args.includes('--discord');
  const allResultsArg = args.includes('--all-results');
  
  if (!projectArg) {
    console.error('Usage: node report.js --project=name [--output=report.json] [--discord] [--all-results]');
    process.exit(1);
  }
  
  const projectName = projectArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : `/tmp/x-growth-${projectName}-report.json`;
  
  try {
    const report = generateReport(projectName, { allResults: allResultsArg });
    saveReport(report, outputFile);
    
    // Print summary
    const discordMessage = formatForDiscord(report);
    console.log('\n' + discordMessage);
    
    // Post to Discord if requested
    if (discordArg) {
      const config = loadProject(projectName);
      const channelId = config.discord?.reportChannel || '1466532145257255004';
      postToDiscord(report, channelId);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  generateReport,
  formatForDiscord,
  saveReport,
  postToDiscord
};
