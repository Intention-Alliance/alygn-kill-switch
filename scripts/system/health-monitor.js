#!/usr/bin/env node
/**
 * ALYGN Project Health Monitor
 * 
 * Monitors project health metrics and alerts on anomalies
 * Runs every 6 hours
 */

const fs = require('fs');
const path = require('path');

const DAILY_REPORTS_DIR = path.join(__dirname, '../daily-reports');
const HEALTH_LOG = path.join(__dirname, '../logs/health-monitor.log');

function checkSystemHealth() {
  console.log('🏥 ALYGN Project Health Monitor');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log('');
  
  const issues = [];
  
  // Check daily reports directory
  if (!fs.existsSync(DAILY_REPORTS_DIR)) {
    issues.push('⚠️ Daily reports directory missing');
  } else {
    const files = fs.readdirSync(DAILY_REPORTS_DIR);
    console.log(`✅ Daily reports: ${files.length} files`);
  }
  
  // Check contact tracking
  const contactTrackingDir = path.join(process.env.HOME, '.openclaw', 'workspace', 'contact-tracking');
  if (!fs.existsSync(contactTrackingDir)) {
    issues.push('⚠️ Contact tracking directory missing');
  } else {
    console.log('✅ Contact tracking: operational');
  }
  
  // Check workspace
  const workspace = path.join(process.env.HOME, '.openclaw', 'workspace');
  if (!fs.existsSync(workspace)) {
    issues.push('❌ CRITICAL: Workspace directory missing');
  } else {
    console.log('✅ Workspace: accessible');
  }
  
  // Check memory directory
  const memoryDir = path.join(workspace, 'memory');
  if (!fs.existsSync(memoryDir)) {
    issues.push('⚠️ Memory directory missing');
  } else {
    const memoryFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    console.log(`✅ Memory files: ${memoryFiles.length}`);
  }
  
  console.log('');
  
  if (issues.length === 0) {
    console.log('✅ System health: OPTIMAL');
    console.log('   All subsystems operational');
  } else {
    console.log(`⚠️ System health: ${issues.length} issue(s) detected`);
    console.log('');
    issues.forEach(issue => console.log(`   ${issue}`));
    console.log('');
    console.log('💡 Action required: Review system configuration');
  }
  
  // Log health check
  const logDir = path.dirname(HEALTH_LOG);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logEntry = `[${new Date().toISOString()}] Health check: ${issues.length === 0 ? 'OK' : 'ISSUES: ' + issues.join(', ')}\n`;
  fs.appendFileSync(HEALTH_LOG, logEntry);
}

// Main execution
try {
  checkSystemHealth();
} catch (error) {
  console.error('❌ Health monitor failed:', error.message);
  process.exit(1);
}
