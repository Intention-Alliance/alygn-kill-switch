#!/usr/bin/env node
/**
 * ALYGN Twitter Poster: OpenClaw Browser Tool Edition
 * Uses existing Chrome tab (already logged into X.com)
 * Posts all 5 threads with media via OpenClaw browser control
 */

const fs = require('fs');
const path = require('path');

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

console.log('🚀 ALYGN Twitter Phase 2: Browser Tool Edition');
console.log('='.repeat(60));
console.log(`\n📋 Posts to publish: ${workflow.posts.length}`);
console.log(`🖼️  Media files ready: ${Object.keys(mediaMap).length}`);
console.log(`👥 Profiles to follow: ${workflow.profiles.length}`);
console.log('\n✅ Using existing Chrome tab (logged into X.com)');
console.log('='.repeat(60) + '\n');

// Instructions for browser-based posting
console.log('PHASE 2 POSTING INSTRUCTIONS:');
console.log('\n📝 For each thread:');
console.log('1. OpenClaw browser tool will navigate to X.com');
console.log('2. Find the compose textarea');
console.log('3. Type the thread text');
console.log('4. Upload media image');
console.log('5. Click Post button');
console.log('6. Wait 3 seconds, repeat\n');

console.log('THREADS TO POST:\n');

workflow.posts.forEach((post, i) => {
  console.log(`${i+1}. ${post.title}`);
  console.log(`   Text: "${post.fullText.substring(0, 60)}..."`);
  console.log(`   Media: ${path.basename(mediaMap[post.title])}`);
  console.log('');
});

console.log('👥 PROFILES TO FOLLOW:\n');
workflow.profiles.forEach((handle, i) => {
  console.log(`${i+1}. ${handle}`);
});

console.log('\n' + '='.repeat(60));
console.log('📌 IMPORTANT: Use OpenClaw browser tool to automate these steps');
console.log('   The existing Chrome tab is already authenticated to X.com!');
console.log('='.repeat(60) + '\n');

// Export for use by posting script
module.exports = { workflow, mediaMap, MEDIA_DIR };
