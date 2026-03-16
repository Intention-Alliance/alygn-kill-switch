/**
 * ALYGN VC Outreach Orchestrator
 * 
 * Main campaign runner that coordinates the complete outreach workflow:
 * - Load VCs pending outreach from Notion
 * - Generate personalized email drafts
 * - Send emails in rate-limited batches
 * - Track batch iterations
 * - Update Notion with outreach status
 * 
 * Usage:
 *   node outreach-orchestrator.js                # Run next batch
 *   node outreach-orchestrator.js --send-next     # Send next batch (dry-run by default)
 *   node outreach-orchestrator.js --full          # Full cycle (draft + send)
 *   node outreach-orchestrator.js --dry-run       # Preview without sending
 *   node outreach-orchestrator.js --status        # Check queue status
 */

import { spawn } from "child_process";
import fs from "fs".promises;
import path from "path";
import { log, success, error, info, LogLevel } from "../utils/logger.js";

const WORKSPACE_DIR = path.join(process.env.HOME, '.openclaw', 'workspace');
const OUTREACH_SCRIPT = path.join(WORKSPACE_DIR, 'scripts', 'alygn', 'vc-outreach', 'email', 'draft-outreach-emails.js');
const SEND_SCRIPT = path.join(WORKSPACE_DIR, 'scripts', 'alygn', 'vc-outreach', 'email', 'send-approved-emails.js');
const BATCH_SCRIPT = path.join(WORKSPACE_DIR, 'scripts', 'alygn', 'vc-outreach', 'core', 'schedule-batch-iterations.js');

// Configuration
const BATCH_SIZE = 12; // Emails per day (hourly 7AM-7PM)
const MAX_DAILY_EMAILS = 12;

/**
 * Run a script and capture output
 */
async function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    log(`Running: node ${scriptPath} ${args.join(' ')}`);
    
    const child = spawn('node', [scriptPath, ...args]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Script failed with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Check queue status
 */
async function checkQueueStatus() {
  console.log('\n📊 VC Outreach Queue Status\n');

  try {
    // Check pending VCs
    const listResult = await runScript(
      path.join(WORKSPACE_DIR, 'scripts', 'alygn', 'vc-outreach', 'tracking', 'vc-outreach.js'),
      ['list']
    );

    console.log(listResult.stdout);

    // Check batch schedule
    const batchSchedulePath = path.join(WORKSPACE_DIR, '.openclaw', 'queue', 'vc-outreach-batch-schedule.json');
    
    try {
      const batchSchedule = JSON.parse(await fs.readFile(batchSchedulePath, 'utf8'));
      console.log('\n📅 Batch Schedule:');
      console.log(`   Last sent: ${batchSchedule.lastSentDate || 'Never'}`);
      console.log(`   Sent today: ${batchSchedule.emailsSentToday || 0}/${MAX_DAILY_EMAILS}`);
      console.log(`   Next batch due: ${batchSchedule.nextBatchDue || 'Now'}`);
      console.log(`   Total sent: ${batchSchedule.totalSent || 0}\n`);
    } catch (err) {
      console.log('\n📅 Batch Schedule: No records yet\n');
    }

    // Check for unapproved drafts
    const draftsDir = path.join(WORKSPACE_DIR, 'output', 'vc-outreach', 'drafts');
    
    try {
      const drafts = await fs.readdir(draftsDir);
      const pendingDrafts = drafts.filter(f => f.endsWith('.json'));
      
      if (pendingDrafts.length > 0) {
        console.log(`📝 ${pendingDrafts.length} drafts awaiting review\n`);
      }
    } catch (err) {
      // Drafts directory doesn't exist yet
    }

    return true;
  } catch (err) {
    error(`Queue status check failed: ${err.message}`);
    return false;
  }
}

/**
 * Generate email drafts for pending VCs
 */
async function generateDrafts(limit = BATCH_SIZE, dryRun = false) {
  console.log('\n📝 Generating Email Drafts\n');

  const args = [];
  if (limit) args.push(`--limit=${limit}`);
  if (dryRun) args.push('--dry-run');

  try {
    const result = await runScript(OUTREACH_SCRIPT, args);
    console.log(result.stdout);
    success('Draft generation complete');
    return true;
  } catch (err) {
    error(`Draft generation failed: ${err.message}`);
    return false;
  }
}

/**
 * Send approved emails from queue
 */
async function sendApprovedEmails(limit = 1, dryRun = true) {
  console.log('\n📧 Sending Approved Emails\n');

  const args = ['--send-next'];
  if (limit) args.push(`--limit=${limit}`);
  if (dryRun) args.push('--dry-run');

  try {
    let result = await runScript(SEND_SCRIPT, args);
    console.log(result.stdout);
    
    if (!dryRun) {
      // Check batch schedule after sending
      try {
        await runScript(BATCH_SCRIPT, ['--check']);
      } catch (err) {
        info(`Batch schedule check: ${err.message}`);
      }
    }
    
    success('Email sending complete');
    return true;
  } catch (err) {
    error(`Email sending failed: ${err.message}`);
    return false;
  }
}

/**
 * Full cycle: draft + update schedule
 */
async function runFullCycle(dryRun = false) {
  console.log('\n🚀 Running Full Outreach Cycle\n');

  // Step 1: Generate drafts
  success('Step 1: Generating drafts...');
  const draftsSuccess = await generateDrafts(BATCH_SIZE, dryRun);

  if (!draftsSuccess) {
    return false;
  }

  // Step 2: Update batch schedule
  try {
    await runScript(BATCH_SCRIPT, ['--next']);
    success('Step 2: Batch schedule updated');
  } catch (err) {
    info(`Batch schedule update: ${err.message}`);
  }

  console.log('\n✅ Full cycle complete');
  console.log('💡 Drafts saved. Review and approve via:');
  console.log('   node send-approved-emails.js --send-next');

  return true;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  console.log('\n🎯 ALYGN VC Outreach Orchestrator');
  console.log('================================\n');

  try {
    if (args.includes('--status')) {
      await checkQueueStatus();
    } else if (args.includes('--full')) {
      const dryRun = args.includes('--dry-run');
      await runFullCycle(dryRun);
    } else if (args.includes('--send-next')) {
      const dryRun = !args.includes('--send');
      const limitMatch = args.find(a => a.startsWith('--limit='));
      const limit = limitMatch ? parseInt(limitMatch.split('=')[1]) : 1;
      await sendApprovedEmails(limit, dryRun);
    } else {
      // Default: show status
      await checkQueueStatus();
      console.log('\n💡 Commands:');
      console.log('   --status      Check queue status');
      console.log('   --full        Run full cycle (draft + schedule)');
      console.log('   --send-next   Send next batch (add --send to actually send)');
      console.log('   --dry-run     Preview without sending\n');
    }

    process.exit(0);
  } catch (err) {
    error(`Orchestrator failed: ${err.message}`);
    process.exit(1);
  }
}

// CLI execution
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}

export {
  checkQueueStatus,
  generateDrafts,
  sendApprovedEmails,
  runFullCycle
};