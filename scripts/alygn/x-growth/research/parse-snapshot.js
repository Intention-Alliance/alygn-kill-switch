
/**
 * Parse X.com /explore snapshot into structured post data
 * Extracts posts from browser snapshot with article elements
 */

function parsePostsFromSnapshot(snapshotText) {
  const posts = [];
  
  // Split by article elements (each post is wrapped in article)
  const articlePattern = /article "([^"]+)" \[ref=([^\]]+)\]/g;
  let match;
  
  while ((match = articlePattern.exec(snapshotText)) !== null) {
    const articleText = match[1];
    
    // Extract components from article text
    // Format: "AuthorName Verified account @handle TimeAgo Content ... NNN replies, MMM reposts, KKK likes, BBB bookmarks, VVV views"
    
    const authorMatch = articleText.match(/^([^@]+)\s+(?:Verified account\s+)?@(\w+)/);
    const timeMatch = articleText.match(/(\d+)\s+(hour|hours|day|days|minute|minutes)\s+ago/);
    const engagementMatch = articleText.match(/(\d+)\s+replies,\s+(\d+)\s+reposts,\s+(\d+)\s+likes,\s+(\d+)\s+bookmarks,\s+(\d+)\s+views/);
    
    if (!authorMatch) continue;
    
    const authorName = authorMatch[1].trim();
    const handle = authorMatch[2];
    
    // Extract post ID from status URL
    const statusMatch = articleText.match(/\/status\/(\d+)/);
    const postId = statusMatch ? statusMatch[1] : null;
    
    // Content: everything after timestamp and before engagement metrics
    let content = articleText;
    if (timeMatch) {
      const timeEnd = articleText.indexOf(timeMatch[0]) + timeMatch[0].length;
      content = articleText.substring(timeEnd).trim();
    }
    if (engagementMatch) {
      const engStart = articleText.indexOf(engagementMatch[0]);
      content = articleText.substring(0, engStart).trim();
    }
    
    // Clean up content
    content = content.replace(/^([^@]+\s+)?@\w+\s+\d+\s+(hour|hours|day|days|minute|minutes)\s+ago\s+/, '');
    content = content.replace(/\s+\d+\s+replies.*$/, '');
    content = content.trim();
    
    // Extract engagement metrics
    let engagement = { likes: 0, retweets: 0, replies: 0, views: 0, bookmarks: 0 };
    if (engagementMatch) {
      engagement = {
        replies: parseInt(engagementMatch[1]),
        retweets: parseInt(engagementMatch[2]),
        likes: parseInt(engagementMatch[3]),
        bookmarks: parseInt(engagementMatch[4]),
        views: parseInt(engagementMatch[5])
      };
    }
    
    posts.push({
      postId,
      author: `@${handle}`,
      authorName,
      content,
      engagement,
      url: postId ? `https://x.com/${handle}/status/${postId}` : null,
      keywords: extractKeywords(content)
    });
  }
  
  return posts;
}

function extractKeywords(content) {
  const keywords = [];
  const text = content.toLowerCase();
  
  // AI/AGI/Safety related keywords
  const aiKeywords = [
    'agi', 'ai safety', 'alignment', 'grok', 'xai', 'anthropic',
    'openai', 'deepmind', 'claude', 'opus', 'mechanistic', 'interpretability',
    'superintelligence', 'transformer', 'llm', 'neural', 'ai corridor'
  ];
  
  for (const kw of aiKeywords) {
    if (text.includes(kw)) {
      keywords.push(kw);
    }
  }
  
  return keywords;
}

// Test with real snapshot
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const testSnapshot = `
  article "Elon Musk Verified account @elonmusk 12 hours ago New @xAI office opened in Seattle area Quote X Daily News Verified account @xDaily 13 hours ago NEWS: xAI opened a new engineering office in Bellevue, Washington at Lincoln Square South, joining OpenAI in the Eastside AI corridor. The company now has offices in the Bay Area, Bellevue, and data centers in Memphis. x.com/grok/status/20 1496 replies, 1377 reposts, 12969 likes, 586 bookmarks, 16064599 views" [ref=e1265]
  
  article "Muhammad Ayan Verified account @socialwithaayan 11 hours ago BREAKING: AI can now do market research like McKinsey (for free). Here are 12 insane Claude Opus 4.6 prompts that replace $5,000 consultant: (Save for later) Image 133 replies, 675 reposts, 5641 likes, 15542 bookmarks, 758612 views" [ref=e1459]
  `;
  
  const posts = parsePostsFromSnapshot(testSnapshot);
  console.log(JSON.stringify(posts, null, 2));
}

export { parsePostsFromSnapshot, extractKeywords };
