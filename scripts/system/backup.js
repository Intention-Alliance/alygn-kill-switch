#!/usr/bin/env node
/**
 * ALYGN Backup & Archive
 * 
 * Daily backup of ALYGN data and logs
 * Runs at 2:00 AM CST
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = path.join(process.env.HOME, '.openclaw', 'workspace');
const BACKUP_DIR = path.join(WORKSPACE, 'backups');
const TIMESTAMP = new Date().toISOString().split('T')[0];

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    console.error(error.message);
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
    return false;
  }
  
  const targetDir = path.join(BACKUP_DIR, TIMESTAMP);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const targetPath = path.join(targetDir, name);
  
  console.log(`📦 Backing up ${name}...`);
  const result = exec(`cp -r "${source}" "${targetPath}"`);
  
  if (result !== null) {
    console.log(`   ✅ ${name} backed up successfully`);
    return true;
  } else {
    console.log(`   ❌ ${name} backup failed`);
    return false;
  }
}

function cleanOldBackups(keepDays = 30) {
  console.log('');
  console.log(`🧹 Cleaning backups older than ${keepDays} days...`);
  
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('   No backups to clean');
    return;
  }
  
  const backups = fs.readdirSync(BACKUP_DIR);
  const cutoffDate = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  
  let removedCount = 0;
  
  backups.forEach(backup => {
    const backupPath = path.join(BACKUP_DIR, backup);
    const stats = fs.statSync(backupPath);
    
    if (stats.isDirectory() && stats.mtime < cutoffDate) {
      console.log(`   🗑️ Removing old backup: ${backup}`);
      exec(`rm -rf "${backupPath}"`);
      removedCount++;
    }
  });
  
  if (removedCount === 0) {
    console.log('   ✅ No old backups to remove');
  } else {
    console.log(`   ✅ Removed ${removedCount} old backup(s)`);
  }
}

function generateBackupReport() {
  console.log('');
  console.log('📊 Backup Report:');
  
  const backupPath = path.join(BACKUP_DIR, TIMESTAMP);
  if (!fs.existsSync(backupPath)) {
    console.log('   ❌ No backup created');
    return;
  }
  
  const files = fs.readdirSync(backupPath);
  console.log(`   ✅ Backed up ${files.length} directory/directories`);
  
  files.forEach(file => {
    const filePath = path.join(backupPath, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`      - ${file}: ${sizeMB} MB`);
  });
}

function performBackup() {
  console.log('💾 ALYGN Backup & Archive');
  console.log(`📅 ${TIMESTAMP}`);
  console.log('');
  
  ensureBackupDir();
  
  // Backup critical directories
  const backups = [
    { source: path.join(WORKSPACE, 'alygn-automation'), name: 'alygn-automation' },
    { source: path.join(WORKSPACE, 'memory'), name: 'memory' },
    { source: path.join(WORKSPACE, 'daily-reports'), name: 'daily-reports' },
    { source: path.join(WORKSPACE, 'contact-tracking'), name: 'contact-tracking' },
    { source: path.join(WORKSPACE, 'knowledge'), name: 'knowledge' }
  ];
  
  let successCount = 0;
  backups.forEach(backup => {
    if (backupDirectory(backup.source, backup.name)) {
      successCount++;
    }
  });
  
  generateBackupReport();
  cleanOldBackups(30);
  
  console.log('');
  console.log(`✅ Backup complete: ${successCount}/${backups.length} directories backed up`);
}

// Main execution
try {
  performBackup();
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  process.exit(1);
}
