
/**
 * Test Parser v3 - Show Output Before Posting
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGrokOutput } from '../../twitter-content-parser.js';

const TEST_FILE = join(
  process.env.HOME,
  '.openclaw/workspace/twitter-outputs/test-grok-real.md'
);

console.log('\n🔍 PARSER V3 DEBUG TEST\n');
console.log('='.repeat(70));

const markdown = readFileSync(TEST_FILE, 'utf-8');
const workflow = parseGrokOutput(markdown);

console.log(`\n📊 RESULTS:`);
console.log(`   Total: ${workflow.totalPosts}`);
console.log(`   Valid: ${workflow.validPosts} ✅`);
console.log(`   Blocked: ${workflow.blockedPosts} ⚠️\n`);

workflow.posts.forEach((post, idx) => {
  console.log('-'.repeat(70));
  console.log(`POST #${idx + 1}: ${post.status.toUpperCase()}\n`);
  
  if (post.status === 'blocked') {
    console.log(`❌ ${post.issues.join(', ')}\n`);
  } else {
    console.log(`✅ READY TO POST (${post.content.length} chars):\n`);
    console.log(post.content);
    console.log();
  }
});

console.log('='.repeat(70));
console.log('\n✅ If all posts look clean (no markdown, no metadata), we\'re ready!\n');
