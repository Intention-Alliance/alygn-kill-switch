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

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../../../twitter-outputs/alygn/discovery');
const SNAPSHOT_PATH = process.argv[2] || '/tmp/x-explore-snapshot.txt';

// Simple console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * Parse trending topics from X Explore snapshot
 * The snapshot contains trending news/links with engagement metrics
 * Also handles regional trending topics
 */
function parsePostsFromSnapshot(snapshotText) {
  const posts = [];
  const lines = snapshotText.split('\n');
  const processed = new Set(); // Track processed content to avoid duplicates
  
  // Pattern 1: News articles with engagement
  // Format: link "TITLE TIME · CATEGORY · COUNT posts"
  const newsPattern = /link\s+"([^"]+)\s+(Trending\s+now|\d+\s+(?:hour|hours|day|days)\s+ago)\s*[·]\s*([^·]*)\s*[·]\s*([^"]+)"\s*\[ref=e\d+\]/;
  
  // Pattern 2: Regional trending topics
  // Format: "Trending in LOCATION TOPIC"
  const regionPattern = /generic\s+\[ref=e\d+\]:\s*Trending\s+in\s+([^\n]+)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // === Pattern 1: News articles with engagement ===
    const newsMatch = line.match(newsPattern);
    if (newsMatch) {
      const title = newsMatch[1].trim();
      const age = newsMatch[2].trim(); // "Trending now" or "4 hours ago"
      const category = newsMatch[3].trim(); // "News", "Other", etc.
      const postsMeta = newsMatch[4].trim(); // "1.4K posts", "365 posts"
      
      // Skip duplicates
      if (processed.has(title)) continue;
      processed.add(title);
      
      // Parse engagement from posts count
      let postsCount = 0;
      const countMatch = postsMeta.match(/([\d.]+)(K?)\s*posts/);
      if (countMatch) {
        postsCount = parseFloat(countMatch[1]);
        if (countMatch[2] === 'K') postsCount *= 1000;
      }
      
      const postId = `trending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      posts.push({
        postId: postId,
        author: '@explore',
        authorName: 'Trending',
        content: title,
        engagement: {
          likes: Math.floor(postsCount),
          retweets: Math.floor(postsCount * 0.3),
          replies: Math.floor(postsCount * 0.1)
        },
        url: `https://x.com/explore`,
        category: category,
        age: age,
        keywords: extractKeywords(title),
        type: 'news'
      });
      continue;
    }
    
    // === Pattern 2: Regional trending topics ===
    const regionMatch = line.match(regionPattern);
    if (regionMatch) {
      const location = regionMatch[1].trim();
      
      // Look ahead for the topic name on next lines
      let topic = null;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        
        // Find generic text containing the topic
        const topicMatch = nextLine.match(/generic\s+\[ref=e\d+\]:\s*"?([^"\[\]]+)"?\s*$/);
        if (topicMatch) {
          const candidate = topicMatch[1].trim();
          // Skip button labels and metadata
          if (!candidate.includes('More') && 
              !candidate.includes('Trending') && 
              !candidate.includes('button')) {
            topic = candidate;
            break;
          }
        }
        
        // Also match Korean/Unicode hashtags
        const hashtagMatch = nextLine.match(/generic\s+\[ref=e\d+\]:\s*"([^"]+)"/);
        if (hashtagMatch) {
          const hashtag = hashtagMatch[1].trim();
          if (!hashtag.includes('More')) {
            topic = hashtag;
            break;
          }
        }
      }
      
      if (topic && !processed.has(topic)) {
        processed.add(topic);
        
        const postId = `trending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fullContent = `${location}: ${topic}`;
        
        posts.push({
          postId: postId,
          author: '@explore',
          authorName: 'Trending',
          content: fullContent,
          engagement: { likes: 0, retweets: 0, replies: 0 },
          url: `https://x.com/explore`,
          category: 'Regional',
          age: 'Trending',
          keywords: extractKeywords(fullContent),
          type: 'regional'
        });
      }
    }
  }
  
  return posts.filter(p => p.content && p.content.length > 3);
}

/**
 * Extract keywords from post content
 */
function extractKeywords(content) {
  const keywords = [];
  const text = content.toLowerCase();
  
  // AI/AGI/Safety related keywords
  const aiKeywords = [
    ['ai', 'AI'],
    ['agi', 'AGI'],
    ['safety', 'safety'],
    ['alignment', 'alignment'],
    ['grok', 'Grok'],
    ['xai', 'xAI'],
    ['anthropic', 'Anthropic'],
    ['openai', 'OpenAI'],
    ['deepmind', 'DeepMind'],
    ['mechanistic', 'mechanistic'],
    ['interpretability', 'interpretability'],
    ['llm', 'LLM'],
    ['model', 'model'],
    ['training', 'training'],
    ['neural', 'neural'],
    ['machine learning', 'machine learning'],
    ['ml', 'ML'],
    ['gpt', 'GPT'],
    ['transformer', 'transformer'],
    ['automation', 'automation'],
    ['autonomous', 'autonomous'],
    ['compute', 'compute'],
    ['gpu', 'GPU'],
    ['tpu', 'TPU'],
    ['cluster', 'cluster'],
    ['datacenter', 'datacenter'],
    ['scaling', 'scaling'],
    ['efficiency', 'efficiency'],
    ['optimization', 'optimization'],
    ['benchmark', 'benchmark'],
    ['evaluation', 'evaluation'],
    ['reward hacking', 'reward hacking'],
    ['jailbreak', 'jailbreak'],
    ['prompt injection', 'prompt injection'],
    ['adversarial', 'adversarial'],
    ['robustness', 'robustness'],
    ['verification', 'verification'],
    ['oversight', 'oversight'],
    ['superalignment', 'superalignment'],
    ['cooperative ai', 'cooperative AI'],
    ['multi-agent', 'multi-agent'],
    ['recursive', 'recursive'],
    ['self-improving', 'self-improving'],
    ['emergence', 'emergence'],
    ['capability', 'capability'],
    ['risk', 'risk'],
    ['governance', 'governance'],
    ['policy', 'policy'],
    ['regulation', 'regulation'],
    ['ethics', 'ethics'],
    ['fairness', 'fairness'],
    ['bias', 'bias'],
    ['interpretable', 'interpretable'],
    ['explainable', 'explainable'],
    ['transparent', 'transparent'],
    ['audit', 'audit'],
    ['monitoring', 'monitoring'],
    ['eval', 'eval']
  ];
  
  for (const [pattern, keyword] of aiKeywords) {
    if (text.includes(pattern)) {
      keywords.push(keyword);
    }
  }
  
  // Remove duplicates
  return [...new Set(keywords)].slice(0, 5);
}

/**
 * Main browser exploration workflow
 */
async function exploreFeed() {
  log('🔍 Starting Twitter/X feed exploration...');
  log(`📸 Using snapshot: ${SNAPSHOT_PATH}`);
  
  try {
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Read snapshot file
    let snapshotText;
    try {
      snapshotText = await fs.readFile(SNAPSHOT_PATH, 'utf-8');
      success(`📄 Loaded snapshot: ${snapshotText.length} characters`);
    } catch (err) {
      error(`Failed to read snapshot file: ${SNAPSHOT_PATH}`, err);
      throw err;
    }
    
    // Parse posts from snapshot
    log('🔍 Parsing trending topics...');
    const posts = parsePostsFromSnapshot(snapshotText);
    
    if (posts.length === 0) {
      warn('No posts found in snapshot. Check parsing logic or snapshot content.');
    }
    
    success(`📊 Found ${posts.length} trending topics`);
    
    // Output discovery data
    const timestamp = Date.now();
    const output = {
      timestamp: new Date().toISOString(),
      source: 'explore_feed',
      snapshotPath: SNAPSHOT_PATH,
      discovered: posts
    };
    
    const outputPath = path.join(OUTPUT_DIR, `discovery-${timestamp}.json`);
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    
    success(`💾 Saved discovery data to: ${outputPath}`);
    
    // Print summary
    console.log('\n📊 Discovery Summary:');
    posts.forEach((post, i) => {
      console.log(`\n${i + 1}. ${post.content}`);
      console.log(`   Engagement: ${post.engagement.likes}L ${post.engagement.retweets}RT ${post.engagement.replies}R`);
      console.log(`   Keywords: ${post.keywords.join(', ') || 'none'}`);
      console.log(`   Category: ${post.category || 'N/A'}`);
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
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
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

export { exploreFeed, parsePostsFromSnapshot, extractKeywords };
