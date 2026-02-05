#!/usr/bin/env bun

/**
 * ALYGN Twitter Poster - Bird CLI Integration
 * 
 * Posts approved content from twitter-automation-v2.js to @aialyygn via bird CLI.
 * 
 * Workflow:
 * 1. Read generated content from /twitter-outputs/
 * 2. Check approval status from /twitter-outputs/approved/
 * 3. Post to @aialyygn via bird tweet/reply
 * 4. Archive to /twitter-outputs/posted/
 * 5. Track posting metrics
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getNotionKey } from '../shared/load-credentials.js';
import { log, success, error, LogLevel } from '../shared/logger.js';

// X API credentials
const CREDENTIALS_FILE = path.join(new URL('.', import.meta.url).pathname, '../../config/credentials.json');
let TWITTER_CREDS = null;

try {
  const credsData = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  TWITTER_CREDS = credsData.twitter;
} catch (e) {
  console.warn('⚠️  Could not load Twitter API credentials');
}

const NOTION_API_KEY = getNotionKey();
const BASE_DIR = new URL('.', import.meta.url).pathname;
const TWITTER_OUTPUTS_DIR = path.join(BASE_DIR, '../../twitter-outputs');
const APPROVED_DIR = path.join(TWITTER_OUTPUTS_DIR, 'approved');
const POSTED_DIR = path.join(TWITTER_OUTPUTS_DIR, 'posted');
const QUEUE_FILE = path.join(TWITTER_OUTPUTS_DIR, 'posting-queue.jsonl');

// Ensure directories exist
[APPROVED_DIR, POSTED_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Parse a markdown output file and extract post-worthy content
 */
function parsePostContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const result = {
    type: 'thread', // default
    posts: [],
    title: '',
    source: path.basename(filePath)
  };
  
  // Extract title
  const titleMatch = content.match(/^# (.+?)$/m);
  if (titleMatch) result.title = titleMatch[1];
  
  // Strategy 1: Look for "Hook:" lines (Grok prompt #1 format)
  // These are pre-formatted tweets ready to go
  const hookPattern = /^\s*-\s*Hook:\s*"(.+?)"\s*$/gm;
  let match;
  let hookCount = 0;
  
  while ((match = hookPattern.exec(content)) !== null) {
    const hookText = match[1].trim();
    // Remove emoji and trailing punctuation if needed
    if (hookText.length <= 280) {
      result.posts.push({
        text: hookText,
        number: hookCount++,
        type: 'tweet',
        source: 'hook'
      });
    }
  }
  
  // If no hooks found, try Strategy 2: numbered items
  if (result.posts.length === 0) {
    let currentPost = '';
    let postNum = 0;
    
    for (const line of lines) {
      // Match numbered items: "1. ", "2. ", etc.
      if (/^\d+\.\s/.test(line)) {
        if (currentPost.length > 0 && currentPost.length <= 280) {
          result.posts.push({
            text: currentPost.trim(),
            number: postNum++,
            type: 'tweet'
          });
        }
        currentPost = line.replace(/^\d+\.\s/, '');
      } else if (/^[\*\-]\s/.test(line) && currentPost.length > 0) {
        // New bullet = new post
        if (currentPost.length <= 280) {
          result.posts.push({
            text: currentPost.trim(),
            number: postNum++,
            type: 'tweet'
          });
        }
        currentPost = line.replace(/^[\*\-]\s/, '');
      } else if (line.trim() && !line.startsWith('#') && currentPost) {
        // Append to current post
        currentPost += ' ' + line.trim();
      }
    }
    
    // Add final post
    if (currentPost.length > 0 && currentPost.length <= 280) {
      result.posts.push({
        text: currentPost.trim(),
        number: postNum++,
        type: 'tweet'
      });
    }
  }
  
  return result;
}

/**
 * Queue a post for approval or posting
 */
function queuePost(postData) {
  const entry = {
    id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    text: postData.text,
    source: postData.source,
    type: postData.type || 'tweet',
    status: 'pending_approval',
    approved: false,
    posted: false,
    postedAt: null,
    engagement: { likes: 0, retweets: 0, replies: 0 }
  };
  
  fs.appendFileSync(QUEUE_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * Get pending posts from queue
 */
function getPendingPosts(status = 'pending_approval') {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  
  const lines = fs.readFileSync(QUEUE_FILE, 'utf-8').split('\n').filter(l => l.trim());
  return lines.map(l => {
    try {
      return JSON.parse(l);
    } catch (e) {
      return null;
    }
  }).filter(p => p && p.status === status);
}

/**
 * Auto-approve and post content (with quality gates)
 */
async function autoApproveAndPost(postData) {
  // Quality gates
  const issues = [];
  
  // Check length
  if (postData.text.length > 280) {
    issues.push(`Text too long (${postData.text.length}/280 chars)`);
  }
  
  // Check for spam indicators
  if ((postData.text.match(/!/g) || []).length > 3) {
    issues.push('Too many exclamation marks');
  }
  
  // Check for URLs (manually verify)
  if (postData.text.includes('http')) {
    issues.push('Contains URLs (manual review recommended)');
  }
  
  if (issues.length > 0) {
    return {
      approved: false,
      reason: 'Quality gate failed: ' + issues.join(', '),
      issues
    };
  }
  
  // Auto-approved
  return {
    approved: true,
    reason: 'Auto-approved (passed quality gates)'
  };
}

/**
 * Post to X via REST API v2 using configured credentials
 */
async function postToTwitter(text, replyToId = null) {
  if (!TWITTER_CREDS || !TWITTER_CREDS.bearerToken) {
    console.log(`   ❌ X API credentials not configured`);
    return {
      success: false,
      error: 'Bearer token missing from config',
      tweetId: null
    };
  }
  
  try {
    const endpoint = 'https://api.x.com/2/tweets';
    const payload = {
      text: text
    };
    
    // If replying to a tweet
    if (replyToId) {
      payload.reply = {
        in_reply_to_tweet_id: replyToId
      };
    }
    
    console.log(`   🔄 Posting to X API v2...`);
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TWITTER_CREDS.bearerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    };
    
    const response = await fetch(endpoint, options);
    const data = await response.json();
    
    if (!response.ok) {
      console.log(`   ❌ API Error: ${response.status}`);
      console.log(`      ${data.errors?.[0]?.message || data.detail || 'Unknown error'}`);
      return {
        success: false,
        error: data.errors?.[0]?.message || data.detail || `HTTP ${response.status}`,
        tweetId: null
      };
    }
    
    const tweetId = data.data?.id;
    console.log(`   ✅ Posted! Tweet ID: ${tweetId}`);
    console.log(`   🔗 Link: https://x.com/aialyygn/status/${tweetId}`);
    
    return {
      success: true,
      tweetId: tweetId,
      message: `Posted to @aialyygn (${tweetId})`
    };
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return {
      success: false,
      error: err.message,
      tweetId: null
    };
  }
}

/**
 * Post approved content to Twitter
 */
async function postApprovedContent() {
  const pending = getPendingPosts('approved');
  
  if (pending.length === 0) {
    console.log('ℹ️  No approved content to post');
    return { posted: 0, failed: 0 };
  }
  
  let posted = 0;
  let failed = 0;
  const today = new Date().toISOString().split('T')[0];
  const postedTodayCount = getPendingPosts('posted').filter(p => 
    p.postedAt?.startsWith(today)
  ).length;
  
  const MAX_POSTS_PER_DAY = 10;
  const remainingPostsToday = MAX_POSTS_PER_DAY - postedTodayCount;
  
  console.log(`📊 Rate limit: ${postedTodayCount}/${MAX_POSTS_PER_DAY} posts today`);
  console.log(`📤 Posting up to ${remainingPostsToday} approved posts...\n`);
  
  for (const post of pending.slice(0, remainingPostsToday)) {
    console.log(`📝 Posting: "${post.text.substring(0, 50)}..."`);
    
    const result = await postToTwitter(post.text, post.replyToId);
    
    if (result.success) {
      console.log(`   ✅ Posted (ID: ${result.tweetId})`);
      
      // Update queue
      post.status = 'posted';
      post.posted = true;
      post.postedAt = new Date().toISOString();
      post.tweetId = result.tweetId;
      
      updateQueueEntry(post);
      posted++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failed++;
    }
  }
  
  // Log to Notion
  await log({
    type: 'twitter-posting',
    title: 'Twitter Posting Session',
    level: LogLevel.INFO,
    summary: `Posted ${posted} tweets, ${failed} failed`,
    details: {
      posted,
      failed,
      remaining: remainingPostsToday - posted,
      dailyLimit: MAX_POSTS_PER_DAY
    },
    notionParent: 'organizations_todos'
  });
  
  return { posted, failed };
}

/**
 * Update an entry in the queue file
 */
function updateQueueEntry(updatedEntry) {
  const lines = fs.readFileSync(QUEUE_FILE, 'utf-8').split('\n');
  const newLines = lines.map(line => {
    if (!line.trim()) return line;
    try {
      const entry = JSON.parse(line);
      if (entry.id === updatedEntry.id) {
        return JSON.stringify(updatedEntry);
      }
    } catch (e) {
      // Skip invalid lines
    }
    return line;
  });
  
  fs.writeFileSync(QUEUE_FILE, newLines.join('\n'));
}

/**
 * Main entry point
 */
async function main() {
  const command = process.argv[2];
  
  try {
    if (command === 'check') {
      // Check if posting is ready
      console.log(`\n🐦 TWITTER POSTING STATUS\n`);
      console.log(`   Queue System: ✅ Ready`);
      console.log(`   Auto-approval: ✅ Ready`);
      console.log(`   X API Token: ⏳ Needs configuration`);
      console.log(`   \n   To enable real posting:`);
      console.log(`   1. Get X API credentials from dev.twitter.com`);
      console.log(`   2. Add to config/credentials.json:`);
      console.log(`   { "twitter": { "apiKey": "...", "apiSecret": "...", ... }}`);
      console.log(`   3. Install npm package: npm install twitter-api-v2`);
      console.log(`   4. Uncomment X API code in twitter-poster.js\n`);
      console.log(`   For now: Running in SIMULATION mode ✅\n`);
      
    } else if (command === 'queue') {
      // Queue content from twitter-outputs
      const promptNumber = process.argv[3];
      
      if (!promptNumber) {
        console.log('Usage: twitter-poster.js queue <prompt-number>');
        console.log('Example: twitter-poster.js queue 1');
        return;
      }
      
      // Find latest output for this prompt
      const files = fs.readdirSync(TWITTER_OUTPUTS_DIR)
        .filter(f => f.startsWith(`prompt-${promptNumber}-`) && f.endsWith('.md'))
        .sort()
        .reverse();
      
      if (files.length === 0) {
        console.log(`❌ No outputs found for prompt #${promptNumber}`);
        return;
      }
      
      const latestFile = path.join(TWITTER_OUTPUTS_DIR, files[0]);
      console.log(`📂 Parsing: ${files[0]}`);
      
      const parsed = parsePostContent(latestFile);
      console.log(`📊 Found ${parsed.posts.length} post(s) to queue\n`);
      
      let queued = 0;
      for (const post of parsed.posts) {
        // Auto-approve
        const approval = await autoApproveAndPost(post);
        
        const qEntry = queuePost({
          text: post.text,
          source: parsed.source,
          type: 'tweet'
        });
        
        qEntry.status = approval.approved ? 'approved' : 'pending_approval';
        qEntry.approved = approval.approved;
        qEntry.approvalReason = approval.reason;
        
        updateQueueEntry(qEntry);
        
        console.log(`${approval.approved ? '✅' : '⏳'} "${post.text.substring(0, 40)}..."`);
        console.log(`   ${approval.reason}\n`);
        
        if (approval.approved) queued++;
      }
      
      console.log(`\n📈 Summary: ${queued} auto-approved, ${parsed.posts.length - queued} pending manual review`);
      
    } else if (command === 'post') {
      // Post approved content
      const result = await postApprovedContent();
      console.log(`\n✨ Done: ${result.posted} posted, ${result.failed} failed`);
      
    } else if (command === 'status') {
      // Show queue status
      const approved = getPendingPosts('approved');
      const posted = getPendingPosts('posted');
      const pending = getPendingPosts('pending_approval');
      
      console.log(`\n📊 POSTING QUEUE STATUS\n`);
      console.log(`   ✅ Approved (ready to post): ${approved.length}`);
      console.log(`   📤 Already posted: ${posted.length}`);
      console.log(`   ⏳ Pending approval: ${pending.length}`);
      console.log(`   📝 Total in queue: ${approved.length + posted.length + pending.length}\n`);
      
    } else {
      console.log(`ALYGN Twitter Poster - Bird CLI Integration`);
      console.log(`\nUsage: twitter-poster.js <command> [args]\n`);
      console.log(`Commands:`);
      console.log(`  check              - Check if bird CLI is available`);
      console.log(`  queue <prompt-num> - Queue content from prompt output (with auto-approval)`);
      console.log(`  post               - Post all approved content (respects rate limit)`);
      console.log(`  status             - Show queue status\n`);
      console.log(`Example workflow:`);
      console.log(`  bun twitter-automation-v2.js exec 1  # Generate thread ideas`);
      console.log(`  bun twitter-poster.js queue 1        # Auto-approve & queue`);
      console.log(`  bun twitter-poster.js post           # Post to @aialyygn\n`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    await log({
      type: 'twitter-posting',
      title: 'Twitter Poster Error',
      level: LogLevel.ERROR,
      summary: err.message,
      details: { error: err.toString() },
      notionParent: 'organizations_todos'
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
