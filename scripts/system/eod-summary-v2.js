#!/usr/bin/env node
/**
 * End-of-Day Summary Generator v2
 * 
 * Creates a conversational summary of the day's activities:
 * - Analyzes today's session transcripts
 * - Reviews code commits and PR activity
 * - Summarizes memory entries and decisions
 * - Reports on automation/cron job status
 * - Identifies blockers and tomorrow's priorities
 * 
 * Output: ~/.openclaw/workspace/daily-reports/YYYY-MM-DD-eod-summary.txt
 */

import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const WORKSPACE = process.env.HOME + "/.openclaw/workspace";
const REPORT_DIR = path.join(WORKSPACE, "daily-reports");
const MEMORY_DIR = path.join(WORKSPACE, "memory");
const SESSIONS_DIR = process.env.HOME + "/.openclaw/agents/main/sessions";
const LOGS_DIR = path.join(WORKSPACE, "logs");

// Date utilities
function getToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
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

function formatTimeSpoken(hours) {
  if (hours < 1) return "less than an hour";
  if (hours === 1) return "about an hour";
  if (hours < 2) return "a couple of hours";
  if (hours < 4) return "a few hours";
  return `${Math.round(hours)} hours`;
}

/**
 * Parse today's sessions for activity summary
 */
async function parseTodaySessions() {
  const today = getToday();
  const sessions = {
    count: 0,
    totalMessages: 0,
    projects: new Set(),
    tools: new Set(),
    startTime: null,
    endTime: null,
    highlights: [],
    blockers: [],
    completedTasks: []
  };

  try {
    if (!existsSync(SESSIONS_DIR)) return sessions;

    const files = await fs.readdir(SESSIONS_DIR);
    const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('.reset.'));
    
    for (const file of sessionFiles) {
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = await fs.stat(filePath);
      const fileDate = stats.mtime.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
      
      if (fileDate !== today) continue;
      
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      
      sessions.count++;
      
      // Get session timestamp from first line
      try {
        const firstEntry = JSON.parse(lines[0]);
        if (!sessions.startTime || new Date(firstEntry.timestamp) < new Date(sessions.startTime)) {
          sessions.startTime = firstEntry.timestamp;
        }
        const lastEntry = JSON.parse(lines[lines.length - 1]);
        if (!sessions.endTime || new Date(lastEntry.timestamp) > new Date(sessions.endTime)) {
          sessions.endTime = lastEntry.timestamp;
        }
      } catch (e) {}
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // Track messages
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            sessions.totalMessages++;
            
            const text = entry.message.content?.[0]?.text || '';
            
            // Detect projects
            const textLower = text.toLowerCase();
            if (textLower.includes('alygn')) sessions.projects.add('ALYGN');
            if (textLower.includes('bitcash')) sessions.projects.add('BitcashOrg');
            if (textLower.includes('github')) sessions.projects.add('GitHub');
            if (textLower.includes('notion')) sessions.projects.add('Notion');
            if (textLower.includes('discord')) sessions.projects.add('Discord');
            
            // Track tool usage
            if (entry.message.content?.some(c => c.type === 'toolCall')) {
              sessions.tools.add('tools');
            }
            
            // Extract completions
            if (text.includes('✅') || text.includes('Created') || 
                text.includes('Updated') || text.includes('Completed') ||
                text.includes('Done!')) {
              const task = text.replace(/✅/g, '').split(/[.\n]/)[0].trim().substring(0, 80);
              if (task.length > 15 && task.length < 100) {
                sessions.completedTasks.push(task);
              }
            }
            
            // Extract blockers
            if (textLower.includes('error:') || textLower.includes('failed') ||
                textLower.includes('blocked') || textLower.includes('issue:')) {
              const blocker = text.split(/[.\n]/)[0].substring(0, 80);
              if (blocker.length > 10) sessions.blockers.push(blocker);
            }
          }
          
          // Track tool calls specifically
          if (entry.type === 'message' && entry.message?.content) {
            for (const content of entry.message.content) {
              if (content.type === 'toolCall') {
                const toolName = content.name || '';
                if (toolName) sessions.tools.add(toolName);
              }
            }
          }
        } catch (e) {}
      }
    }
  } catch (error) {
    console.error('Session parsing error:', error.message);
  }
  
  return sessions;
}

/**
 * Get GitHub activity for today
 */
async function getGitHubActivity() {
  const activity = { commits: 0, prs: [], issues: [], repos: new Set() };
  
  try {
    // Get today's PRs
    const { stdout: prsOut } = await execAsync(
      `gh search prs --author=@me --updated=$(date +%Y-%m-%d) --json title,repository,url,state --limit 20`,
      { cwd: WORKSPACE }
    );
    const prs = JSON.parse(prsOut || '[]');
    activity.prs = prs;
    prs.forEach(pr => activity.repos.add(pr.repository?.name));
    
    // Get today's issues
    const { stdout: issuesOut } = await execAsync(
      `gh search issues --author=@me --updated=$(date +%Y-%m-%d) --json title,repository,url,state --limit 20`,
      { cwd: WORKSPACE }
    );
    const issues = JSON.parse(issuesOut || '[]');
    activity.issues = issues;
    issues.forEach(issue => activity.repos.add(issue.repository?.name));
    
  } catch (error) {
    // GitHub CLI may not be available or authenticated
  }
  
  return activity;
}

/**
 * Parse today's memory file
 */
async function parseTodayMemory() {
  const today = getToday();
  const memoryPath = path.join(MEMORY_DIR, `${today}.md`);
  
  const memory = {
    hasContent: false,
    highlights: [],
    decisions: [],
    blockers: [],
    tomorrowPrep: [],
    wordCount: 0
  };
  
  try {
    if (!existsSync(memoryPath)) return memory;
    
    const content = await fs.readFile(memoryPath, 'utf8');
    memory.hasContent = true;
    memory.wordCount = content.split(/\s+/).length;
    
    const lines = content.split('\n');
    let inTomorrowSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Detect tomorrow/tomorrow section
      if (trimmed.toLowerCase().includes('tomorrow') || 
          trimmed.toLowerCase().includes('next')) {
        inTomorrowSection = true;
      }
      
      // Parse list items
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const clean = trimmed.replace(/^[-*]\s+/, '').substring(0, 120);
        
        if (inTomorrowSection) {
          memory.tomorrowPrep.push(clean);
        } else if (clean.length > 20) {
          memory.highlights.push(clean);
        }
      }
      
      // Detect decisions
      if (trimmed.includes('decided') || trimmed.includes('Decision:') ||
          trimmed.includes('agreed to') || trimmed.includes('going with')) {
        memory.decisions.push(trimmed.substring(0, 100));
      }
      
      // Detect blockers
      if (trimmed.toLowerCase().includes('blocker') || 
          trimmed.toLowerCase().includes('blocked') ||
          trimmed.toLowerCase().includes('stuck on')) {
        memory.blockers.push(trimmed.substring(0, 100));
      }
    }
  } catch (error) {
    // No memory file is OK
  }
  
  return memory;
}

/**
 * Check automation runs today
 */
async function checkAutomationRuns() {
  const today = getToday();
  const runs = { count: 0, details: [], byProject: {} };
  
  try {
    // Check logs directory
    const logDir = path.join(LOGS_DIR, today);
    if (existsSync(logDir)) {
      const files = await fs.readdir(logDir);
      runs.count = files.length;
      runs.details = files.map(f => f.replace('.md', ''));
    }
    
    // Check ALYGN reports
    const alygnDir = path.join(WORKSPACE, 'reports/alygn');
    if (existsSync(alygnDir)) {
      const subdirs = ['vc-research', 'vc-personalize', 'vc-sent', 
                       'muni-research', 'muni-personalize', 'muni-sent'];
      for (const subdir of subdirs) {
        const subdirPath = path.join(alygnDir, subdir);
        if (existsSync(subdirPath)) {
          const files = await fs.readdir(subdirPath).catch(() => []);
          const todayFiles = files.filter(f => f.includes(today));
          if (todayFiles.length > 0) {
            runs.byProject['ALYGN'] = (runs.byProject['ALYGN'] || 0) + todayFiles.length;
          }
        }
      }
    }
    
  } catch (error) {
    // Non-critical
  }
  
  return runs;
}

/**
 * Generate conversational EOD summary
 */
async function generateSummary() {
  const today = getToday();
  const tomorrow = getTomorrow();
  const dayName = getDayName(today);
  
  const [sessions, github, memory, automation] = await Promise.all([
    parseTodaySessions(),
    getGitHubActivity(),
    parseTodayMemory(),
    checkAutomationRuns()
  ]);
  
  const parts = [];
  
  // === GREETING ===
  const hour = new Date().getHours();
  let timePhrase = "evening";
  if (hour < 18) timePhrase = "afternoon";
  if (hour >= 22) timePhrase = "night";
  
  parts.push(`Good ${timePhrase}, Andler. `);
  parts.push(`Here's your end-of-day summary for ${dayName}. `);
  
  // === WORK SESSION SUMMARY ===
  if (sessions.count > 0) {
    parts.push("\n\n");
    parts.push("Work Sessions. ");
    parts.push(`You had ${sessions.count} session${sessions.count > 1 ? 's' : ''} today. `);
    
    // Calculate approximate time
    if (sessions.startTime && sessions.endTime) {
      const start = new Date(sessions.startTime);
      const end = new Date(sessions.endTime);
      const hours = (end - start) / (1000 * 60 * 60);
      if (hours > 0.5) {
        parts.push(`Active time was ${formatTimeSpoken(hours)}. `);
      }
    }
    
    // Projects worked on
    if (sessions.projects.size > 0) {
      const projectList = Array.from(sessions.projects).join(', ');
      parts.push(`Projects: ${projectList}. `);
    }
    
    // Completed tasks
    if (sessions.completedTasks.length > 0) {
      parts.push(`Notable completions: ${sessions.completedTasks.slice(0, 2).join('; ')}. `);
    }
  } else {
    parts.push("\n\n");
    parts.push("No active work sessions recorded today. ");
  }
  
  // === CODE ACTIVITY ===
  const hasCodeActivity = github.prs.length > 0 || github.issues.length > 0;
  
  if (hasCodeActivity) {
    parts.push("\n\n");
    parts.push("Code Activity. ");
    
    if (github.prs.length > 0) {
      const open = github.prs.filter(p => p.state === 'open').length;
      const closed = github.prs.filter(p => p.state === 'closed').length;
      
      if (closed > 0) {
        parts.push(`You closed ${closed} pull request${closed > 1 ? 's' : ''}. `);
      }
      if (open > 0) {
        parts.push(`${open} still open. `);
      }
    }
    
    if (github.issues.length > 0) {
      parts.push(`${github.issues.length} issue${github.issues.length > 1 ? 's' : ''} worked on. `);
    }
    
    if (github.repos.size > 0) {
      const repoList = Array.from(github.repos).slice(0, 3).join(', ');
      parts.push(`Active repos: ${repoList}. `);
    }
  }
  
  // === MEMORY & DECISIONS ===
  if (memory.hasContent) {
    parts.push("\n\n");
    parts.push("Memory & Decisions. ");
    parts.push(`You logged ${memory.wordCount} words today. `);
    
    if (memory.decisions.length > 0) {
      parts.push(`Key decision: ${memory.decisions[0].substring(0, 80)}. `);
    } else if (memory.highlights.length > 0) {
      parts.push(`Main highlight: ${memory.highlights[0].substring(0, 80)}. `);
    }
  }
  
  // === BLOCKERS ===
  const allBlockers = [...sessions.blockers, ...memory.blockers];
  if (allBlockers.length > 0) {
    parts.push("\n\n");
    parts.push("Outstanding Items. ");
    parts.push(`You have ${allBlockers.length} item${allBlockers.length > 1 ? 's' : ''} carrying over. `);
    parts.push(`The main one: ${allBlockers[0].toLowerCase().substring(0, 70)}. `);
  }
  
  // === AUTOMATION STATUS ===
  parts.push("\n\n");
  parts.push("Automation. ");
  
  if (automation.count > 0) {
    parts.push(`${automation.count} automation runs completed today. `);
    
    const alygnRuns = automation.byProject['ALYGN'] || 0;
    if (alygnRuns > 0) {
      parts.push(`ALYGN outreach processed ${alygnRuns} wave${alygnRuns > 1 ? 's' : ''}. `);
    }
  } else {
    parts.push("No automation runs today. ");
  }
  
  // === TOMORROW PREP ===
  parts.push("\n\n");
  parts.push("Tomorrow. ");
  parts.push(`${getDayName(tomorrow)} is ${formatDateSpoken(tomorrow)}. `);
  
  if (memory.tomorrowPrep.length > 0) {
    parts.push(`You noted: ${memory.tomorrowPrep[0].substring(0, 80)}. `);
  } else {
    // Generate based on context
    const suggestions = [];
    if (allBlockers.length > 0) suggestions.push("address the outstanding blockers");
    if (github.prs.filter(p => p.state === 'open').length > 0) suggestions.push("review open pull requests");
    if (!memory.hasContent) suggestions.push("update your daily memory file");
    
    if (suggestions.length > 0) {
      parts.push(`Consider: ${suggestions[0]}. `);
    } else {
      parts.push("Consider reviewing your project priorities. ");
    }
  }
  
  // === CLOSING ===
  parts.push("\n\n");
  parts.push("That's a wrap for today. ");
  
  const hourNow = new Date().getHours();
  if (hourNow >= 22) {
    parts.push("Time to rest. ");
  } else {
    parts.push("Good work. ");
  }
  
  return parts.join('');
}

/**
 * Save summary to file
 */
async function saveSummary(text, date) {
  const filePath = path.join(REPORT_DIR, `${date}-eod-summary.txt`);
  
  try {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(filePath, text, 'utf8');
    return filePath;
  } catch (err) {
    throw new Error(`Failed to save summary: ${err.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const today = getToday();
    
    console.log('🌙 Generating end-of-day summary...\n');
    
    const summary = await generateSummary();
    const filePath = await saveSummary(summary, today);
    
    console.log('='.repeat(60));
    console.log('END-OF-DAY SUMMARY');
    console.log('='.repeat(60));
    console.log(summary);
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

export { generateSummary, parseTodaySessions, getGitHubActivity };
