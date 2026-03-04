#!/usr/bin/env node

/**
 * X API Executor - Unified Twitter Execution Engine
 * 
 * SHARED SCRIPT - Supports both:
 * 1. Alygn X-Growth daily workflow (from Grok markdown)
 * 2. Municipal outreach X warmup (from JSON workflows)
 * 
 * Features:
 * - Post new tweets (with media)
 * - Reply to posts
 * - Quote posts
 * - Create polls (TODO)
 * - Dry-run and live modes
 * - Comprehensive audit logging
 * 
 * Usage:
 *   # Alygn X-Growth (markdown input)
 *   node scripts/shared/x-growth/x-api-executor.js <input.md> [--dry-run|--live]
 * 
 *   # Municipal outreach (JSON workflow)
 *   node scripts/shared/x-growth/x-api-executor.js --workflow=<path.json> [--dry-run|--live]
 * 
 *   # Search mode (for cronjob)
 *   node scripts/shared/x-growth/x-api-executor.js --search --query="<query>" [--limit=10]
 */

import { Client, OAuth1 } from "@xdevplatform/xdk";
import fs from "fs";
import path from "path";
import { parseGrokOutput } from '../../alygn/x-growth/parser/twitter-content-parser.js';

// Configuration
const OUTPUT_DIR = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs');
const LOGS_DIR = path.join(OUTPUT_DIR, 'logs');
const ALYGN_WORKFLOW_DIR = path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs/alygn/workflows");
const CREDENTIALS_PATH = path.join(process.env.HOME, '.openclaw/workspace/config/credentials.json');

// Rate limits (CONSERVATIVE - Outreach Strategy)
// Prioritize account safety over speed
const RATE_LIMITS = {
  // Daily limits for municipal outreach
  posts_per_day: 3,         // Original Alygn content
  replies_per_day: 4,       // To municipal accounts
  quotes_per_day: 2,        // Quote municipal content
  follows_per_day: 4,       // Hard limit (X API)
  likes_per_day: 8,         // Hard limit (X API)
  
  // Weekly limits (prevent burnout patterns)
  max_actions_per_week: 60,  // Total actions cap
  skip_days_per_week: 1,     // Rest 1 day/week (natural pattern)
  
  // Delays (increased for natural behavior)
  min_delay_between_actions: 15,  // 15-25s random
  max_delay_between_actions: 25,
  
  // Account age factor
  account_age_days: 30,           // Check if account < 30 days
  new_account_multiplier: 0.5     // 50% limits for new accounts
};

// Console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * Load X API credentials
 */
function loadCredentials() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    return {
      apiKey: credentials.twitter.consumerKey,
      apiSecret: credentials.twitter.consumerSecret,
      accessToken: credentials.twitter.accessToken,
      accessTokenSecret: credentials.twitter.accessTokenSecret
    };
  } catch (err) {
    throw new Error(`Failed to load credentials: ${err.message}`);
  }
}

/**
 * Initialize X API client
 */
function createClient() {
  const creds = loadCredentials();
  const oauth1 = new OAuth1(creds);
  return new Client({ oauth1 });
}

/**
 * Ensure output directories exist
 */
function ensureDirectories() {
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error('❌ Failed to create output directories:', err.message);
    process.exit(1);
  }
}

/**
 * Format tweet with hashtags (MANDATORY for Alygn branding)
 * Applies to ALL tweets: posts, replies, quotes
 */
function formatTweet(content, hashtags = ["#AIGovernance", "#Alygn"]) {
  const hashtagStr = hashtags.join(" ");
  return `${content}\n\n${hashtagStr}`;
}

/**
 * Post a regular tweet (with optional media)
 */
async function postTweet(client, content, mediaPath = null) {
  try {
    const formatted = formatTweet(content);
    const postData = { text: formatted };
    
    if (mediaPath && fs.existsSync(mediaPath)) {
      const mediaId = await client.media.uploadImage(mediaPath);
      if (mediaId) {
        postData.media = { media_ids: [mediaId] };
      }
    }
    
    const response = await client.posts.create(postData);
    return response.data?.id;
  } catch (err) {
    throw new Error(`Post failed: ${err.message}`);
  }
}

/**
 * Reply to a post
 */
async function replyToPost(client, content, targetPostId, mediaPath = null) {
  try {
    const formatted = formatTweet(content);
    const postData = { 
      text: formatted,
      reply: { in_reply_to_tweet_id: targetPostId }
    };
    
    if (mediaPath && fs.existsSync(mediaPath)) {
      const mediaId = await client.media.uploadImage(mediaPath);
      if (mediaId) {
        postData.media = { media_ids: [mediaId] };
      }
    }
    
    const response = await client.posts.create(postData);
    return response.data?.id;
  } catch (err) {
    throw new Error(`Reply failed: ${err.message}`);
  }
}

/**
 * Quote a post
 */
async function quotePost(client, content, quoteTweetId, mediaPath = null) {
  try {
    const formatted = formatTweet(content);
    const postData = { 
      text: formatted,
      quote_tweet_id: quoteTweetId
    };
    
    if (mediaPath && fs.existsSync(mediaPath)) {
      const mediaId = await client.media.uploadImage(mediaPath);
      if (mediaId) {
        postData.media = { media_ids: [mediaId] };
      }
    }
    
    const response = await client.posts.create(postData);
    return response.data?.id;
  } catch (err) {
    throw new Error(`Quote failed: ${err.message}`);
  }
}

/**
 * Create a poll (TODO)
 */
async function createPoll(client, content, options, durationMinutes = 1440) {
  try {
    const formatted = formatTweet(content);
    const postData = { 
      text: formatted,
      poll: {
        options: options,
        duration_minutes: durationMinutes
      }
    };
    
    const response = await client.posts.create(postData);
    return response.data?.id;
  } catch (err) {
    throw new Error(`Poll creation failed: ${err.message}`);
  }
}

/**
 * Execute workflow from JSON (Municipal outreach / Decision Engine)
 */
async function executeJsonWorkflow(workflowPath, dryRun = true) {
  log(`📂 Loading workflow: ${workflowPath}`);
  
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
  log(`📊 Workflow: ${workflow.posts?.length || 0} posts, ${workflow.replies?.length || 0} replies`);
  
  const results = {
    mode: dryRun ? 'dry-run' : 'live',
    executedAt: new Date().toISOString(),
    workflow,
    posts: [],
    replies: [],
    quotes: [],
    executed: 0,
    failed: 0
  };
  
  if (dryRun) {
    log('🔍 DRY-RUN MODE - No posts will be sent\n');
    
    // Simulate execution
    if (workflow.posts) {
      for (const post of workflow.posts) {
        log(`📝 Post: ${post.content.substring(0, 80)}...`);
        results.posts.push({ content: post.content, status: 'ready' });
        results.executed++;
      }
    }
    
    if (workflow.replies) {
      for (const reply of workflow.replies) {
        log(`💬 Reply to ${reply.targetHandle}: ${reply.content.substring(0, 80)}...`);
        results.replies.push({ content: reply.content, target: reply.targetHandle });
        results.executed++;
      }
    }
    
  } else {
    // Live execution
    const client = createClient();
    success('X API client initialized\n');
    
    if (workflow.posts) {
      for (const post of workflow.posts) {
        try {
          log(`📝 Posting: ${post.content.substring(0, 60)}...`);
          
          let postId;
          if (post.quoteTweetId) {
            postId = await quotePost(client, post.content, post.quoteTweetId, post.mediaPath);
            results.quotes.push({ id: postId, content: post.content, quoted: post.quoteTweetId });
          } else {
            postId = await postTweet(client, post.content, post.mediaPath);
            results.posts.push({ id: postId, content: post.content });
          }
          
          success(`  ✅ Posted (ID: ${postId})`);
          results.executed++;
          
          // Random delay between 10-15 seconds (avoid rate limit triggers)
          const delay = Math.floor(Math.random() * (RATE_LIMITS.max_delay_between_posts - RATE_LIMITS.min_delay_between_posts + 1)) + RATE_LIMITS.min_delay_between_posts;
          log(`  ⏱️  Waiting ${delay}s before next action...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
          
        } catch (err) {
          error(`  ❌ Failed:`, err.message);
          results.failed++;
        }
      }
    }
    
    if (workflow.replies) {
      for (const reply of workflow.replies) {
        try {
          log(`💬 Replying to ${reply.targetHandle}...`);
          
          const postIdMatch = reply.targetUrl?.match(/status\/(\d+)/);
          const targetPostId = postIdMatch ? postIdMatch[1] : null;
          
          if (!targetPostId) {
            throw new Error(`Could not extract post ID from URL: ${reply.targetUrl}`);
          }
          
          const replyId = await replyToPost(client, reply.content, targetPostId, reply.mediaPath);
          results.replies.push({ id: replyId, content: reply.content, target: reply.targetHandle });
          success(`  ✅ Reply posted (ID: ${replyId})`);
          results.executed++;
          
          // Random delay between 10-15 seconds
          const delay = Math.floor(Math.random() * (RATE_LIMITS.max_delay_between_actions - RATE_LIMITS.min_delay_between_actions + 1)) + RATE_LIMITS.min_delay_between_actions;
          log(`  ⏱️  Waiting ${delay}s before next action...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
          
        } catch (err) {
          error(`  ❌ Failed:`, err.message);
          results.failed++;
        }
      }
    }
  }
  
  // Save audit log
  const auditPath = path.join(LOGS_DIR, `audit-${Date.now()}.json`);
  fs.writeFileSync(auditPath, JSON.stringify(results, null, 2));
  log(`\n💾 Audit log saved: ${auditPath}`);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  success(`${dryRun ? 'DRY-RUN' : 'LIVE'} complete! ${results.executed} actions, ${results.failed} failed`);
  console.log('='.repeat(60));
  
  return results;
}

/**
 * Execute workflow from markdown (Grok output - Legacy Alygn)
 */
async function executeMarkdownWorkflow(markdownPath, dryRun = true) {
  log(`📄 Loading markdown: ${markdownPath}`);
  
  const markdown = fs.readFileSync(markdownPath, 'utf-8');
  const workflow = parseGrokOutput(markdown);
  
  log(`📊 Parsed: ${workflow.totalPosts} posts, ${workflow.validPosts} ready, ${workflow.blockedPosts} blocked`);
  
  const results = {
    mode: dryRun ? 'dry-run' : 'live',
    executedAt: new Date().toISOString(),
    workflow,
    posts: [],
    executed: 0,
    failed: 0
  };
  
  if (dryRun) {
    log('🔍 DRY-RUN MODE - No posts will be sent\n');
    
    workflow.posts.forEach((post, idx) => {
      log(`📝 Post #${idx + 1} [${post.status.toUpperCase()}]`);
      log(`   Content: ${post.content.substring(0, 80)}...`);
      log(`   Length: ${post.content.length} chars`);
      
      if (post.issues?.length > 0) {
        warn(`   Issues: ${post.issues.join(', ')}`);
      } else {
        success('   Ready to post');
      }
      
      results.posts.push(post);
      results.executed++;
    });
    
  } else {
    // Live execution
    const client = createClient();
    success('X API client initialized\n');
    
    for (const post of workflow.posts) {
      if (post.status !== 'ready') {
        warn(`⚠️  Skipping blocked post: ${post.issues?.join(', ')}`);
        continue;
      }
      
      try {
        log(`📝 Posting: ${post.content.substring(0, 60)}...`);
        
        const postId = await postTweet(client, post.content, post.mediaPath);
        results.posts.push({ id: postId, content: post.content });
        success(`  ✅ Posted (ID: ${postId})`);
        results.executed++;
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (err) {
        error(`  ❌ Failed:`, err.message);
        results.failed++;
      }
    }
  }
  
  // Save audit log
  const auditPath = path.join(LOGS_DIR, `audit-md-${Date.now()}.json`);
  fs.writeFileSync(auditPath, JSON.stringify(results, null, 2));
  log(`\n💾 Audit log saved: ${auditPath}`);
  
  return results;
}

/**
 * Search mode - for cronjob discovery
 */
async function searchMode(query, limit = 10) {
  log(`🔍 Search mode: "${query}" (limit: ${limit})`);
  
  const client = createClient();
  
  try {
    const response = await client.search.searchTweets({
      query: query,
      max_results: limit
    });
    
    const tweets = response.data || [];
    log(`📊 Found ${tweets.length} tweets`);
    
    tweets.forEach((tweet, idx) => {
      log(`\n${idx + 1}. @${tweet.author_id}`);
      log(`   ${tweet.text.substring(0, 100)}...`);
      log(`   ID: ${tweet.id}`);
    });
    
    return tweets;
    
  } catch (err) {
    error('Search failed:', err.message);
    throw err;
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  try {
    ensureDirectories();
    
    const args = process.argv.slice(2);
    
    // Parse arguments
    const workflowArg = args.find(a => a.startsWith('--workflow='));
    const searchArg = args.find(a => a.startsWith('--search'));
    const queryArg = args.find(a => a.startsWith('--query='));
    const limitArg = args.find(a => a.startsWith('--limit='));
    const liveArg = args.find(a => a.startsWith('--live'));
    
    const dryRun = !liveArg;
    
    // Search mode
    if (searchArg) {
      const query = queryArg ? queryArg.split('=')[1] : 'AI governance';
      const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;
      await searchMode(query, limit);
      process.exit(0);
    }
    
    // Workflow mode (JSON)
    if (workflowArg) {
      const workflowPath = workflowArg.split('=')[1];
      await executeJsonWorkflow(workflowPath, dryRun);
      process.exit(0);
    }
    
    // Markdown mode (legacy Grok output)
    const markdownPath = args.find(a => !a.startsWith('--'));
    if (markdownPath) {
      await executeMarkdownWorkflow(markdownPath, dryRun);
      process.exit(0);
    }
    
    // Auto-detect latest workflow
    if (fs.existsSync(ALYGN_WORKFLOW_DIR)) {
      const files = fs.readdirSync(ALYGN_WORKFLOW_DIR);
      const workflowFiles = files.filter(f => f.startsWith('workflow-')).sort().reverse();
      
      if (workflowFiles.length > 0) {
        const latestWorkflow = path.join(ALYGN_WORKFLOW_DIR, workflowFiles[0]);
        log(`📁 Auto-detected latest workflow: ${workflowFiles[0]}`);
        await executeJsonWorkflow(latestWorkflow, dryRun);
        process.exit(0);
      }
    }
    
    // No input provided
    console.log(`
❌ No input provided.

Usage:
  # Alygn X-Growth (markdown from Grok)
  node scripts/shared/x-growth/x-api-executor.js <input.md> [--dry-run|--live]

  # Municipal outreach / Decision Engine (JSON workflow)
  node scripts/shared/x-growth/x-api-executor.js --workflow=<path.json> [--dry-run|--live]

  # Search mode (for cronjob)
  node scripts/shared/x-growth/x-api-executor.js --search --query="<query>" [--limit=10]

  # Auto-detect latest Alygn workflow
  node scripts/shared/x-growth/x-api-executor.js [--dry-run|--live]
`);
    
    process.exit(1);
    
  } catch (err) {
    error('💥 Fatal error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for programmatic use
export { 
  executeJsonWorkflow, 
  executeMarkdownWorkflow, 
  searchMode,
  postTweet, 
  replyToPost, 
  quotePost, 
  createPoll,
  loadCredentials,
  createClient
};
