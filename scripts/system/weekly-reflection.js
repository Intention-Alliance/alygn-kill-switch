/**
 * ALYGN Weekly Reflection (IMPROVED)
 * 
 * Weekly project retrospective and planning
 * Runs Sunday 6:00 PM CST
 * Uses centralized logger for Notion integration
 */

import fs from "fs";
import path from "path";
import { success } from "../shared/logger.js";

const DAILY_REPORTS_DIR = path.join(process.env.HOME, '.openclaw/workspace/daily-reports');
const MEMORY_DIR = path.join(process.env.HOME, '.openclaw', 'workspace', 'memory');

function getThisWeek() {
  const dates = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today - i * 24 * 60 * 60 * 1000);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
}

async function getMemoryFiles(weekDates) {
  const files = [];
  for (const date of weekDates) {
    const filePath = path.join(MEMORY_DIR, `${date}.md`);
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

async function analyzeWeek() {
  const weekDates = getThisWeek();
  const weekMemoryFiles = await getMemoryFiles(weekDates);
  const weekEnd = weekDates[weekDates.length - 1];
  
  console.log('📝 **ALYGN Weekly Reflection**\n');
  console.log(`📅 Week ending ${weekEnd}\n`);
  
  // Count active days
  let totalDays = 0;
  const dayDetails = [];
  
  weekDates.forEach(date => {
    const reportFile = path.join(DAILY_REPORTS_DIR, `${date}-summary.txt`);
    if (fs.existsSync(reportFile)) {
      totalDays++;
      dayDetails.push(`✅ ${date}`);
    } else {
      dayDetails.push(`⚪ ${date} (no report)`);
    }
  });

  weekMemoryFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    console.log(`\n📂 Memory file: ${path.basename(file)}\n`);
    // If the memory content is too long, show the beginning and end with an ellipsis in the middle to the AI to connect the dots without losing important context
    console.log(`${content.substring(0, 500)}${content.length > 500 ? `... ${content.substring(500 > content.length - 750 ? content.length - 250 : content.length - 500)}` : ''}`);
  })
  
  const activityRate = Math.round((totalDays / 7) * 100);
  
  // Build reflection summary
  const summary = {
    weekEnd,
    activeDays: `${totalDays}/7 (${activityRate}%)`,
    wins: [
      'System automation setup completed',
      'Daily tracking operational',
      'Project monitoring active'
    ],
    improvements: [
      'Increase GitHub commit frequency',
      'More consistent Notion updates',
      'Earlier morning starts'
    ],
    nextWeek: [
      'Refine automation workflows',
      'Complete pending Alygn tasks',
      'Increase collaboration with Jacobo'
    ]
  };
  
  // Format output
  const output = `
📊 **Weekly Activity Summary:**
${dayDetails.join('\n')}

Active days: ${totalDays}/7 (${activityRate}%)

🎯 **This Week's Wins:**
${summary.wins.map(w => `- ${w}`).join('\n')}

💡 **Areas for Improvement:**
${summary.improvements.map(i => `- ${i}`).join('\n')}

📋 **Next Week's Focus:**
${summary.nextWeek.map(t => `- [ ] ${t}`).join('\n')}

🚀 Keep pushing forward!
`;

  console.log(output);
  
  // Log to Notion
  await success(
    'weekly-reflection',
    `Weekly Reflection - Week Ending ${weekEnd}`,
    `${totalDays}/7 active days (${activityRate}%)`,
    {
      weekEnd,
      activeDays: totalDays,
      activityRate: `${activityRate}%`,
      wins: summary.wins,
      improvements: summary.improvements,
      nextWeekFocus: summary.nextWeek
    }
  );
  
  return summary;
}

// Main execution
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  analyzeWeek()
    .then(() => {
      console.log('\n✅ Weekly reflection complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Weekly reflection failed:', error.message);
      process.exit(1);
    });
}

export { analyzeWeek };
