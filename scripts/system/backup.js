/**
 * ALYGN Backup & Archive (IMPROVED)
 * 
 * Daily backup of ALYGN data and logs
 * Runs at 2:00 AM CST
 * Uses centralized logger for Notion integration
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { error, success } from '../shared/logger.js';

const WORKSPACE = path.join(process.env.HOME, '.openclaw', 'workspace');
const BACKUP_DIR = path.join(WORKSPACE, 'backups');
const TIMESTAMP = new Date().toISOString().split('T')[0];

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    console.error(`Command failed: ${command}`);
    console.error(err.message);
    return null;
  }
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`✅ Created backup directory: ${BACKUP_DIR}`);
  }
}

function backupDirectory(source, name) {
  if (!fs.existsSync(source)) {
    console.log(`⚠️ Skipping ${name}: directory not found`);
    return { success: false, reason: 'not found' };
  }
  
  const targetDir = path.join(BACKUP_DIR, TIMESTAMP);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const targetPath = path.join(targetDir, name);
  
  console.log(`📦 Backing up ${name}...`);
  const result = exec(`cp -r "${source}" "${targetPath}"`);
  
  if (result !== null) {
    const size = exec(`du -sh "${targetPath}" | cut -f1`);
    console.log(`✅ ${name}: ${size ? size.trim() : 'done'}`);
    return { success: true, size: size ? size.trim() : 'unknown' };
  } else {
    console.log(`❌ ${name}: backup failed`);
    return { success: false, reason: 'copy failed' };
  }
}

async function runBackup() {
  console.log('🗄️ **ALYGN Daily Backup**\n');
  console.log(`📅 ${TIMESTAMP}\n`);
  
  ensureBackupDir();
  
  const backups = [
    { source: path.join(WORKSPACE, 'memory'), name: 'memory' },
    { source: path.join(WORKSPACE, 'daily-reports'), name: 'daily-reports' },
    { source: path.join(WORKSPACE, 'logs'), name: 'logs' },
    { source: path.join(WORKSPACE, 'contact-tracking'), name: 'contact-tracking' },
    { source: path.join(WORKSPACE, 'scripts'), name: 'scripts' },
    { source: path.join(WORKSPACE, 'config'), name: 'config' }
  ];
  
  const results = {};
  let successCount = 0;
  let failCount = 0;
  
  for (const backup of backups) {
    const result = backupDirectory(backup.source, backup.name);
    results[backup.name] = result;
    
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log(`\n📊 Backup Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  
  const targetDir = path.join(BACKUP_DIR, TIMESTAMP);
  const totalSize = exec(`du -sh "${targetDir}" | cut -f1`);
  console.log(`   📦 Total size: ${totalSize ? totalSize.trim() : 'unknown'}\n`);
  
  // Log to Notion
  await success(
    'backup',
    `Daily Backup - ${TIMESTAMP}`,
    `${successCount} directories backed up successfully`,
    {
      timestamp: TIMESTAMP,
      successCount,
      failCount,
      totalSize: totalSize ? totalSize.trim() : 'unknown',
      results
    }
  );
  
  return { successCount, failCount, results };
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup()
    .then(result => {
      console.log('✅ Backup complete!');
      process.exit(result.failCount > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('❌ Backup failed:', err.message);
      error('backup', 'Daily Backup Failed', err)
        .then(() => process.exit(1));
    });
}

export { runBackup };
