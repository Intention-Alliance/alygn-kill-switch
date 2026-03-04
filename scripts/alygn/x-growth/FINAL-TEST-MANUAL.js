#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Inline parser v3 (aggressive stripping)
function parseContent(content) {
  let lines = content.split('\n');
  let posts = [];
  let currentPost = '';
  
  for (let line of lines) {
    line = line.trim();
    
    // Hard skip list
    if (line.match(/^#+\s/) || 
        line.includes('**') || 
        line.includes('Tokens Used:') ||
        line.includes('Executed:') ||
        line.includes('Model:') ||
        line.includes('Search Enabled:') ||
        line.includes('---') ||
        line.includes('Response') ||
        line.includes('Thread Ideas') ||
        line.length < 15) {
      continue;
    }
    
    // Numbered list item
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      if (currentPost.length > 20) posts.push(currentPost);
      currentPost = match[1];
      continue;
    }
    
    // End of list
    if (line.length === 0 && currentPost.length > 20) {
      posts.push(currentPost);
      currentPost = '';
      continue;
    }
    
    // Accumulate
    if (line.length >= 15) {
      currentPost = currentPost ? currentPost + ' ' + line : line;
    }
  }
  
  if (currentPost.length > 20) posts.push(currentPost);
  return posts;
}

function format(content) {
  return `${content}\n\n#AIGovernance #Alygn`;
}

// Load test file
const testFile = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/test-grok-real.md');
const markdown = fs.readFileSync(testFile, 'utf-8');

console.log('\n' + '='.repeat(70));
console.log('PARSER V3 - FINAL VERIFICATION');
console.log('='.repeat(70) + '\n');

const posts = parseContent(markdown);

console.log(`Extracted: ${posts.length} posts\n`);

let allClean = true;

posts.forEach((post, i) => {
  const formatted = format(post);
  
  // Check for残留
  const hasMarkdown = formatted.includes('# ') || 
                      formatted.includes('**') || 
                      formatted.includes('Executed:') ||
                      formatted.includes('Model:') ||
                      formatted.includes('Tokens:');
  
  if (hasMarkdown) {
    console.log(`❌ POST ${i+1}: STILL HAS MARKDOWN/METADATA!\n`);
    allClean = false;
  } else {
    console.log(`✅ POST ${i+1} CLEAN (${formatted.length} chars):`);
  }
  
  console.log('-'.repeat(70));
  console.log(formatted);
  console.log();
});

console.log('='.repeat(70));
if (allClean && posts.length === 5) {
  console.log('✅ SUCCESS: All 5 posts clean, no markdown/metadata!\n');
} else {
  console.log(`⚠️  ISSUE: ${allClean ? 'Correct count but' : 'Still has markdown'} - needs fix\n`);
}
