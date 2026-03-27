/**
 * AndlerRL Personal Daily Activity Tracker
 * 
 * Tracks daily activity across personal projects
 * Runs at 4:00 AM to prepare summary for morning briefing
 * Uses centralized logger for Notion integration
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { success, warning } from '../shared/logger.js';

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'daily-reports');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    return null;
  }
}

/**
 * Check GitHub activity for personal repos
 */
async function checkGithubActivity() {
  console.log('🔧 Checking GitHub activity...');

  const PERSONAL_REPOS = [
    'AndlerRL/ai-agents-server',
    'AndlerRL/ai-powered-creative-hub',
    'AndlerRL/andlerrl',
    'AndlerRL/andler-landing',
    'AndlerRL/accounting-dashboard',
    'AndlerRL/volinks-powerbank-service',
    'AndlerRL/MintMoment',
    'AndlerRL/AndlerRL-Develops-Website'
  ];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let totalCommits = 0;
  let totalPRs = 0;
  let totalIssues = 0;
  const digest = [];
  const commitsByRepo = {};

  for (const repo of PERSONAL_REPOS) {
    console.log(`\n🔍 Checking ${repo}...`);

    // Check commits in last 24h
    const commitsOutput = exec(`gh api repos/${repo}/commits?since=$(date -d '24 hours ago' -Iseconds) --jq 'length' 2>/dev/null`);
    const commits = commitsOutput ? parseInt(commitsOutput.trim()) || 0 : 0;
    
    // Check PRs updated in last 24h
    const prsOutput = exec(`gh api repos/${repo}/pulls?state=all\&sort=updated\&direction=desc --jq '[.[] | select(.updated_at > (now - 86400 | todate))] | length' 2>/dev/null`);
    const prs = prsOutput ? parseInt(prsOutput.trim()) || 0 : 0;
    
    // Check issues updated in last 24h
    const issuesOutput = exec(`gh api repos/${repo}/issues?state=all\&sort=updated\&direction=desc --jq '[.[] | select(.updated_at > (now - 86400 | todate))] | length' 2>/dev/null`);
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
 * Check memory files for recent activity
 */
async function checkMemoryActivity() {
  console.log('📝 Checking memory activity...');
  
  try {
    const files = await fs.readdir(MEMORY_DIR);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const todayFile = files.find(f => f === `${today}.md`);
    const yesterdayFile = files.find(f => f === `${yesterday}.md`);
    
    let todayEntries = 0;
    let yesterdayEntries = 0;
    
    if (todayFile) {
      const content = await fs.readFile(path.join(MEMORY_DIR, todayFile), 'utf8');
      todayEntries = content.split('\n## ').length - 1;
    }
    
    if (yesterdayFile) {
      const content = await fs.readFile(path.join(MEMORY_DIR, yesterdayFile), 'utf8');
      yesterdayEntries = content.split('\n## ').length - 1;
    }
    
    return {
      todayFile: !!todayFile,
      yesterdayFile: !!yesterdayFile,
      todayEntries,
      yesterdayEntries,
      totalFiles: files.length
    };
  } catch (error) {
    return { todayFile: false, yesterdayFile: false, todayEntries: 0, yesterdayEntries: 0, totalFiles: 0 };
  }
}

/**
 * Check daily reports
 */
async function checkDailyReports() {
  console.log('📊 Checking daily reports...');
  
  try {
    const files = await fs.readdir(REPORT_DIR);
    const today = new Date().toISOString().split('T')[0];
    const todayReport = files.find(f => f.includes(today));
    
    return {
      totalReports: files.length,
      todayReport: !!todayReport
    };
  } catch (error) {
    return { totalReports: 0, todayReport: false };
  }
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
  
  console.log('📊 **AndlerRL Personal Daily Activity Tracker**\n');
  console.log(`📅 ${today}\n`);
  
  // Collect all activity data
  const github = await checkGithubActivity();
  const memory = await checkMemoryActivity();
  const reports = await checkDailyReports();
  const contacts = await checkContactTracking();
  
  console.log('');
  
  // Build summary
  const summary = {
    date: today,
    github,
    memory,
    reports,
    contacts,
    highlights: []
  };
  
  // Determine highlights
  if (github.totalActivity > 0) {
    summary.highlights.push(...github.digest);
    const topRepo = Object.entries(github.commitsByRepo).sort((a,b) => b[1] - a[1])[0];
    if (topRepo[1] > 0) {
      summary.highlights.push(`Top repo: ${topRepo[0]} (${topRepo[1]} commits)`);
    }
  }
  
  if (memory.todayEntries > 0) {
    summary.highlights.push(`${memory.todayEntries} memory entries today`);
  }
  
  if (memory.yesterdayEntries > 0) {
    summary.highlights.push(`${memory.yesterdayEntries} memory entries yesterday`);
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
  report += `- GitHub: ${github.totalCommits} commits, ${github.totalPRs} PRs, ${github.totalIssues} issues across ${Object.keys(github.commitsByRepo).length} repos\n`;
  report += `- Memory: ${memory.todayEntries} entries today, ${memory.yesterdayEntries} yesterday\n`;
  report += `- Reports: ${reports.totalReports} total, ${reports.todayReport ? 'today generated' : 'none today'}\n`;
  report += `- Contacts: ${contacts.active ? 'Active' : 'Inactive'}\n`;
  
  console.log(report);
  
  // Save report locally
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${today}-personal-summary.txt`);
  await fs.writeFile(reportPath, report);
  
  // Log to Notion
  if (summary.highlights.length > 0) {
    await success(
      'daily-tracker',
      `Personal Daily Activity - ${today}`,
      summary.highlights.join(', '),
      summary
    );
  } else {
    await warning(
      'daily-tracker',
      `Personal Daily Activity - ${today}`,
      'No activity recorded',
      summary
    );
  }
  
  return summary;
}

// Main execution
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] === __filename) {
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

export { generateDailySummary };
