
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
import { parseGrokOutput, shortenUrl } from '../../alygn/x-growth/parser/twitter-content-parser.js';

// Configuration
const OUTPUT_DIR = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs');
const LOGS_DIR = path.join(OUTPUT_DIR, 'logs');
const ALYGN_WORKFLOW_DIR = path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs/alygn/workflows");
const CREDENTIALS_PATH = path.join(process.env.HOME, '.openclaw/workspace/config/credentials.json');

// Rate limits (CONSERVATIVE - Quality over Quantity)
// Prioritize account safety and engagement quality - avoid 403/406/409 errors
const RATE_LIMITS = {
  // Daily limits for Alygn Twitter automation
  posts_per_day: 3,         // Main tweets (3 thread pairs)
  replies_per_day: 3,       // Reply tweets (3 thread pairs)
  quotes_per_day: 3,        // Quote posts (2-4 range)
  follows_per_day: 4,       // Hard limit (X API)
  likes_per_day: 8,         // Hard limit (X API)
  pre_approved_per_day: 1,  // Pre-approved post (separate from posts_per_day)
  
  // Weekly limits (prevent burnout patterns)
  max_actions_per_week: 50,  // Total actions cap (reduced from 80)
  skip_days_per_week: 1,     // Rest 1 day/week (natural pattern)
  
  // Delays (CONSERVATIVE to avoid rate limiting)
  min_delay_between_threads: 45,  // 45-60s between thread pairs
  max_delay_between_threads: 60,
  min_delay_before_reply: 3,      // 3-5s before posting reply
  max_delay_before_reply: 5,
  
  // Engagement targets
  min_engagement_per_day: 2,      // Minimum quotes/replies
  max_engagement_per_day: 4,      // Maximum quotes/replies
  
  // Account age factor
  account_age_days: 30,           // Check if account < 30 days
  new_account_multiplier: 0.5     // 50% limits for new accounts
};

// Console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

import { loadCredentials } from "../load-credentials.js";

/**
 * Initialize X API client
 */
function createClient() {
  const creds = loadCredentials();
  const oauth1 = new OAuth1({
    apiKey: creds.twitter.consumerKey,
    apiSecret: creds.twitter.consumerSecret,
    accessToken: creds.twitter.accessToken,
    accessTokenSecret: creds.twitter.accessTokenSecret
  });
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
 * Select varied hashtags based on content topic
 * Rotates between 8-10 different hashtag sets to avoid repetition
 */
let hashtagRotationIndex = 0;
const HASHTAG_POOLS = [
  ["#AIGovernance", "#InstitutionalAI"],
  ["#AIAlignment", "#Alygn"],
  ["#AISafety", "#AIPolicy"],
  ["#AIEthics", "#AITransparency"],
  ["#AIRisk", "#AIGovernance"],
  ["#AGI", "#AIRegulation"],
  ["#AICoordination", "#Alygn"],
  ["#AILegitimacy", "#AIGovernance"],
  ["#InstitutionalAI", "#AIPolicy"],
  ["#AIGovernance", "#AISafety"]
];

function selectVariedHashtags(content = '') {
  // Rotate through hashtag pools
  const hashtags = HASHTAG_POOLS[hashtagRotationIndex % HASHTAG_POOLS.length];
  hashtagRotationIndex++;
  return hashtags;
}

/**
 * Format tweet with hashtags (MANDATORY for Alygn branding)
 * Applies to ALL tweets: posts, replies, quotes
 * Uses varied hashtags to avoid repetition
 */
function formatTweet(content, customHashtags = null) {
  const hashtags = customHashtags || selectVariedHashtags(content);
  const hashtagStr = hashtags.join(" ");
  
  // Check if content already ends with these hashtags (avoid duplication)
  if (content.endsWith(hashtagStr) || content.endsWith('#Alygn')) {
    return content; // Hashtags already present
  }
  
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
 * Reply to a post with optional source URL (shortened via TinyURL)
 */
async function replyToPost(client, content, targetPostId, sourceUrl = null, mediaPath = null) {
  try {
    // Add source URL if provided (shorten via TinyURL)
    let finalContent = content;
    if (sourceUrl && !content.includes(sourceUrl)) {
      console.log(`🔗 Attempting to shorten: ${sourceUrl.substring(0, 50)}...`);
      const shortUrl = await shortenUrl(sourceUrl);
      if (shortUrl) {
        finalContent = `${content}\n\n📚 Source: ${shortUrl}`;
        console.log(`✅ Shortened to: ${shortUrl}`);
      } else {
        // Fallback to original URL if shortening fails
        finalContent = `${content}\n\n📚 Source: ${sourceUrl}`;
        console.log(`⚠️  Using original URL (shortening failed)`);
      }
    }
    
    const formatted = formatTweet(finalContent);
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
    
    // Engagement limits for discovery mode
    let engagementToday = 0;
    const MAX_ENGAGEMENT = 4;
    const MIN_ENGAGEMENT = 2;
    
    // Check if workflow has engagement targets (from decision engine)
    const isEngagementMode = workflow.source?.includes('Decision Engine') || process.argv.includes('--engagement-mode');
    
    if (workflow.posts) {
      for (const post of workflow.posts) {
        // Check engagement limits in discovery mode
        if (isEngagementMode && engagementToday >= MAX_ENGAGEMENT) {
          warn(`⚠️  Daily engagement limit reached: ${MAX_ENGAGEMENT}. Skipping remaining posts.`);
          break;
        }
        try {
          // Check if this is a thread pair (mainText + replyText)
          if (post.mainText && post.isThread) {
            // Thread pair execution: main tweet + reply
            log(`📝 Thread #${post.id}: ${post.mainText.substring(0, 60)}...`);
            
            // Post main tweet with dynamic hashtags
            const mainFormatted = formatTweet(post.mainText);
            const mainId = await postTweet(client, mainFormatted, post.mediaPath);
            results.posts.push({ id: mainId, content: mainFormatted, type: 'main' });
            success(`  ✅ Main posted (ID: ${mainId})`);
            results.executed++;
            
            // Post reply (governance angle) with delay to avoid rate limiting
            if (post.replyText) {
              log(`💬 Reply: ${post.replyText.substring(0, 50)}...`);
              
              // Wait 3-5s before posting reply (natural behavior)
              const replyDelay = Math.floor(Math.random() * 3) + 3;
              await new Promise(resolve => setTimeout(resolve, replyDelay * 1000));
              
              const replyFormatted = formatTweet(post.replyText);
              const replyId = await replyToPost(client, replyFormatted, mainId, post.sourceUrl);
              results.posts.push({ id: replyId, content: replyFormatted, type: 'reply', parentId: mainId, sourceUrl: post.sourceUrl });
              success(`  ✅ Reply posted (ID: ${replyId})`);
              results.executed++;
              engagementToday++;
              
              if (isEngagementMode) {
                log(`   📊 Engagement: ${engagementToday}/${MAX_ENGAGEMENT}`);
              }
              
              if (post.sourceUrl && !post.sourceUrl.includes('twitter.com')) {
                log(`   🔗 Source: ${post.sourceUrl}`);
              }
            }
            
            // Random delay 45-60s between thread pairs (conservative rate limiting)
            const delay = Math.floor(Math.random() * (RATE_LIMITS.max_delay_between_threads - RATE_LIMITS.min_delay_between_threads + 1)) + RATE_LIMITS.min_delay_between_threads;
            log(`  ⏱️  Waiting ${delay}s before next thread...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
            
          } else if (post.content) {
            // Legacy single post format
            log(`📝 Posting: ${post.content.substring(0, 60)}...`);
            
            let postId;
            if (post.quoteTweetId) {
              postId = await quotePost(client, post.content, post.quoteTweetId, post.mediaPath);
              results.quotes.push({ id: postId, content: post.content, quoted: post.quoteTweetId });
              // Count quotes as engagement in discovery mode
              if (isEngagementMode) {
                engagementToday++;
                log(`   📊 Engagement: ${engagementToday}/${MAX_ENGAGEMENT}`);
              }
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
          }
          
        } catch (err) {
          error(`  ❌ Failed:`, err.message);
          results.failed++;
        }
      }
    }
    
    if (workflow.replies) {
      for (const reply of workflow.replies) {
        // Check engagement limits in discovery mode
        if (isEngagementMode && engagementToday >= MAX_ENGAGEMENT) {
          warn(`⚠️  Daily engagement limit reached: ${MAX_ENGAGEMENT}. Skipping remaining replies.`);
          break;
        }
        
        try {
          log(`💬 Replying to ${reply.targetHandle}...`);
          
          const postIdMatch = reply.targetUrl?.match(/status\/(\d+)/);
          const targetPostId = postIdMatch ? postIdMatch[1] : null;
          
          if (!targetPostId) {
            throw new Error(`Could not extract post ID from URL: ${reply.targetUrl}`);
          }
          
          const replyId = await replyToPost(client, reply.content, targetPostId, null, reply.mediaPath);
          results.replies.push({ id: replyId, content: reply.content, target: reply.targetHandle });
          success(`  ✅ Reply posted (ID: ${replyId})`);
          results.executed++;
          engagementToday++;
          
          if (isEngagementMode) {
            log(`   📊 Engagement: ${engagementToday}/${MAX_ENGAGEMENT}`);
          }
          
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
  const workflow = await parseGrokOutput(markdown);
  
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
      log(`📝 Thread #${idx + 1} [${post.status.toUpperCase()}]`);
      
      // Main tweet
      log(`   📌 Main: ${post.mainTweet.substring(0, 80)}...`);
      log(`   📏 Length: ${post.mainTweet.length} chars`);
      
      // Reply tweet
      if (post.isThread && post.replyTweet) {
        log(`   💬 Reply: ${post.replyTweet.substring(0, 60)}...`);
        if (post.sourceUrl) {
          log(`   🔗 Source: ${post.sourceUrl}`);
        }
      }
      
      if (post.issues?.length > 0) {
        warn(`   Issues: ${post.issues.join(', ')}`);
      } else {
        success('   Ready to post as thread');
      }
      
      results.posts.push(post);
      results.executed++;
    });
    
  } else {
    // Live execution - THREAD PAIRS with daily limits
    const client = createClient();
    success('X API client initialized\n');
    
    // Daily limits enforcement
    let mainPostsToday = 0;
    let replyPostsToday = 0;
    const MAX_MAIN_POSTS = 3;
    const MAX_REPLY_POSTS = 3;
    
    for (const post of workflow.posts) {
      // Check daily limits
      if (mainPostsToday >= MAX_MAIN_POSTS) {
        warn(`⚠️  Daily limit reached: ${MAX_MAIN_POSTS} main posts. Skipping remaining posts.`);
        break;
      }
      
      if (post.status !== 'ready') {
        warn(`⚠️  Skipping blocked post: ${post.issues?.join(', ')}`);
        continue;
      }
      
      try {
        // Check daily limits BEFORE posting
        if (mainPostsToday >= MAX_MAIN_POSTS) {
          warn(`⚠️  Daily main post limit reached: ${MAX_MAIN_POSTS}. Skipping remaining posts.`);
          break;
        }
        
        // Post main tweet
        log(`📝 Main tweet: ${post.mainTweet.substring(0, 60)}...`);
        
        const mainId = await postTweet(client, post.mainTweet, post.mediaPath);
        results.posts.push({ id: mainId, content: post.mainTweet, type: 'main' });
        success(`  ✅ Main posted (ID: ${mainId})`);
        results.executed++;
        mainPostsToday++;
        
        // Check reply limit before posting reply
        if (replyPostsToday >= MAX_REPLY_POSTS) {
          warn(`⚠️  Daily reply limit reached: ${MAX_REPLY_POSTS} replies. Skipping reply for this thread.`);
          continue;
        }
        
        // Post reply with source if thread (with delay to avoid rate limiting)
        if (post.isThread && post.replyTweet) {
          log(`💬 Reply with source: ${post.sourceUrl || 'context'}`);
          
          // Wait 3-5s before posting reply (natural behavior)
          const replyDelay = Math.floor(Math.random() * 3) + 3;
          await new Promise(resolve => setTimeout(resolve, replyDelay * 1000));
          
          const replyId = await replyToPost(client, post.replyTweet, mainId, post.sourceUrl);
          results.posts.push({ id: replyId, content: post.replyTweet, type: 'reply', parentId: mainId, sourceUrl: post.sourceUrl });
          success(`  ✅ Reply posted (ID: ${replyId})`);
          replyPostsToday++;
          results.executed++;
        }
        
        // Random delay 25-40s between thread pairs (conservative rate limiting)
        const delay = Math.floor(Math.random() * 16) + 25;
        log(`  ⏱️  Waiting ${delay}s before next thread...`);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
        
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
  createClient, createPoll, executeJsonWorkflow,
  executeMarkdownWorkflow, postTweet, quotePost, replyToPost, searchMode
};

