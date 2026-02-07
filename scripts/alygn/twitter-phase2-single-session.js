#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2: Single Session Poster
 * Posts all threads in one browser session (avoids re-login issues)
 * More reliable than fresh browser per post
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = '/home/andlersrv/.openclaw/browser/openclaw/user-data';
const CHROME_PATH = '/usr/bin/chromium';
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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function postInSession(page, text, mediaPath) {
  try {
    // Go back to home first
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    
    console.log(`📝 Posting: ${text.substring(0, 45)}...`);
    
    // Click what's happening box
    const composer = await page.$('[data-testid="tweetTextarea_0"]');
    if (!composer) {
      console.log('⚠️  Composer not found, trying tweet button');
      const tweetBtn = await page.$('[data-testid="SideNav_NewTweet_Button"]');
      if (tweetBtn) await tweetBtn.click();
      await sleep(500);
    }
    
    // Type text
    const ta = await page.$('[data-testid="tweetTextarea_0"]');
    if (ta) {
      await ta.click();
      await sleep(200);
      await page.keyboard.type(text, { delay: 3 });
    } else {
      console.log('❌ Could not find textarea');
      return false;
    }
    
    // Add media
    if (mediaPath && fs.existsSync(mediaPath)) {
      try {
        const fileInput = await page.$('[type="file"]');
        if (fileInput) {
          await fileInput.uploadFile(mediaPath);
          console.log(`📎 Media attached`);
          await sleep(1500);
        }
      } catch (e) {
        console.log(`⚠️  Media attachment failed: ${e.message}`);
      }
    }
    
    // Post
    await sleep(500);
    const btn = await page.$('[data-testid="tweetButton"]');
    if (btn) {
      const disabled = await page.evaluate(el => el.disabled, btn);
      if (!disabled) {
        console.log('🚀 Posting...');
        await btn.click();
        await sleep(2500);
        console.log('✅ Posted!');
        return true;
      } else {
        console.log('⚠️  Button disabled');
        return false;
      }
    } else {
      console.log('❌ Post button not found');
      return false;
    }
  } catch (error) {
    console.error(`❌ Post error: ${error.message}`);
    return false;
  }
}

async function followInSession(page, handle) {
  try {
    console.log(`👥 Following: ${handle}`);
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    
    // Click follow button (text or icon based)
    const followBtn = await page.$('a[href="/' + handle + '"], button[aria-label*="Follow"]');
    if (followBtn) {
      await followBtn.click();
      await sleep(1500);
      console.log(`✅ Followed`);
      return true;
    }
    
    // Alternative: look for all buttons
    const btns = await page.$$('button');
    for (let btn of btns) {
      const label = await page.evaluate(el => el.getAttribute('aria-label'), btn);
      if (label && label.includes('Follow')) {
        await page.evaluate(el => el.click(), btn);
        await sleep(1500);
        console.log(`✅ Followed`);
        return true;
      }
    }
    
    console.log(`⚠️  Could not find follow button`);
    return false;
    
  } catch (error) {
    console.error(`❌ Follow error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 ALYGN Twitter Phase 2: Single Session (Optimized)\n');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      userDataDir: USER_DATA_DIR,
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Verify login
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    const loggedIn = await page.evaluate(() => !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]'));
    
    if (!loggedIn) {
      console.log('❌ Not logged in. Please log in manually first.');
      await browser.close();
      process.exit(1);
    }
    
    console.log('✅ Authenticated\n');
    console.log('='.repeat(60) + '\n');
    
    // Posts
    console.log('📋 Posting Threads...\n');
    let posted = 0;
    for (let i = 0; i < workflow.posts.length; i++) {
      const post = workflow.posts[i];
      console.log(`[${i+1}/5]`);
      const success = await postInSession(page, post.fullText, mediaMap[post.title]);
      if (success) posted++;
      
      if (i < workflow.posts.length - 1) {
        console.log('⏳ Waiting before next post...\n');
        await sleep(4000);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Results: ${posted}/${workflow.posts.length} posted\n`);
    
    // Follows
    console.log('👥 Following Profiles...\n');
    let followed = 0;
    for (let i = 0; i < workflow.profiles.length; i++) {
      const handle = workflow.profiles[i].replace('@', '');
      console.log(`[${i+1}/5]`);
      const success = await followInSession(page, handle);
      if (success) followed++;
      
      if (i < workflow.profiles.length - 1) {
        console.log('⏳ Waiting...\n');
        await sleep(3000);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ PHASE 2 COMPLETE!\n');
    console.log(`Posts: ${posted}/${workflow.posts.length}`);
    console.log(`Follows: ${followed}/${workflow.profiles.length}\n`);
    
    await browser.close();
    
  } catch (error) {
    console.error('Fatal:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
