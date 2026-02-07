#!/usr/bin/env node
/**
 * ALYGN GitHub Activity Digest
 * 
 * Generates daily GitHub activity summary for ALYGN-related repositories
 * Uses: gh CLI (already authenticated)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALYGN_REPOS = [
  // Intention Alliance org repos
  'Intention-Alliance/align-core-infra',
  'Intention-Alliance/license-app',
  'Intention-Alliance/docs',
  'Intention-Alliance/examples',
  // Your personal ALYGN-related repos
  'AndlerRL/ai-agents-server',
  'AndlerRL/ai-powered-creative-hub'
];

const OUTPUT_DIR = path.join(__dirname, '../daily-reports');

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    console.error(error.message);
    return null;
  }
}

function getRepoActivity(repo) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  // Get commits from last 24h
  const commits = exec(`gh api repos/${repo}/commits --jq '.[] | select(.commit.author.date >= "${since}") | {sha: .sha, message: .commit.message, author: .commit.author.name, date: .commit.author.date}'`);
  
  // Get PRs updated in last 24h
  const prs = exec(`gh pr list --repo ${repo} --state all --limit 50 --json number,title,state,updatedAt --jq '.[] | select(.updatedAt >= "${since}")'`);
  
  // Get issues updated in last 24h
  const issues = exec(`gh issue list --repo ${repo} --state all --limit 50 --json number,title,state,updatedAt --jq '.[] | select(.updatedAt >= "${since}")'`);
  
  return {
    repo,
    commits: commits ? commits.trim().split('\n').filter(Boolean) : [],
    prs: prs ? prs.trim().split('\n').filter(Boolean) : [],
    issues: issues ? issues.trim().split('\n').filter(Boolean) : []
  };
}

function generateDigest() {
  const timestamp = new Date().toISOString().split('T')[0];
  
  console.log('📊 ALYGN GitHub Activity Digest');
  console.log(`📅 ${timestamp}`);
  console.log('');
  
  let totalActivity = 0;
  const digest = [];
  
  for (const repo of ALYGN_REPOS) {
    console.log(`\n🔍 Checking ${repo}...`);
    
    const activity = getRepoActivity(repo);
    const activityCount = activity.commits.length + activity.prs.length + activity.issues.length;
    totalActivity += activityCount;
    
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
  
  // Save digest
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const outputFile = path.join(OUTPUT_DIR, `github-digest-${timestamp}.md`);
  
  if (totalActivity > 0) {
    const fullDigest = `# GitHub Activity Digest - ${timestamp}\n\n${digest.join('')}`;
    fs.writeFileSync(outputFile, fullDigest);
    console.log(`\n✅ Digest saved to ${outputFile}`);
    console.log(`\n📊 Total activities: ${totalActivity}`);
  } else {
    console.log('\n⚪ No GitHub activity in the last 24 hours');
  }
  
  return { totalActivity, outputFile: totalActivity > 0 ? outputFile : null };
}

// Main execution
try {
  const result = generateDigest();
  
  // Output for cron job
  if (result.totalActivity > 0) {
    console.log(`\n💻 GitHub Activity: ${result.totalActivity} updates across ALYGN repos`);
  } else {
    console.log('\n💻 No GitHub activity today - all quiet on the code front!');
  }
} catch (error) {
  console.error('❌ GitHub digest failed:', error.message);
  process.exit(1);
}
