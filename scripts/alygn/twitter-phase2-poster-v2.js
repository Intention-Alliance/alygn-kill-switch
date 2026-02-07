#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2 Poster v2
 * Improved version with fresh browser launch per post to avoid session stale issues
 * Posts threads, replies, and follows using Puppeteer with better error recovery
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

async function postTweetFresh(text, mediaPath = null) {
  let browser;
  try {
    console.log(`📝 Posting: ${text.substring(0, 50)}...`);
    
    // Fresh browser for each post to avoid session stale issues
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      userDataDir: USER_DATA_DIR,
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-resources'
      ]
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Check login
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    });
    
    if (!isLoggedIn) {
      console.log('⚠️  Not logged in');
      await browser.close();
      return false;
    }
    
    // Navigate to compose with reduced timeout
    try {
      await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch (e) {
      // Compose page is slow, try with networkidle0
      await page.reload({ waitUntil: 'networkidle0' });
    }
    
    // Wait for textarea
    try {
      await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 8000 });
    } catch (e) {
      console.log('⚠️  Textarea not found, trying alternative selectors');
      await browser.close();
      return false;
    }
    
    // Click and type
    await page.click('[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(text, { delay: 5 });
    
    // Add media if available
    if (mediaPath && fs.existsSync(mediaPath)) {
      try {
        console.log(`📎 Attaching: ${path.basename(mediaPath)}`);
        const fileInput = await page.$('[type="file"]');
        if (fileInput) {
          await fileInput.uploadFile(mediaPath);
          await page.waitForTimeout(1500);
        }
      } catch (e) {
        console.log(`⚠️  Could not attach media: ${e.message}`);
      }
    }
    
    // Find and click Post button
    await page.waitForTimeout(500);
    const postBtn = await page.$('[data-testid="tweetButton"]');
    
    if (postBtn) {
      const isDisabled = await page.evaluate(btn => {
        return btn.disabled || btn.getAttribute('aria-disabled') === 'true';
      }, postBtn);
      
      if (!isDisabled) {
        console.log('🚀 Posting...');
        await postBtn.click();
        await page.waitForTimeout(2000);
        console.log('✅ Posted!');
        await browser.close();
        return true;
      } else {
        console.log('⚠️  Post button disabled');
        await browser.close();
        return false;
      }
    }
    
    await browser.close();
    return false;
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    return false;
  }
}

async function followUserFresh(handle) {
  let browser;
  try {
    console.log(`👥 Following: ${handle}`);
    
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
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    
    // Click follow button
    const followBtn = await page.$('button[aria-label*="Follow"]');
    if (followBtn) {
      await followBtn.click();
      await page.waitForTimeout(1500);
      console.log(`✅ Followed ${handle}`);
      await browser.close();
      return true;
    } else {
      console.log(`⚠️  Follow button not found`);
      await browser.close();
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Error following ${handle}: ${error.message}`);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    return false;
  }
}

async function executePhase2V2() {
  console.log('🚀 ALYGN Twitter Phase 2 v2: Fresh Browser Per Action');
  console.log('='.repeat(60));
  
  // Post threads
  console.log('\n📋 Step 1: Posting Threads');
  console.log('-'.repeat(60));
  let postedCount = 0;
  for (const post of workflow.posts) {
    const success = await postTweetFresh(post.fullText, mediaMap[post.title]);
    if (success) postedCount++;
    await new Promise(r => setTimeout(r, 3000)); // Delay between posts
  }
  console.log(`✅ Posted ${postedCount}/${workflow.posts.length}\n`);
  
  // Follow profiles
  console.log('👥 Step 2: Following Profiles');
  console.log('-'.repeat(60));
  let followedCount = 0;
  for (const handle of workflow.profiles) {
    const success = await followUserFresh(handle.replace('@', ''));
    if (success) followedCount++;
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log(`✅ Followed ${followedCount}/${workflow.profiles.length}\n`);
  
  console.log('='.repeat(60));
  console.log(`📊 Phase 2 v2 Complete!`);
  console.log(`  Posts: ${postedCount}/${workflow.posts.length}`);
  console.log(`  Follows: ${followedCount}/${workflow.profiles.length}`);
}

executePhase2V2();
