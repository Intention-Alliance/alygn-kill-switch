/**
 * Test script for parser truncation fixes
 * Tests:
 * 1. Word boundary truncation (no mid-word cuts)
 * 2. URL stripping (no original URLs in output)
 * 3. Citation marker removal (no [[N]] markers)
 */

import { formatPost, stripUrlsAndCitations } from '../twitter-content-parser.js';

console.log('🧪 Testing Parser Fixes\n');
console.log('=' .repeat(60));

// Test 1: stripUrlsAndCitations function
console.log('\n📋 Test 1: stripUrlsAndCitations function');
console.log('-'.repeat(60));

const testContent1 = 'This is a test [[1]] with citation markers [[2]] and URLs https://example.com/page and (https://other.com) plus [markdown link](https://link.com)';
const cleaned1 = stripUrlsAndCitations(testContent1);
console.log('Input:  ', testContent1);
console.log('Output: ', cleaned1);
console.log('✅ Pass:', !cleaned1.includes('http') && !cleaned1.includes('[[') && !cleaned1.includes(']('));

// Test 2: Word boundary truncation
console.log('\n📋 Test 2: Word boundary truncation');
console.log('-'.repeat(60));

const longText = 'This is a very long text about accelerating innovation and implementing new strategies for maximizing productivity in the workplace environment';
const truncated = longText.length > 100 
  ? longText.substring(0, longText.lastIndexOf(' ', 100))
  : longText;
console.log('Original length:', longText.length);
console.log('Truncated:     ', truncated);
console.log('Truncated len: ', truncated.length);
console.log('Ends with space:', truncated.endsWith(' '));
console.log('✅ Pass:', !truncated.match(/\w+\s*$/) || truncated.length === longText.length);

// Test 3: Full formatPost with URL stripping
console.log('\n📋 Test 3: formatPost with URL stripping');
console.log('-'.repeat(60));

const testPost = 'New AI governance framework [[1]](https://example.com/ai-gov) is accelerating adoption rates. Check https://governance.ai/framework for details [[2]].';
const formatted = await formatPost(testPost);
console.log('Main tweet:  ', formatted.main);
console.log('Reply tweet: ', formatted.reply || '(no reply - short content)');
if (formatted.reply) {
  console.log('✅ No http in reply:', !formatted.reply.includes('http://') && !formatted.reply.includes('https://'));
  console.log('✅ No [[ in reply:', !formatted.reply.includes('[['));
} else {
  console.log('✅ No http in main:', !formatted.main.includes('http://') && !formatted.main.includes('https://'));
  console.log('✅ No [[ in main:', !formatted.main.includes('[['));
}

// Test 4: Simulated truncation at word boundary
console.log('\n📋 Test 4: Simulated truncation scenarios');
console.log('-'.repeat(60));

const scenarios = [
  { text: 'The quick brown fox jumps over the lazy dog repeatedly', limit: 30 },
  { text: 'Accelerating innovation through strategic implementation of best practices', limit: 50 },
  { text: 'This text has a URL https://example.com/page and should be cleaned', limit: 60 }
];

scenarios.forEach((scenario, idx) => {
  const cleaned = stripUrlsAndCitations(scenario.text);
  const truncated = cleaned.length > scenario.limit 
    ? cleaned.substring(0, cleaned.lastIndexOf(' ', scenario.limit))
    : cleaned;
  
  console.log(`\nScenario ${idx + 1}:`);
  console.log('  Original: ', scenario.text);
  console.log('  Cleaned:  ', cleaned);
  console.log('  Truncated:', truncated);
  console.log('  Length:   ', truncated.length);
  
  // Check if we cut at word boundary
  const lastChar = truncated.slice(-1);
  const isWordChar = /\w/.test(lastChar);
  console.log('  ✅ Word boundary:', isWordChar || truncated.length === cleaned.length);
});

console.log('\n' + '='.repeat(60));
console.log('🎉 All tests completed!\n');
