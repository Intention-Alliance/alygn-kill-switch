#!/usr/bin/env node

// Manual test - inline parser to avoid import issues
const fs = require('fs');
const path = require('path');

function enhancedParseMarkdownContent(content) {
  let lines = content.split('\n');
  let posts = [];
  let currentPost = '';
  let inNumberedList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // SKIP ALL METADATA LINES
    if (line.match(/^#+\s/) || 
        line.includes('**') || 
        line.includes('Tokens Used:') ||
        line.includes('Executed:') ||
        line.includes('Model:') ||
        line.includes('Search Enabled:') ||
        line.includes('Dynamic Injection:') ||
        line.includes('###') ||
        line.includes('---') ||
        line.match(/^\*\s/) ||
        line.match(/^-+\s*$/) ||
        line.includes('Response') ||
        line.includes('Thread Ideas') ||
        line.includes('Prompt #')) {
      continue;
    }
    
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      if (currentPost.trim().length > 20) {
        posts.push(currentPost.trim());
      }
      currentPost = numberedMatch[2];
      inNumberedList = true;
      continue;
    }
    
    if (inNumberedList && line.length === 0) {
      if (currentPost.trim().length > 20) {
        posts.push(currentPost.trim());
      }
      currentPost = '';
      inNumberedList = false;
      continue;
    }
    
    if (line.length === 0) continue;
    if (line.length < 15) continue;
    if (line.match(/^(Here are|Based on|According to|In summary)/i)) continue;
    
    if (currentPost.length > 0) {
      currentPost += ' ' + line;
    } else {
      currentPost = line;
    }
  }
  
  if (currentPost.trim().length > 20) {
    posts.push(currentPost.trim());
  }
  
  return posts;
}

function formatPost(content, hashtags = ['#AIGovernance', '#Alygn']) {
  const trimmed = content.trim();
  const hashtagLine = hashtags.join(' ');
  const reservedLength = hashtagLine.length + 2;
  const availableSpace = 280 - reservedLength;
  
  const finalContent = trimmed.length > availableSpace 
    ? trimmed.substring(0, availableSpace - 3) + '...'
    : trimmed;
  
  return `${finalContent}\n\n${hashtagLine}`;
}

// Test
const TEST_FILE = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/test-grok-real.md');
const markdown = fs.readFileSync(TEST_FILE, 'utf-8');

console.log('\n🔍 PARSER V3 TEST - Manual Inline\n');
console.log('='.repeat(70));

const posts = enhancedParseMarkdownContent(markdown);

console.log(`\nExtracted ${posts.length} posts:\n`);

posts.forEach((post, idx) => {
  const formatted = formatPost(post);
  console.log('-'.repeat(70));
  console.log(`POST #${idx + 1} (${formatted.length} chars):\n`);
  console.log(formatted);
  console.log();
});

console.log('='.repeat(70));
console.log('\n✅ Check: No markdown (#, **), no metadata (Executed:, Model:, Tokens:)\n');
