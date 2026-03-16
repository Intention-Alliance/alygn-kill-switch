/**
 * ALYGN End-of-Day Summary
 * Runs at 9 PM to summarize the day's activities
 */

import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);
const WORKSPACE = process.env.HOME + "/.openclaw/workspace";

async function getGitHubActivity() {
  try {
    const { stdout } = await execAsync(
      `gh search prs --author=@me --updated=$(date +%Y-%m-%d) --json title,repository,url,state --limit 20`
    );
    const prs = JSON.parse(stdout || "[]");
    
    const { stdout: issuesOut } = await execAsync(
      `gh search issues --author=@me --updated=$(date +%Y-%m-%d) --json title,repository,url,state --limit 20`
    );
    const issues = JSON.parse(issuesOut || "[]");
    
    return { prs, issues };
  } catch (error) {
    console.error("GitHub activity error:", error.message);
    return { prs: [], issues: [] };
  }
}

async function getTwitterActivity() {
  try {
    const outputDir = path.join(WORKSPACE, "twitter-outputs");
    const files = await fs.readdir(outputDir);
    
    // Get today's workflow files (Costa Rica timezone)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    const todayFiles = files.filter(f => f.includes(today) && f.startsWith("workflow-"));
    
    if (todayFiles.length === 0) return null;
    
    const latestFile = todayFiles.sort().reverse()[0];
    const content = await fs.readFile(path.join(outputDir, latestFile), "utf-8");
    const workflow = JSON.parse(content);
    
    return {
      postsScheduled: workflow.posts?.length || 0,
      repliesDrafted: workflow.replies?.length || 0,
      profilesIdentified: workflow.profiles?.length || 0,
    };
  } catch (error) {
    console.error("Twitter activity error:", error.message);
    return null;
  }
}

async function checkDailyLog() {
  try {
    // Get today's date in Costa Rica timezone
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    const logPath = path.join(WORKSPACE, "memory", `${today}.md`);
    
    try {
      const content = await fs.readFile(logPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      
      // Count different types of entries
      const highlights = lines.filter(l => l.includes("✅") || l.includes("Shipped"));
      const blockers = lines.filter(l => l.includes("⚠️") || l.includes("Blocker"));
      
      return {
        totalEntries: lines.length,
        highlights: highlights.length,
        blockers: blockers.length,
      };
    } catch (readError) {
      // File doesn't exist yet - that's okay
      return null;
    }
  } catch (error) {
    console.error("Daily log error:", error.message);
    return null;
  }
}

async function generateSummary() {
  const [github, twitter, dailyLog] = await Promise.all([
    getGitHubActivity(),
    getTwitterActivity(),
    checkDailyLog(),
  ]);

  let summary = "📊 **ALYGN End-of-Day Summary**\n\n";
  
  // GitHub Activity
  if (github.prs.length > 0 || github.issues.length > 0) {
    summary += "**GitHub Activity:**\n";
    if (github.prs.length > 0) {
      summary += `• ${github.prs.length} PRs updated\n`;
      github.prs.slice(0, 3).forEach(pr => {
        summary += `  - ${pr.title} (${pr.state})\n`;
      });
    }
    if (github.issues.length > 0) {
      summary += `• ${github.issues.length} issues updated\n`;
      github.issues.slice(0, 3).forEach(issue => {
        summary += `  - ${issue.title} (${issue.state})\n`;
      });
    }
    summary += "\n";
  } else {
    summary += "**GitHub:** No activity today\n\n";
  }

  // Twitter Activity
  if (twitter) {
    summary += "**Twitter Automation:**\n";
    summary += `• ${twitter.postsScheduled} posts scheduled\n`;
    summary += `• ${twitter.repliesDrafted} replies drafted\n`;
    summary += `• ${twitter.profilesIdentified} profiles identified\n\n`;
  } else {
    summary += "**Twitter:** No automation runs today\n\n";
  }

  // Daily Log Stats
  if (dailyLog) {
    summary += "**Daily Log:**\n";
    summary += `• ${dailyLog.totalEntries} entries\n`;
    if (dailyLog.highlights > 0) summary += `• ${dailyLog.highlights} highlights ✅\n`;
    if (dailyLog.blockers > 0) summary += `• ${dailyLog.blockers} blockers ⚠️\n`;
  }

  summary += "\n---\n";
  summary += `Generated: ${new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" })}`;

  return summary;
}

async function main() {
  try {
    const summary = await generateSummary();
    
    // Output summary (OpenClaw will handle delivery to WhatsApp)
    console.log(summary);
  } catch (error) {
    console.error("❌ EOD summary failed:", error.message);
    process.exit(1);
  }
}

main();
