/**
 * Post Discovery for @aialyygn Twitter Automation
 * 
 * Uses browser snapshots to find high-engagement posts on X
 * Extracts post content, author, engagement metrics for injection
 * 
 * Workflow:
 * 1. Navigate to X search (AI alignment, trending topics)
 * 2. Take snapshot of results
 * 3. Parse posts with engagement metrics
 * 4. Return structured data for [insert post text here] injection
 */

const fs = require('fs').promises;
const path = require('path');

const POSTS_CACHE_DIR = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/discovered-posts');

/**
 * Parse posts from browser snapshot content
 * 
 * @param {string} snapshotContent - Raw snapshot from browser
 * @returns {Array} - Parsed posts with metrics
 */
function parsePostsFromSnapshot(snapshotContent) {
  const posts = [];
  
  // Look for article elements (posts)
  const articlePattern = /article "([^"]+)" \[ref=(\w+)\]/g;
  const matches = snapshotContent.matchAll(articlePattern);
  
  for (const match of matches) {
    const articleDesc = match[1];
    const refId = match[2];
    
    // Parse the article description which contains author, time, content, and metrics
    // Format: "Author Verified account @handle time Content metrics"
    
    const post = parseArticleDescription(articleDesc);
    if (post && post.content && post.content.length > 20) {
      post.refId = refId;
      posts.push(post);
    }
  }
  
  // Sort by engagement (likes)
  posts.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  
  return posts;
}

/**
 * Parse article description into structured post data
 */
function parseArticleDescription(desc) {
  const post = {
    author: null,
    handle: null,
    timestamp: null,
    content: null,
    replies: 0,
    reposts: 0,
    likes: 0,
    bookmarks: 0,
    views: 0,
    url: null
  };
  
  // Extract handle (@username)
  const handleMatch = desc.match(/@(\w+)/);
  if (handleMatch) {
    post.handle = '@' + handleMatch[1];
  }
  
  // Extract author name (before "Verified account" or @handle)
  const authorMatch = desc.match(/^([^@]+?)(?:\s+Verified account|\s+@)/);
  if (authorMatch) {
    post.author = authorMatch[1].trim();
  }
  
  // Extract timestamp (common patterns: "8 hours ago", "Jan 25", "Dec 20, 2024")
  const timePatterns = [
    /(\d+\s+(?:hours?|minutes?|days?)\s+ago)/i,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+(?:,\s+\d{4})?/i
  ];
  for (const pattern of timePatterns) {
    const timeMatch = desc.match(pattern);
    if (timeMatch) {
      post.timestamp = timeMatch[0];
      break;
    }
  }
  
  // Extract engagement metrics
  const metricsPatterns = {
    replies: /(\d+)\s+repl(?:y|ies)/i,
    reposts: /(\d+)\s+reposts?/i,
    likes: /(\d+)\s+likes?/i,
    bookmarks: /(\d+)\s+bookmarks?/i,
    views: /(\d+(?:,\d+)?[KkMm]?)\s+views?/i
  };
  
  for (const [key, pattern] of Object.entries(metricsPatterns)) {
    const match = desc.match(pattern);
    if (match) {
      let value = match[1].replace(/,/g, '');
      // Handle K/M suffixes
      if (value.match(/[Kk]$/)) {
        value = parseFloat(value) * 1000;
      } else if (value.match(/[Mm]$/)) {
        value = parseFloat(value) * 1000000;
      }
      post[key] = parseInt(value) || 0;
    }
  }
  
  // Extract content (the main text between timestamp and metrics)
  // Look for text after the timestamp and before the metrics
  if (post.timestamp) {
    const afterTime = desc.split(post.timestamp)[1];
    if (afterTime) {
      // Remove metrics from the end
      let content = afterTime
        .replace(/\d+\s+repl(?:y|ies)[,.\s]*/gi, '')
        .replace(/\d+\s+reposts?[,.\s]*/gi, '')
        .replace(/\d+\s+likes?[,.\s]*/gi, '')
        .replace(/\d+\s+bookmarks?[,.\s]*/gi, '')
        .replace(/\d+(?:,\d+)?[KkMm]?\s+views?[,.\s]*/gi, '')
        .replace(/(?:Image|Embedded video|Play Video)[,.\s]*/gi, '')
        .trim();
      
      if (content.length > 10) {
        post.content = content;
      }
    }
  }
  
  // Calculate engagement score
  post.engagementScore = (post.likes || 0) + (post.reposts || 0) * 2 + (post.replies || 0) * 3;
  
  return post;
}

/**
 * Format posts for injection into prompts
 * 
 * @param {Array} posts - Parsed posts
 * @param {number} limit - Max posts to include
 * @returns {string} - Formatted text for injection
 */
function formatPostsForInjection(posts, limit = 5) {
  const topPosts = posts.slice(0, limit);
  
  if (topPosts.length === 0) {
    return 'No recent high-engagement posts found';
  }
  
  return topPosts.map((post, i) => {
    return `${i + 1}. ${post.handle || 'Unknown'} (${post.likes || 0} likes, ${post.views || 0} views):
   "${post.content || 'Content unavailable'}"`;
  }).join('\n\n');
}

/**
 * Format a single post for [insert post text here] replacement
 */
function formatSinglePost(post) {
  if (!post) return 'No post available';
  
  return `Post by ${post.handle || 'Unknown'}${post.timestamp ? ` (${post.timestamp})` : ''}:
"${post.content || 'Content unavailable'}"
[${post.likes || 0} likes, ${post.reposts || 0} reposts, ${post.views || 0} views]`;
}

/**
 * Save discovered posts to cache
 */
async function savePostsToCache(posts, searchQuery) {
  try {
    await fs.mkdir(POSTS_CACHE_DIR, { recursive: true });
    
    const timestamp = Date.now();
    const filename = `posts-${searchQuery.replace(/\s+/g, '-')}-${timestamp}.json`;
    const filepath = path.join(POSTS_CACHE_DIR, filename);
    
    await fs.writeFile(filepath, JSON.stringify({
      timestamp: new Date().toISOString(),
      query: searchQuery,
      postCount: posts.length,
      posts: posts
    }, null, 2));
    
    console.log(`✅ Saved ${posts.length} posts to: ${filename}`);
    return filepath;
  } catch (err) {
    console.error('Error saving posts:', err.message);
    return null;
  }
}

/**
 * Load most recent posts from cache
 */
async function loadCachedPosts(maxAge = 6 * 60 * 60 * 1000) {
  try {
    const files = await fs.readdir(POSTS_CACHE_DIR);
    const postFiles = files
      .filter(f => f.startsWith('posts-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        timestamp: parseInt(f.match(/posts-.*-(\d+)\.json/)?.[1] || '0')
      }))
      .filter(f => Date.now() - f.timestamp < maxAge)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (postFiles.length === 0) return null;
    
    const content = await fs.readFile(path.join(POSTS_CACHE_DIR, postFiles[0].name), 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

/**
 * Get best post for single-post injection
 * Prioritizes high engagement + relevance to AI alignment
 */
function getBestPostForReply(posts) {
  if (!posts || posts.length === 0) return null;
  
  // Filter for posts with meaningful content
  const validPosts = posts.filter(p => 
    p.content && 
    p.content.length > 30 && 
    p.engagementScore > 10
  );
  
  if (validPosts.length === 0) return posts[0];
  
  // Return highest engagement post
  return validPosts[0];
}

module.exports = {
  parsePostsFromSnapshot,
  parseArticleDescription,
  formatPostsForInjection,
  formatSinglePost,
  savePostsToCache,
  loadCachedPosts,
  getBestPostForReply,
  POSTS_CACHE_DIR
};
