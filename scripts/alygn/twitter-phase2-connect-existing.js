#!/usr/bin/env node
/**
 * ALYGN Twitter Phase 2: Connect to Existing Chrome Session
 * Connects to already-running Chrome "Work" profile logged into X.com
 * Posts all 5 threads with media + follows profiles
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');

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

// Get Chrome DevTools endpoint from OpenClaw's CDP proxy
function getChromeEndpoint() {
  return new Promise((resolve, reject) => {
    // Try port 18792 first (OpenClaw CDP proxy)
    const req = http.get('http://127.0.0.1:18792/json/version', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.webSocketDebuggerUrl);
        } catch (e) {
          reject(new Error('Could not parse Chrome endpoint'));
        }
      });
    });
    req.on('error', () => {
      // Try standard Chrome DevTools port
      const req2 = http.get('http://127.0.0.1:9222/json/version', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.webSocketDebuggerUrl);
          } catch (e) {
            reject(new Error('Could not find Chrome on either port'));
          }
        });
      });
      req2.on('error', reject);
    });
  });
}

async function postThreadWithMedia(page, post, mediaPath) {
  try {
    console.log(`\n📝 Posting: ${post.title}`);
    
    // Go to home
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(800);
    
    // Click compose box
    const composer = await page.$('[data-testid="tweetTextarea_0"]');
    if (!composer) {
      console.log('⚠️  Composer not found, trying home button');
      const homeBtn = await page.$('[href="/home"]');
      if (homeBtn) await homeBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Click textarea
    const ta = await page.$('[data-testid="tweetTextarea_0"]');
    if (!ta) {
      console.log('❌ No textarea found');
      return false;
    }
    
    await ta.click();
    await page.waitForTimeout(300);
    
    // Type the post
    await page.keyboard.type(post.fullText, { delay: 2 });
    console.log(`✅ Text entered`);
    
    // Add media if available
    if (mediaPath && fs.existsSync(mediaPath)) {
      try {
        console.log(`📎 Uploading media...`);
        const fileInput = await page.$('[type="file"]');
        if (fileInput) {
          await fileInput.uploadFile(mediaPath);
          await page.waitForTimeout(1500);
          console.log(`✅ Media attached`);
        }
      } catch (e) {
        console.log(`⚠️  Media upload failed: ${e.message}`);
      }
    }
    
    // Wait and Post
    await page.waitForTimeout(800);
    const postBtn = await page.$('[data-testid="tweetButton"]');
    
    if (postBtn) {
      const disabled = await page.evaluate(btn => btn.disabled, postBtn);
      if (!disabled) {
        console.log(`🚀 Publishing...`);
        await postBtn.click();
        await page.waitForTimeout(2500);
        console.log(`✅ POSTED!`);
        return true;
      } else {
        console.log(`⚠️  Button disabled`);
        return false;
      }
    } else {
      console.log(`❌ Post button not found`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function followProfile(page, handle) {
  try {
    console.log(`\n👥 Following: ${handle}`);
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Look for follow button
    const buttons = await page.$$('button');
    for (let btn of buttons) {
      const label = await page.evaluate(el => el.getAttribute('aria-label'), btn);
      if (label && label.toLowerCase().includes('follow')) {
        await page.evaluate(el => el.click(), btn);
        await page.waitForTimeout(1200);
        console.log(`✅ Followed`);
        return true;
      }
    }
    
    console.log(`⚠️  Follow button not found`);
    return false;
    
  } catch (error) {
    console.error(`❌ Follow error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 ALYGN Twitter Phase 2: Connecting to Existing Chrome Session');
  console.log('='.repeat(60));
  
  let browser;
  try {
    // Get the WSS endpoint from existing Chrome
    console.log('🔍 Finding existing Chrome session...');
    const endpoint = await getChromeEndpoint();
    console.log(`✅ Found Chrome at: ${endpoint.substring(0, 50)}...`);
    
    // Connect to existing browser
    browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
    console.log('✅ Connected to existing browser\n');
    
    // Get existing page or create new one
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    console.log(`📋 PHASE 2 POSTING SEQUENCE:`);
    console.log('='.repeat(60));
    
    // Post all threads
    let postedCount = 0;
    for (let i = 0; i < workflow.posts.length; i++) {
      const post = workflow.posts[i];
      console.log(`\n[${i+1}/5] ${post.title}`);
      const success = await postThreadWithMedia(page, post, mediaMap[post.title]);
      if (success) postedCount++;
      
      if (i < workflow.posts.length - 1) {
        console.log('⏳ Waiting before next post...');
        await page.waitForTimeout(3000);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Posts: ${postedCount}/5`);
    
    // Follow profiles
    console.log(`\n👥 FOLLOWING PROFILES:`);
    console.log('='.repeat(60));
    
    let followedCount = 0;
    for (let i = 0; i < workflow.profiles.length; i++) {
      const handle = workflow.profiles[i].replace('@', '');
      console.log(`\n[${i+1}/5] @${handle}`);
      const success = await followProfile(page, handle);
      if (success) followedCount++;
      
      if (i < workflow.profiles.length - 1) {
        await page.waitForTimeout(2500);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ PHASE 2 COMPLETE!`);
    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`  ✅ Posts: ${postedCount}/5`);
    console.log(`  ✅ Follows: ${followedCount}/5`);
    console.log(`\n🎉 All done! Check @aialygn timeline for new posts.\n`);
    
  } catch (error) {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main();
