#!/usr/bin/env node
/**
 * BitcashOrg Daily Activity Tracker
 * Tracks GitHub activity for bitcashorg repos and generates daily report
 * Runs at 3:45 AM to prepare summary for morning briefing
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

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
 * Check GitHub activity for bitcashorg repos
 */
async function checkGithubActivity() {
  console.log('🔧 Checking BitcashOrg GitHub activity...');
  
  const repos = [
    'bitcashorg/masterbots',
    'bitcashorg/smartsale',
    'bitcashorg/bitcash'
  ];
  
  let totalCommits = 0;
  let totalPRs = 0;
  let totalIssues = 0;
  const details = [];
  
  for (const repo of repos) {
    // Check commits in last 24h
    const commitsOutput = exec(`gh api repos/${repo}/commits?since=$(date -d '24 hours ago' -Iseconds) --jq 'length' 2>/dev/null`);
    const commits = commitsOutput ? parseInt(commitsOutput.trim()) || 0 : 0;
    
    // Check PRs updated in last 24h
    const prsOutput = exec(`gh api repos/${repo}/pulls?state=all\\&sort=updated\\&direction=desc --jq '[.[] | select(.updated_at > (now - 86400 | todate))] | length' 2>/dev/null`);
    const prs = prsOutput ? parseInt(prsOutput.trim()) || 0 : 0;
    
    // Check issues updated in last 24h
    const issuesOutput = exec(`gh api repos/${repo}/issues?state=all\\&sort=updated\\&direction=desc --jq '[.[] | select(.updated_at > (now - 86400 | todate))] | length' 2>/dev/null`);
    const issues = issuesOutput ? parseInt(issuesOutput.trim()) || 0 : 0;
    
    if (commits > 0 || prs > 0 || issues > 0) {
      details.push(`  - ${repo.split('/')[1]}: ${commits} commits, ${prs} PRs, ${issues} issues`);
    }
    
    totalCommits += commits;
    totalPRs += prs;
    totalIssues += issues;
  }
  
  console.log(`   Total commits (24h): ${totalCommits}`);
  console.log(`   Total PRs (24h): ${totalPRs}`);
  console.log(`   Total issues (24h): ${totalIssues}`);
  
  return { totalCommits, totalPRs, totalIssues, details };
}

/**
 * Check user's GitHub events for bitcashorg activity
 */
async function checkUserEvents() {
  console.log('🔧 Checking user events for bitcashorg...');
  
  const output = exec(`gh api /users/andlerrl/events --jq '[.[] | select(.repo.name | startswith("bitcashorg/")) | select(.created_at > (now - 86400 | todate))] | group_by(.type) | map({type: .[0].type, count: length})'`);
  
  if (!output) return { events: [], summary: 'No events found' };
  
  try {
    const events = JSON.parse(output);
    const summary = events.map(e => `${e.type}: ${e.count}`).join(', ');
    return { events, summary: summary || 'No recent activity' };
  } catch {
    return { events: [], summary: 'Error parsing events' };
  }
}

/**
 * Get recent commit messages
 */
async function getRecentCommitMessages() {
  const output = exec(`gh api /users/andlerrl/events --jq '[.[] | select(.type == "PushEvent") | select(.repo.name | startswith("bitcashorg/")) | .payload.commits[].message] | .[0:5]'`);
  
  if (!output) return [];
  
  try {
    return JSON.parse(output);
  } catch {
    return [];
  }
}

/**
 * Generate report
 */
async function generateReport() {
  const today = new Date().toISOString().split('T')[0];
  
  console.log(`\n📊 BitcashOrg Daily Tracker - ${today}`);
  console.log('='.repeat(50));
  
  const github = await checkGithubActivity();
  const userEvents = await checkUserEvents();
  const recentCommits = await getRecentCommitMessages();
  
  // Build report content
  let report = `📊 BitcashOrg Daily Summary - ${today}\n\n`;
  
  if (github.totalCommits > 0 || github.totalPRs > 0 || github.totalIssues > 0) {
    report += `✅ GitHub Activity (24h):\n`;
    report += `- ${github.totalCommits} commits\n`;
    report += `- ${github.totalPRs} pull requests\n`;
    report += `- ${github.totalIssues} issues\n`;
    
    if (github.details.length > 0) {
      report += `\nBy repository:\n`;
      report += github.details.join('\n') + '\n';
    }
    
    if (userEvents.summary && userEvents.summary !== 'No recent activity') {
      report += `\nEvent breakdown: ${userEvents.summary}\n`;
    }
    
    if (recentCommits.length > 0) {
      report += `\nRecent commits:\n`;
      recentCommits.forEach(msg => {
        report += `  • ${msg.substring(0, 80)}${msg.length > 80 ? '...' : ''}\n`;
      });
    }
  } else {
    report += `⚪ No GitHub activity recorded in the last 24 hours\n`;
  }
  
  // Save report
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `bitcash-${today}.txt`);
  await fs.writeFile(reportPath, report);
  
  console.log(`\n✅ Report saved to: ${reportPath}`);
  console.log('\nReport content:');
  console.log(report);
  
  return { success: true, path: reportPath, github, userEvents };
}

// Run
generateReport().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
