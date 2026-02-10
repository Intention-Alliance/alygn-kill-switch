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

    const activity = getRepoActivity(repo);
    const activityCount = activity.commits.length + activity.prs.length + activity.issues.length;
    totalCommits += activity.commits.length;
    totalPRs += activity.prs.length;
    totalIssues += activity.issues.length;
    commitsByRepo[repo] = activity.commits.length;
    
    if (activityCount > 0) {
      digest.push(`\n### ${repo}\n`);

      if (activity.commits.length > 0) {
        digest.push(`**Commits (${activity.commits.length}):**\n`);
        activity.commits.forEach(c => digest.push(`- ${c}\n`));
      }

      if (activity.prs.length > 0) {
        digest.push(`\n**Pull Requests (${activity.prs.length}):**\n`);
        activity.prs.forEach(pr => digest.push(`- ${pr}\n`));
      }

      if (activity.issues.length > 0) {
        digest.push(`\n**Issues (${activity.issues.length}):**\n`);
        activity.issues.forEach(issue => digest.push(`- ${issue}\n`));
      }

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
