#!/usr/bin/env node
/**
 * Interactive Puppeteer Session for Twitter Automation
 * Keeps browser open so you can see what's happening and debug
 * Usage: node puppeteer-interactive-session.js
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function postTweet(page, post, mediaPath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📝 POSTING: ${post.title}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Navigate to home
    console.log('\n1️⃣  Navigating to https://x.com/home...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
    console.log('✅ Loaded');
    
    await page.waitForTimeout(1000);
    console.log('⏳ Waiting for page to settle...');
    
    // Step 2: Find and click the textarea
    console.log('\n2️⃣  Looking for compose textarea...');
    const textarea = await page.$('[data-testid="tweetTextarea_0"]');
    if (!textarea) {
      console.log('❌ ERROR: Textarea not found!');
      console.log('📸 Taking screenshot to debug...');
      await page.screenshot({ path: '/tmp/twitter-error-textarea.png' });
      console.log('📸 Screenshot saved: /tmp/twitter-error-textarea.png');
      return false;
    }
    console.log('✅ Found textarea');
    
    // Step 3: Click and focus
    console.log('\n3️⃣  Clicking textarea to focus...');
    await textarea.click();
    await page.waitForTimeout(500);
    console.log('✅ Focused');
    
    // Step 4: Type the tweet
    console.log('\n4️⃣  Typing tweet text...');
    console.log(`Text: "${post.fullText.substring(0, 60)}..."`);
    await page.keyboard.type(post.fullText, { delay: 2 });
    await page.waitForTimeout(800);
    console.log('✅ Text entered');
    
    // Step 5: Upload media if available
    if (mediaPath && fs.existsSync(mediaPath)) {
      console.log(`\n5️⃣  Uploading media: ${path.basename(mediaPath)}`);
      try {
        const fileInput = await page.$('[type="file"]');
        if (fileInput) {
          await fileInput.uploadFile(mediaPath);
          console.log('⏳ Media uploading...');
          await page.waitForTimeout(2000);
          console.log('✅ Media attached');
        } else {
          console.log('⚠️  File input not found');
        }
      } catch (e) {
        console.log(`⚠️  Media upload error: ${e.message}`);
      }
    }
    
    // Step 6: Find Post button
    console.log('\n6️⃣  Looking for Post button...');
    await page.waitForTimeout(500);
    
    const postBtn = await page.$('[data-testid="tweetButton"]');
    if (!postBtn) {
      console.log('❌ ERROR: Post button not found!');
      await page.screenshot({ path: '/tmp/twitter-error-postbtn.png' });
      console.log('📸 Screenshot saved: /tmp/twitter-error-postbtn.png');
      return false;
    }
    console.log('✅ Found Post button');
    
    // Step 7: Check if button is enabled
    console.log('\n7️⃣  Checking if button is enabled...');
    const disabled = await page.evaluate(btn => {
      const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
      const text = btn.textContent;
      return { isDisabled, text };
    }, postBtn);
    
    console.log(`   Button text: "${disabled.text}"`);
    console.log(`   Disabled: ${disabled.isDisabled}`);
    
    if (disabled.isDisabled) {
      console.log('⚠️  Button is DISABLED - text may not have entered correctly');
      await page.screenshot({ path: '/tmp/twitter-button-disabled.png' });
      console.log('📸 Screenshot saved: /tmp/twitter-button-disabled.png');
      return false;
    }
    
    // Step 8: Click Post
    console.log('\n8️⃣  CLICKING POST BUTTON...');
    await postBtn.click();
    console.log('⏳ Waiting for post to publish...');
    await page.waitForTimeout(3000);
    
    console.log('✅ POST PUBLISHED!');
    return true;
    
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    console.error(error.stack);
    await page.screenshot({ path: '/tmp/twitter-error-exception.png' });
    console.log('📸 Screenshot saved: /tmp/twitter-error-exception.png');
    return false;
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ALYGN TWITTER PHASE 2: INTERACTIVE PUPPETEER SESSION     ║
║  Keep browser open to debug authentication issues         ║
╚════════════════════════════════════════════════════════════╝
`);

  let browser;
  try {
    // Launch browser with visible window
    console.log('🚀 Launching Chromium...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      userDataDir: USER_DATA_DIR,
      headless: false,  // ← VISIBLE WINDOW
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    console.log('✅ Chromium launched (visible window opened)');
    console.log('📋 Authenticating to X.com...\n');
    
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Check authentication
    console.log('🔐 Checking authentication...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    });
    
    if (!isLoggedIn) {
      console.log('⚠️  NOT LOGGED IN - Please log in manually in the browser window');
      console.log('📌 Wait until you see the Twitter feed, then press ENTER to continue...\n');
      await prompt('Press ENTER when logged in: ');
    } else {
      console.log('✅ AUTHENTICATED\n');
    }
    
    // Interactive loop
    let postIndex = 0;
    while (true) {
      if (postIndex >= workflow.posts.length) {
        console.log('\n✅ All posts published!');
        break;
      }
      
      const post = workflow.posts[postIndex];
      console.log(`\n📋 Ready to post: ${post.title} (${postIndex + 1}/${workflow.posts.length})`);
      
      const action = await prompt('\nAction [p=post, s=skip, q=quit]: ');
      
      if (action.toLowerCase() === 'p') {
        const success = await postTweet(page, post, mediaMap[post.title]);
        if (success) {
          postIndex++;
          console.log(`\n✅ Successfully posted ${postIndex}/${workflow.posts.length}`);
          
          if (postIndex < workflow.posts.length) {
            await prompt('\nPress ENTER to continue to next post: ');
          }
        } else {
          console.log('\n❌ Post failed - check screenshots in /tmp/');
          const retry = await prompt('Retry? [y/n]: ');
          if (retry.toLowerCase() !== 'y') {
            postIndex++;
          }
        }
      } else if (action.toLowerCase() === 's') {
        postIndex++;
      } else if (action.toLowerCase() === 'q') {
        break;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Session complete!');
    console.log('='.repeat(60));
    console.log('\n💡 Tip: Check /tmp/ for error screenshots if needed');
    console.log('📧 Share any auth errors with Andler for debugging\n');
    
    rl.close();
    await browser.close();
    
  } catch (error) {
    console.error(`\n❌ FATAL ERROR: ${error.message}`);
    console.error(error.stack);
    rl.close();
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
