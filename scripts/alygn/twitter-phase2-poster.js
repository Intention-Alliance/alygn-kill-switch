#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2 Poster
 * Posts threads, replies, and follows using Puppeteer
 * Handles media attachments for enriched content
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = '/home/andlersrv/.openclaw/browser/openclaw/user-data';
const CHROME_PATH = '/usr/bin/chromium';
const WORKFLOW_PATH = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/workflow-1770484855297.json');
const MEDIA_DIR = '/home/andlersrv/.local/share/mise/installs/node/24.11.1/lib/node_modules/openclaw/skills/nano-banana-pro';

// Load workflow
const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

const mediaMap = {
  'Scalable Oversight Crisis': path.join(MEDIA_DIR, 'ai-oversight-crisis.png'),
  'Reward Hacking Nightmares': path.join(MEDIA_DIR, 'reward-hacking.png'),
  'Inner Misalignment Trap': path.join(MEDIA_DIR, 'inner-misalignment.png'),
  'AGI Timelines Debate': path.join(MEDIA_DIR, 'agi-timelines.png'),
  'Realistic AI Takeover Paths': path.join(MEDIA_DIR, 'ai-takeover.png')
};

async function postTweet(page, text, mediaPath = null) {
  try {
    console.log(`📝 Posting: ${text.substring(0, 50)}...`);
    
    // Navigate to compose
    await page.goto('https://x.com/compose/post', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    
    // Click textarea
    await page.click('[data-testid="tweetTextarea_0"]');
    await new Promise(r => setTimeout(r, 500));
    
    // Type text
    await page.keyboard.type(text, { delay: 10 });
    
    // Add media if provided
    if (mediaPath && fs.existsSync(mediaPath)) {
      console.log(`📎 Attaching media: ${path.basename(mediaPath)}`);
      const fileInput = await page.$('[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(mediaPath);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // Wait for Post button to enable
    await new Promise(r => setTimeout(r, 1000));
    
    // Click Post button
    const postButton = await page.$('[data-testid="tweetButton"]');
    if (postButton) {
      const isDisabled = await page.evaluate(btn => btn.disabled || btn.getAttribute('aria-disabled') === 'true', postButton);
      if (!isDisabled) {
        console.log('🚀 Clicking Post...');
        await postButton.click();
        await new Promise(r => setTimeout(r, 3000));
        console.log('✅ Post published!');
        return true;
      } else {
        console.log('⚠️  Post button disabled');
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Error posting:', error.message);
    return false;
  }
}

async function postReply(page, targetUrl, replyText) {
  try {
    console.log(`💬 Replying to: ${targetUrl}`);
    
    // Navigate to tweet
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Find and click reply button
    const replyBtn = await page.$('[data-testid="reply"]');
    if (!replyBtn) {
      console.log('⚠️  Reply button not found');
      return false;
    }
    
    await replyBtn.click();
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Type reply
    await page.click('[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(replyText, { delay: 10 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Post reply
    const postButton = await page.$('[data-testid="tweetButton"]');
    if (postButton) {
      const isDisabled = await page.evaluate(btn => btn.disabled || btn.getAttribute('aria-disabled') === 'true', postButton);
      if (!isDisabled) {
        console.log('🚀 Posting reply...');
        await postButton.click();
        await new Promise(r => setTimeout(r, 3000));
        console.log('✅ Reply posted!');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error replying:', error.message);
    return false;
  }
}

async function followUser(page, handle) {
  try {
    console.log(`👥 Following: ${handle}`);
    
    // Navigate to user profile
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Find and click Follow button
    const followBtn = await page.$('button[aria-label*="Follow"]');
    if (followBtn) {
      await followBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      console.log(`✅ Followed ${handle}`);
      return true;
    } else {
      console.log(`⚠️  Follow button not found for ${handle}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error following:', error.message);
    return false;
  }
}

async function executePhase2() {
  console.log('🚀 ALYGN Twitter Phase 2: Starting Execution');
  console.log('='.repeat(60));
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      userDataDir: USER_DATA_DIR,
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Check if logged in
    await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 30000 });
    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    });
    
    if (!isLoggedIn) {
      console.log('⚠️  Not logged in! Please log in manually first.');
      await browser.close();
      process.exit(1);
    }
    
    console.log('✅ Authenticated\n');
    
    // Post threads
    console.log('📋 Step 1: Posting Threads');
    console.log('-'.repeat(60));
    let postedCount = 0;
    for (const post of workflow.posts) {
      const success = await postTweet(page, post.fullText, mediaMap[post.title]);
      if (success) postedCount++;
    }
    console.log(`✅ Posted ${postedCount}/${workflow.posts.length} threads\n`);
    
    // Post replies (simplified - would need real tweet URLs)
    console.log('💬 Step 2: Posting Replies');
    console.log('-'.repeat(60));
    console.log('⏸️  Replies skipped (requires tweet URLs from Grok analysis)\n');
    
    // Follow profiles
    console.log('👥 Step 3: Following Profiles');
    console.log('-'.repeat(60));
    let followedCount = 0;
    for (const handle of workflow.profiles) {
      const success = await followUser(page, handle.replace('@', ''));
      if (success) followedCount++;
    }
    console.log(`✅ Followed ${followedCount}/${workflow.profiles.length} profiles\n`);
    
    console.log('='.repeat(60));
    console.log(`✅ Phase 2 Complete!`);
    console.log(`📊 Summary:`);
    console.log(`  • Posts: ${postedCount}/${workflow.posts.length}`);
    console.log(`  • Profiles followed: ${followedCount}/${workflow.profiles.length}`);
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

// Run
executePhase2();
