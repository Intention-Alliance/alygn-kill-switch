#!/usr/bin/env node
/**
 * ALYGN Project Health Monitor (IMPROVED)
 * 
 * Monitors project health metrics and alerts on anomalies
 * Runs every 6 hours
 * Uses centralized logger for Notion integration
 */

const fs = require('fs');
const path = require('path');
const { success, warning } = require('../shared/logger');

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const DAILY_REPORTS_DIR = path.join(WORKSPACE, 'daily-reports');

async function checkSystemHealth() {
  console.log('🏥 **ALYGN Project Health Monitor**\n');
  console.log(`📅 ${new Date().toISOString()}\n`);
  
  const issues = [];
  const checks = {
    dailyReports: false,
    contactTracking: false,
    workspace: false,
    memory: false,
    logs: false
  };
  
  // Check daily reports directory
  if (!fs.existsSync(DAILY_REPORTS_DIR)) {
    issues.push('⚠️ Daily reports directory missing');
  } else {
    const files = fs.readdirSync(DAILY_REPORTS_DIR);
    console.log(`✅ Daily reports: ${files.length} files`);
    checks.dailyReports = true;
  }
  
  // Check contact tracking
  const contactTrackingDir = path.join(WORKSPACE, 'contact-tracking');
  if (!fs.existsSync(contactTrackingDir)) {
    issues.push('⚠️ Contact tracking directory missing');
  } else {
    console.log('✅ Contact tracking: operational');
    checks.contactTracking = true;
  }
  
  // Check workspace
  if (!fs.existsSync(WORKSPACE)) {
    issues.push('❌ CRITICAL: Workspace directory missing');
  } else {
    console.log('✅ Workspace: accessible');
    checks.workspace = true;
  }
  
  // Check memory directory
  const memoryDir = path.join(WORKSPACE, 'memory');
  if (!fs.existsSync(memoryDir)) {
    issues.push('⚠️ Memory directory missing');
  } else {
    const memoryFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    console.log(`✅ Memory files: ${memoryFiles.length}`);
    checks.memory = true;
  }
  
  // Check logs directory
  const logsDir = path.join(WORKSPACE, 'logs');
  if (!fs.existsSync(logsDir)) {
    issues.push('⚠️ Logs directory missing');
  } else {
    console.log('✅ Logs: operational');
    checks.logs = true;
  }
  
  console.log('');
  
  const healthStatus = issues.length === 0 ? 'OPTIMAL' : `${issues.length} ISSUES`;
  
  if (issues.length === 0) {
    console.log('✅ System health: OPTIMAL');
    console.log('   All subsystems operational\n');
    
    await success(
      'health-monitor',
      'System Health Check - All Systems Operational',
      'No issues detected',
      checks
    );
  } else {
    console.log(`⚠️ System health: ${issues.length} issue(s) detected\n`);
    issues.forEach(issue => console.log(`   ${issue}`));
    console.log('\n💡 Action required: Review system configuration\n');
    
    await warning(
      'health-monitor',
      `System Health Check - ${issues.length} Issues Detected`,
      issues.join(', '),
      { checks, issues }
    );
  }
  
  return { healthStatus, issues, checks };
}

// Main execution
if (require.main === module) {
  checkSystemHealth()
    .then(result => {
      console.log(`✅ Health check complete: ${result.healthStatus}`);
      process.exit(result.issues.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Health monitor failed:', error.message);
      process.exit(1);
    });
}

module.exports = { checkSystemHealth };
