#!/usr/bin/env node

/**
 * Execute Twitter replies + follows via browser relay
 * Uses workflow.json data to reply to targets and follow profiles
 * Requires: --profile=alygn flag for browser tool calls
 */

const fs = require('fs');
const path = require('path');

// Load workflow
const workflowPath = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/workflow-1770484855297.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🐦 Twitter Phase 2 Executor - Replies & Follows');
console.log('='.repeat(50));
console.log(`Total replies to execute: ${workflow.replies.length}`);
console.log(`Total profiles to follow: ${workflow.profiles.length}`);
console.log('');

// Display what we're about to do
console.log('📋 REPLIES TO EXECUTE:');
workflow.replies.forEach((r, i) => {
  console.log(`${i + 1}. Reply to ${r.targetHandle}: "${r.content.substring(0, 60)}..."`);
});

console.log('');
console.log('👥 PROFILES TO FOLLOW:');
workflow.profiles.forEach((p, i) => {
  console.log(`${i + 1}. ${p}`);
});

console.log('');
console.log('INSTRUCTIONS FOR MANUAL EXECUTION:');
console.log('─'.repeat(50));
console.log('');
console.log('Since automated browser clicking has limitations on X.com,');
console.log('execute replies/follows manually using the prepared text:');
console.log('');
console.log('REPLIES:');
workflow.replies.forEach((r, i) => {
  console.log(`\n[${i + 1}] Reply to ${r.targetHandle}`);
  console.log('─'.repeat(40));
  console.log(`Message:\n${r.content}`);
  console.log('');
});

console.log('\nFOLLOWS:');
console.log('─'.repeat(40));
workflow.profiles.forEach((p, i) => {
  console.log(`${i + 1}. Navigate to ${p} → Click "Follow" button`);
});

console.log('');
console.log('✅ All data prepared and ready for execution!');
