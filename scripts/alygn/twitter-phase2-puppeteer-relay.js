#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2: Puppeteer via Chrome Relay
 * Connects to the already-running Chrome instance via Puppeteer CDP
 * Posts all 5 threads with media + follows profiles
 */

const puppeteer = require('puppeteer-core');
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

async function postThread(page, post, mediaPath) {
  try {
    console.log(`\n📝 [${post.title}]`);
    
    // Navigate to home
    console.log('  1. Going to home...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);
    
    // Find and click textarea
    console.log('  2. Finding textarea...');
    const textarea = await page.$('[data-testid="tweetTextarea_0"]');
    if (!textarea) {
      console.log('  ❌ ERROR: Textarea not found!');
      return false;
    }
    
    await textarea.click();
    await page.waitForTimeout(400);
    
    // Type text
    console.log('  3. Typing text...');
    await page.keyboard.type(post.fullText, { delay: 1 });
    await page.waitForTimeout(800);
    console.log('  ✅ Text entered');
    
    // Upload media if available
    if (mediaPath && fs.existsSync(mediaPath)) {
      console.log(`  4. Uploading media...`);
      try {
        const fileInput = await page.$('[type="file"]');
        if (fileInput) {
          await fileInput.uploadFile(mediaPath);
          await page.waitForTimeout(1500);
          console.log(`  ✅ Media: ${path.basename(mediaPath)}`);
        }
      } catch (e) {
        console.log(`  ⚠️  Media: ${e.message}`);
      }
    }
    
    // Find and click Post button
    console.log('  5. Finding Post button...');
    await page.waitForTimeout(500);
    const postBtn = await page.$('[data-testid="tweetButton"]');
    
    if (!postBtn) {
      console.log('  ❌ ERROR: Post button not found!');
      return false;
    }
    
    // Check if disabled
    const isDisabled = await page.evaluate(btn => {
      return btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    }, postBtn);
    
    if (isDisabled) {
      console.log('  ⚠️  Post button DISABLED - text issue?');
      return false;
    }
    
    console.log('  6. Posting...');
    await postBtn.click();
    await page.waitForTimeout(2500);
    console.log('  ✅ POSTED!');
    return true;
    
  } catch (error) {
    console.error(`  ❌ ${error.message}`);
    return false;
  }
}

async function followUser(page, handle) {
  try {
    console.log(`\n👥 [@${handle}]`);
    
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    
    // Find follow button
    const buttons = await page.$$('button');
    for (let btn of buttons) {
      const label = await page.evaluate(el => el.getAttribute('aria-label'), btn);
      if (label && label.toLowerCase().includes('follow')) {
        await page.evaluate(el => el.click(), btn);
        await page.waitForTimeout(1200);
        console.log('  ✅ Followed');
        return true;
      }
    }
    
    console.log('  ⚠️  Follow button not found');
    return false;
    
  } catch (error) {
    console.error(`  ❌ ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     ALYGN TWITTER PHASE 2: PUPPETEER VIA RELAY           ║
║     Using Chrome ALYGN Profile (OpenClaw Relay)          ║
╚════════════════════════════════════════════════════════════╝
`);

  let browser;
  try {
    // Connect to running Chrome via CDP on port 18792
    console.log('🔗 Connecting to Chrome relay (port 18792)...');
    
    const cdpEndpoint = 'http://127.0.0.1:18792';
    console.log(`   Endpoint: ${cdpEndpoint}\n`);
    
    // Use fetch to get the WSS endpoint
    const response = await fetch(`${cdpEndpoint}/json/version`);
    const browserData = await response.json();
    const wsEndpoint = browserData.webSocketDebuggerUrl;
    
    console.log(`🔗 WebSocket: ${wsEndpoint.substring(0, 60)}...`);
    
    browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    console.log('✅ Connected to Chrome!\n');
    
    // Get the page
    const pages = await browser.pages();
    if (pages.length === 0) {
      console.log('⚠️  No pages found in browser');
      await browser.close();
      return;
    }
    
    const page = pages[0];
    console.log(`📖 Using page: ${page.url().substring(0, 40)}...\n`);
    
    // PHASE 2: POST THREADS
    console.log('='.repeat(60));
    console.log('POSTING THREADS');
    console.log('='.repeat(60));
    
    let postedCount = 0;
    for (let i = 0; i < workflow.posts.length; i++) {
      const post = workflow.posts[i];
      console.log(`\n[${i+1}/5]`);
      const success = await postThread(page, post, mediaMap[post.title]);
      if (success) postedCount++;
      
      if (i < workflow.posts.length - 1) {
        console.log('⏳ Waiting 3s before next...');
        await page.waitForTimeout(3000);
      }
    }
    
    // PHASE 2: FOLLOW PROFILES
    console.log(`\n${'='.repeat(60)}`);
    console.log('FOLLOWING PROFILES');
    console.log('='.repeat(60));
    
    let followedCount = 0;
    for (let i = 0; i < workflow.profiles.length; i++) {
      const handle = workflow.profiles[i].replace('@', '');
      console.log(`\n[${i+1}/5]`);
      const success = await followUser(page, handle);
      if (success) followedCount++;
      
      if (i < workflow.profiles.length - 1) {
        await page.waitForTimeout(2500);
      }
    }
    
    // FINAL RESULTS
    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 PHASE 2 COMPLETE!');
    console.log('='.repeat(60));
    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`  ✅ Posts: ${postedCount}/${workflow.posts.length}`);
    console.log(`  ✅ Profiles: ${followedCount}/${workflow.profiles.length}`);
    console.log('\n🚀 Check @aialygn timeline for new posts!\n');
    
    await browser.close();
    
  } catch (error) {
    console.error(`\n❌ FATAL ERROR: ${error.message}`);
    if (error.stack) console.error(error.stack);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    process.exit(1);
  }
}

main();
