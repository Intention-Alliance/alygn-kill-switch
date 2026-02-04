#!/usr/bin/env node
/**
 * ALYGN Weekly Reflection
 * 
 * Weekly project retrospective and planning
 * Runs Sunday 6:00 PM CST
 */

const fs = require('fs');
const path = require('path');

const DAILY_REPORTS_DIR = path.join(__dirname, '../daily-reports');
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

function analyzeWeek() {
  const weekDates = getThisWeek();
  
  console.log('📝 ALYGN Weekly Reflection');
  console.log(`📅 Week ending ${weekDates[weekDates.length - 1]}`);
  console.log('');
  
  console.log('📊 Weekly Activity Summary:');
  
  let totalDays = 0;
  weekDates.forEach(date => {
    const reportFile = path.join(DAILY_REPORTS_DIR, `${date}-summary.txt`);
    if (fs.existsSync(reportFile)) {
      totalDays++;
      console.log(`   ✅ ${date}`);
    } else {
      console.log(`   ⚪ ${date} (no report)`);
    }
  });
  
  console.log('');
  console.log(`Active days: ${totalDays}/7`);
  console.log('');
  
  console.log('🎯 This Week\'s Wins:');
  console.log('- System automation setup completed');
  console.log('- Daily tracking operational');
  console.log('- Project monitoring active');
  console.log('');
  
  console.log('💡 Areas for Improvement:');
  console.log('- Increase GitHub commit frequency');
  console.log('- More consistent Notion updates');
  console.log('- Earlier morning starts');
  console.log('');
  
  console.log('📋 Next Week\'s Focus:');
  console.log('- [ ] Refine automation workflows');
  console.log('- [ ] Complete pending Intention Alliance tasks');
  console.log('- [ ] Increase collaboration with Jacobo');
  console.log('');
  
  console.log('🚀 Keep pushing forward, Andler!');
}

// Main execution
try {
  analyzeWeek();
} catch (error) {
  console.error('❌ Weekly reflection failed:', error.message);
  process.exit(1);
}
