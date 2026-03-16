/**
 * Twitter Content Parser - v7 (XML + Markdown Support)
 * Parses Grok output (XML or markdown) into clean, tweetable content with shortened URLs
 * 
 * Supports:
 * - XML format: <responses><content><text>...</text><sources>...</sources></content></responses>
 * - Markdown format: Numbered lists, bullet points, bold sections
 * - TinyURL shortening for long URLs
 * - Backward compatibility with existing markdown format
 */

// TinyURL API configuration
import fs from 'fs';

const TINYURL_API_TOKEN = 'IYtBW5bfQdOx5kFTh3YdrCtvtZRE2j5CA5V68PxTRLHHSboWsmwUzQHADFtZ';
const TINYURL_CACHE = new Map();
const CACHE_FILE = '/tmp/tinyurl-cache.json';

// Load cache from file if exists
try {
  if (fs.existsSync(CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const now = Date.now();
    // Filter out expired entries (24h TTL)
    for (const [url, data] of Object.entries(cached)) {
      if (now - data.timestamp < 24 * 60 * 60 * 1000) {
        TINYURL_CACHE.set(url, data.short);
      }
    }
    console.log(`📦 Loaded ${TINYURL_CACHE.size} cached TinyURLs`);
  }
} catch (err) {
  console.log('⚠️  Could not load TinyURL cache:', err.message);
}

// Save cache to file
function saveCache() {
  try {
    const cacheObj = {};
    const now = Date.now();
    for (const [url, short] of TINYURL_CACHE.entries()) {
      cacheObj[url] = { short, timestamp: now };
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2));
  } catch (err) {
    console.log('⚠️  Could not save TinyURL cache:', err.message);
  }
}

/**
 * Simple XML tag extractor - extracts content between XML tags
 * @param {string} xml - Raw XML content
 * @param {string} tag - Tag name to extract (e.g., 'text', 'content', 'url')
 * @returns {string[]} Array of extracted content values
 */
export function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  return [...xml.matchAll(regex)].map(m => m[1].trim());
}

/**
 * Parse XML-style structured output from Grok
 * Uses simple extractTag() regex for clean content extraction
 */
function parseXmlContent(content) {
  const posts = [];
  
  // Check if content contains XML structure
  if (!content.includes('<responses>') || !content.includes('</responses>')) {
    console.log('⚠️  No XML <responses> tag found, skipping XML parsing');
    return null;
  }
  
  console.log('✅ XML structure detected, parsing <responses>...\n');
  
  try {
    // Extract all <content> blocks
    const contentBlocks = extractTag(content, 'content');
    
    if (contentBlocks.length === 0) {
      console.log('⚠️  No <content> blocks found in XML');
      return null;
    }
    
    console.log(`📦 Found ${contentBlocks.length} <content> block(s)\n`);
    
    // Parse each content block
    for (let i = 0; i < contentBlocks.length; i++) {
      const block = contentBlocks[i];
      
      // Extract <text> content using simple regex
      const texts = extractTag(block, 'text');
      const text = texts[0] || '';
      
      // Extract <sources> - get all URLs inside
      const sourcesBlocks = extractTag(block, 'sources');
      const sources = sourcesBlocks.length > 0 ? extractTag(sourcesBlocks[0], 'url') : [];
      
      // Extract <governance_angle> (optional)
      const angles = extractTag(block, 'governance_angle');
      const governanceAngle = angles[0] || '';
      
      if (text.length > 20) {
        console.log(`✅ Extracted content #${i + 1}: "${text.substring(0, 50)}..." (${text.length} chars)`);
        if (sources.length > 0) {
          console.log(`   📚 Sources: ${sources.length} URL(s)`);
        }
        if (governanceAngle) {
          console.log(`   📐 Governance angle: "${governanceAngle.substring(0, 40)}..."`);
        }
        
        // Use ONLY <text> field for tweets (governance_angle is internal context)
        // Combining both exceeds 280 char limit
        const tweetContent = text;
        
        // Attach first source URL for thread formatting
        const primarySource = sources[0] || null;
        posts.push({
          content: tweetContent,
          sourceUrl: primarySource,
          allSources: sources,
          governanceAngle: governanceAngle
        });
      } else {
        console.log(`⏭️  Skip content #${i + 1}: too short (${text.length} chars)\n`);
      }
    }
    
    console.log(`✅ XML parsing complete: ${posts.length} valid content(s) extracted\n`);
    return posts;
    
  } catch (err) {
    console.log(`⚠️  XML parsing error: ${err.message}`);
    console.log('   Falling back to markdown parsing...\n');
    return null;
  }
}

/**
 * Shorten URL using TinyURL API
 * Returns original URL if shortening fails (graceful degradation)
 */
async function shortenUrl(longUrl) {
  if (!longUrl || longUrl.includes('twitter.com')) {
    return longUrl;
  }
  
  // Check cache first
  if (TINYURL_CACHE.has(longUrl)) {
    console.log(`⚡ Cache hit: ${longUrl.substring(0, 50)}...`);
    return TINYURL_CACHE.get(longUrl);
  }
  
  // Only shorten if > 40 chars
  if (longUrl.length <= 40) {
    return longUrl;
  }
  
  try {
    const response = await fetch('https://api.tinyurl.com/create?api_token=' + TINYURL_API_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl })
    });
    
    const data = await response.json();
    
    if (data.code === 0 && data.data?.tiny_url) {
      const shortUrl = data.data.tiny_url;
      TINYURL_CACHE.set(longUrl, shortUrl);
      saveCache();
      console.log(`🔗 Shortened: ${longUrl.substring(0, 50)}... → ${shortUrl}`);
      return shortUrl;
    }
  } catch (err) {
    console.log(`⚠️  TinyURL failed for ${longUrl.substring(0, 50)}...: ${err.message}`);
  }
  
  // Graceful degradation - return original
  return longUrl;
}

function enhancedParseMarkdownContent(content) {
  // STEP 1: Try XML parsing first (if <responses> tag found)
  const xmlPosts = parseXmlContent(content);
  if (xmlPosts) {
    console.log('✅ Using XML parsing mode\n');
    // Return array of content strings for backward compatibility
    return xmlPosts.map(p => p.content);
  }
  
  // STEP 2: Fallback to markdown parsing (backward compatibility)
  console.log('✅ Using markdown parsing mode (fallback)\n');
  
  let lines = content.split('\n');
  let posts = [];
  let currentPost = '';
  let inList = false;
  
  // Find the Response section - skip everything before it
  const responseIndex = lines.findIndex(line => 
    line.includes('📝 Response') || 
    line.includes('### Response') ||
    (line.includes('Response') && line.startsWith('###'))
  );
  
  if (responseIndex > 0) {
    console.log(`✅ Found Response section at line ${responseIndex + 1}, skipping search results...\n`);
    lines = lines.slice(responseIndex);
  } else {
    console.log(`⚠️  No Response section found, parsing entire document...\n`);
  }
  
  console.log(`🔍 Parser v7 Debug: Processing ${lines.length} lines...\n`);
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Extract link text from markdown: [text](url) → text
    line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Remove citation markers: [[1]], [[2]], etc.
    line = line.replace(/\[\[\d+\]\]/g, '');
    
    // Remove standalone URLs (we'll add TinyURL later)
    line = line.replace(/https?:\/\/[^\s\)\]\(]+/g, '');
    
    // Remove URL patterns in parentheses: (url)
    line = line.replace(/\(https?:\/\/[^\)]+\)/g, '');
    
    // SKIP METADATA LINES
    if (line.includes('Tokens Used:') ||
        line.includes('Executed:') ||
        line.includes('Model:') ||
        line.includes('Search Enabled:') ||
        line.includes('Dynamic Injection:') ||
        line.includes('---') ||
        line.includes('Response') ||
        line.includes('Thread Ideas') ||
        line.includes('Prompt #') ||
        line.includes('Twitter Automation')) {
      console.log(`⏭️  Skip metadata: "${line.substring(0, 40)}..."`);
      continue;
    }
    
    // Strip character count metadata
    line = line.replace(/\(\s*\d+\s+chars\s*\)/g, '');
    
    // Skip pure headers (but NOT content after headers)
    if (line.match(/^#+\s*$/) || line.match(/^#+\s+\d/)) {
      continue;
    }
    
    // EXTRACT NUMBERED LIST ITEMS (1. Content)
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      console.log(`✅ Extracted numbered: "${numberedMatch[2].substring(0, 40)}..."`);
      if (currentPost.trim().length > 20) {
        posts.push(currentPost.trim());
      }
      currentPost = numberedMatch[2];
      inList = true;
      continue;
    }
    
    // EXTRACT BULLET POINTS (- Content or * Content)
    const bulletMatch = line.match(/^[\-\*•]\s+(.+)$/);
    if (bulletMatch) {
      console.log(`✅ Extracted bullet: "${bulletMatch[1].substring(0, 40)}..."`);
      if (currentPost.trim().length > 20) {
        posts.push(currentPost.trim());
      }
      currentPost = bulletMatch[1];
      inList = true;
      continue;
    }
    
    // End of list - save accumulated post
    if (inList && line.length === 0) {
      if (currentPost.trim().length > 20) {
        posts.push(currentPost.trim());
      }
      currentPost = '';
      inList = false;
      continue;
    }
    
    // Skip empty lines
    if (line.length === 0) {
      continue;
    }
    
    // Skip very short lines (< 15 chars)
    if (line.length < 15) {
      continue;
    }
    
    // Skip URL-only lines (not actual content)
    if (line.match(/^https?:\/\/[^\s]+$/)) {
      console.log(`⏭️  Skip URL-only: "${line.substring(0, 40)}..."`);
      continue;
    }
    
    // Skip intro phrases
    if (line.match(/^(Here are|Based on|According to|In summary|Key Trends)/i)) {
      continue;
    }
    
    // Accumulate content
    if (currentPost.length > 0) {
      currentPost += ' ' + line;
    } else {
      currentPost = line;
    }
    
    // If post exceeds 270 chars, truncate at word boundary
    if (currentPost.length > 270) {
      const truncatePoint = currentPost.lastIndexOf(' ', 270);
      if (truncatePoint > 50) {
        posts.push(currentPost.substring(0, truncatePoint).trim());
        currentPost = '';
        inList = false;
      }
    }
  }
  
  // Don't forget the last post (truncate if needed)
  if (currentPost.trim().length > 20) {
    let finalPost = currentPost.trim();
    if (finalPost.length > 275) {
      // Truncate at word boundary (find last space before limit)
      const truncatePoint = finalPost.lastIndexOf(' ', 270);
      if (truncatePoint > 50) {
        finalPost = finalPost.substring(0, truncatePoint).trim();
      } else {
        // Fallback: find any space to avoid cutting mid-word
        const lastSpace = finalPost.substring(0, 270).lastIndexOf(' ');
        finalPost = finalPost.substring(0, lastSpace > 20 ? lastSpace : 270).trim();
      }
    }
    posts.push(finalPost);
  }
  
  // FALLBACK: Extract bold title sections from Response
  // Format: **Title** Description + Governance angle + URL
  if (posts.length === 0) {
    const sections = content.split(/\n\n+/);
    sections.forEach(section => {
      // Check if section has bold title
      const boldMatch = section.match(/\*\*([^*]+)\*\*\s*(.+)/s);
      
      if (boldMatch) {
        const title = boldMatch[1].trim();
        const rest = boldMatch[2].replace(/\n/g, ' ').trim();
        
        // Extract URL from rest
        const urlMatch = rest.match(/https?:\/\/[^\s\)]+/);
        const sourceUrl = urlMatch ? urlMatch[0] : null;
        
        // Remove URL from rest for cleaner context
        const context = urlMatch ? rest.replace(urlMatch[0], '').trim() : rest;
        
        // Create thread pair: title as main, context as reply
        if (title.length > 20 && title.length < 200) {
          console.log(`✅ Extracted bold section: "${title}" (${title.length} chars)`);
          // Push as combined string with special marker for thread splitting
          posts.push(`TITLE:${title}|||CONTEXT:${context}|||URL:${sourceUrl || ''}`);
        }
      }
    });
  }
  
  return posts;
}

/**
 * Safety validator
 */
function validateContent(posts) {
  const results = [];
  
  for (const post of posts) {
    const issues = [];
    
    if (post.length > 280) {
      issues.push(`Too long: ${post.length} chars (max 280)`);
    }
    
    if (post.match(/(npm|pip|apt|curl|sh|bash|git)\s+install/)) {
      issues.push('Contains package install command');
    }
    
    if (post.match(/https?:\/\/[^\s]+/g)?.length > 2) {
      issues.push('Too many URLs (max 2)');
    }
    
    if (post.trim().length < 10) {
      issues.push('Content too short');
    }
    
    // Block if still has metadata
    if (post.includes('Tokens Used:') ||
        post.includes('Executed:') ||
        post.includes('Model:')) {
      issues.push('Contains metadata');
    }
    
    results.push({
      content: post,
      valid: issues.length === 0,
      issues
    });
  }
  
  return results;
}

/**
 * Select Select hashtags dynamically based on post content topic
 *! Prevents duplication and repetition across posts
 */
function selectHashtags(content) {
  const topicKeywords = {
    'regulation': ['#AIRegulation', '#Alygn'],
    'safety': ['#AISafety', '#Alygn'],
    'governance': ['#AIGovernance', '#Alygn'],
    'policy': ['#AIPolicy', '#Alygn'],
    'ethics': ['#AIEthics', '#Alygn'],
    'coordination': ['#AICoordination', '#Alygn'],
    'alignment': ['#AIAlignment', '#Alygn'],
    'risk': ['#AIRisk', '#Alygn'],
    'enterprise': ['#EnterpriseAI', '#Alygn'],
    'compliance': ['#AICompliance', '#Alygn']
  };
  
  const lower = content.toLowerCase();
  for (const [keyword, tags] of Object.entries(topicKeywords)) {
    if (lower.includes(keyword)) return tags;
  }
  
  // Default fallback
  return ['#AIGovernance', '#Alygn'];
}

/**
 * Format as THREAD PAiR (main tweet + source reply)
 * ASYNC - shortens URLs using TinyURL
 * 
 * Handles two formats:
 * 1. Special marker: TITLE:...|||CONTEXT:...|||URL:...
 * 2. Regular content: split into hook + context
 */
async function formatPost(content, sourceUrl = null) {
  // Dynamic hashtag selection based on content topic
  const hashtags = selectHashtags(content);
  const hashtagLine = Array.from(new Set(hashtags)).join(' ');
  
  // Check for special marker format from bold sections
  const markerMatch = content.match(/TITLE:([^|]+)\|\|\|CONTEXT:([^|]+)\|\|\|URL:(.*)/);
  
  if (markerMatch) {
    // Strip bold markers from title
    const title = markerMatch[1].replace(/\*\*/g, '').trim();
    // Strip ALL URLs and citation markers from context
    const context = stripUrlsAndCitations(markerMatch[2].trim());
    
    // Clean URL extraction (aggressive markdown removal)
    let url = markerMatch[3].trim() || sourceUrl;
    if (url) {
      // Remove ALL markdown artifacts: ], ), [[, ((, spaces after URL
      url = url.split(')')[0].split('(')[0].split(']')[0].split('[')[0].trim();
      // Remove any trailing slashes or special chars
      url = url.replace(/[\/\)\]\(]+$/, '').trim();
      // Extract just the URL (no spaces)
      url = url.split(' ')[0].trim();
      
      // Shorten URL using TinyURL
      url = await shortenUrl(url);
    }
    
    // Main tweet: title + hashtags
    const mainTweet = `${title}\n\n${hashtagLine}`;
    
    // Reply: source + context (HARD LIMIT 270 CHARS)
    let replyText = '';
    if (url && !url.includes('twitter.com')) {
      replyText = `📚 Source: ${url}\n\n`;
    }
    
    // Calculate remaining space for context
    const maxContextLength = 270 - replyText.length;
    
    if (context.length > 20) {
      // Truncate at word boundary
      if (maxContextLength > 30) {
        const truncatePoint = context.lastIndexOf(' ', maxContextLength);
        const truncatedContext = truncatePoint > 20 
          ? context.substring(0, truncatePoint) 
          : context.substring(0, maxContextLength);
        replyText += truncatedContext + '...';
      } else {
        replyText += 'Context exceeds limit. See source link.';
      }
    } else {
      replyText += 'What\'s your take on this?';
    }
    
    // Final safety check - ensure under 280
    if (replyText.length > 275) {
      const lastSpace = replyText.lastIndexOf(' ', 270);
      replyText = lastSpace > 50 ? replyText.substring(0, lastSpace) : replyText.substring(0, 270);
    }
    
    console.log(`🧵 Thread pair: "${title}" (${mainTweet.length} chars) + source reply (${replyText.length} chars)`);
    
    return {
      main: mainTweet,
      reply: replyText,
      isThread: true,
      sourceUrl: url
    };
  }
  
  // Regular content - split into hook + context (with TinyURL)
  let trimmed = content.trim();
  
  // Try to extract URL from content if not provided
  if (!sourceUrl) {
    const urlMatch = trimmed.match(/https?:\/\/[^\s\)\]\(]+/);
    if (urlMatch) {
      sourceUrl = urlMatch[0];
    }
  }
  
  // Clean URL (remove any remaining artifacts)
  if (sourceUrl) {
    sourceUrl = sourceUrl.split(')')[0].split('(')[0].split(']')[0].trim();
  }
  
  // Shorten URL using TinyURL
  let displayUrl = await shortenUrl(sourceUrl);
  
  // Strip ALL URLs and citation markers from content BEFORE formatting
  trimmed = stripUrlsAndCitations(trimmed);
  
  // Split into main tweet + context if long enough
  if (trimmed.length > 180) {
    // Find first sentence for hook (max 200 chars)
    const firstSentence = trimmed.substring(0, 190);
    const sentenceEnd = firstSentence.lastIndexOf('.');
    
    let mainTweet = sentenceEnd > 50 
      ? firstSentence.substring(0, sentenceEnd + 1)
      : trimmed.substring(0, 195);
    
    // Strip bold markers
    mainTweet = mainTweet.replace(/\*\*/g, '').trim();
    
    // Rest becomes context for reply
    const context = trimmed.substring(sentenceEnd > 50 ? sentenceEnd + 1 : 195).replace(/\*\*/g, '').trim();
    
    const mainFormatted = `${mainTweet}\n\n${hashtagLine}`;
    
    // Build reply with source + context (HARD LIMIT 270 CHARS)
    let replyText = '';
    if (displayUrl && !displayUrl.includes('twitter.com')) {
      replyText = `📚 Source: ${displayUrl}\n\n`;
    }
    
    // Calculate remaining space
    const maxContextLength = 270 - replyText.length;
    
    if (context.length > 20) {
      if (maxContextLength > 30) {
        // Truncate at word boundary
        const truncatePoint = context.lastIndexOf(' ', maxContextLength);
        const truncatedContext = truncatePoint > 20 
          ? context.substring(0, truncatePoint) 
          : context.substring(0, maxContextLength);
        replyText += truncatedContext + '...';
      } else {
        replyText += 'Context exceeds limit. See source.';
      }
    } else {
      replyText += 'What\'s your take on this?';
    }
    
    // Final safety check - truncate at word boundary
    if (replyText.length > 275) {
      const lastSpace = replyText.lastIndexOf(' ', 270);
      replyText = lastSpace > 50 ? replyText.substring(0, lastSpace) : replyText.substring(0, 270);
    }
    
    console.log(`🧵 Thread: main=${mainFormatted.length} chars, reply=${replyText.length} chars`);
    
    return {
      main: mainFormatted,
      reply: replyText,
      isThread: true,
      sourceUrl: displayUrl
    };
  }
  
  // Short content - single tweet
  return {
    main: `${trimmed.replace(/\*\*/g, '')}\n\n${hashtagLine}`,
    reply: null,
    isThread: false,
    sourceUrl: displayUrl
  };
}

/**
 * Strip all URLs, citation markers, and markdown artifacts from content
 * Removes: http://, https://, [[N]], (url), markdown links
 */
function stripUrlsAndCitations(content) {
  let cleaned = content;
  
  // Remove markdown links: [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove citation markers: [[1]], [[2]], etc.
  cleaned = cleaned.replace(/\[\[\d+\]\]/g, '');
  
  // Remove standalone URLs: http://... or https://...
  cleaned = cleaned.replace(/https?:\/\/[^\s\)\]\(]+/g, '');
  
  // Remove URL patterns in parentheses: (url)
  cleaned = cleaned.replace(/\(https?:\/\/[^\)]+\)/g, '');
  
  // Clean up empty parentheses left behind
  cleaned = cleaned.replace(/\(\s*\)/g, '');
  
  // Clean up extra spaces left behind
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Extract source URLs from Grok search citations
 * Looks for: [N] Title - URL format or numbered citations
 */
function extractSourceUrls(content) {
  const urls = [];
  const urlPattern = /\[(\d+)\]\s+([^\n]+)\s+(https?:\/\/[^\s\)]+)/g;
  let match;
  
  while ((match = urlPattern.exec(content)) !== null) {
    urls.push({
      index: parseInt(match[1]),
      title: match[2].trim(),
      url: match[3]
    });
  }
  
  return urls;
}

/**
 * Extract source URLs from XML content (if XML parsing was used)
 * Returns array of source URLs for each content block
 */
function extractXmlSources(content) {
  const sources = [];
  
  if (!content.includes('<responses>')) {
    return sources;
  }
  
  const contentRegex = /<content>([\s\S]*?)<\/content>/g;
  let contentMatch;
  
  while ((contentMatch = contentRegex.exec(content)) !== null) {
    const block = contentMatch[1];
    const sourcesMatch = block.match(/<sources>([\s\S]*?)<\/sources>/);
    
    if (sourcesMatch) {
      const urls = [];
      const urlRegex = /<url>([^<]+)<\/url>/g;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(sourcesMatch[1])) !== null) {
        urls.push(urlMatch[1].trim());
      }
      sources.push(urls[0] || null); // Return first source for each content block
    } else {
      sources.push(null);
    }
  }
  
  return sources;
}

/**
 * Main parse function - returns thread pairs
 * VALIDATES AFTER FORMATTING (not before!)
 * ASYNC - awaits TinyURL shortening
 * Supports both XML and markdown input formats
 */
async function parseGrokOutput(markdownContent) {
  const posts = enhancedParseMarkdownContent(markdownContent);
  
  // Try to extract sources from XML first, fallback to markdown extraction
  let sources = extractXmlSources(markdownContent);
  if (sources.length === 0) {
    sources = extractSourceUrls(markdownContent).map(s => s.url);
  }
  
  console.log(`📊 Total posts to format: ${posts.length}, Sources available: ${sources.length}\n`);
  
  // Format ALL posts as thread pairs FIRST (with TinyURL)
  const formatted = await Promise.all(posts.map(async (content, idx) => {
    const sourceUrl = sources[idx] || null;
    return await formatPost(content, sourceUrl);
  }));
  
  // THEN validate the formatted main + reply tweets
  const validated = formatted.map((f, idx) => {
    const issues = [];
    
    // Validate main tweet
    if (f.main.length > 280) {
      issues.push(`Main too long: ${f.main.length} chars`);
    }
    
    // Validate reply tweet (if exists)
    if (f.reply && f.reply.length > 280) {
      issues.push(`Reply too long: ${f.reply.length} chars`);
    }
    
    // Check for metadata
    if (f.main.includes('Tokens Used:') || f.main.includes('Model:')) {
      issues.push('Contains metadata');
    }
    
    return {
      main: f.main,
      reply: f.reply,
      isThread: f.isThread,
      sourceUrl: f.sourceUrl,
      valid: issues.length === 0,
      issues
    };
  });
  
  // Build workflow
  const isXmlMode = markdownContent.includes('<responses>');
  const workflow = {
    generatedAt: new Date().toISOString(),
    parsingMode: isXmlMode ? 'xml' : 'markdown',
    totalPosts: validated.length,
    validPosts: validated.filter(p => p.valid).length,
    blockedPosts: validated.filter(p => !p.valid).length,
    sourcesExtracted: sources.length,
    posts: validated.map((v, idx) => ({
      id: idx + 1,
      mainTweet: v.main,
      replyTweet: v.reply,
      isThread: v.isThread,
      sourceUrl: v.sourceUrl,
      status: v.valid ? 'ready' : 'blocked',
      issues: v.issues,
      originalContent: posts[idx]
    }))
  };
  
  return workflow;
}

export { enhancedParseMarkdownContent, extractXmlSources, formatPost, parseGrokOutput, parseXmlContent, stripUrlsAndCitations, validateContent };

