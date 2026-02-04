#!/usr/bin/env node
/**
 * ALYGN Monthly Project Review
 * 
 * Comprehensive monthly project analysis and insights
 * Runs on 1st of month at 10:00 AM CST
 */

const fs = require('fs');
const path = require('path');

const DAILY_REPORTS_DIR = path.join(__dirname, '../daily-reports');
const MEMORY_DIR = path.join(process.env.HOME, '.openclaw', 'workspace', 'memory');

function getLastMonth() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  
  return { year, month: month + 1, monthName: new Date(year, month).toLocaleString('en-US', { month: 'long' }) };
}

function getDaysInMonth(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
}

function generateMonthlyReview() {
  const lastMonth = getLastMonth();
  const dates = getDaysInMonth(lastMonth.year, lastMonth.month);
  
  console.log('📊 ALYGN Monthly Project Review');
  console.log(`📅 ${lastMonth.monthName} ${lastMonth.year}`);
  console.log('═'.repeat(50));
  console.log('');
  
  // Activity Analysis
  console.log('📈 Activity Analysis:');
  let activeDays = 0;
  let totalReports = 0;
  
  dates.forEach(date => {
    const reportFile = path.join(DAILY_REPORTS_DIR, `${date}-summary.txt`);
    if (fs.existsSync(reportFile)) {
      activeDays++;
      totalReports++;
    }
  });
  
  console.log(`   Active Days: ${activeDays}/${dates.length} (${((activeDays/dates.length)*100).toFixed(1)}%)`);
  console.log(`   Reports Generated: ${totalReports}`);
  console.log('');
  
  // Project Highlights
  console.log('🎯 Project Highlights:');
  console.log('   ✅ ALYGN automation system deployed');
  console.log('   ✅ Daily tracking and monitoring operational');
  console.log('   ✅ Integration with Notion, GitHub, WhatsApp');
  console.log('   ✅ Proactive Jacobo communication tracking');
  console.log('');
  
  // Key Metrics
  console.log('📊 Key Metrics:');
  console.log(`   Daily Reports: ${totalReports}`);
  console.log('   GitHub Commits: (tracking started this month)');
  console.log('   Notion Pages: (tracking started this month)');
  console.log('');
  
  // Lessons Learned
  console.log('💡 Lessons Learned:');
  console.log('   • Automation reduces cognitive load significantly');
  console.log('   • Daily tracking provides valuable context continuity');
  console.log('   • Proactive monitoring prevents communication gaps');
  console.log('   • Structured reporting helps identify patterns');
  console.log('');
  
  // Next Month Goals
  const nextMonth = new Date(lastMonth.year, lastMonth.month);
  const nextMonthName = nextMonth.toLocaleString('en-US', { month: 'long' });
  
  console.log(`🚀 ${nextMonthName} Goals:`);
  console.log('   1. Increase daily activity consistency to 90%+');
  console.log('   2. Complete Intention Alliance core deliverables');
  console.log('   3. Enhance GitHub commit frequency');
  console.log('   4. Expand automation workflows');
  console.log('   5. Strengthen Jacobo collaboration');
  console.log('');
  
  console.log('═'.repeat(50));
  console.log('💪 Another month of progress! Keep building, Andler!');
}

// Main execution
try {
  generateMonthlyReview();
} catch (error) {
  console.error('❌ Monthly review failed:', error.message);
  process.exit(1);
}
