#!/usr/bin/env node
/**
 * Morning Briefing Generator v2
 * 
 * Creates a natural-sounding, contextual morning briefing by:
 * - Reading yesterday's session transcripts for activity context
 * - Parsing daily reports from all projects (ALYGN, BitcashOrg, personal)
 * - Analyzing memory files for decisions and blockers
 * - Generating conversational text optimized for TTS
 * 
 * Output: ~/.openclaw/workspace/daily-reports/YYYY-MM-DD-briefing.txt
 */

import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const WORKSPACE = process.env.HOME + "/.openclaw/workspace";
const REPORT_DIR = path.join(WORKSPACE, "daily-reports");
const MEMORY_DIR = path.join(WORKSPACE, "memory");
const SESSIONS_DIR = process.env.HOME + "/.openclaw/agents/main/sessions";
const LOGS_DIR = path.join(WORKSPACE, "logs");

// Date utilities
function getToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}

function getDayName(dateStr) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

function formatDateSpoken(dateStr) {
  const date = new Date(dateStr);
  const months = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Read and parse yesterday's session transcripts
 */
async function parseYesterdaySessions() {
  const yesterday = getYesterday();
  const activities = {
    totalSessions: 0,
    totalMessages: 0,
    projects: new Set(),
    highlights: [],
    decisions: [],
    blockers: []
  };

  try {
    if (!existsSync(SESSIONS_DIR)) {
      return activities;
    }

    const files = await fs.readdir(SESSIONS_DIR);
    const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('.reset.'));
    
    for (const file of sessionFiles) {
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = await fs.stat(filePath);
      const fileDate = stats.mtime.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
      
      if (fileDate !== yesterday) continue;
      
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      
      activities.totalSessions++;
      
      let hasContent = false;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // Count messages
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            activities.totalMessages++;
            hasContent = true;
          }
          
          // Extract content from assistant messages
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            const text = entry.message.content?.[0]?.text || '';
            
            // Detect project context
            if (text.toLowerCase().includes('alygn')) activities.projects.add('ALYGN');
            if (text.toLowerCase().includes('bitcash')) activities.projects.add('BitcashOrg');
            if (text.toLowerCase().includes('github') || text.includes('git ')) activities.projects.add('GitHub');
            if (text.toLowerCase().includes('discord')) activities.projects.add('Discord');
            if (text.toLowerCase().includes('notion')) activities.projects.add('Notion');
            
            // Extract decisions (look for keywords)
            if (text.includes('decided') || text.includes('Decision:') || text.includes('going with')) {
              const decision = text.split(/[.\n]/)[0].substring(0, 100);
              if (decision.length > 20) activities.decisions.push(decision);
            }
            
            // Extract blockers
            if (text.includes('blocker') || text.includes('blocked') || text.includes('failed') || text.includes('error:')) {
              const blocker = text.split(/[.\n]/)[0].substring(0, 100);
              if (blocker.length > 10) activities.blockers.push(blocker);
            }
            
            // Extract highlights (completed actions)
            if (text.includes('✅') || text.includes('Complete') || text.includes('Created') || 
                text.includes('Updated') || text.includes('Fixed')) {
              const highlight = text.split(/[.\n]/)[0].substring(0, 80).replace(/✅/g, '').trim();
              if (highlight.length > 15 && highlight.length < 100) {
                activities.highlights.push(highlight);
              }
            }
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
    }
  } catch (error) {
    console.error('Session parsing error:', error.message);
  }
  
  return activities;
}

/**
 * Parse daily reports for all projects
 */
async function parseDailyReports(date) {
  const reports = {
    alygn: null,
    bitcash: null,
    personal: null
  };
  
  try {
    // ALYGN report
    const alygnPath = path.join(REPORT_DIR, `${date}-summary.txt`);
    if (existsSync(alygnPath)) {
      const content = await fs.readFile(alygnPath, 'utf8');
      reports.alygn = parseAlygnReport(content);
    }
    
    // Bitcash report
    const bitcashPath = path.join(REPORT_DIR, `bitcash-${date}.txt`);
    if (existsSync(bitcashPath)) {
      const content = await fs.readFile(bitcashPath, 'utf8');
      reports.bitcash = parseBitcashReport(content);
    }
    
    // Personal report
    const personalPath = path.join(REPORT_DIR, `${date}-personal-summary.txt`);
    if (existsSync(personalPath)) {
      const content = await fs.readFile(personalPath, 'utf8');
      reports.personal = parsePersonalReport(content);
    }
  } catch (error) {
    console.error('Report parsing error:', error.message);
  }
  
  return reports;
}

function parseAlygnReport(content) {
  const report = { hasActivity: false, commits: 0, prs: 0, issues: 0, notion: 0 };
  
  if (content.includes('⚪ No activity')) return report;
  
  report.hasActivity = true;
  
  const commitMatch = content.match(/(\d+)\s+commit/i);
  if (commitMatch) report.commits = parseInt(commitMatch[1]);
  
  const prMatch = content.match(/(\d+)\s+pull request/i);
  if (prMatch) report.prs = parseInt(prMatch[1]);
  
  const issueMatch = content.match(/(\d+)\s+issue/i);
  if (issueMatch) report.issues = parseInt(issueMatch[1]);
  
  const notionMatch = content.match(/Notion:\s*(\d+)/i);
  if (notionMatch) report.notion = parseInt(notionMatch[1]);
  
  // Extract repo names
  const repoMatch = content.match(/repositories?[\s:]+([^\n]+)/i);
  if (repoMatch) {
    report.repos = repoMatch[1].split(/[,\s]+/).filter(r => r && !r.includes('/'));
  }
  
  return report;
}

function parseBitcashReport(content) {
  const report = { hasActivity: false, commits: 0, prs: 0, issues: 0 };
  
  if (!content || content.includes('⚪ No activity') || content.includes('📊 BitcashOrg Daily Summary')) {
    // Parse the structured format
    const commitMatch = content.match(/(\d+)\s*commits?/i);
    if (commitMatch) report.commits = parseInt(commitMatch[1]);
    
    const prMatch = content.match(/(\d+)\s*pull requests?/i);
    if (prMatch) report.prs = parseInt(prMatch[1]);
    
    const issueMatch = content.match(/(\d+)\s*issues?/i);
    if (issueMatch) report.issues = parseInt(issueMatch[1]);
    
    report.hasActivity = report.commits > 0 || report.prs > 0 || report.issues > 0;
  }
  
  return report;
}

function parsePersonalReport(content) {
  const report = { hasActivity: false, highlights: [], memoryEntries: 0 };
  
  const memMatch = content.match(/(\d+)\s+memory entries?/i);
  if (memMatch) report.memoryEntries = parseInt(memMatch[1]);
  
  report.hasActivity = report.memoryEntries > 0;
  
  return report;
}

/**
 * Parse memory file for yesterday
 */
async function parseYesterdayMemory() {
  const yesterday = getYesterday();
  const memoryPath = path.join(MEMORY_DIR, `${yesterday}.md`);
  
  const memory = {
    hasContent: false,
    highlights: [],
    blockers: [],
    decisions: [],
    wordCount: 0
  };
  
  try {
    if (!existsSync(memoryPath)) return memory;
    
    const content = await fs.readFile(memoryPath, 'utf8');
    memory.hasContent = true;
    memory.wordCount = content.split(/\s+/).length;
    
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Extract key points
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const clean = trimmed.replace(/^[-*]\s+/, '').substring(0, 100);
        if (clean.length > 20) {
          memory.highlights.push(clean);
        }
      }
      
      // Detect blockers
      if (trimmed.toLowerCase().includes('blocker') || 
          trimmed.toLowerCase().includes('stuck') ||
          trimmed.toLowerCase().includes('issue:')) {
        memory.blockers.push(trimmed.substring(0, 100));
      }
    }
  } catch (error) {
    // No memory file is OK
  }
  
  return memory;
}

/**
 * Check automation/cron status
 */
async function checkAutomationStatus() {
  const status = {
    cronJobs: [],
    recentRuns: [],
    health: 'unknown'
  };
  
  try {
    // Check for today's log entries
    const today = getToday();
    const logDir = path.join(LOGS_DIR, today);
    
    if (existsSync(logDir)) {
      const files = await fs.readdir(logDir);
      status.cronJobs = files.map(f => f.replace('.md', ''));
    }
    
    // Check daily-reports for automation activity
    const recentBriefings = await fs.readdir(REPORT_DIR).catch(() => []);
    const todayBriefing = recentBriefings.find(f => f.includes(today) && f.includes('briefing'));
    if (todayBriefing) status.health = 'operational';
    
  } catch (error) {
    // Non-critical
  }
  
  return status;
}

/**
 * Generate conversational, TTS-optimized briefing
 */
async function generateBriefing() {
  const today = getToday();
  const yesterday = getYesterday();
  const dayName = getDayName(today);
  
  // Gather all data
  const [sessions, reports, memory, automation] = await Promise.all([
    parseYesterdaySessions(),
    parseDailyReports(yesterday),
    parseYesterdayMemory(),
    checkAutomationStatus()
  ]);
  
  const parts = [];
  
  // === GREETING ===
  const hour = new Date().getHours();
  let greeting = "Good morning";
  if (hour < 6) greeting = "Early morning";
  else if (hour > 10) greeting = "Good day";
  
  parts.push(`${greeting}, Andler. `);
  parts.push(`Today is ${dayName}, ${formatDateSpoken(today)}. `);
  parts.push(`Here's what you need to know. `);
  
  // === YESTERDAY'S ACTIVITY ===
  parts.push("\n\n");
  parts.push("Yesterday. ");
  
  // Session summary
  if (sessions.totalSessions > 0) {
    parts.push(`You had ${sessions.totalSessions} work session${sessions.totalSessions > 1 ? 's' : ''}. `);
    
    if (sessions.projects.size > 0) {
      const projectList = Array.from(sessions.projects).slice(0, 3).join(', ');
      parts.push(`Work included ${projectList}. `);
    }
  } else {
    parts.push("No active sessions recorded yesterday. ");
  }
  
  // Project activity
  const activityParts = [];
  
  if (reports.alygn?.hasActivity) {
    const alygnParts = [];
    if (reports.alygn.commits > 0) alygnParts.push(`${reports.alygn.commits} commits`);
    if (reports.alygn.prs > 0) alygnParts.push(`${reports.alygn.prs} pull requests`);
    if (alygnParts.length > 0) {
      activityParts.push(`ALYGN had ${alygnParts.join(' and ')}`);
    }
  }
  
  if (reports.bitcash?.hasActivity) {
    const bcParts = [];
    if (reports.bitcash.commits > 0) bcParts.push(`${reports.bitcash.commits} commits`);
    if (reports.bitcash.prs > 0) bcParts.push(`${reports.bitcash.prs} pull requests`);
    if (bcParts.length > 0) {
      activityParts.push(`BitcashOrg saw ${bcParts.join(' and ')}`);
    }
  }
  
  if (reports.personal?.hasActivity) {
    if (reports.personal.memoryEntries > 0) {
      activityParts.push(`you logged ${reports.personal.memoryEntries} memory entries`);
    }
  }
  
  if (activityParts.length > 0) {
    parts.push(`In terms of code activity: ${activityParts.join('; ')}. `);
  } else if (!sessions.projects.size) {
    parts.push("No significant code activity was recorded. ");
  }
  
  // Memory highlights
  if (memory.hasContent && memory.highlights.length > 0) {
    const topHighlight = memory.highlights[0];
    parts.push(`You also noted: ${topHighlight}. `);
  }
  
  // === OUTSTANDING ITEMS ===
  const blockers = [...sessions.blockers, ...memory.blockers];
  if (blockers.length > 0) {
    parts.push("\n\n");
    parts.push("Items Needing Attention. ");
    parts.push(`You have ${blockers.length} outstanding item${blockers.length > 1 ? 's' : ''} from yesterday. `);
    parts.push("The main one involves " + blockers[0].toLowerCase().replace(/^(the|a|an)\s+/i, '').substring(0, 60) + ". ");
  }
  
  // === AUTOMATION STATUS ===
  parts.push("\n\n");
  parts.push("Automation Status. ");
  
  if (automation.cronJobs.length > 0) {
    parts.push(`${automation.cronJobs.length} cron job${automation.cronJobs.length > 1 ? 's are' : ' is'} running today. `);
    parts.push("Systems are operational. ");
  } else {
    parts.push("No automation runs yet today. Systems are on standby. ");
  }
  
  // Check for ALYGN outreach status
  const alygnOutreachActive = existsSync(path.join(WORKSPACE, 'reports/alygn/vc-waves'));
  if (alygnOutreachActive) {
    parts.push("ALYGN outreach automation is active with wave-based processing. ");
  }
  
  // === TODAY'S PRIORITIES ===
  parts.push("\n\n");
  parts.push("Today. ");
  
  // Determine priorities based on activity patterns
  const priorities = [];
  
  if (!reports.alygn?.hasActivity && sessions.projects.has('ALYGN')) {
    priorities.push("Continue ALYGN work from yesterday");
  }
  
  if (!reports.bitcash?.hasActivity) {
    priorities.push("Check BitcashOrg repositories for any pending items");
  }
  
  if (blockers.length > 0) {
    priorities.push("Address the outstanding blockers from yesterday");
  }
  
  if (priorities.length === 0) {
    priorities.push("Review your calendar and set today's focus");
    priorities.push("Check for any new GitHub notifications");
  }
  
  parts.push(`Top priority: ${priorities[0]}. `);
  if (priorities.length > 1) {
    parts.push(`Also: ${priorities[1]}. `);
  }
  
  // === CLOSING ===
  parts.push("\n\n");
  parts.push("That's your briefing. ");
  parts.push("Ready when you are. ");
  
  return parts.join('');
}

/**
 * Save briefing to file
 */
async function saveBriefing(text, date) {
  const filePath = path.join(REPORT_DIR, `${date}-briefing.txt`);
  
  try {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(filePath, text, 'utf8');
    return filePath;
  } catch (err) {
    throw new Error(`Failed to save briefing: ${err.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const today = getToday();
    
    console.log('🌅 Generating morning briefing...\n');
    
    const briefing = await generateBriefing();
    const filePath = await saveBriefing(briefing, today);
    
    console.log('='.repeat(60));
    console.log('MORNING BRIEFING');
    console.log('='.repeat(60));
    console.log(briefing);
    console.log('='.repeat(60));
    console.log(`\n✅ Saved to: ${filePath}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}

export { generateBriefing, parseYesterdaySessions, parseDailyReports };
