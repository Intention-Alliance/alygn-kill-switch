#!/usr/bin/env node

/**
 * ALYGN Twitter Discovery - Phase 3: X API Execution
 * 
 * Purpose:
 * - Read workflow-*.json from Phase 2 (Decision Engine)
 * - Execute actions via X API:
 *   - Post new tweets (with media)
 *   - Reply to posts
 *   - Quote posts (NEW)
 *   - Create polls (TODO)
 * - Track results and report summary
 * 
 * Workflow:
 * 1. Load workflow JSON from Phase 2
 * 2. For each action in workflow:
 *    a. Posts → create new tweet (with media if present)
 *    b. Replies → reply to target post
 *    c. Quotes → quote target post with commentary
 *    d. Polls → create poll tweet (TODO)
 * 3. Log results + WhatsApp notification (optional)
 */

import { Client, OAuth1 } from "@xdevplatform/xdk";
import fs from "fs";
import path from "path";

const WORKFLOW_DIR = path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs/alygn/workflows");
const CREDENTIALS_PATH = path.join(process.env.HOME, ".openclaw/workspace/config/credentials.json");

// Simple console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * Format tweet with signature + hashtag (MANDATORY)
 * Applies to ALL tweets: posts, replies, quotes
 */
function formatTweet(content, hashtags = ["#AIGovernance"]) {
  const hashtagStr = hashtags.join(" ");
  return `${content}\n\n${hashtagStr}\n\nmore at @aialygn`;
}

/**
 * Load X API credentials
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
 * Post a regular tweet (with optional media)
 */
async function postTweet(client, content, mediaPath = null) {
  try {
    // Apply mandatory format (hashtags + signature)
    const formatted = formatTweet(content);
    const postData = { text: formatted };
    
    // Add media if provided
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
    // Apply mandatory format (hashtags + signature)
    const formatted = formatTweet(content);
    const postData = { 
      text: formatted,
      reply: { in_reply_to_tweet_id: targetPostId }
    };
    
    // Add media if provided
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
 * Quote a post (NEW - Phase 3 feature)
 */
async function quotePost(client, content, quoteTweetId, mediaPath = null) {
  try {
    // Apply mandatory format (hashtags + signature)
    const formatted = formatTweet(content);
    const postData = { 
      text: formatted,
      quote_tweet_id: quoteTweetId
    };
    
    // Add media if provided
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
 * Create a poll (TODO - Phase 3 feature)
 */
async function createPoll(client, content, options, durationMinutes = 1440) {
  try {
    // Apply mandatory format (hashtags + signature)
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
 * Main execution workflow
 */
async function executeWorkflow(workflowPath) {
  log('⚡ Starting X API execution...');
  
  // Load workflow
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
  log(`📂 Loaded workflow: ${workflow.posts.length} posts, ${workflow.replies.length} replies`);
  
  // Setup X API client
  const credentials = loadCredentials();
  const oauth1 = new OAuth1(credentials);
  const client = new Client({ oauth1 });
  
  const results = {
    executed: 0,
    failed: 0,
    posts: [],
    replies: [],
    quotes: []
  };
  
  // Execute posts (includes quotes)
  for (const post of workflow.posts) {
    try {
      log(`\n📝 Posting: ${post.content.substring(0, 60)}...`);
      
      let postId;
      if (post.quoteTweetId) {
        // Quote tweet
        postId = await quotePost(client, post.content, post.quoteTweetId, post.mediaPath);
        results.quotes.push({ id: postId, content: post.content, quoted: post.quoteTweetId });
        success(`  ✅ Quote posted (ID: ${postId})`);
      } else if (post.poll) {
        // Poll tweet
        postId = await createPoll(client, post.content, post.poll.options, post.poll.duration_minutes);
        results.posts.push({ id: postId, content: post.content, type: 'poll' });
        success(`  ✅ Poll posted (ID: ${postId})`);
      } else {
        // Regular tweet
        postId = await postTweet(client, post.content, post.mediaPath);
        results.posts.push({ id: postId, content: post.content, type: 'regular' });
        success(`  ✅ Posted (ID: ${postId})`);
      }
      
      results.executed++;
      
      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (err) {
      error(`  ❌ Failed:`, err.message);
      results.failed++;
    }
  }
  
  // Execute replies
  for (const reply of workflow.replies) {
    try {
      log(`\n💬 Replying to ${reply.targetHandle}: ${reply.content.substring(0, 60)}...`);
      
      // Extract post ID from targetUrl
      const postIdMatch = reply.targetUrl?.match(/status\/(\d+)/);
      const targetPostId = postIdMatch ? postIdMatch[1] : null;
      
      if (!targetPostId) {
        throw new Error(`Could not extract post ID from URL: ${reply.targetUrl}`);
      }
      
      const replyId = await replyToPost(client, reply.content, targetPostId, reply.mediaPath);
      results.replies.push({ id: replyId, content: reply.content, target: reply.targetHandle });
      success(`  ✅ Reply posted (ID: ${replyId})`);
      
      results.executed++;
      
      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (err) {
      error(`  ❌ Failed:`, err.message);
      results.failed++;
    }
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(60));
  success(`✅ Execution complete! ${results.executed} actions executed, ${results.failed} failed`);
  console.log('='.repeat(60));
  
  console.log('\n📊 Results Summary:');
  console.log(`  Posts: ${results.posts.length}`);
  console.log(`  Quotes: ${results.quotes.length}`);
  console.log(`  Replies: ${results.replies.length}`);
  console.log(`  Failed: ${results.failed}`);
  
  if (results.quotes.length > 0) {
    console.log('\n📝 Quote Tweets:');
    results.quotes.forEach((q, i) => {
      console.log(`  ${i + 1}. ${q.content.substring(0, 80)}...`);
      console.log(`     Posted: https://x.com/aialygn/status/${q.id}`);
      console.log(`     Quoted: https://x.com/i/status/${q.quoted}`);
    });
  }
  
  if (results.replies.length > 0) {
    console.log('\n💬 Replies:');
    results.replies.forEach((r, i) => {
      console.log(`  ${i + 1}. To ${r.target}: ${r.content.substring(0, 80)}...`);
      console.log(`     Posted: https://x.com/aialygn/status/${r.id}`);
    });
  }
  
  return results;
}

/**
 * CLI Entry Point
 */
async function main() {
  try {
    // Find latest workflow file
    const files = fs.readdirSync(WORKFLOW_DIR);
    const workflowFiles = files.filter(f => f.startsWith('workflow-')).sort().reverse();
    
    if (workflowFiles.length === 0) {
      error('❌ No workflow files found. Run decision-engine.js first.');
      process.exit(1);
    }
    
    const latestWorkflow = path.join(WORKFLOW_DIR, workflowFiles[0]);
    log(`📁 Processing: ${workflowFiles[0]}`);
    
    const results = await executeWorkflow(latestWorkflow);
    
    // Exit with status code
    process.exit(results.failed > 0 ? 1 : 0);
    
  } catch (err) {
    error('💥 Fatal error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { executeWorkflow, postTweet, replyToPost, quotePost, createPoll };
