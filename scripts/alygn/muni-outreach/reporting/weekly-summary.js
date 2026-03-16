/**
 * Weekly Summary Report Script
 * Generates progress reports for municipal outreach
 * Posts to Discord #annotations
 * 
 * Usage:
 *   node weekly-summary.js --wave=1 --region=cr
 */

import fs from "fs";
import path from "path";

/**
 * Generates weekly summary report
 * @param {Object} options - Report options
 * @returns {Object} Report object
 */
function generateWeeklySummary(options = {}) {
  const { wave = 1, region = 'cr' } = options;
  
  console.log(`📊 Generating weekly summary for Wave ${wave} (${region})...`);
  
  // Find all result files
  const tmpDir = '/tmp';
  const muniFiles = fs.readdirSync(tmpDir)
    .filter(f => f.includes(`muni-${region}`) && f.endsWith('.json'))
    .map(f => path.join(tmpDir, f));
  
  const report = {
    generated_at: new Date().toISOString(),
    wave: wave,
    region: region,
    files_analyzed: muniFiles.length,
    pipeline_status: {},
    summary: {},
    next_steps: []
  };
  
  // Load and analyze all files
  const stages = {
    discovered: 0,
    researched: 0,
    verified: 0,
    personalized: 0,
    approved: 0,
    synced: 0,
    sent: 0,
    engaged: 0
  };
  
  muniFiles.forEach(file => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const stage = detectStage(file);
      
      if (stage && data.count !== undefined) {
        stages[stage] = Math.max(stages[stage], data.count);
      }
      
      // Track specific metrics
      if (data.valid_count !== undefined) stages.verified = data.valid_count;
      if (data.ready_count !== undefined) stages.personalized = data.ready_count;
      if (data.sent !== undefined) stages.sent = data.sent;
    } catch (error) {
      console.warn(`⚠️  Error reading ${file}: ${error.message}`);
    }
  });
  
  report.pipeline_status = stages;
  
  // Calculate conversion rates
  report.summary = {
    total_discovered: stages.discovered,
    pipeline_completion: stages.discovered > 0 ? ((stages.sent / stages.discovered) * 100).toFixed(1) : 0,
    email_validity_rate: stages.discovered > 0 ? ((stages.verified / stages.discovered) * 100).toFixed(1) : 0,
    send_rate: stages.personalized > 0 ? ((stages.sent / stages.personalized) * 100).toFixed(1) : 0,
    engagement_rate: stages.sent > 0 ? ((stages.engaged / stages.sent) * 100).toFixed(1) : 0
  };
  
  // Next steps
  if (stages.discovered === 0) {
    report.next_steps.push('Run discovery phase');
  }
  if (stages.researched < stages.discovered) {
    report.next_steps.push('Complete research phase');
  }
  if (stages.verified < stages.researched) {
    report.next_steps.push('Verify emails with ZeroBounce');
  }
  if (stages.personalized < stages.verified) {
    report.next_steps.push('Generate personalized emails');
  }
  if (stages.sent < stages.approved) {
    report.next_steps.push('Send approved emails via Smartlead');
  }
  if (stages.engaged < stages.sent) {
    report.next_steps.push('Engage on X/Twitter');
  }
  
  console.log(`✅ Report generated from ${muniFiles.length} files`);
  return report;
}

/**
 * Detects pipeline stage from filename
 */
function detectStage(filename) {
  if (filename.includes('-discovered')) return 'discovered';
  if (filename.includes('-researched')) return 'researched';
  if (filename.includes('-verified')) return 'verified';
  if (filename.includes('-personalized')) return 'personalized';
  if (filename.includes('-approved')) return 'approved';
  if (filename.includes('-sync')) return 'synced';
  if (filename.includes('-sent')) return 'sent';
  if (filename.includes('-engaged')) return 'engaged';
  return null;
}

/**
 * Formats report for Discord
 */
function formatForDiscord(report) {
  const lines = [
    `🏛️ **ALYGN Municipal Outreach - Weekly Summary**`,
    `Wave ${report.wave} (${report.region.toUpperCase()})`,
    `Generated: ${new Date(report.generated_at).toLocaleString('en-CR', { timeZone: 'America/Costa_Rica' })}`,
    '',
    '**Pipeline Status:**',
    `• Discovered: ${report.pipeline_status.discovered || 0}`,
    `• Researched: ${report.pipeline_status.researched || 0}`,
    `• Verified: ${report.pipeline_status.verified || 0}`,
    `• Personalized: ${report.pipeline_status.personalized || 0}`,
    `• Approved: ${report.pipeline_status.approved || 0}`,
    `• Sent: ${report.pipeline_status.sent || 0}`,
    `• Engaged (X): ${report.pipeline_status.engaged || 0}`,
    '',
    '**Metrics:**',
    `• Pipeline completion: ${report.summary.pipeline_completion}%`,
    `• Email validity: ${report.summary.email_validity_rate}%`,
    `• Send rate: ${report.summary.send_rate}%`,
    `• Engagement rate: ${report.summary.engagement_rate}%`,
    '',
    '**Next Steps:**'
  ];
  
  if (report.next_steps.length > 0) {
    report.next_steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
  } else {
    lines.push('✅ All phases complete for this wave!');
  }
  
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`📁 Files analyzed: ${report.files_analyzed}`);
  
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
  
  // In production, would POST to Discord webhook
  console.log('\n⚠️  Discord posting not implemented - would send to:', channelId);
  
  return { message, channelId };
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const waveArg = args.find(a => a.startsWith('--wave='));
  const regionArg = args.find(a => a.startsWith('--region='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const discordArg = args.includes('--discord');
  
  const wave = waveArg ? parseInt(waveArg.split('=')[1]) : 1;
  const region = regionArg ? regionArg.split('=')[1] : 'cr';
  const outputFile = outputArg ? outputArg.split('=')[1] : `/tmp/muni-weekly-summary-${region}.json`;
  
  try {
    const report = generateWeeklySummary({ wave, region });
    saveReport(report, outputFile);
    
    // Print Discord-formatted summary
    const discordMessage = formatForDiscord(report);
    console.log('\n' + discordMessage);
    
    // Post to Discord if requested
    if (discordArg) {
      postToDiscord(report, '1466532145257255004'); // #annotations
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export {
  generateWeeklySummary,
  formatForDiscord,
  saveReport
};
