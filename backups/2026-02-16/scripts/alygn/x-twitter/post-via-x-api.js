#!/usr/bin/env node
import { Client, OAuth1 } from "@xdevplatform/xdk";
import fs from "fs";
import path from "path";

// Load credentials from config
const credentialsPath = path.join(process.env.HOME, ".openclaw/workspace/config/credentials.json");
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

const CONFIG = {
  WORKFLOW_FILE: path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs/workflows/workflow-1770653500000.json"),
  OAUTH: {
    apiKey: credentials.twitter.consumerKey,
    apiSecret: credentials.twitter.consumerSecret,
    accessToken: credentials.twitter.accessToken,
    accessTokenSecret: credentials.twitter.accessTokenSecret
  }
};

// Load workflow
console.log("📋 Loading workflow...");
const workflow = JSON.parse(fs.readFileSync(CONFIG.WORKFLOW_FILE, "utf8"));

// Setup X API client
const oauth1 = new OAuth1(CONFIG.OAUTH);
const client = new Client({ oauth1 });

// Main execution
async function main() {
  console.log("🐦 X API Poster with Threading & Media - ALYGN");
  console.log("=".repeat(60));
  console.log("");

  const results = {
    posted: 0,
    failed: 0,
    threadIds: []
  };

  // Process each post
  for (let i = 0; i < workflow.posts.length; i++) {
    const post = workflow.posts[i];
    try {
      console.log(`\n[${i + 1}/${workflow.posts.length}] ${post.hook}`);
      console.log(`    Type: ${post.type}`);
      console.log(`    Is thread: ${post.isThread ? "Yes" : "No"}`);

      let threadId;

      if (post.isThread && post.threadPoints) {
        // Post as thread
        threadId = await postThread(post);
        console.log(`    ✅ Thread complete (ID: ${threadId})`);
      } else {
        // Post as single tweet
        threadId = await postToX(post.readyText, post.imagePath);
        console.log(`    ✅ Posted (ID: ${threadId})`);
      }

      results.posted++;
      results.threadIds.push({ index: i + 1, id: threadId, text: post.hook });

      // Wait between posts to respect rate limits
      if (i < workflow.posts.length - 1) {
        const waitTime = 15000; // 15 seconds between posts
        console.log(`    ⏳ Waiting ${waitTime / 1000}s before next post...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      console.log(`    ❌ Failed: ${error.message}`);
      results.failed++;
    }
  }

  // Summary
  console.log("\n\n✅ EXECUTION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Posts/Threads published: ${results.posted}/${workflow.posts.length}`);
  console.log(`Posts failed: ${results.failed}/${workflow.posts.length}`);

  if (results.posted > 0) {
    console.log("\n📊 Published thread IDs:");
    results.threadIds.forEach(t => {
      console.log(`   [${t.index}] ${t.text}: ${t.id}`);
    });
  }

  if (results.failed === 0 && results.posted > 0) {
    console.log("\n🎉 ALL POSTS PUBLISHED SUCCESSFULLY!");
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

// Helper: Post thread (first tweet + replies)
async function postThread(post) {
  try {
    // Post first tweet (hook)
    console.log(`    📝 Posting hook...`);
    const hookPost = await postToX(post.hookText, post.imagePath);
    const threadId = hookPost.id;
    console.log(`    ✅ Hook posted (ID: ${threadId})`);

    // Post each thread point as reply
    if (post.threadPoints && post.threadPoints.length > 0) {
      for (let i = 0; i < post.threadPoints.length; i++) {
        const point = post.threadPoints[i];
        const pointNum = i + 2; // 2/4, 3/4, 4/4
        const totalPoints = post.threadPoints.length + 1;

        const pointText = `${pointNum}/${totalPoints} ${point}`;

        console.log(`    📝 Posting point ${pointNum}/${totalPoints}...`);
        await postToX(pointText, post.imagePath, threadId);

        // Small delay between thread points to avoid rate limits
        if (i < post.threadPoints.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    return threadId;
  } catch (error) {
    throw error;
  }
}


// Helper: Post tweet with optional media and thread support
async function postToX(text, imagePath = null, replyToId = null) {
  try {
    const postData = { text };

    // Add media if provided
    if (imagePath) {
      const mediaId = await uploadMedia(imagePath);
      if (mediaId) {
        postData.media = { mediaIds: [mediaId] };
      }
    }

    // Add reply structure for threading
    if (replyToId) {
      postData.reply = { in_reply_to_tweet_id: replyToId };
    }

    const response = await client.posts.create(postData);

    if (response.data?.id) {
      return { success: true, id: response.data.id, text: text.substring(0, 50) };
    } else {
      throw new Error(`No tweet ID in response: ${JSON.stringify(response)}`);
    }
  } catch (error) {
    throw new Error(`Post failed: ${error.message}`);
  }
}

// Helper: Upload media to X (image file)
async function uploadMedia(imagePath) {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) {
      console.log(`    ⚠️ Image not found: ${imagePath}`);
      return null;
    }
    // Use SDK's v1.1 upload endpoint
    const mediaId = await client.media.uploadImage(imagePath); // Returns media_id_string
    return mediaId;
  } catch (error) {
    console.log(`    ⚠️ Media upload failed: ${error.message}`);
    return null;
  }
}
