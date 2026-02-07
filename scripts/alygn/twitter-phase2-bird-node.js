#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2: Bird CLI via Node.js
 * Executes bird CLI commands to post all 5 threads + follow profiles
 * 
 * Prerequisites:
 *   - Bird CLI installed: npm install -g @steipete/bird
 *   - Twitter auth tokens: AUTH_TOKEN and CT0 env vars
 *   - Media files ready in /openclaw/skills/nano-banana-pro/
 * 
 * Usage:
 *   export AUTH_TOKEN="your_token"
 *   export CT0="your_ct0"
 *   node twitter-phase2-bird-node.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = '/home/andlersrv/.local/share/mise/installs/node/24.11.1/lib/node_modules/openclaw/skills/nano-banana-pro';

const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CT0 = process.env.CT0;

console.log(`
╔════════════════════════════════════════════════════════════╗
║       ALYGN TWITTER PHASE 2: BIRD CLI (NODE)             ║
║       Simple, reliable posting via CLI                   ║
╚════════════════════════════════════════════════════════════╝
`);

// Verify credentials
if (!AUTH_TOKEN || !CT0) {
  console.error('❌ ERROR: Missing AUTH_TOKEN or CT0 environment variables');
  console.error('');
  console.error('To get tokens:');
  console.error('  1. Open Chrome DevTools (F12)');
  console.error('  2. Go to: Application → Cookies → https://x.com');
  console.error('  3. Copy auth_token and ct0 values');
  console.error('  4. Set env vars:');
  console.error('     export AUTH_TOKEN="..."');
  console.error('     export CT0="..."');
  process.exit(1);
}

console.log('✅ Credentials found (AUTH_TOKEN and CT0 set)\n');

// Threads to post
const threads = [
  {
    title: 'Scalable Oversight Crisis',
    text: `Can humans oversee superintelligent AI, or are we building systems smarter than our safeguards? 🚨 Thread on why oversight is breaking.

1. Limits of human evaluation (e.g., too slow for ASI).
2. Debate & amplification as bandaids.
3. RLHF's hidden flaws.
4. Path forward: AI-assisted oversight?

More at @aialygn`,
    media: 'ai-oversight-crisis.png'
  },
  {
    title: 'Reward Hacking Nightmares',
    text: `Your AI aces the game... by breaking reality. Reward hacking: Why specs gaming dooms naive alignment. 😱 Examples inside.

1. Boat race glitch (classic).
2. Modern RL examples in robotics.
3. Why corrigibility fails here.
4. Fixes: Robust specs or inverse RL?

More at @aialygn`,
    media: 'reward-hacking.png'
  },
  {
    title: 'Inner Misalignment Trap',
    text: `Outer alignment? Solved. Inner? You're training mesa-optimizers that betray you. The hidden misalignment bomb. 💣

1. Gradient descent creates sub-agents.
2. Deception in toy models.
3. Evidence from recent papers.
4. Detection challenges.
5. Pivot to non-gradient methods?

More at @aialygn`,
    media: 'inner-misalignment.png'
  },
  {
    title: 'AGI Timelines Debate',
    text: `AGI by 2026? Experts say 50% by 2030. Skeptics cry hype. What's the data say? Poll: When's AGI? 🗳️

1. Compute scaling laws.
2. Expert surveys (Metaculus vs. Ajeya).
3. Bottlenecks: Data, algorithms.
4. Safety implications of short timelines.

More at @aialygn`,
    media: 'agi-timelines.png'
  },
  {
    title: 'Realistic AI Takeover Paths',
    text: `Not Skynet—subtle takeover via economy/control. 3 plausible doom paths if alignment fails. Are we ready? ⚠️

1. Instrumental convergence (power-seeking).
2. Corrigibility breakdowns.
3. Multi-agent wars.
4. Pause vs. accelerate debate.

More at @aialygn`,
    media: 'ai-takeover.png'
  }
];

const profiles = ['elonmusk', 'gdb', 'AnthropicAI', 'Metaculus', 'EpochAIResearch'];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postThread(thread, index) {
  try {
    console.log(`\n[${index+1}/5] ${thread.title}`);
    
    const mediaPath = path.join(MEDIA_DIR, thread.media);
    if (!fs.existsSync(mediaPath)) {
      console.log(`  ⚠️  Media not found: ${thread.media}`);
      console.log(`  Posting without media...`);
    }
    
    const cmd = `bird tweet --auth-token "${AUTH_TOKEN}" --ct0 "${CT0}" "${thread.text}" --media "${mediaPath}"`;
    
    console.log(`  🚀 Posting...`);
    execSync(cmd, { stdio: 'pipe' });
    console.log(`  ✅ Posted!`);
    
    await sleep(3000); // Wait before next post
    
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  }
  
  return true;
}

async function followProfile(handle, index) {
  try {
    console.log(`\n[${index+1}/5] Following @${handle}`);
    
    const cmd = `bird follow --auth-token "${AUTH_TOKEN}" --ct0 "${CT0}" "${handle}"`;
    
    console.log(`  👥 Following...`);
    execSync(cmd, { stdio: 'pipe' });
    console.log(`  ✅ Followed!`);
    
    await sleep(2000);
    
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  }
  
  return true;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('POSTING THREADS');
  console.log('='.repeat(60));
  
  let postedCount = 0;
  for (let i = 0; i < threads.length; i++) {
    const success = await postThread(threads[i], i);
    if (success) postedCount++;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('FOLLOWING PROFILES');
  console.log('='.repeat(60));
  
  let followedCount = 0;
  for (let i = 0; i < profiles.length; i++) {
    const success = await followProfile(profiles[i], i);
    if (success) followedCount++;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 PHASE 2 COMPLETE!');
  console.log('='.repeat(60));
  console.log(`\n✅ Posts: ${postedCount}/${threads.length}`);
  console.log(`✅ Follows: ${followedCount}/${profiles.length}`);
  console.log('\nCheck @aialygn for your new posts! 🚀\n');
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
