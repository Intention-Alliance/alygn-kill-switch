
import fs from 'fs';
import path from 'path';
import { parseGrokOutput } from '../twitter-content-parser.js';

const outputDir = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs');
const files = fs.readdirSync(outputDir)
  .filter(f => f.startsWith('prompt-') && f.endsWith('.md'))
  .sort()
  .reverse();

if (files.length === 0) {
  console.log('❌ No Grok output files found');
  process.exit(1);
}

const latestFile = files[0];
const filePath = path.join(outputDir, latestFile);

console.log(`\n🔍 Testing Parser: ${latestFile}\n`);

const markdown = fs.readFileSync(filePath, 'utf-8');
console.log(`\n📄 RAW INPUT (first 1000 chars):\n${markdown.substring(0, 1000)}\n`);

console.log('\n🔄 PARSING...\n');
const workflow = parseGrokOutput(markdown);

console.log(`\n📊 RESULTS:`);
console.log(`Total: ${workflow.totalPosts}`);
console.log(`Valid: ${workflow.validPosts}`);
console.log(`Blocked: ${workflow.blockedPosts}\n`);

workflow.posts.forEach((post, idx) => {
  console.log(`--- POST #${idx + 1} [${post.status}] ---`);
  if (post.status === 'blocked') {
    console.log(`❌ ${post.issues.join(', ')}`);
  } else {
    console.log(`✅ ${post.content.length} chars\n${post.content}\n`);
  }
});
