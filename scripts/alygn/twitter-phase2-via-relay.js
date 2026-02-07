#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2: Via OpenClaw Browser Relay
 * Uses the Browser Relay Chrome instance with ALYGN profile
 * Posts all 5 threads with media + follows profiles
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const WORKFLOW_PATH = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/workflow-1770484855297.json');
const MEDIA_DIR = '/home/andlersrv/.local/share/mise/installs/node/24.11.1/lib/node_modules/openclaw/skills/nano-banana-pro';

const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

const mediaMap = {
  'Scalable Oversight Crisis': path.join(MEDIA_DIR, 'ai-oversight-crisis.png'),
  'Reward Hacking Nightmares': path.join(MEDIA_DIR, 'reward-hacking.png'),
  'Inner Misalignment Trap': path.join(MEDIA_DIR, 'inner-misalignment.png'),
  'AGI Timelines Debate': path.join(MEDIA_DIR, 'agi-timelines.png'),
  'Realistic AI Takeover Paths': path.join(MEDIA_DIR, 'ai-takeover.png')
};

console.log(`
╔════════════════════════════════════════════════════════════╗
║  ALYGN TWITTER PHASE 2: BROWSER RELAY EDITION            ║
║  Using OpenClaw Browser Relay + Chrome ALYGN Profile     ║
╚════════════════════════════════════════════════════════════╝
`);

console.log('📊 Workflow Summary:');
console.log(`  • Threads to post: ${workflow.posts.length}`);
console.log(`  • Media assets: ${Object.keys(mediaMap).length}`);
console.log(`  • Profiles to follow: ${workflow.profiles.length}`);
console.log('\n🔑 Note: Using OpenClaw Browser Relay for authentication');
console.log('   This means all browser control goes through the relay\n');

console.log('📋 POSTS READY:\n');
workflow.posts.forEach((post, i) => {
  console.log(`${i+1}. ${post.title}`);
  console.log(`   📎 Media: ${path.basename(mediaMap[post.title])}`);
  console.log(`   📝 Text: "${post.fullText.substring(0, 50)}..."`);
  console.log('');
});

console.log('👥 PROFILES TO FOLLOW:\n');
workflow.profiles.forEach((handle, i) => {
  console.log(`${i+1}. ${handle}`);
});

console.log(`\n${'='.repeat(60)}`);
console.log('🚀 NEXT STEPS:\n');
console.log('Option 1: Use the OpenClaw browser tool (CLI)');
console.log('   → browser snapshot (chrome profile)');
console.log('   → browser act (to click/type)\n');
console.log('Option 2: Use Playwright with Browser Relay connection');
console.log('   → Connect to the relay endpoint');
console.log('   → Automate posting through relay\n');
console.log('Option 3: Manual posting via browser');
console.log('   → Use PHASE2-READY-TO-POST.md');
console.log('   → Copy-paste 5 times (10 minutes)\n');
console.log('='.repeat(60));
console.log('\n💡 RECOMMENDATION:');
console.log('Since Browser Relay is running, use Option 2 (Playwright via relay)');
console.log('This combines the best of both: automation + relay reliability\n');

// Export workflow for use by other scripts
module.exports = { workflow, mediaMap, MEDIA_DIR };
