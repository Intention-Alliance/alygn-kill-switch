/**
 * Format Enforcer - Ensures all tweets follow Alygn mandatory format
 * 
 * Rules:
 * 1. Every tweet MUST end with "more at @aialygn"
 * 2. Must include 1-3 hashtags from approved list
 * 3. Hashtags go before signature
 * 4. Max 280 characters total
 */

const APPROVED_HASHTAGS = [
  '#AIGovernance',
  '#AIAlignment',
  '#AISafety',
  '#AGI',
  '#AIPolicy',
  '#AIEthics',
  '#AIRisk'
];

const SIGNATURE = 'more at @aialygn';

/**
 * Formats content to meet Alygn standards
 * @param {string} content - Raw content
 * @param {Array} hashtags - Optional hashtags (will auto-select if not provided)
 * @returns {string} Formatted tweet
 */
function formatTweet(content, hashtags = []) {
  // Remove existing signature if present
  let cleanContent = content.replace(/\n*more at @aialygn/g, '').trim();
  
  // Remove existing hashtags if present
  cleanContent = cleanContent.replace(/\n*#[A-Za-z0-9_]+/g, '').trim();
  
  // Auto-select hashtags if none provided
  if (hashtags.length === 0) {
    hashtags = selectHashtags(cleanContent);
  }
  
  // Limit to 3 hashtags max
  if (hashtags.length > 3) {
    hashtags = hashtags.slice(0, 3);
  }
  
  // Build final tweet
  const hashtagBlock = hashtags.length > 0 ? `\n\n${hashtags.join(' ')}` : '';
  const formattedTweet = `${cleanContent}${hashtagBlock}\n\n${SIGNATURE}`;
  
  // Check length
  if (formattedTweet.length > 280) {
    // Truncate content to fit
    const maxContentLength = 280 - hashtagBlock.length - SIGNATURE.length - 4; // 4 for newlines
    const truncatedContent = truncateContent(cleanContent, maxContentLength);
    return `${truncatedContent}${hashtagBlock}\n\n${SIGNATURE}`;
  }
  
  return formattedTweet;
}

/**
 * Selects relevant hashtags based on content
 */
function selectHashtags(content) {
  const contentLower = content.toLowerCase();
  const selected = [];
  
  // Keyword matching for hashtag selection
  const keywordMap = {
    '#AIGovernance': ['governance', 'coordination', 'institution', 'legitimacy', 'oversight'],
    '#AIAlignment': ['alignment', 'reward hacking', 'misalignment', 'goals', 'values'],
    '#AISafety': ['safety', 'risk', 'emergency', 'crisis', 'preparedness'],
    '#AGI': ['agi', 'artificial general intelligence', 'frontier', 'superintelligence'],
    '#AIPolicy': ['policy', 'regulation', 'compliance', 'framework'],
    '#AIEthics': ['ethics', 'ethical', 'moral', 'responsibility'],
    '#AIRisk': ['risk', 'existential', 'catastrophic', 'systemic']
  };
  
  for (const [hashtag, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(keyword => contentLower.includes(keyword))) {
      selected.push(hashtag);
      if (selected.length >= 3) break;
    }
  }
  
  // Default to #AIGovernance if no matches
  if (selected.length === 0) {
    selected.push('#AIGovernance');
  }
  
  return selected;
}

/**
 * Truncates content while preserving meaning
 */
function truncateContent(content, maxLength) {
  if (content.length <= maxLength) {
    return content;
  }
  
  // Try to cut at sentence boundary
  const truncated = content.substring(0, maxLength - 3);
  const lastPeriod = truncated.lastIndexOf('.');
  
  if (lastPeriod > maxLength * 0.5) {
    return truncated.substring(0, lastPeriod + 1) + '...';
  }
  
  // Try to cut at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.5) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  // Just truncate
  return truncated + '...';
}

/**
 * Validates that content follows format rules
 */
function validateFormat(content) {
  const issues = [];
  
  // Check signature
  if (!content.includes(SIGNATURE)) {
    issues.push('Missing mandatory signature "more at @aialygn"');
  }
  
  // Check hashtags
  const hashtags = content.match(/#[A-Za-z0-9_]+/g) || [];
  if (hashtags.length === 0) {
    issues.push('Missing hashtags (required: 1-3 from approved list)');
  } else if (hashtags.length > 3) {
    issues.push(`Too many hashtags (${hashtags.length}, max 3)`);
  } else {
    // Check if hashtags are from approved list
    const unapprovedHashtags = hashtags.filter(tag => !APPROVED_HASHTAGS.includes(tag));
    if (unapprovedHashtags.length > 0) {
      issues.push(`Unapproved hashtags: ${unapprovedHashtags.join(', ')}`);
    }
  }
  
  // Check length
  if (content.length > 280) {
    issues.push(`Content exceeds 280 characters (${content.length})`);
  }
  
  // Check signature position (should be at end)
  const trimmedContent = content.trim();
  if (!trimmedContent.endsWith(SIGNATURE)) {
    issues.push('Signature must be at the end of the tweet');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    stats: {
      length: content.length,
      hashtagCount: hashtags.length,
      hasSignature: content.includes(SIGNATURE)
    }
  };
}

/**
 * Formats multiple posts from workflow
 */
function formatWorkflowPosts(workflow) {
  const formatted = {
    posts: [],
    replies: [],
    quotes: [],
    follows: workflow.follows || []
  };
  
  if (workflow.posts) {
    formatted.posts = workflow.posts.map(post => ({
      ...post,
      content: formatTweet(post.content, post.hashtags)
    }));
  }
  
  if (workflow.replies) {
    formatted.replies = workflow.replies.map(reply => ({
      ...reply,
      content: formatTweet(reply.content, reply.hashtags)
    }));
  }
  
  if (workflow.quotes) {
    formatted.quotes = workflow.quotes.map(quote => ({
      ...quote,
      content: formatTweet(quote.content, quote.hashtags)
    }));
  }
  
  return formatted;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node format-enforcer.js <content>');
    console.error('   or: node format-enforcer.js --validate <content>');
    process.exit(1);
  }
  
  let content, mode;
  
  if (args[0] === '--validate') {
    mode = '--validate';
    content = args.slice(1).join(' ');
  } else {
    mode = 'format';
    content = args.join(' ');
  }
  
  if (mode === '--validate') {
    const result = validateFormat(content);
    console.log(result.valid ? '✅ Valid format' : '❌ Invalid format:');
    if (!result.valid) {
      result.issues.forEach(issue => console.log(`  - ${issue}`));
    }
    console.log(`Stats: ${JSON.stringify(result.stats, null, 2)}`);
  } else {
    const formatted = formatTweet(content);
    console.log('Formatted tweet:');
    console.log(formatted);
    console.log(`\nLength: ${formatted.length} chars`);
  }
}

export {
  formatTweet,
  formatWorkflowPosts,
  validateFormat,
  selectHashtags,
  APPROVED_HASHTAGS,
  SIGNATURE
};
