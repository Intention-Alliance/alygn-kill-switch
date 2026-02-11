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

  const ALYGN_REPOS = [
    'Intention-Alliance/align-core-infra',
    'Intention-Alliance/license-app',
    'Intention-Alliance/docs',
    'Intention-Alliance/examples',
    'AndlerRL/ai-agents-server',
    'AndlerRL/ai-powered-creative-hub'
  ];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let totalCommits = 0;
  let totalPRs = 0;
  let totalIssues = 0;
  const digest = [];
  const commitsByRepo = {};

  for (const repo of ALYGN_REPOS) {
    console.log(`\n🔍 Checking ${repo}...`);

    // Check commits in last 24h
    const commitsOutput = exec(`gh api repos/${repo}/commits?since=$(date -d '24 hours ago' -Iseconds) --jq 'length' 2>/dev/null`);
    const commits = commitsOutput ? parseInt(commitsOutput.trim()) || 0 : 0;
    
    // Check PRs updated in last 24h
    const prsOutput = exec(`gh api repos/${repo}/pulls?state=all\\&sort=updated\\&direction=desc --jq '[.[] | select(.updated_at > (now - 86400 | todate))] | length' 2>/dev/null`);
    const prs = prsOutput ? parseInt(prsOutput.trim()) || 0 : 0;
    
    // Check issues updated in last 24h
    const issuesOutput = exec(`gh api repos/${repo}/issues?state=all\\&sort=updated\\&direction=desc --jq '[.[] | select(.updated_at > (now - 86400 | todate))] | length' 2>/dev/null`);
    const issues = issuesOutput ? parseInt(issuesOutput.trim()) || 0 : 0;
    
    const activityCount = commits + prs + issues;
    totalCommits += commits;
    totalPRs += prs;
    totalIssues += issues;
    commitsByRepo[repo] = commits;
    
    if (activityCount > 0) {
      digest.push(`  - ${repo.split('/')[1]}: ${commits} commits, ${prs} PRs, ${issues} issues`);
      console.log(`  ✅ ${activityCount} activities found`);
    } else {
      console.log(`  ⚪ No activity in last 24h`);
    }
  }

  return { totalCommits, totalPRs, totalIssues, commitsByRepo, digest, totalActivity: totalCommits + totalPRs + totalIssues };
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
  if (github.totalActivity > 0) {
    summary.highlights.push(github.digest);
    summary.highlights.push(`Top repo: ${Object.entries(github.commitsByRepo).sort((a,b) => b[1] - a[1])[0][0]} (${github.commitsByRepo[Object.entries(github.commitsByRepo).sort((a,b) => b[1] - a[1])[0][0]]} commits)`);
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
  report += `- GitHub: ${github.digest.join()}, between ${Object.keys(github.commitsByRepo)} repositories\n`;
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
