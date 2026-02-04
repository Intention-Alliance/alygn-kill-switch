#!/usr/bin/env node

/**
 * Daily Activity Tracker & Report Generator
 * Runs at 3:30 AM to gather activity across all platforms
 * Generates summary report for 8:00 AM audio briefing
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const { getNotionKey, getNotionPage } = require('../shared/load-credentials');

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'daily-reports');

const NOTION_KEY = getNotionKey();
const NOTION_VERSION = "2022-06-28";
const ORG_TODO_PAGE_ID = getNotionPage('organizations_todos');

async function notionRequest(endpoint, method = "GET", body = null) {
  const url = `https://api.notion.com/v1/${endpoint}`;
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${NOTION_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Notion API error: ${res.status} ${await res.text()}`);
  return res.json();
}

// ===========================
// 1. SESSION ACTIVITY CHECK
// ===========================
async function checkSessionActivity() {
  console.log("📊 Checking session activity...");
  
  try {
    const result = execSync('openclaw sessions list --limit 50', { encoding: 'utf8' });
    
    // Parse sessions and check for activity in last 24h
    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
    const lines = result.split('\n').filter(l => l.trim());
    
    const recentSessions = [];
    for (const line of lines) {
      // Simple parsing - adjust based on actual output format
      if (line.includes('agent:') || line.includes('session')) {
        recentSessions.push(line);
      }
    }
    
    return {
      totalSessions: recentSessions.length,
      summary: recentSessions.slice(0, 5).join('\n')
    };
  } catch (error) {
    console.error("❌ Failed to check sessions:", error.message);
    return { totalSessions: 0, summary: "Error checking sessions" };
  }
}

// ===========================
// 2. GITHUB ACTIVITY CHECK
// ===========================
async function checkGithubActivity() {
  console.log("🔧 Checking GitHub activity...");
  
  const organizations = [
    { name: 'Intention Alliance', repos: ['intention-alliance', 'alygn'] },
    { name: 'Bitcash', repos: ['bitcash'] },
    { name: 'Personal', repos: ['openclaw-workspace', 'personal-projects'] }
  ];
  
  const activity = [];
  
  for (const org of organizations) {
    const orgActivity = {
      organization: org.name,
      commits: [],
      totalCommits: 0
    };
    
    for (const repo of org.repos) {
      try {
        // Check if repo exists locally
        const repoPath = path.join(WORKSPACE, repo);
        try {
          await fs.access(repoPath);
        } catch {
          continue; // Repo not found locally
        }
        
        // Get commits from last 24h
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const cmd = `cd ${repoPath} && git log --since="${since}" --pretty=format:"%h - %s (%an)" --all 2>/dev/null || echo "No commits"`;
        const commits = execSync(cmd, { encoding: 'utf8' }).trim();
        
        if (commits && commits !== "No commits") {
          const commitLines = commits.split('\n').filter(l => l.trim());
          orgActivity.commits.push({
            repo,
            count: commitLines.length,
            commits: commitLines
          });
          orgActivity.totalCommits += commitLines.length;
        }
      } catch (error) {
        console.warn(`⚠️  Could not check ${repo}:`, error.message);
      }
    }
    
    if (orgActivity.totalCommits > 0) {
      activity.push(orgActivity);
    }
  }
  
  return activity;
}

// ===========================
// 3. EMAIL ACTIVITY CHECK
// ===========================
async function checkEmailActivity() {
  console.log("📧 Checking email activity...");
  
  // TODO: Implement Gmail API check
  // For now, return placeholder
  return {
    inbox: {
      unread: "N/A (Gmail API pending)",
      important: []
    }
  };
}

// ===========================
// 4. UPDATE NOTION TODO
// ===========================
async function updateNotionTodos(report) {
  console.log("📝 Creating Notion daily report page...");
  
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Create a child page INSIDE the Organizations TODO Lists page
    const newPage = await notionRequest('pages', 'POST', {
      parent: {
        type: 'page_id',
        page_id: ORG_TODO_PAGE_ID
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: `📊 Daily Report - ${today}`
              }
            }
          ]
        }
      },
      children: [
        // DAY SUMMARY & NOTES SECTION
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '📝 Day Summary & Notes' } }]
          }
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji: '💡' },
            rich_text: [{
              text: {
                content: 'Add observations, ideas, important conversations, decisions made, or anything relevant that happened today. This helps track context and decide next steps.'
              }
            }],
            color: 'blue_background'
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: '• ' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: '' } }]
          }
        },
        
        // COMPLETED TODAY SECTION
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '✅ Completed Today' } }]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: true,
            rich_text: [{ text: { content: 'Morning briefing reviewed' } }]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: true,
            rich_text: [{ text: { content: `${report.sessions.totalSessions} session(s) active` } }]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: report.github.length > 0,
            rich_text: [{
              text: {
                content: report.github.length > 0
                  ? `GitHub: ${report.github.map(org => `${org.totalCommits} commit(s) in ${org.organization}`).join(', ')}`
                  : 'GitHub: No commits today'
              }
            }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: '' } }]
          }
        },
        
        // NEXT STEPS SECTION
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '🎯 Next Steps' } }]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: false,
            rich_text: [{ text: { content: 'Review and prioritize tasks from Organizations TODO Lists' } }]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: false,
            rich_text: [{ text: { content: 'Check Intention Alliance project updates' } }]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: false,
            rich_text: [{
              text: {
                content: report.email.inbox.unread !== 'N/A (Gmail API pending)'
                  ? `Respond to ${report.email.inbox.unread} unread email(s)`
                  : 'Check email inbox'
              }
            }]
          }
        },
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: false,
            rich_text: [{ text: { content: 'Review GitHub activity and plan next commits' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: '' } }]
          }
        },
        
        // ACTIVITY DETAILS SECTION
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '📊 Activity Details' } }]
          }
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📱 Session Activity' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: `Total sessions: ${report.sessions.totalSessions}` } }]
          }
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '🔧 GitHub Activity' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{
              text: {
                content: report.github.length === 0
                  ? 'No commits in the last 24 hours.'
                  : `${report.github.map(org => `${org.organization}: ${org.totalCommits} commit(s)`).join(', ')}`
              }
            }]
          }
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📧 Email Activity' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: `Unread emails: ${report.email.inbox.unread}` } }]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji: '📋' },
            rich_text: [{
              text: {
                content: `Report generated at: ${new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })} CST`
              }
            }]
          }
        }
      ]
    });
    
    console.log(`✅ Notion page created: ${newPage.url}`);
    return newPage;
  } catch (error) {
    console.error("❌ Failed to create Notion page:", error.message);
    throw error;
  }
}

// ===========================
// 5. GENERATE DAILY REPORT
// ===========================
async function generateDailyReport() {
  console.log("\n🚀 Generating Daily Report\n");
  console.log("=".repeat(50));
  
  const today = new Date().toISOString().split('T')[0];
  const reportPath = path.join(REPORT_DIR, `${today}.json`);
  const summaryPath = path.join(REPORT_DIR, `${today}-summary.txt`);
  
  // Ensure report directory exists
  await fs.mkdir(REPORT_DIR, { recursive: true });
  
  // Gather all activity
  const sessionActivity = await checkSessionActivity();
  const githubActivity = await checkGithubActivity();
  const emailActivity = await checkEmailActivity();
  
  const report = {
    date: today,
    generated: new Date().toISOString(),
    sessions: sessionActivity,
    github: githubActivity,
    email: emailActivity
  };
  
  // Save full report
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Full report saved: ${reportPath}`);
  
  // Generate human-readable summary
  let summary = `📊 Daily Activity Report - ${today}\n`;
  summary += `${"=".repeat(50)}\n\n`;
  
  // Sessions
  summary += `📱 SESSION ACTIVITY:\n`;
  summary += `  Total sessions: ${sessionActivity.totalSessions}\n`;
  if (sessionActivity.summary) {
    summary += `  Recent activity:\n${sessionActivity.summary.split('\n').map(l => `    ${l}`).join('\n')}\n`;
  }
  summary += `\n`;
  
  // GitHub
  summary += `🔧 GITHUB ACTIVITY:\n`;
  if (githubActivity.length === 0) {
    summary += `  No commits in the last 24 hours.\n`;
  } else {
    for (const org of githubActivity) {
      summary += `  ${org.organization}: ${org.totalCommits} commit(s)\n`;
      for (const repo of org.commits) {
        summary += `    📁 ${repo.repo} (${repo.count})\n`;
        for (const commit of repo.commits.slice(0, 3)) {
          summary += `      - ${commit}\n`;
        }
        if (repo.commits.length > 3) {
          summary += `      ... and ${repo.commits.length - 3} more\n`;
        }
      }
    }
  }
  summary += `\n`;
  
  // Email
  summary += `📧 EMAIL ACTIVITY:\n`;
  summary += `  Unread: ${emailActivity.inbox.unread}\n`;
  summary += `\n`;
  
  // Next steps
  summary += `🎯 SUGGESTED NEXT STEPS:\n`;
  if (githubActivity.length > 0) {
    summary += `  - Review recent commits and prepare update posts for @AndlerDev\n`;
  }
  if (sessionActivity.totalSessions > 0) {
    summary += `  - Follow up on recent session conversations\n`;
  }
  summary += `  - Check Organizations TODO list for pending items\n`;
  summary += `\n`;
  
  summary += `${"=".repeat(50)}\n`;
  summary += `Report generated at: ${new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })} CST\n`;
  
  // Save summary
  await fs.writeFile(summaryPath, summary);
  console.log(`✅ Summary saved: ${summaryPath}\n`);
  
  // Update Notion
  report.summary = summary;
  await updateNotionTodos(report);
  
  console.log("=".repeat(50));
  console.log("\n✅ Daily report generation complete!");
  
  return { report, summary, summaryPath };
}

// ===========================
// MAIN EXECUTION
// ===========================
if (require.main === module) {
  generateDailyReport()
    .then(({ summaryPath }) => {
      console.log("\n📋 Summary available at:", summaryPath);
      console.log("\n🔊 Audio briefing will be generated at 8:00 AM");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n❌ Error generating report:", error);
      process.exit(1);
    });
}

module.exports = { generateDailyReport };
