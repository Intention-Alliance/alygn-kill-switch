/**
 * ALYGN End-of-Day Summary
 * 
 * Daily wrap-up with accomplishments and tomorrow's prep
 * Runs at 9:00 PM CST
 */

import fs from "fs";
import path from "path";

const DAILY_REPORTS_DIR = path.join(__dirname, '../daily-reports');

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function readTodayReport() {
  const reportFile = path.join(DAILY_REPORTS_DIR, `${getToday()}-summary.txt`);
  
  if (!fs.existsSync(reportFile)) {
    return null;
  }
  
  return fs.readFileSync(reportFile, 'utf-8');
}

function generateEODSummary() {
  console.log('🌙 End-of-Day Summary');
  console.log(`📅 ${getToday()}`);
  console.log('');
  
  const todayReport = readTodayReport();
  
  if (todayReport) {
    console.log('📊 Today\'s Activity:');
    console.log(todayReport);
    console.log('');
  } else {
    console.log('⚪ No activity report available for today');
    console.log('');
  }
  
  // Tomorrow prep
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  console.log(`🌅 Tomorrow (${tomorrow}):`);
  console.log('- [ ] Morning briefing at 8:00 AM');
  console.log('- [ ] Check Notion for pending tasks');
  console.log('- [ ] Review GitHub activity');
  console.log('');
  console.log('😴 Rest well, Andler! Tomorrow\'s another productive day.');
}

// Main execution
try {
  generateEODSummary();
} catch (error) {
  console.error('❌ EOD summary failed:', error.message);
  process.exit(1);
}
