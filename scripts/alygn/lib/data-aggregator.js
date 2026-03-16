/**
 * Data Aggregator for @aialyygn Twitter Automation
 * 
 * Loads and parses data from existing prompt outputs:
 * - Prompt #13: Trending topics, sources, engagement data
 * - Prompt #17: Analytics data (followers, impressions, top posts)
 * - Prompt #1: Previous thread ideas (for variety check)
 * 
 * Returns structured data for dynamic injection into prompts.
 */

import fs from 'fs/promises';
import path from 'path';
import { loadCachedPosts, formatPostsForInjection, formatSinglePost, getBestPostForReply } from './post-discovery.js';

const OUTPUT_DIR = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs');

/**
 * Get the most recent output file for a given prompt number
 */
async function getLatestOutputFile(promptNumber, maxAge = 24 * 60 * 60 * 1000) {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const promptFiles = files
      .filter(f => f.startsWith(`prompt-${promptNumber}-`) && f.endsWith('.md'))
      .map(f => ({
        name: f,
        timestamp: parseInt(f.match(/prompt-\d+-(\d+)\.md/)?.[1] || '0')
      }))
      .filter(f => Date.now() - f.timestamp < maxAge) // Only files within maxAge
      .sort((a, b) => b.timestamp - a.timestamp);

    if (promptFiles.length === 0) return null;

    const content = await fs.readFile(path.join(OUTPUT_DIR, promptFiles[0].name), 'utf8');
    return {
      filename: promptFiles[0].name,
      timestamp: promptFiles[0].timestamp,
      content
    };
  } catch (err) {
    console.error(`Error loading prompt #${promptNumber} output:`, err.message);
    return null;
  }
}

/**
 * Parse trending topics from Prompt #13 output
 */
function parseTrendData(content) {
  if (!content) return null;

  const trends = {
    topics: [],
    sources: [],
    keyAccounts: [],
    replyIdeas: [],
    rawSummary: ''
  };

  // Skip metadata headers (Executed:, Model:, etc.)
  const skipPatterns = [
    'Executed:', 'Model:', 'Search Enabled:', 'Dynamic Injection:',
    'Tokens Used:', 'prompt:', 'completion:', 'Search Results',
    'Injected Data', 'Data Freshness'
  ];

  // Extract topics from "Today's Top X Trends" section
  const topicsMatch = content.match(/### Today's Top.*?(?=###|$)/s);
  if (topicsMatch) {
    trends.rawSummary = topicsMatch[0].trim();
  }

  // Also look for "Response" section which has the actual content
  const responseMatch = content.match(/### 📝 Response\n\n([\s\S]*?)(?=\n---|\n\*\*Tokens)/);
  const searchSection = responseMatch ? responseMatch[1] : content;

  // Extract specific topics mentioned - focus on actual AI/tech topics
  const topicPatterns = [
    /\*\*([^*]+)\*\*/g,  // Bold text
    /trending.*?"([^"]+)"/gi,  // Quoted trends
  ];

  for (const pattern of topicPatterns) {
    const matches = searchSection.matchAll(pattern);
    for (const match of matches) {
      const topic = match[1].trim();
      // Filter out metadata and short/generic terms
      const isSkipped = skipPatterns.some(skip => topic.includes(skip));
      const isValidTopic = topic.length > 5 && 
                           topic.length < 80 && 
                           !trends.topics.includes(topic) &&
                           !isSkipped &&
                           !topic.match(/^\d+$/) && // Skip pure numbers
                           !topic.match(/^https?:/) && // Skip URLs
                           topic.match(/[a-zA-Z]/); // Must have letters
      
      if (isValidTopic) {
        trends.topics.push(topic);
      }
    }
  }

  // Extract hashtags separately
  const hashtagMatches = searchSection.matchAll(/#([A-Za-z][A-Za-z0-9_]+)/g);
  for (const match of hashtagMatches) {
    const tag = '#' + match[1];
    if (!trends.topics.includes(tag) && tag.length > 3) {
      trends.topics.push(tag);
    }
  }

  // Extract sources/URLs
  const urlMatches = content.matchAll(/https?:\/\/[^\s\)]+/g);
  for (const match of urlMatches) {
    if (!trends.sources.includes(match[0])) {
      trends.sources.push(match[0]);
    }
  }

  // Extract key accounts (@mentions)
  const accountMatches = content.matchAll(/@(\w+)/g);
  for (const match of accountMatches) {
    const account = '@' + match[1];
    if (!trends.keyAccounts.includes(account) && account !== '@aialygn' && account !== '@aialyygn') {
      trends.keyAccounts.push(account);
    }
  }

  // Extract reply ideas section
  const replySection = content.match(/### \d+ Reply Ideas.*?(?=---|$)/s);
  if (replySection) {
    const replyMatches = replySection[0].matchAll(/\d+\.\s*\*\*([^*]+)\*\*:\s*"([^"]+)"/g);
    for (const match of replyMatches) {
      trends.replyIdeas.push({
        target: match[1].trim(),
        reply: match[2].trim()
      });
    }
  }

  return trends;
}

/**
 * Parse analytics data from Prompt #17 output
 */
function parseAnalyticsData(content) {
  if (!content) return null;

  const analytics = {
    followersGained: null,
    impressions: null,
    engagementRate: null,
    topPosts: [],
    recommendations: [],
    rawContent: content
  };

  // Try to extract numeric metrics
  const followersMatch = content.match(/followers?\s*(?:gained|growth)[:\s]*(\d+)/i);
  if (followersMatch) analytics.followersGained = parseInt(followersMatch[1]);

  const impressionsMatch = content.match(/impressions?[:\s]*(\d+[,\d]*)/i);
  if (impressionsMatch) analytics.impressions = parseInt(impressionsMatch[1].replace(/,/g, ''));

  const engagementMatch = content.match(/engagement\s*rate[:\s]*(\d+\.?\d*)%?/i);
  if (engagementMatch) analytics.engagementRate = parseFloat(engagementMatch[1]);

  // Extract recommendations (numbered lists)
  const recMatches = content.matchAll(/\d+\.\s+([^\n]+)/g);
  for (const match of recMatches) {
    if (match[1].length > 20 && match[1].length < 500) {
      analytics.recommendations.push(match[1].trim());
    }
  }

  return analytics;
}

/**
 * Get aggregated data from all relevant prompt outputs
 */
async function getAggregatedData() {
  const data = {
    timestamp: new Date().toISOString(),
    trends: null,
    analytics: null,
    previousThreads: [],
    discoveredPosts: null,
    metadata: {}
  };

  // Load Prompt #13 (Trends) - most recent within 12 hours
  const trendOutput = await getLatestOutputFile(13, 12 * 60 * 60 * 1000);
  if (trendOutput) {
    data.trends = parseTrendData(trendOutput.content);
    data.metadata.trendSource = trendOutput.filename;
    data.metadata.trendAge = Math.round((Date.now() - trendOutput.timestamp) / (60 * 1000)) + ' minutes';
  }

  // Load Prompt #17 (Analytics) - most recent within 24 hours
  const analyticsOutput = await getLatestOutputFile(17, 24 * 60 * 60 * 1000);
  if (analyticsOutput) {
    data.analytics = parseAnalyticsData(analyticsOutput.content);
    data.metadata.analyticsSource = analyticsOutput.filename;
  }

  // Load recent Prompt #1 outputs (Thread Ideas) - for variety check
  const threadOutput = await getLatestOutputFile(1, 48 * 60 * 60 * 1000);
  if (threadOutput) {
    // Extract thread titles to avoid repetition
    const threadMatches = threadOutput.content.matchAll(/\d+\.\s*\*\*([^*]+)\*\*/g);
    for (const match of threadMatches) {
      data.previousThreads.push(match[1].trim());
    }
  }

  // Load discovered posts from browser cache (within 6 hours)
  const cachedPosts = await loadCachedPosts(6 * 60 * 60 * 1000);
  if (cachedPosts && cachedPosts.posts) {
    data.discoveredPosts = cachedPosts.posts;
    data.metadata.postsSource = cachedPosts.query;
    data.metadata.postsAge = Math.round((Date.now() - new Date(cachedPosts.timestamp).getTime()) / (60 * 1000)) + ' minutes';
  }

  return data;
}

/**
 * Get specific data for prompt injection
 */
async function getInjectionData() {
  const aggregated = await getAggregatedData();

  // Build injection-ready data
  const injection = {
    // Trending topics (comma-separated)
    TRENDING_TOPICS: aggregated.trends?.topics?.slice(0, 5).join(', ') || 'AI alignment, AGI safety, xAI developments',
    
    // Primary trend (first/most important)
    PRIMARY_TREND: aggregated.trends?.topics?.[0] || 'AI alignment research',
    
    // Key accounts to engage
    KEY_ACCOUNTS: aggregated.trends?.keyAccounts?.slice(0, 5).join(', ') || '@xai, @OpenAI, @AnthropicAI',
    
    // Sources for citations
    TREND_SOURCES: aggregated.trends?.sources?.slice(0, 3).join('\n') || 'No recent sources available',
    
    // Analytics summary
    ANALYTICS_DATA: aggregated.analytics ? 
      `Followers gained: ${aggregated.analytics.followersGained || 'N/A'}, ` +
      `Impressions: ${aggregated.analytics.impressions || 'N/A'}, ` +
      `Engagement rate: ${aggregated.analytics.engagementRate || 'N/A'}%` :
      'Analytics data not available',
    
    // Top content themes (from analytics recommendations)
    TOP_CONTENT_THEMES: aggregated.analytics?.recommendations?.slice(0, 3).join('; ') || 
      'technical threads, hot takes, research analysis',
    
    // Target audience (rotate based on time)
    TARGET_AUDIENCE: getTargetAudience(),
    
    // Engagement targets (based on follower count)
    ENGAGEMENT_TARGET: '50+ likes, 15+ retweets, 8+ replies',
    
    // Previous threads (for variety)
    PREVIOUS_THREADS: aggregated.previousThreads?.slice(0, 3).join(', ') || 'none',
    
    // Avoid angles
    AVOID_ANGLES: 'clickbait, FUD, vague predictions, overly promotional content',
    
    // Reply ideas from trends
    SUGGESTED_REPLIES: aggregated.trends?.replyIdeas?.slice(0, 3)
      .map(r => `To ${r.target}: "${r.reply}"`)
      .join('\n') || 'Generate original replies based on trending topics',
    
    // Raw trend summary for context
    TREND_SUMMARY: aggregated.trends?.rawSummary?.substring(0, 500) || 'No recent trend data',
    
    // AI Alignment insight (for [brief explanation] replacement)
    ALIGNMENT_INSIGHT: generateAlignmentInsight(aggregated.trends?.topics?.[0]),
    
    // Discovered posts from browser (for [insert post text here])
    POST_TEXT: aggregated.discoveredPosts ? 
      formatSinglePost(getBestPostForReply(aggregated.discoveredPosts)) :
      'No recent posts discovered. Run post discovery first.',
    
    // Multiple posts for context
    TOP_POSTS: aggregated.discoveredPosts ?
      formatPostsForInjection(aggregated.discoveredPosts, 5) :
      'No recent posts discovered',
    
    // High engagement posts specifically
    HIGH_ENGAGEMENT_POSTS: aggregated.discoveredPosts ?
      formatPostsForInjection(
        aggregated.discoveredPosts.filter(p => (p.likes || 0) > 50),
        3
      ) :
      'No high-engagement posts found',
    
    // Metadata
    DATA_FRESHNESS: aggregated.metadata.trendAge || 'unknown',
    
    // Current date/time
    CURRENT_DATE: new Date().toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    }),
    CURRENT_TIME: new Date().toLocaleTimeString('en-US', { hour12: true })
  };

  return injection;
}

/**
 * Generate a contextual AI alignment insight based on the trending topic
 */
function generateAlignmentInsight(topic) {
  if (!topic) return 'proper value alignment ensures AI systems benefit humanity';
  
  const topicLower = topic.toLowerCase();
  
  // Match topic to alignment insight
  if (topicLower.includes('xai') || topicLower.includes('grok')) {
    return 'frontier labs like xAI can lead the way in scalable alignment research';
  }
  if (topicLower.includes('spacex') || topicLower.includes('orbital') || topicLower.includes('space')) {
    return 'as AI scales to space infrastructure, robust alignment protocols become critical';
  }
  if (topicLower.includes('agi') || topicLower.includes('superintelligence')) {
    return 'AGI development demands proactive alignment research before capabilities outpace safety';
  }
  if (topicLower.includes('safety') || topicLower.includes('risk')) {
    return 'alignment research provides concrete frameworks for managing these exact risks';
  }
  if (topicLower.includes('regulation') || topicLower.includes('policy') || topicLower.includes('eu ai act')) {
    return 'technical alignment work informs better policy by clarifying actual AI risks';
  }
  if (topicLower.includes('deepfake') || topicLower.includes('misuse')) {
    return 'alignment includes preventing misuse through value-aligned output filtering';
  }
  if (topicLower.includes('benchmark') || topicLower.includes('eval')) {
    return 'alignment evals complement capability benchmarks to ensure safe deployment';
  }
  if (topicLower.includes('open source') || topicLower.includes('opensource')) {
    return 'open alignment research accelerates community-driven safety solutions';
  }
  
  // Default contextual insight
  return `alignment research helps ensure ${topic.substring(0, 30)} developments remain beneficial`;
}

/**
 * Rotate target audience based on time of day
 */
function getTargetAudience() {
  const audiences = [
    'AI researchers and academics',
    'AI/tech entrepreneurs and founders',
    'AI safety and policy advocates',
    'tech enthusiasts and developers'
  ];
  const hourIndex = Math.floor(new Date().getHours() / 6); // 0-3 based on 6-hour blocks
  return audiences[hourIndex % audiences.length];
}

export {
  getAggregatedData,
  getInjectionData,
  getLatestOutputFile,
  parseTrendData,
  parseAnalyticsData
};
