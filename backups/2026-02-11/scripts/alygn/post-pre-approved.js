#!/usr/bin/env node

/**
 * ALYGN Pre-Approved Post Automation
 * 
 * Purpose:
 * - Post one pre-approved post per day (sequential order)
 * - Track which posts have been used
 * - Update tracking JSON with posted status
 * 
 * Workflow:
 * 1. Load pre-approved-posts.json
 * 2. Find next unposted post
 * 3. Post via X API (same credentials as discovery system)
 * 4. Update tracking JSON with date/tweet_id
 * 5. Report to WhatsApp (optional)
 * 
 * Usage:
 *   node post-pre-approved.js               # Post next pre-approved post
 *   node post-pre-approved.js --status      # Show posting status
 *   node post-pre-approved.js --reset       # Reset all to unposted (admin only)
 */

import { Client } from "@xdevplatform/xdk";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const TRACKING_FILE = path.join(__dirname, 'pre-approved-posts.json');
const CREDENTIALS_PATH = path.join(process.env.HOME, '.openclaw/workspace/config/credentials.json');
const WORKSPACE = path.join(process.env.HOME, '.openclaw/workspace');

// Console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * Load X API credentials (same as discovery system)
 */
function loadCredentials() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  return {
    apiKey: credentials.twitter.consumerKey,
    apiSecret: credentials.twitter.consumerSecret,
    accessToken: credentials.twitter.accessToken,
    accessTokenSecret: credentials.twitter.accessTokenSecret
  };
}

/**
 * Load tracking data
 */
async function loadTracking() {
  try {
    const data = fs.readFileSync(TRACKING_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    error('Failed to load tracking file:', err.message);
    throw err;
  }
}

/**
 * Save tracking data
 */
async function saveTracking(data) {
  try {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
    success('Tracking file updated');
  } catch (err) {
    error('Failed to save tracking file:', err.message);
    throw err;
  }
}

/**
 * Find next unposted post
 */
function findNextPost(tracking) {
  return tracking.posts.find(p => !p.posted);
}

/**
 * Show posting status
 */
async function showStatus() {
  const tracking = await loadTracking();
  
  const posted = tracking.posts.filter(p => p.posted).length;
  const remaining = tracking.posts.length - posted;
  
  console.log('\n📊 Pre-Approved Posts Status\n');
  console.log(`Total posts: ${tracking.posts.length}`);
  console.log(`Posted: ${posted}`);
  console.log(`Remaining: ${remaining}`);
  console.log(`Progress: ${Math.round((posted / tracking.posts.length) * 100)}%\n`);
  
  const nextPost = findNextPost(tracking);
  if (nextPost) {
    console.log(`Next post: #${nextPost.id}`);
    console.log(`Content: "${nextPost.text}"\n`);
  } else {
    warn('All posts have been used! Consider creating variations or resetting.\n');
  }
  
  // Show last 5 posted
  const recentPosts = tracking.posts
    .filter(p => p.posted)
    .sort((a, b) => new Date(b.date_posted) - new Date(a.date_posted))
    .slice(0, 5);
  
  if (recentPosts.length > 0) {
    console.log('Recent posts:');
    recentPosts.forEach(p => {
      console.log(`  #${p.id} - ${p.date_posted} - "${p.text.substring(0, 50)}..."`);
    });
  }
}

/**
 * Post via X API (same method as discovery system)
 */
async function postToTwitter(text) {
  log(`🐦 Posting to X.com via X API...`);
  log(`Content: "${text}"`);
  
  try {
    // Load credentials
    const creds = loadCredentials();
    
    // Initialize X API client (same as discovery system)
    const client = new Client({
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      accessToken: creds.accessToken,
      accessTokenSecret: creds.accessTokenSecret
    });
    
    // Post tweet
    const response = await client.posts.create({ text: text });
    const tweetId = response.data?.id;
    
    if (tweetId) {
      success(`Posted to X.com! Tweet ID: ${tweetId}`);
      return tweetId;
    } else {
      throw new Error('No tweet ID in response');
    }
  } catch (err) {
    error('X API posting failed:', err.message);
    throw err;
  }
}

/**
 * Notify via WhatsApp (optional)
 */
async function notifyWhatsApp(post, tweetId) {
  try {
    const tweetUrl = `https://x.com/aialygn/status/${tweetId}`;
    const message = `📣 ALYGN Pre-Approved Post #${post.id} Posted\n\n` +
                    `Content: "${post.text}"\n\n` +
                    `Tweet: ${tweetUrl}\n` +
                    `Date: ${new Date().toISOString()}\n\n` +
                    `Progress: ${post.id}/100 posts`;
    
    log('📱 Sending WhatsApp notification...');
    
    // Use OpenClaw message tool
    execSync(`openclaw message send --to="+50662163355" --channel=whatsapp --message="${message.replace(/"/g, '\\"')}"`, {
      cwd: WORKSPACE,
      stdio: 'inherit'
    });
    
    success('WhatsApp notification sent');
  } catch (err) {
    warn('WhatsApp notification failed (non-fatal)');
  }
}

/**
 * Main: Post next pre-approved post
 */
async function postNext() {
  log('🚀 Starting pre-approved post automation...\n');
  
  // Load tracking
  const tracking = await loadTracking();
  
  // Find next post
  const nextPost = findNextPost(tracking);
  if (!nextPost) {
    warn('All 100 posts have been used!');
    warn('Consider creating variations or resetting the tracker.');
    return false;
  }
  
  log(`📝 Next post: #${nextPost.id}`);
  log(`Content: "${nextPost.text}"\n`);
  
  // Post to Twitter via X API
  const tweetId = await postToTwitter(nextPost.text);
  
  // Update tracking
  nextPost.posted = true;
  nextPost.date_posted = new Date().toISOString();
  nextPost.tweet_id = tweetId;
  
  tracking.meta.last_updated = new Date().toISOString();
  
  await saveTracking(tracking);
  
  success(`\n✅ Post #${nextPost.id} marked as posted!`);
  log(`Progress: ${nextPost.id}/100 (${Math.round((nextPost.id / 100) * 100)}%)`);
  log(`Tweet URL: https://x.com/aialygn/status/${tweetId}`);
  
  // Notify via WhatsApp
  await notifyWhatsApp(nextPost, tweetId);
  
  return true;
}

/**
 * Reset all posts to unposted (admin only)
 */
async function resetAll() {
  warn('⚠️  ADMIN ACTION: Resetting all posts to unposted');
  
  const tracking = await loadTracking();
  
  tracking.posts.forEach(p => {
    p.posted = false;
    p.date_posted = null;
    p.tweet_id = null;
  });
  
  tracking.meta.last_updated = new Date().toISOString();
  
  await saveTracking(tracking);
  
  success('All posts reset to unposted');
}

/**
 * CLI handler
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
ALYGN Pre-Approved Post Automation

Usage:
  node post-pre-approved.js               # Post next pre-approved post
  node post-pre-approved.js --status      # Show posting status
  node post-pre-approved.js --reset       # Reset all to unposted (admin only)
  node post-pre-approved.js --help        # Show this help
`);
    return;
  }
  
  if (args.includes('--status')) {
    await showStatus();
    return;
  }
  
  if (args.includes('--reset')) {
    await resetAll();
    return;
  }
  
  // Default: post next
  const success = await postNext();
  process.exit(success ? 0 : 1);
}

// Run if called directly
main().catch(err => {
  error('💥 Fatal error:', err);
  process.exit(1);
});

export { postNext, showStatus, resetAll, loadTracking };
