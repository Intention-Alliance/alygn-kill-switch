#!/usr/bin/env bun
/**
 * Create All ALYGN Cron Jobs (UPDATED - Using New Script Paths)
 * 
 * Creates cron jobs using OpenClaw cron API
 * All jobs run in isolated sessions
 * Uses BUN for faster execution
 */

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:4040';
const PHONE = '+50662163355';
const WORKSPACE = process.env.HOME + '/.openclaw/workspace';

// Timezone
const TZ = 'America/Costa_Rica';

/**
 * Cron job definitions using NEW script paths
 */
const cronJobs = [
  // ========================================
  // MORNING ROUTINE
  // ========================================
  {
    name: "ALYGN Morning Briefing",
    schedule: { kind: "cron", expr: "0 8 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Execute morning briefing: cd ${WORKSPACE} && bun scripts/system/morning-briefing-v2.js`,
      deliver: true,
      channel: "whatsapp",
      to: PHONE
    },
    sessionTarget: "isolated",
    enabled: true
  },

  // ========================================
  // TWITTER/X AUTOMATION
  // ========================================
  {
    name: "ALYGN Twitter - Morning Engagement",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Execute Twitter automation: cd ${WORKSPACE} && bun scripts/alygn/twitter-automation.js exec 13 --search`
    },
    sessionTarget: "isolated",
    enabled: true
  },
  {
    name: "ALYGN Twitter - Afternoon Engagement",
    schedule: { kind: "cron", expr: "0 15 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Execute Twitter automation: cd ${WORKSPACE} && bun scripts/alygn/twitter-automation.js exec 13 --search`
    },
    sessionTarget: "isolated",
    enabled: true
  },
  {
    name: "ALYGN Twitter - Auto Engagement",
    schedule: { kind: "cron", expr: "0 18 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Execute Twitter automation: cd ${WORKSPACE} && bun scripts/alygn/twitter-automation.js exec 15`
    },
    sessionTarget: "isolated",
    enabled: true
  },

  // ========================================
  // DAILY TRACKING
  // ========================================
  {
    name: "ALYGN Daily Activity Tracker",
    schedule: { kind: "cron", expr: "30 3 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Run daily tracker: cd ${WORKSPACE} && bun scripts/alygn/daily-tracker.js`
    },
    sessionTarget: "isolated",
    enabled: true
  },
  {
    name: "ALYGN End-of-Day Summary",
    schedule: { kind: "cron", expr: "0 21 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Generate EOD summary: cd ${WORKSPACE} && bun scripts/alygn/eod-summary.js`,
      deliver: true,
      channel: "discord",
      to: "andler-develops"
    },
    sessionTarget: "isolated",
    enabled: true
  },

  // ========================================
  // GITHUB ACTIVITY
  // ========================================
  {
    name: "ALYGN GitHub Activity Digest",
    schedule: { kind: "cron", expr: "30 21 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Generate GitHub digest: cd ${WORKSPACE} && bun scripts/alygn/github-digest.js`,
      deliver: true,
      channel: "discord",
      to: "andler-develops"
    },
    sessionTarget: "isolated",
    enabled: true
  },

  // ========================================
  // CONTACT TRACKING
  // ========================================
  {
    name: "ALYGN Jacobo Daily Summary",
    schedule: { kind: "cron", expr: "0 18 * * *", tz: TZ },
    payload: {
      kind: "agentTurn",
      message: `Generate Jacobo summary: cd ${WORKSPACE} && bun scripts/alygn/jacobo-tracking.js summary`,
      deliver: true,
      channel: "whatsapp",
      to: PHONE
    },
    sessionTarget: "isolated",
    enabled: true
  },

  // ========================================
  // VC OUTREACH
  // ========================================
  {
    name: "ALYGN VC Contact Discovery",
    schedule: { kind: "cron", expr: "0 10 * * 1", tz: TZ }, // Monday 10 AM
    payload: {
      kind: "agentTurn",
      message: `Run VC contact discovery: cd ${WORKSPACE} && bun scripts/alygn/vc-contact-discovery.js discover`,
      deliver: true,
      channel: "discord",
      to: "andler-develops"
    },
    sessionTarget: "isolated",
    enabled: true
  },
  {
    name: "ALYGN VC Outreach Follow-up",
    schedule: { kind: "cron", expr: "0 14 * * 3", tz: TZ }, // Wednesday 2 PM
    payload: {
      kind: "agentTurn",
      message: `Run VC outreach check: cd ${WORKSPACE} && bun scripts/alygn/vc-outreach.js check`
    },
    sessionTarget: "isolated",
    enabled: true
  },

  // ========================================
  // WEEKLY & MONTHLY REVIEWS
  // ========================================
  {
    name: "ALYGN Weekly Reflection",
    schedule: { kind: "cron", expr: "0 18 * * 0", tz: TZ }, // Sunday 6 PM
    payload: {
      kind: "agentTurn",
      message: `Generate weekly reflection: cd ${WORKSPACE} && bun scripts/alygn/weekly-reflection.js`,
      deliver: true,
      channel: "whatsapp",
      to: PHONE
    },
    sessionTarget: "isolated",
    enabled: true
  },
  {
    name: "ALYGN Monthly Review",
    schedule: { kind: "cron", expr: "0 18 1 * *", tz: TZ }, // 1st of month 6 PM
    payload: {
      kind: "agentTurn",
      message: `Generate monthly review: cd ${WORKSPACE} && bun scripts/alygn/monthly-review.js`,
      deliver: true,
      channel: "whatsapp",
      to: PHONE
    },
    sessionTarget: "isolated",
    enabled: true
  },

  // ========================================
  // SYSTEM MAINTENANCE
  // ========================================
  {
    name: "System Health Monitor",
    schedule: { kind: "cron", expr: "0 */6 * * *", tz: TZ }, // Every 6 hours
    payload: {
      kind: "agentTurn",
      message: `Check system health: cd ${WORKSPACE} && bun scripts/system/health-monitor.js`
    },
    sessionTarget: "isolated",
    enabled: true
  },
  {
    name: "System Daily Backup",
    schedule: { kind: "cron", expr: "0 2 * * *", tz: TZ }, // 2 AM
    payload: {
      kind: "agentTurn",
      message: `Run daily backup: cd ${WORKSPACE} && bun scripts/system/backup.js`
    },
    sessionTarget: "isolated",
    enabled: true
  },
  {
    name: "Notion Sync",
    schedule: { kind: "cron", expr: "0 */12 * * *", tz: TZ }, // Every 12 hours
    payload: {
      kind: "agentTurn",
      message: `Sync to Notion: cd ${WORKSPACE} && bun scripts/system/notion-sync.js`
    },
    sessionTarget: "isolated",
    enabled: true
  }
];

/**
 * Create cron job via API
 */
async function createCronJob(job) {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', job })
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ ${job.name}`);
      return { success: true, job: data };
    } else {
      console.error(`❌ ${job.name}: ${data.error || 'Unknown error'}`);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error(`❌ ${job.name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * List existing cron jobs
 */
async function listExistingJobs() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' })
    });

    const data = await response.json();
    return data.jobs || [];
  } catch (error) {
    console.error('Failed to list existing jobs:', error.message);
    return [];
  }
}

/**
 * Remove all ALYGN cron jobs
 */
async function removeAllJobs() {
  const existing = await listExistingJobs();
  const alygnjobs = existing.filter(j => 
    j.name.includes('ALYGN') || 
    j.name.includes('System') || 
    j.name.includes('Notion')
  );

  console.log(`\n🗑️  Removing ${alygnjobs.length} existing jobs...\n`);

  for (const job of alygnjobs) {
    try {
      await fetch(`${GATEWAY_URL}/api/cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', jobId: job.id })
      });
      console.log(`   ✅ Removed: ${job.name}`);
    } catch (error) {
      console.error(`   ❌ Failed to remove ${job.name}:`, error.message);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 ALYGN Cron Jobs Setup (Updated Paths + Bun)\n');

  const command = process.argv[2];

  if (command === 'remove') {
    await removeAllJobs();
    console.log('\n✅ All jobs removed\n');
    return;
  }

  if (command === 'list') {
    const jobs = await listExistingJobs();
    console.log(`\n📋 Existing jobs: ${jobs.length}\n`);
    jobs.forEach(job => {
      console.log(`   - ${job.name} (${job.enabled ? '✅ enabled' : '⚪ disabled'})`);
    });
    console.log('');
    return;
  }

  // Create all jobs
  console.log(`📋 Creating ${cronJobs.length} cron jobs...\n`);

  // Remove existing first (optional)
  if (process.argv.includes('--replace')) {
    await removeAllJobs();
    console.log('');
  }

  let successCount = 0;
  let failCount = 0;

  for (const job of cronJobs) {
    const result = await createCronJob(job);
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Created: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📋 Total: ${cronJobs.length}\n`);

  if (failCount === 0) {
    console.log('🎉 All cron jobs created successfully!\n');
  } else {
    console.log('⚠️  Some jobs failed. Check logs above.\n');
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
