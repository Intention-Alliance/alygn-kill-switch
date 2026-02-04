#!/usr/bin/env node
/**
 * ALYGN Monthly Review (IMPROVED)
 * 
 * Monthly project retrospective and strategic planning
 * Runs on the 1st of each month at 6:00 PM CST
 * Uses centralized logger for Notion integration
 */

const fs = require('fs');
const path = require('path');
const { success } = require('../shared/logger');

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw', 'workspace', 'memory');

function getThisMonth() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  
  const dates = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
}

function getMonthName() {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[new Date().getMonth()];
}

async function analyzeMonth() {
  const monthDates = getThisMonth();
  const monthName = getMonthName();
  const year = new Date().getFullYear();
  
  console.log('📊 **ALYGN Monthly Review**\n');
  console.log(`📅 ${monthName} ${year}\n`);
  
  // Count days with memory entries
  let activeDays = 0;
  const weeklyBreakdown = [];
  
  monthDates.forEach(date => {
    const memoryFile = path.join(MEMORY_DIR, `${date}.md`);
    if (fs.existsSync(memoryFile)) {
      activeDays++;
    }
  });
  
  const activityRate = Math.round((activeDays / monthDates.length) * 100);
  
  console.log('📊 **Monthly Activity Summary:**');
  console.log(`   Active days: ${activeDays}/${monthDates.length} (${activityRate}%)\n`);
  
  // Monthly highlights
  const highlights = {
    technical: [
      'Centralized logging system implemented',
      'Grok API integration completed',
      'Multi-org automation deployed'
    ],
    organizational: [
      'Daily tracking operational',
      'VC outreach system established',
      'Contact tracking automated'
    ],
    growth: [
      'Twitter automation with Grok',
      'Morning briefing audio system',
      'Health monitoring active'
    ]
  };
  
  console.log('🎯 **Monthly Highlights:**\n');
  console.log('**Technical Achievements:**');
  highlights.technical.forEach(h => console.log(`- ${h}`));
  console.log('');
  
  console.log('**Organizational:**');
  highlights.organizational.forEach(h => console.log(`- ${h}`));
  console.log('');
  
  console.log('**Growth Initiatives:**');
  highlights.growth.forEach(h => console.log(`- ${h}`));
  console.log('');
  
  // Strategic focus for next month
  const nextMonthFocus = [
    'Scale Twitter engagement automation',
    'Complete VC outreach with contact discovery',
    'Enhance daily briefing intelligence',
    'Implement cross-project analytics'
  ];
  
  console.log('🚀 **Next Month Focus:**');
  nextMonthFocus.forEach(f => console.log(`- [ ] ${f}`));
  console.log('');
  
  // Areas for improvement
  const improvements = [
    'Increase GitHub commit frequency',
    'More proactive Notion updates',
    'Better time allocation for deep work',
    'Strengthen Jacobo collaboration'
  ];
  
  console.log('💡 **Areas for Improvement:**');
  improvements.forEach(i => console.log(`- ${i}`));
  console.log('');
  
  const summary = {
    month: monthName,
    year,
    activeDays,
    totalDays: monthDates.length,
    activityRate: `${activityRate}%`,
    highlights,
    nextMonthFocus,
    improvements
  };
  
  // Log to Notion
  await success(
    'monthly-review',
    `Monthly Review - ${monthName} ${year}`,
    `${activeDays}/${monthDates.length} active days (${activityRate}%)`,
    summary
  );
  
  console.log('🎉 **Great month! Keep the momentum going!**\n');
  
  return summary;
}

// Main execution
if (require.main === module) {
  analyzeMonth()
    .then(() => {
      console.log('✅ Monthly review complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Monthly review failed:', error.message);
      process.exit(1);
    });
}

module.exports = { analyzeMonth };
