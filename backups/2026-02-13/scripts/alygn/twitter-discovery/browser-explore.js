#!/usr/bin/env node

/**
 * ALYGN Twitter Discovery - Phase 1: Browser Exploration
 * 
 * Purpose:
 * - Use browser relay (alygn profile) to scroll /explore feed
 * - Extract trending posts, high-engagement content, relevant authors
 * - Output raw discovery data for Decision Engine (Phase 2)
 * 
 * Workflow:
 * 1. Navigate to /explore with alygn profile
 * 2. Scroll feed (simulate natural browsing)
 * 3. Take snapshots and extract post elements
 * 4. Parse: post IDs, author handles, content, engagement metrics
 * 5. Save to discovery-{timestamp}.json for Decision Engine
 * 
 * Output Format:
 * {
 *   "timestamp": "ISO-8601",
 *   "discovered": [
 *     {
 *       "postId": "1234567890",
 *       "author": "@handle",
 *       "content": "Tweet text...",
 *       "engagement": { likes: N, retweets: N, replies: N },
 *       "url": "https://x.com/handle/status/1234567890",
 *       "keywords": ["AI", "safety", ...]
 *     }
 *   ]
 * }
 */

const fs = require('fs').promises;
const path = require('path');

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../../../twitter-outputs/alygn/discovery');

// Simple console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * Extract post data from browser snapshot
 * Parses aria/role refs to identify tweets, authors, engagement
 */
function parsePostsFromSnapshot(snapshotText) {
  const posts = [];
  
  // Look for tweet-like patterns in snapshot
  // X.com structure: article role with author, content, engagement buttons
  const lines = snapshotText.split('\n');
  
  let currentPost = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect post start (article or tweet container)
    if (line.includes('article') || line.includes('tweet')) {
      if (currentPost) {
        posts.push(currentPost);
      }
      currentPost = {
        author: null,
        content: '',
        engagement: { likes: 0, retweets: 0, replies: 0 },
        url: null,
        postId: null,
        keywords: []
      };
    }
    
    // Extract author handle (look for @username patterns)
    const handleMatch = line.match(/@([a-zA-Z0-9_]+)/);
    if (handleMatch && currentPost && !currentPost.author) {
      currentPost.author = handleMatch[0];
    }
    
    // Extract engagement metrics (like/retweet/reply counts)
    const likeMatch = line.match(/(\d+)\s*(like|heart)/i);
    const retweetMatch = line.match(/(\d+)\s*(retweet|repost)/i);
    const replyMatch = line.match(/(\d+)\s*(repl|comment)/i);
    
    if (likeMatch && currentPost) {
      currentPost.engagement.likes = parseInt(likeMatch[1]);
    }
    if (retweetMatch && currentPost) {
      currentPost.engagement.retweets = parseInt(retweetMatch[1]);
    }
    if (replyMatch && currentPost) {
      currentPost.engagement.replies = parseInt(replyMatch[1]);
    }
    
    // Extract post URL/ID
    const urlMatch = line.match(/x\.com\/[^/]+\/status\/(\d+)/);
    if (urlMatch && currentPost) {
      currentPost.postId = urlMatch[1];
      currentPost.url = `https://x.com${urlMatch[0]}`;
    }
    
    // Collect content (text not matching meta patterns)
    if (currentPost && !line.match(/@|http|like|retweet|reply|article/i)) {
      currentPost.content += line + ' ';
    }
  }
  
  // Push last post
  if (currentPost) {
    posts.push(currentPost);
  }
  
  // Filter out incomplete posts
  return posts.filter(p => p.author && p.content.trim().length > 10);
}

/**
 * Extract keywords from post content
 */
function extractKeywords(content) {
  const keywords = [];
  const text = content.toLowerCase();
  
  // AI/AGI/Safety related keywords
  const aiKeywords = ['agi', 'ai safety', 'alignment', 'grok', 'xai', 'anthropic', 
                      'openai', 'deepmind', 'mechanistic', 'interpretability'];
  
  for (const kw of aiKeywords) {
    if (text.includes(kw)) {
      keywords.push(kw);
    }
  }
  
  return keywords;
}

/**
 * Main browser exploration workflow
 */
async function exploreFeed() {
  log('🔍 Starting Twitter/X feed exploration...');
  
  try {
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Step 1: Navigate to /explore
    log('📍 Navigating to /explore...');
    
    // Note: This is a placeholder for OpenClaw's browser tool
    // In actual execution, this will be called by the agent with proper browser access
    console.log('\n⚠️  BROWSER TOOL REQUIRED:');
    console.log('   This script needs to be executed by OpenClaw agent with browser access.');
    console.log('   Expected flow:');
    console.log('   1. browser({ action: "navigate", profile: "alygn", targetUrl: "https://x.com/explore" })');
    console.log('   2. Wait for feed load (timeoutMs: 30000)');
    console.log('   3. Scroll down 3-5 times (simulate natural browsing)');
    console.log('   4. browser({ action: "snapshot", profile: "alygn", refs: "aria" })');
    console.log('   5. Parse snapshot and extract posts\n');
    
    // For testing: simulate snapshot parsing
    const mockSnapshot = `
      article: Tweet by @elonmusk
      "AGI by 2026 is achievable. xAI's Colossus is the key."
      456 likes, 123 retweets, 89 replies
      x.com/elonmusk/status/1234567890
      
      article: Tweet by @karpathy
      "Mechanistic interpretability is the path forward for AI safety."
      789 likes, 234 retweets, 145 replies
      x.com/karpathy/status/9876543210
    `;
    
    log('📸 Parsing snapshot...');
    const posts = parsePostsFromSnapshot(mockSnapshot);
    
    // Enrich with keywords
    posts.forEach(post => {
      post.keywords = extractKeywords(post.content);
    });
    
    // Output discovery data
    const timestamp = Date.now();
    const output = {
      timestamp: new Date().toISOString(),
      source: 'explore_feed',
      discovered: posts
    };
    
    const outputPath = path.join(OUTPUT_DIR, `discovery-${timestamp}.json`);
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    
    success(`✅ Discovery complete! Found ${posts.length} posts`);
    success(`📁 Saved to: ${outputPath}`);
    
    // Print summary
    console.log('\n📊 Discovery Summary:');
    posts.forEach((post, i) => {
      console.log(`\n${i + 1}. ${post.author}`);
      console.log(`   Engagement: ${post.engagement.likes}L ${post.engagement.retweets}RT ${post.engagement.replies}R`);
      console.log(`   Keywords: ${post.keywords.join(', ') || 'none'}`);
      console.log(`   Content: ${post.content.substring(0, 80)}...`);
    });
    
    return output;
    
  } catch (err) {
    error('❌ Browser exploration failed:', err);
    throw err;
  }
}

/**
 * CLI Entry Point
 */
if (require.main === module) {
  exploreFeed()
    .then(() => {
      success('🎉 Browser discovery complete!');
      process.exit(0);
    })
    .catch(err => {
      error('💥 Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { exploreFeed, parsePostsFromSnapshot, extractKeywords };
