#!/usr/bin/env node

/**
 * Test Parser Output - Debug Mode
 * Shows exactly what will be posted BEFORE sending to X API
 */

import { parseGrokOutput } from '../../twitter-content-parser.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEST_FILE = join(
  process.env.HOME,
  '.openclaw/workspace/twitter-outputs/test-grok-real.md'
);

console.log('🔍 PARSER DEBUG TEST\n');
console.log('='.repeat(70));
console.log(`Input: ${TEST_FILE}\n`);

// Load test file
const markdown = readFileSync(TEST_FILE, 'utf-8');
console.log('📄 RAW INPUT (first 500 chars):');
console.log('-'.repeat(70));
console.log(markdown.substring(0, 500) + '...\n');

// Parse
console.log('🔄 PARSING...\n');
const workflow = parseGrokOutput(markdown);

// Show results
console.log('📊 PARSER OUTPUT:');
console.log('='.repeat(70));
console.log(`Total posts extracted: ${workflow.totalPosts}`);
console.log(`Valid posts: ${workflow.validPosts}`);
console.log(`Blocked posts: ${workflow.blockedPosts}\n`);

workflow.posts.forEach((post, idx) => {
  console.log('-'.repeat(70));
  console.log(`POST #${idx + 1} [${post.status.toUpperCase()}]`);
  console.log('-'.repeat(70));
  
  if (post.status === 'blocked') {
    console.log(`❌ BLOCKED: ${post.issues.join(', ')}`);
    console.log(`\nOriginal content:\n"${post.originalContent}"\n`);
  } else {
    console.log(`✅ READY TO POST\n`);
    console.log(`Content (${post.content.length} chars):\n`);
    console.log('```');
    console.log(post.content);
    console.log('```\n');
    
    // Check for markdown残留
    if (post.content.includes('#') || 
        post.content.includes('**') || 
        post.content.includes('Executed:') ||
        post.content.includes('Model:')) {
      console.log('⚠️  WARNING: Markdown/metadata still present!\n');
    }
  }
});

console.log('='.repeat(70));
console.log('\n✅ Test complete!\n');
