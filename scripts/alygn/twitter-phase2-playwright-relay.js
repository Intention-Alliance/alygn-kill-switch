#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2: Playwright via Chrome Relay
 * Connects to the already-running Chrome instance via Playwright
 * Posts all 5 threads with media + follows profiles
 */

const playwright = require('playwright');
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
    console.log(`\n📝 Posting: ${post.title}`);
    
    // Navigate to home
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);
    
    // Click textarea
    console.log('  → Clicking compose textarea...');
    const textarea = await page.$('[data-testid="tweetTextarea_0"]');
    if (!textarea) {
      console.log('  ❌ Textarea not found');
      return false;
    }
    
    await textarea.click();
    await page.waitForTimeout(300);
    
    // Type text
    console.log('  → Typing text...');
    await page.keyboard.type(post.fullText, { delay: 2 });
    await page.waitForTimeout(800);
    
    // Upload media
    if (mediaPath && fs.existsSync(mediaPath)) {
      console.log(`  → Uploading media: ${path.basename(mediaPath)}`);
      try {
        const fileInput = await page.$('[type="file"]');
        if (fileInput) {
          await fileInput.uploadFile(mediaPath);
          await page.waitForTimeout(1500);
          console.log('  ✅ Media attached');
        }
      } catch (e) {
        console.log(`  ⚠️  Media upload: ${e.message}`);
      }
    }
    
    // Click Post
    console.log('  → Looking for Post button...');
    await page.waitForTimeout(500);
    const postBtn = await page.$('[data-testid="tweetButton"]');
    
    if (!postBtn) {
      console.log('  ❌ Post button not found');
      return false;
    }
    
    const isDisabled = await page.evaluate(btn => btn.disabled, postBtn);
    if (isDisabled) {
      console.log('  ⚠️  Post button is disabled');
      return false;
    }
    
    console.log('  → Clicking Post...');
    await postBtn.click();
    await page.waitForTimeout(2500);
    console.log('  ✅ POSTED!');
    return true;
    
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function followUser(page, handle) {
  try {
    console.log(`\n👥 Following: ${handle}`);
    
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);
    
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
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ALYGN TWITTER PHASE 2: PLAYWRIGHT VIA RELAY             ║
║  Using Chrome ALYGN Profile (already running)            ║
╚════════════════════════════════════════════════════════════╝
`);

  try {
    // Connect to running Chrome via CDP
    console.log('🔗 Connecting to Chrome via CDP endpoint...');
    console.log('   Endpoint: http://127.0.0.1:18792');
    
    const browser = await playwright.chromium.connectOverCDP('http://127.0.0.1:18792');
    console.log('✅ Connected!\n');
    
    // Get the first context and page
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      console.log('⚠️  No browser context found');
      await browser.close();
      return;
    }
    
    const context = contexts[0];
    const pages = context.pages();
    if (pages.length === 0) {
      console.log('⚠️  No pages found');
      await browser.close();
      return;
    }
    
    const page = pages[0];
    console.log('📖 Using existing page\n');
    
    // Post threads
    console.log('='.repeat(60));
    console.log('PHASE 2: POSTING THREADS');
    console.log('='.repeat(60));
    
    let postedCount = 0;
    for (let i = 0; i < workflow.posts.length; i++) {
      const post = workflow.posts[i];
      console.log(`\n[${i+1}/5]`);
      const success = await postThread(page, post, mediaMap[post.title]);
      if (success) postedCount++;
      
      if (i < workflow.posts.length - 1) {
        console.log('⏳ Waiting before next post...');
        await page.waitForTimeout(3000);
      }
    }
    
    // Follow profiles
    console.log(`\n${'='.repeat(60)}`);
    console.log('PHASE 2: FOLLOWING PROFILES');
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
    
    // Results
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ PHASE 2 COMPLETE!');
    console.log('='.repeat(60));
    console.log(`\n📊 Results:`);
    console.log(`  Posts: ${postedCount}/${workflow.posts.length}`);
    console.log(`  Follows: ${followedCount}/${workflow.profiles.length}`);
    console.log('\n🎉 Check @aialygn for new posts!\n');
    
    await browser.close();
    
  } catch (error) {
    console.error(`\n❌ FATAL ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
