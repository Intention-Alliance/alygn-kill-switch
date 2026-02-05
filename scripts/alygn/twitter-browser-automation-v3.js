#!/usr/bin/env node

/**
 * ALYGN Twitter Browser Automation v3
 * 
 * Automated workflow:
 * 1. Generate top 5 posts (Prompt #1)
 * 2. Generate 5 strategic replies (Prompt #13)
 * 3. Use browser to post threads + replies
 * 4. Follow suggested profiles
 * 5. Include @aialygn mention on all posts
 */

const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  WORKSPACE: path.join(process.env.HOME, ".openclaw/workspace"),
  OUTPUT_DIR: path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs"),
  POSTS_TO_PUBLISH: 5,
  REPLIES_TO_POST: 5,
  PROFILES_TO_FOLLOW: [
    "@xai",
    "@Dr_Singularity",
    "@AhmedZRashad",
    "@KaiwenZhou9",
    "@steve47285"
  ]
};

/**
 * Best posts to publish (pre-selected by AI review)
 * These are indices 0-based from the 10 generated ideas
 */
const BEST_POSTS = [
  0, // #1: Superintelligent Oversight (The Oversight Crisis)
  2, // #3: Inner vs Outer Alignment
  3, // #4: Fast AI Takeoff
  4, // #5: Deceptive Alignment
  9  // #10: Constitutional AI
];

const BEST_REPLIES = [
  0, // To @xai on Grok Imagine
  1, // To @Dr_Singularity on AGI timelines
  2, // To @AhmedZRashad on distribution shift
  3, // To @KaiwenZhou9 on safety benchmarks
  4  // To @steve47285 on high-reliability engineering
];

/**
 * Main orchestration
 */
async function main() {
  console.log("🚀 ALYGN Twitter Automation v3 - Starting");
  console.log(`⏰ Execution time: ${new Date().toISOString()}`);

  try {
    // Step 1: Load generated posts
    console.log("\n📝 Step 1: Loading generated posts...");
    const postsFile = getLatestFile(CONFIG.OUTPUT_DIR, "prompt-1");
    const repliesFile = getLatestFile(CONFIG.OUTPUT_DIR, "prompt-13");
    
    if (!postsFile || !repliesFile) {
      throw new Error("Posts or replies file not found. Run prompts first.");
    }

    const posts = parseMarkdownPosts(fs.readFileSync(postsFile, "utf-8"));
    const replies = parseMarkdownReplies(fs.readFileSync(repliesFile, "utf-8"));

    console.log(`✅ Loaded ${posts.length} posts and ${replies.length} replies`);

    // Step 2: Select best content
    console.log("\n🎯 Step 2: Selecting best posts and replies...");
    const selectedPosts = BEST_POSTS.map(i => posts[i]).filter(Boolean);
    const selectedReplies = BEST_REPLIES.map(i => replies[i]).filter(Boolean);

    console.log(`✅ Selected ${selectedPosts.length} posts and ${selectedReplies.length} replies`);

    // Step 3: Prepare post data for browser automation
    console.log("\n🔧 Step 3: Preparing post data for browser...");
    const postQueue = selectedPosts.map((post, idx) => ({
      id: idx + 1,
      title: post.title || `Post ${idx + 1}`,
      hook: post.hook || "",
      content: post.points || [],
      isThread: (post.points && post.points.length > 1),
      mention: "@aialygn"
    }));

    // Step 4: Prepare reply data
    console.log("\n💬 Step 4: Preparing reply data for browser...");
    const replyQueue = selectedReplies.map((reply, idx) => ({
      id: idx + 1,
      target: CONFIG.PROFILES_TO_FOLLOW[idx] || "unknown",
      content: reply.content || reply,
      mention: "@aialygn"
    }));

    // Step 5: Generate browser automation instructions
    console.log("\n🌐 Step 5: Generating browser automation workflow...");
    const workflow = {
      timestamp: new Date().toISOString(),
      posts: postQueue,
      replies: replyQueue,
      profiles: CONFIG.PROFILES_TO_FOLLOW,
      instructions: [
        "1. Navigate to https://x.com/home",
        "2. For each post in queue: Type hook + expand thread points",
        "3. Add mention 'More at @aialygn' at end of each post",
        "4. Click Post / Reply (Ctrl+Enter)",
        "5. For each reply: Navigate to target profile via /explore",
        "6. Find recent high-engagement tweet from target",
        "7. Reply with generated content + @aialygn mention",
        "8. Follow suggested profiles",
        "9. Log completion and engagement metrics"
      ]
    };

    // Step 6: Save workflow to file for browser script
    console.log("\n💾 Step 6: Saving workflow for browser automation...");
    const workflowFile = path.join(
      CONFIG.OUTPUT_DIR,
      `workflow-${Date.now()}.json`
    );
    fs.writeFileSync(workflowFile, JSON.stringify(workflow, null, 2));
    console.log(`✅ Workflow saved: ${workflowFile}`);

    // Step 7: Output summary
    console.log("\n📊 Execution Summary:");
    console.log(`   Posts to publish: ${selectedPosts.length}`);
    console.log(`   Replies to post: ${selectedReplies.length}`);
    console.log(`   Profiles to follow: ${CONFIG.PROFILES_TO_FOLLOW.length}`);
    console.log(`   Workflow file: ${workflowFile}`);

    // Step 8: Output next steps
    console.log("\n✨ Next Steps:");
    console.log("   1. Browser automation will:");
    console.log("      - Navigate to X.com");
    console.log("      - Post selected threads with @aialygn mention");
    console.log("      - Navigate to /explore and target profiles");
    console.log("      - Post strategic replies");
    console.log("      - Follow suggested profiles");
    console.log("   2. Monitor engagement metrics");
    console.log("   3. Log completion time");

    console.log("\n✅ Automation orchestration complete!");
    console.log(`📍 Workflow ready at: ${workflowFile}`);

    return {
      success: true,
      workflowFile,
      postsCount: selectedPosts.length,
      repliesCount: selectedReplies.length,
      profilesCount: CONFIG.PROFILES_TO_FOLLOW.length
    };
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

/**
 * Helper: Get latest file matching pattern
 */
function getLatestFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter(f => f.includes(pattern))
    .map(f => ({
      name: f,
      path: path.join(dir, f),
      time: fs.statSync(path.join(dir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  return files.length > 0 ? files[0].path : null;
}

/**
 * Helper: Parse markdown post format
 */
function parseMarkdownPosts(content) {
  const posts = [];
  const sections = content.split(/### \d+\./);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const lines = section.split("\n").filter(l => l.trim());

    if (lines.length > 0) {
      const titleMatch = lines[0].match(/\*\*(.*?)\*\*/);
      const hookMatch = section.match(/Hook: "(.*?)"/);
      const points = section
        .split(/\d+\.\s+/)
        .slice(1)
        .map(p => p.trim().split("\n")[0]);

      posts.push({
        title: titleMatch ? titleMatch[1] : lines[0],
        hook: hookMatch ? hookMatch[1] : "",
        points: points.filter(p => p.length > 0)
      });
    }
  }

  return posts;
}

/**
 * Helper: Parse markdown reply format
 */
function parseMarkdownReplies(content) {
  const replies = [];
  const replyMatches = content.match(/\d+\. \*\*To @(\w+).*?\*\*([\s\S]*?)(?=\d+\. \*\*To|---|\Z)/g);

  if (replyMatches) {
    replyMatches.forEach(match => {
      const contentMatch = match.match(/\*\*(.*?)\*\*([\s\S]*?)(?=\n\n|$)/);
      if (contentMatch) {
        const text = contentMatch[2]
          .split("\n")
          .filter(l => l.trim())
          .map(l => l.replace(/^"/, "").replace(/"$/, ""))
          .join(" ")
          .trim();

        replies.push({
          content: text
        });
      }
    });
  }

  return replies;
}

// Run
main().catch(console.error);
