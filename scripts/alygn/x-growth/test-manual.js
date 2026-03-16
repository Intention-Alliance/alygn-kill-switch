
/**
 * Manual Test - Inline Parser Test
 * No imports, just inline test
 */

import fs from "fs";
import path from "path";

// Inline parser functions (copied from twitter-content-parser.js for testing)
function enhancedParseMarkdownContent(content) {
  let cleanedContent = content.replace(/```[\S\s]*?```/g, '');
  cleanedContent = cleanedContent.replace(/`[\S\s]*?`/g, '');
  
  cleanedContent = cleanedContent.replace(/^\s*(`?\$?\s*(npm|pip|apt|curl|sh|bash|git)\b)/gm, '');
  cleanedContent = cleanedContent.replace(/`npm install\s+\S+`/g, '');
  cleanedContent = cleanedContent.replace(/`pip install\s+\S+`/g, '');
  cleanedContent = cleanedContent.replace(/`curl -s\s+\S+`/g, '');
  
  let lines = cleanedContent.split('\n');
  let posts = [];
  let currentPost = '';
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (line.match(/^(\d+\.\s*)/)) {
      if (currentPost && currentPost.length > 20) {
        posts.push(currentPost);
        currentPost = '';
      }
      inList = true;
    } else if (line.match(/^(\*\s*)/)) {
      if (currentPost && currentPost.length > 20) {
        posts.push(currentPost);
        currentPost = '';
      }
      inList = true;
    } else if (line.match(/^(\-\s*)/)) {
      if (currentPost && currentPost.length > 20) {
        posts.push(currentPost);
        currentPost = '';
      }
      inList = true;
    } else {
      if (inList) {
        if (currentPost && currentPost.length > 20) {
          posts.push(currentPost);
          currentPost = '';
        }
        inList = false;
      }
      
      if (line.length > 20) {
        currentPost += line + '\n';
      }
    }
  }
  
  if (currentPost && currentPost.length > 20) {
    posts.push(currentPost);
  }
  
  return posts;
}

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
    
    results.push({
      content: post,
      valid: issues.length === 0,
      issues
    });
  }
  
  return results;
}

function formatPost(content, hashtags = ['#AIGovernance']) {
  const trimmed = content.trim();
  const hashtagLine = hashtags.join(' ');
  const signature = 'more at @aialygn';
  
  const reservedLength = hashtagLine.length + signature.length + 4;
  const availableSpace = 280 - reservedLength;
  
  const finalContent = trimmed.length > availableSpace 
    ? trimmed.substring(0, availableSpace - 3) + '...'
    : trimmed;
  
  return `${finalContent}\n\n${hashtagLine}\n\n${signature}`;
}

// Test
const TEST_FILE = path.join(
  process.env.HOME,
  '.openclaw/workspace/twitter-outputs/grok-output-ai-governance-2026.md'
);

console.log('🔧 Twitter Parser - Manual Inline Test\n');
console.log('='.repeat(60));

const markdown = fs.readFileSync(TEST_FILE, 'utf-8');
console.log(`✅ Loaded: ${markdown.length} chars\n`);

const posts = enhancedParseMarkdownContent(markdown);
console.log(`📝 Extracted ${posts.length} posts:\n`);

const validated = validateContent(posts);

validated.forEach((post, idx) => {
  console.log(`\n--- Post #${idx + 1} [${post.valid ? '✅ VALID' : '⚠️ BLOCKED'}] ---`);
  
  if (!post.valid) {
    console.log(`Issues: ${post.issues.join(', ')}`);
  }
  
  const formatted = formatPost(post.content);
  console.log(`Formatted (${formatted.length} chars):`);
  console.log(formatted);
});

console.log('\n' + '='.repeat(60));
console.log(`\n✅ Test complete!`);
console.log(`Total: ${validated.length}`);
console.log(`Valid: ${validated.filter(p => p.valid).length}`);
console.log(`Blocked: ${validated.filter(p => !p.valid).length}`);
