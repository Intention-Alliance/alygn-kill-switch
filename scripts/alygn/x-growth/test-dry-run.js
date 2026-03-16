
/**
 * Test Script - Parser & Executor Dry-Run
 * 
 * Quick test of the Twitter content parser pipeline
 */

import fs from "fs";
import path from "path";
import { parseGrokOutput } from "../../twitter-content-parser.js";

const TEST_FILE = path.join(
  process.env.HOME,
  '.openclaw/workspace/twitter-outputs/grok-output-ai-governance-2026.md'
);

console.log('🔧 Twitter Parser Pipeline - Dry-Run Test\n');
console.log('='.repeat(60));

// Load test file
try {
  const markdown = fs.readFileSync(TEST_FILE, 'utf-8');
  console.log(`✅ Loaded: ${TEST_FILE}`);
  console.log(`   Size: ${markdown.length} chars\n`);
  
  // Parse
  console.log('🔄 Parsing content...\n');
  const workflow = parseGrokOutput(markdown);
  
  // Display results
  console.log('📊 WORKFLOW RESULTS');
  console.log('='.repeat(60));
  console.log(`Generated: ${workflow.generatedAt}`);
  console.log(`Total posts: ${workflow.totalPosts}`);
  console.log(`Valid: ${workflow.validPosts} ✅`);
  console.log(`Blocked: ${workflow.blockedPosts} ⚠️`);
  console.log('');
  
  // Show each post
  workflow.posts.forEach((post, idx) => {
    console.log(`\n📝 Post #${post.id} [${post.status.toUpperCase()}]`);
    console.log('-'.repeat(60));
    
    if (post.status === 'blocked') {
      console.log(`⚠️  BLOCKED: ${post.issues.join(', ')}`);
      console.log(`Original: ${post.originalContent.substring(0, 100)}...`);
    } else {
      console.log(`Content (${post.content.length} chars):`);
      console.log(post.content);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Test complete!');
  console.log('\nNext steps:');
  console.log('  bun x-api-executor.js grok-output-ai-governance-2026.md --dry-run');
  console.log('  bun x-api-executor.js grok-output-ai-governance-2026.md --live');
  
} catch (err) {
  console.error(`❌ Error: ${err.message}`);
  console.error(`   Code: ${err.code}`);
  process.exit(1);
}
