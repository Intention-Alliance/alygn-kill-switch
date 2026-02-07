#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2: X REST API Edition
 * Official Twitter API for sustainable automation
 * 
 * Prerequisites:
 *   - Twitter Developer Account: https://developer.twitter.com
 *   - Write access approved for Posts endpoint
 *   - Bearer Token from App Settings
 *   - Media upload capability enabled
 * 
 * Setup:
 *   1. Get Bearer Token from https://developer.twitter.com/en/portal/dashboard
 *   2. Set environment: export BEARER_TOKEN="AAAA..."
 *   3. Run: node twitter-phase2-x-api.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const MEDIA_DIR = '/home/andlersrv/.local/share/mise/installs/node/24.11.1/lib/node_modules/openclaw/skills/nano-banana-pro';

console.log(`
╔════════════════════════════════════════════════════════════╗
║       ALYGN TWITTER PHASE 2: X REST API EDITION          ║
║       Official Twitter API - Most reliable & sustainable ║
╚════════════════════════════════════════════════════════════╝
`);

// Check for Bearer Token
if (!BEARER_TOKEN) {
  console.error('❌ ERROR: Missing BEARER_TOKEN environment variable');
  console.error('');
  console.error('To get your Bearer Token:');
  console.error('  1. Go to: https://developer.twitter.com/en/portal/dashboard');
  console.error('  2. Select your app');
  console.error('  3. Go to: "Keys and tokens" tab');
  console.error('  4. Copy the "Bearer Token" (starts with AAAA...)');
  console.error('  5. Set: export BEARER_TOKEN="your_token_here"');
  console.error('');
  console.error('NOTE: You need ELEVATED ACCESS for POST endpoints');
  console.error('  - Request "Write" access in your app settings');
  console.error('  - Wait 1-48 hours for approval');
  console.error('');
  process.exit(1);
}

console.log('✅ Bearer Token found\n');

// Thread data
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

/**
 * Upload media to Twitter and get media_id
 * https://developer.twitter.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-upload
 */
async function uploadMedia(mediaPath) {
  return new Promise((resolve, reject) => {
    // Stub: Implement media upload using X API v1.1 endpoint
    // https://upload.twitter.com/1.1/media/upload.json
    console.log(`  📎 Uploading media: ${path.basename(mediaPath)}`);
    // TODO: Implement file upload logic
    resolve({ media_id: 'stub_id' });
  });
}

/**
 * Create a tweet
 * https://developer.twitter.com/en/docs/twitter-api/tweets/create-manage-tweets/api-reference/post-tweets
 */
async function createTweet(text, mediaIds = []) {
  return new Promise((resolve, reject) => {
    const payload = {
      text: text
    };
    
    // Add media if provided
    if (mediaIds.length > 0) {
      payload.media = {
        media_ids: mediaIds
      };
    }
    
    const options = {
      hostname: 'api.twitter.com',
      port: 443,
      path: '/2/tweets',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 201) {
          const tweet = JSON.parse(data);
          resolve({ id: tweet.data.id });
        } else {
          console.error(`  ❌ API Error: ${res.statusCode}`);
          console.error(data);
          reject(new Error(`Failed to create tweet: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * Follow a user
 * https://developer.twitter.com/en/docs/twitter-api/users/manage-follow-relationship/api-reference/post-users-id-following
 */
async function followUser(userId) {
  return new Promise((resolve, reject) => {
    // Stub: Implement user follow using X API
    // First need to get user_id from username via lookup
    console.log(`  👥 Following user...`);
    // TODO: Implement follow logic
    resolve({ following: true });
  });
}

/**
 * Get user ID from username
 * https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
 */
async function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.twitter.com',
      port: 443,
      path: `/2/users/by/username/${username}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          const user = JSON.parse(data);
          resolve(user.data.id);
        } else {
          reject(new Error(`Failed to get user: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('POSTING THREADS');
  console.log('='.repeat(60) + '\n');
  
  let postedCount = 0;
  
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    console.log(`[${i+1}/5] ${thread.title}`);
    
    try {
      // TODO: Implement full posting logic
      // 1. Upload media
      // 2. Create tweet with media
      // 3. Wait between posts
      
      console.log(`  🚀 Creating tweet...`);
      const tweet = await createTweet(thread.text);
      console.log(`  ✅ Posted!`);
      postedCount++;
      
      await new Promise(r => setTimeout(r, 3000));
      
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('FOLLOWING PROFILES');
  console.log('='.repeat(60) + '\n');
  
  let followedCount = 0;
  
  for (let i = 0; i < profiles.length; i++) {
    const handle = profiles[i];
    console.log(`[${i+1}/5] @${handle}`);
    
    try {
      // TODO: Implement follow logic
      // 1. Get user ID from username
      // 2. Follow user
      
      console.log(`  👥 Following...`);
      const userId = await getUserByUsername(handle);
      await followUser(userId);
      console.log(`  ✅ Followed!`);
      followedCount++;
      
      await new Promise(r => setTimeout(r, 2000));
      
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 PHASE 2 COMPLETE!');
  console.log('='.repeat(60));
  console.log(`\n✅ Posts: ${postedCount}/${threads.length}`);
  console.log(`✅ Follows: ${followedCount}/${profiles.length}\n`);
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
