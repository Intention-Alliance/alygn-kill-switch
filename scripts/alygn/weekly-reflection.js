#!/usr/bin/env node
/**
 * ALYGN Weekly Reflection (IMPROVED)
 * 
 * Weekly project retrospective and planning
 * Runs Sunday 6:00 PM CST
 * Uses centralized logger for Notion integration
 */

const fs = require('fs');
const path = require('path');
const { success } = require('../shared/logger');

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

async function analyzeWeek() {
  const weekDates = getThisWeek();
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
      'Complete pending Intention Alliance tasks',
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
if (require.main === module) {
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

module.exports = { analyzeWeek };
