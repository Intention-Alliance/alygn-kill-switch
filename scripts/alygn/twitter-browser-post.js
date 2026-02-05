#!/usr/bin/env node

/**
 * Twitter Browser Post Executor
 * 
 * Takes workflow JSON and executes via browser automation
 * - Posts threads with @aialygn mention
 * - Replies to target profiles
 * - Follows suggested profiles
 */

const fs = require("fs");
const path = require("path");

// Load workflow
const workflowFile = process.argv[2];
if (!workflowFile) {
  console.error("Usage: node twitter-browser-post.js <workflow-file>");
  process.exit(1);
}

let workflow;
try {
  workflow = JSON.parse(fs.readFileSync(workflowFile, "utf-8"));
} catch (error) {
  console.error("Failed to load workflow:", error.message);
  process.exit(1);
}

console.log("📱 Twitter Browser Automation Executor");
console.log(`⏰ Workflow: ${workflow.timestamp}`);
console.log(`📊 Posts: ${workflow.posts.length} | Replies: ${workflow.replies.length} | Profiles: ${workflow.profiles.length}`);

// Output instructions for browser automation
console.log("\n🌐 Browser Automation Flow:");
console.log("=".repeat(60));

workflow.posts.forEach((post, idx) => {
  console.log(`\n📝 POST #${idx + 1}: ${post.title}`);
  console.log(`   Hook: "${post.hook}"`);
  if (post.isThread && post.content.length > 0) {
    console.log(`   Thread (${post.content.length} parts):`);
    post.content.forEach((point, pIdx) => {
      console.log(`     ${pIdx + 1}. ${point}`);
    });
  }
  console.log(`   Mention: ${post.mention}`);
  console.log(`   Format: "${post.hook}\n${post.content.join("\n")}\n\nMore at ${post.mention}"`);
});

console.log("\n" + "=".repeat(60));

workflow.replies.forEach((reply, idx) => {
  console.log(`\n💬 REPLY #${idx + 1}: To ${reply.target}`);
  console.log(`   Content: "${reply.content}"`);
  console.log(`   Include: ${reply.mention}`);
});

console.log("\n" + "=".repeat(60));

console.log("\n👥 PROFILES TO FOLLOW:");
workflow.profiles.forEach(profile => {
  console.log(`   • ${profile}`);
});

console.log("\n✅ Instructions:");
console.log("   1. Navigate to https://x.com/home");
console.log("   2. Use the compose box to post each item above");
console.log("   3. For threads: Post hook, then add each point as continuation");
console.log("   4. Always append: 'More at @aialygn'");
console.log("   5. For replies: Navigate via /explore to find target tweets");
console.log("   6. Post reply with @aialygn mention");
console.log("   7. Follow each profile from the list");

console.log("\n🚀 This script outputs the workflow for browser execution.");
console.log("   The actual browser automation should call this with --execute flag.");
console.log("   Then use browser.act() to post, navigate, and reply.");

// Output JSON for external consumption
console.log("\n\n📦 WORKFLOW JSON:");
console.log(JSON.stringify(workflow, null, 2));
