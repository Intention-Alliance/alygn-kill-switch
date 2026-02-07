#!/usr/bin/env node
/**
 * Twitter Puppeteer Poster
 * Launches own browser instance and posts to Twitter
 * Usage: node twitter-puppeteer-post.js "Your tweet text here"
 */

const puppeteer = require('puppeteer-core');
const path = require('path');

const USER_DATA_DIR = '/home/andlersrv/.openclaw/browser/openclaw/user-data';
const CHROME_PATH = '/usr/bin/chromium';

async function postTweet(tweetText) {
  console.log('🐦 Launching browser...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      userDataDir: USER_DATA_DIR,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    console.log('✅ Browser launched');
    
    const page = await browser.newPage();
    
    // Navigate to Twitter home to check login
    console.log('📄 Navigating to Twitter...');
    await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Check if we're logged in
    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    });
    
    if (!isLoggedIn) {
      console.log('⚠️ Not logged in! Please log in manually first with a visible browser.');
      const screenshotPath = `/tmp/twitter-not-logged-in-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Screenshot: ${screenshotPath}`);
      await browser.close();
      process.exit(1);
    }
    
    // Navigate to compose
    console.log('📝 Opening compose dialog...');
    await page.goto('https://x.com/compose/post', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    
    // Wait a moment for the editor to be ready
    await new Promise(r => setTimeout(r, 1000));
    
    // Click on the textarea to focus
    console.log('🎯 Focusing text area...');
    await page.click('[data-testid="tweetTextarea_0"]');
    await new Promise(r => setTimeout(r, 500));
    
    // Type the tweet using Puppeteer's native keyboard
    console.log('⌨️ Typing tweet...');
    await page.keyboard.type(tweetText, { delay: 10 });
    
    // Wait for the Post button to become enabled
    console.log('⏳ Waiting for Post button...');
    await new Promise(r => setTimeout(r, 1000));
    
    // Take screenshot before posting
    const screenshotPath = `/tmp/twitter-pre-post-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    
    // Find and click the Post button
    const postButton = await page.$('[data-testid="tweetButton"]');
    if (postButton) {
      const isDisabled = await page.evaluate(btn => btn.disabled || btn.getAttribute('aria-disabled') === 'true', postButton);
      if (isDisabled) {
        console.log('⚠️ Post button is disabled. Tweet text might not have been entered correctly.');
        console.log('Check the screenshot to verify.');
      } else {
        console.log('🚀 Clicking Post button...');
        await postButton.click();
        await new Promise(r => setTimeout(r, 3000));
        console.log('✅ Tweet posted!');
      }
    } else {
      console.log('❌ Could not find Post button');
    }
    
    await browser.close();
    console.log('🔄 Browser closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

async function postReply(tweetUrl, replyText) {
  console.log('🐦 Launching browser for reply...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      userDataDir: USER_DATA_DIR,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    const page = await browser.newPage();
    
    // Navigate to the tweet
    console.log(`📄 Navigating to tweet: ${tweetUrl}`);
    await page.goto(tweetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('[data-testid="reply"]', { timeout: 10000 });
    
    // Click reply button
    console.log('💬 Clicking reply button...');
    await page.click('[data-testid="reply"]');
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Focus and type
    await page.click('[data-testid="tweetTextarea_0"]');
    await new Promise(r => setTimeout(r, 500));
    
    console.log('⌨️ Typing reply...');
    await page.keyboard.type(replyText, { delay: 10 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Screenshot
    const screenshotPath = `/tmp/twitter-pre-reply-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    
    // Click reply/post button
    const replyButton = await page.$('[data-testid="tweetButton"]');
    if (replyButton) {
      const isDisabled = await page.evaluate(btn => btn.disabled || btn.getAttribute('aria-disabled') === 'true', replyButton);
      if (!isDisabled) {
        console.log('🚀 Posting reply...');
        await replyButton.click();
        await new Promise(r => setTimeout(r, 3000));
        console.log('✅ Reply posted!');
      } else {
        console.log('⚠️ Reply button disabled');
      }
    }
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage:');
  console.log('  Post:  node twitter-puppeteer-post.js "Your tweet text"');
  console.log('  Reply: node twitter-puppeteer-post.js --reply "https://x.com/user/status/123" "Your reply"');
  process.exit(1);
}

if (args[0] === '--reply' && args.length >= 3) {
  postReply(args[1], args[2]).catch(e => process.exit(1));
} else {
  postTweet(args.join(' ')).catch(e => process.exit(1));
}
