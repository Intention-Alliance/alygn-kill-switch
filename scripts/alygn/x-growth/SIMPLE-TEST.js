#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Simplest possible parser test
const testFile = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/test-grok-real.md');
const content = fs.readFileSync(testFile, 'utf-8');

console.log('\n📄 INPUT FILE CONTENTS:\n');
console.log(content);
console.log('\n' + '='.repeat(70) + '\n');

// Extract just the numbered items manually
const lines = content.split('\n');
let posts = [];

for (let line of lines) {
  const match = line.match(/^\d+\.\s+(.+)$/);
  if (match) {
    posts.push(match[1]);
  }
}

console.log(`\n✅ EXTRACTED ${posts.length} posts:\n`);

posts.forEach((post, i) => {
  const formatted = `${post}\n\n#AIGovernance #Alygn`;
  console.log(`POST ${i+1} (${formatted.length} chars):`);
  console.log('-'.repeat(70));
  console.log(formatted);
  console.log();
});

console.log('='.repeat(70));
console.log(posts.length === 5 ? '✅ SUCCESS: All 5 posts extracted cleanly!\n' : '❌ FAILED\n');
