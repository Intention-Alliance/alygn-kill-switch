/**
 * Twitter Content Parser - v3 (Aggressive Markdown Stripping)
 * Parses Grok output markdown into clean, tweetable content
 */

// Aggressive markdown/metadata stripper
function enhancedParseMarkdownContent(content) {
  let lines = content.split('\n');
  let posts = [];
  let currentPost = '';
  let inNumberedList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // SKIP ALL METADATA LINES (aggressive filtering)
    if (line.match(/^#+\s/) || // Headers (#, ##, ###)
        line.includes('**') || // Bold markers
        line.includes('Tokens Used:') ||
        line.includes('Executed:') ||
        line.includes('Model:') ||
        line.includes('Search Enabled:') ||
        line.includes('Dynamic Injection:') ||
        line.includes('###') ||
        line.includes('---') ||
        line.match(/^\*\s/) || // Bullet points
        line.match(/^-+\s*$/) || // Horizontal rules
        line.includes('Response') ||
        line.includes('Thread Ideas') ||
        line.includes('Prompt #')) {
      continue;
    }
    
    // Strip character count metadata: "(124 chars)", "( 128 chars)", etc.
    line = line.replace(/\(\s*\d+\s+chars\s*\)/g, '');
    
    // Check if this is a numbered list item (1., 2., 3., etc.)
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      // Save previous post if exists
      if (currentPost.trim().length > 20) {
        posts.push(currentPost.trim());
      }
      // Start new post with the content (without the number)
      currentPost = numberedMatch[2];
      inNumberedList = true;
      continue;
    }
    
    // If we're in a numbered list and hit non-numbered content, save and reset
    if (inNumberedList && line.length === 0) {
      if (currentPost.trim().length > 20) {
        posts.push(currentPost.trim());
      }
      currentPost = '';
      inNumberedList = false;
      continue;
    }
    
    // Skip empty lines outside of list items
    if (line.length === 0) {
      continue;
    }
    
    // Skip very short lines (< 15 chars) - likely noise
    if (line.length < 15) {
      continue;
    }
    
    // Skip lines that look like section headers even without markdown
    if (line.match(/^(Here are|Based on|According to|In summary)/i)) {
      continue;
    }
    
    // Accumulate content for current post
    if (currentPost.length > 0) {
      currentPost += ' ' + line;
    } else {
      currentPost = line;
    }
  }
  
  // Don't forget the last post
  if (currentPost.trim().length > 20) {
    posts.push(currentPost.trim());
  }
  
  return posts;
}

/**
 * Safety validator - checks content before posting
 */
function validateContent(posts) {
  const results = [];
  
  for (const post of posts) {
    const issues = [];
    
    // Check length (Twitter limit: 280 chars)
    if (post.length > 280) {
      issues.push(`Too long: ${post.length} chars (max 280)`);
    }
    
    // Check for prohibited patterns
    if (post.match(/(npm|pip|apt|curl|sh|bash|git)\s+install/)) {
      issues.push('Contains package install command');
    }
    
    if (post.match(/https?:\/\/[^\s]+/g)?.length > 2) {
      issues.push('Too many URLs (max 2)');
    }
    
    // Check for empty or near-empty posts
    if (post.trim().length < 10) {
      issues.push('Content too short');
    }
    
    // EXTRA CHECK: Ensure no markdown残留
    if (post.includes('**') || 
        post.includes('Executed:') ||
        post.includes('Model:') ||
        post.includes('Tokens Used:')) {
      issues.push('Contains unstripped metadata');
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
 * Format post with required hashtags (NO @mentions)
 */
function formatPost(content, hashtags = ['#AIGovernance', '#Alygn']) {
  const trimmed = content.trim();
  const hashtagLine = hashtags.join(' ');
  
  // Calculate available space (just hashtags, no @mention)
  const reservedLength = hashtagLine.length + 2; // 2 for newlines
  const availableSpace = 280 - reservedLength;
  
  // Truncate if needed
  const finalContent = trimmed.length > availableSpace 
    ? trimmed.substring(0, availableSpace - 3) + '...'
    : trimmed;
  
  return `${finalContent}\n\n${hashtagLine}`;
}

/**
 * Parse and validate Grok output
 * Returns structured workflow JSON
 */
function parseGrokOutput(markdownContent) {
  const posts = enhancedParseMarkdownContent(markdownContent);
  const validated = validateContent(posts);
  
  const workflow = {
    generatedAt: new Date().toISOString(),
    totalPosts: validated.length,
    validPosts: validated.filter(p => p.valid).length,
    blockedPosts: validated.filter(p => !p.valid).length,
    posts: validated.map((v, idx) => ({
      id: idx + 1,
      content: v.valid ? formatPost(v.content) : v.content,
      status: v.valid ? 'ready' : 'blocked',
      issues: v.issues,
      originalContent: v.content
    }))
  };
  
  return workflow;
}

// Export functions
export { enhancedParseMarkdownContent, validateContent, formatPost, parseGrokOutput };
