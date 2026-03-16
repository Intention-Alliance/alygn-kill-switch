/**
 * Dynamic Injector for @aialyygn Twitter Automation
 * 
 * Replaces placeholder patterns in prompts with real data from aggregator.
 * 
 * Supported patterns:
 * - [PLACEHOLDER_NAME] — Standard uppercase placeholders
 * - [insert X] / [INSERT X] — Case-insensitive insert patterns
 * - [topic] / [brief explanation] — Legacy patterns from Grok templates
 */

import { getInjectionData } from './data-aggregator.js';

// Mapping of common placeholder variations to canonical names
const PLACEHOLDER_ALIASES = {
  // Trend-related
  'insert trending topics': 'TRENDING_TOPICS',
  'trending topics': 'TRENDING_TOPICS',
  'current trends': 'TRENDING_TOPICS',
  'insert real topics': 'TRENDING_TOPICS',
  'insert topics': 'TRENDING_TOPICS',
  'topic': 'PRIMARY_TREND',
  'primary trend': 'PRIMARY_TREND',
  
  // Analytics-related
  'insert analytics': 'ANALYTICS_DATA',
  'insert data': 'ANALYTICS_DATA',
  'analytics data': 'ANALYTICS_DATA',
  'insert follower growth': 'ANALYTICS_DATA',
  'insert impressions': 'ANALYTICS_DATA',
  'performance data': 'ANALYTICS_DATA',
  
  // Audience-related
  'target audience': 'TARGET_AUDIENCE',
  'insert audience': 'TARGET_AUDIENCE',
  'audience': 'TARGET_AUDIENCE',
  'segment': 'TARGET_AUDIENCE',
  
  // Engagement-related
  'engagement target': 'ENGAGEMENT_TARGET',
  'insert target': 'ENGAGEMENT_TARGET',
  'target metrics': 'ENGAGEMENT_TARGET',
  
  // Content-related
  'insert content types': 'TOP_CONTENT_THEMES',
  'content themes': 'TOP_CONTENT_THEMES',
  'top content': 'TOP_CONTENT_THEMES',
  'content types': 'TOP_CONTENT_THEMES',
  
  // Accounts-related
  'key accounts': 'KEY_ACCOUNTS',
  'insert accounts': 'KEY_ACCOUNTS',
  'target accounts': 'KEY_ACCOUNTS',
  
  // Legacy patterns from Grok responses
  'brief explanation': 'ALIGNMENT_INSIGHT', // Contextual alignment insight
  'explanation': 'ALIGNMENT_INSIGHT',
  
  // Avoid patterns
  'avoid angles': 'AVOID_ANGLES',
  'avoid': 'AVOID_ANGLES',
  
  // Date/time
  'current date': 'CURRENT_DATE',
  'date': 'CURRENT_DATE',
  'today': 'CURRENT_DATE',
  
  // Post text patterns (for browser-discovered posts)
  'insert post text here': 'POST_TEXT',
  'insert post text': 'POST_TEXT',
  'post text here': 'POST_TEXT',
  'post text': 'POST_TEXT',
  'sample x post': 'POST_TEXT',
  'sample post': 'POST_TEXT',
  'tweet text': 'POST_TEXT',
  'tweet content': 'POST_TEXT',
  
  // Multiple posts
  'top posts': 'TOP_POSTS',
  'insert top posts': 'TOP_POSTS',
  'high-engagement posts': 'HIGH_ENGAGEMENT_POSTS',
  'high engagement posts': 'HIGH_ENGAGEMENT_POSTS',
  'popular posts': 'HIGH_ENGAGEMENT_POSTS'
};

/**
 * Normalize a placeholder key to its canonical form
 */
function normalizeKey(key) {
  const lower = key.toLowerCase().trim();
  
  // Check if it's already a canonical uppercase key
  if (key === key.toUpperCase() && key.includes('_')) {
    return key;
  }
  
  // Check aliases
  if (PLACEHOLDER_ALIASES[lower]) {
    return PLACEHOLDER_ALIASES[lower];
  }
  
  // Try converting to uppercase with underscores
  const canonical = lower.replace(/\s+/g, '_').toUpperCase();
  return canonical;
}

/**
 * Inject dynamic values into a prompt string
 * 
 * @param {string} promptText - Original prompt with placeholders
 * @param {object} injectionData - Data from getInjectionData()
 * @returns {string} - Prompt with placeholders replaced
 */
function injectValues(promptText, injectionData) {
  let result = promptText;
  
  // Pattern 1: [UPPERCASE_PLACEHOLDER]
  result = result.replace(/\[([A-Z_]+)\]/g, (match, key) => {
    return injectionData[key] || match;
  });
  
  // Pattern 2: [insert X] or [INSERT X] (case-insensitive)
  result = result.replace(/\[insert\s+([^\]]+)\]/gi, (match, content) => {
    const canonical = normalizeKey(content);
    return injectionData[canonical] || match;
  });
  
  // Pattern 3: [lowercase placeholder] like [topic] or [brief explanation]
  result = result.replace(/\[([a-z][^\]]*)\]/g, (match, content) => {
    const canonical = normalizeKey(content);
    return injectionData[canonical] || match;
  });
  
  // Pattern 4: Handle remaining [anything] patterns
  result = result.replace(/\[([^\]]+)\]/g, (match, content) => {
    const canonical = normalizeKey(content);
    if (injectionData[canonical]) {
      return injectionData[canonical];
    }
    // If no match found, leave as-is (might be intentional formatting)
    return match;
  });
  
  return result;
}

/**
 * Inject dynamic values using auto-loaded data
 * 
 * @param {string} promptText - Original prompt with placeholders
 * @returns {Promise<{prompt: string, data: object, injectionsMade: number}>}
 */
async function injectDynamicValues(promptText) {
  const injectionData = await getInjectionData();
  
  // Count how many injections we'll make
  const placeholderMatches = promptText.match(/\[[^\]]+\]/g) || [];
  const originalCount = placeholderMatches.length;
  
  const injectedPrompt = injectValues(promptText, injectionData);
  
  // Count remaining placeholders
  const remainingMatches = injectedPrompt.match(/\[[^\]]+\]/g) || [];
  const injectionsMade = originalCount - remainingMatches.length;
  
  return {
    prompt: injectedPrompt,
    data: injectionData,
    injectionsMade,
    remainingPlaceholders: remainingMatches
  };
}

/**
 * Preview injections without executing
 */
async function previewInjections(promptText) {
  const result = await injectDynamicValues(promptText);
  
  console.log('\n📊 DYNAMIC INJECTION PREVIEW\n');
  console.log('='.repeat(60));
  console.log('\n📝 ORIGINAL PROMPT:\n');
  console.log(promptText.substring(0, 500) + (promptText.length > 500 ? '...' : ''));
  console.log('\n' + '='.repeat(60));
  console.log('\n✨ AFTER INJECTION:\n');
  console.log(result.prompt.substring(0, 500) + (result.prompt.length > 500 ? '...' : ''));
  console.log('\n' + '='.repeat(60));
  console.log(`\n📈 Injections made: ${result.injectionsMade}`);
  console.log(`⚠️  Remaining placeholders: ${result.remainingPlaceholders.length}`);
  if (result.remainingPlaceholders.length > 0) {
    console.log('   ' + result.remainingPlaceholders.slice(0, 5).join(', '));
  }
  console.log('\n📦 DATA SOURCES:');
  console.log(`   Trends: ${result.data.TRENDING_TOPICS?.substring(0, 50)}...`);
  console.log(`   Audience: ${result.data.TARGET_AUDIENCE}`);
  console.log(`   Freshness: ${result.data.DATA_FRESHNESS}`);
  
  return result;
}

export {
  injectValues,
  injectDynamicValues,
  previewInjections,
  normalizeKey,
  PLACEHOLDER_ALIASES
};
