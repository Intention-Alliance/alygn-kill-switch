#!/usr/bin/env node
/**
 * ALYGN Daily Activity Tracker (IMPROVED)
 * 
 * Tracks daily activity across all platforms
 * Runs at 3:30 AM to prepare summary for morning briefing
 * Uses centralized logger for Notion integration
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const { success, warning } = require('../shared/logger');

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'daily-reports');

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    return null;
  }
}

/**
 * Check GitHub activity
 */
async function checkGithubActivity() {
  console.log('🔧 Checking GitHub activity...');
  
  const repos = [
    'Intention-Alliance/align-core-infra',
    'Intention-Alliance/license-app',
    'AndlerRL/ai-agents-server'
  ];
  
  let totalCommits = 0;
  const commitsByRepo = {};
  
  for (const repo of repos) {
    const output = exec(`gh api repos/${repo}/commits?since=$(date -d '24 hours ago' -Iseconds) --jq 'length'`);
    const commits = output ? parseInt(output.trim()) : 0;
    
    commitsByRepo[repo] = commits;
    totalCommits += commits;
  }
  
  console.log(`   Total commits (24h): ${totalCommits}`);
  
  return { totalCommits, commitsByRepo };
}

/**
 * Check Notion activity
 */
async function checkNotionActivity() {
  console.log('📝 Checking Notion activity...');
  
  // This would check for new pages/updates in Notion
  // For now, placeholder
  
  return { pagesUpdated: 0, newPages: 0 };
}

/**
 * Check contact tracking
 */
async function checkContactTracking() {
  console.log('👥 Checking contact tracking...');
  
  const contactDir = path.join(WORKSPACE, 'contact-tracking');
  
  try {
    await fs.access(contactDir);
    const files = await fs.readdir(contactDir);
    const today = new Date().toISOString().split('T')[0];
    const todayFile = files.find(f => f.includes(today));
    
    return {
      active: true,
      todayTracking: !!todayFile,
      totalFiles: files.length
    };
  } catch {
    return { active: false, todayTracking: false, totalFiles: 0 };
  }
}

/**
 * Generate daily summary
 */
async function generateDailySummary() {
  const today = new Date().toISOString().split('T')[0];
  
  console.log('📊 **ALYGN Daily Activity Tracker**\n');
  console.log(`📅 ${today}\n`);
  
  // Collect all activity data
  const github = await checkGithubActivity();
  const notion = await checkNotionActivity();
  const contacts = await checkContactTracking();
  
  console.log('');
  
  // Build summary
  const summary = {
    date: today,
    github,
    notion,
    contacts,
    highlights: []
  };
  
  // Determine highlights
  if (github.totalCommits > 0) {
    summary.highlights.push(`${github.totalCommits} GitHub commits`);
  }
  
  if (notion.pagesUpdated > 0) {
    summary.highlights.push(`${notion.pagesUpdated} Notion updates`);
  }
  
  if (contacts.todayTracking) {
    summary.highlights.push('Contact tracking active');
  }
  
  // Generate report
  let report = `📊 Daily Summary - ${today}\n\n`;
  
  if (summary.highlights.length > 0) {
    report += '**Highlights:**\n';
    summary.highlights.forEach(h => {
      report += `- ${h}\n`;
    });
  } else {
    report += '⚪ No activity recorded today\n';
  }
  
  report += '\n**Details:**\n';
  report += `- GitHub: ${github.totalCommits} commits\n`;
  report += `- Notion: ${notion.pagesUpdated} updates\n`;
  report += `- Contacts: ${contacts.active ? 'Active' : 'Inactive'}\n`;
  
  console.log(report);
  
  // Save report locally
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${today}-summary.txt`);
  await fs.writeFile(reportPath, report);
  
  // Log to Notion
  if (summary.highlights.length > 0) {
    await success(
      'daily-tracker',
      `Daily Activity - ${today}`,
      summary.highlights.join(', '),
      summary
    );
  } else {
    await warning(
      'daily-tracker',
      `Daily Activity - ${today}`,
      'No activity recorded',
      summary
    );
  }
  
  return summary;
}

// Main execution
if (require.main === module) {
  generateDailySummary()
    .then(summary => {
      console.log('\n✅ Daily tracker complete!');
      process.exit(summary.highlights.length > 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Daily tracker failed:', error.message);
      process.exit(1);
    });
}

module.exports = { generateDailySummary };
