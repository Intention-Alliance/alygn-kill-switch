#!/usr/bin/env node
/**
 * X-Scout Browser Integration Test
 * 
 * Tests the browser relay integration with a single known VC account.
 * Run within OpenClaw agent context for full browser tool access.
 * 
 * Usage:
 *   node x-scout-browser-test.js
 * 
 * Expected: Verifies @lightspeedvp and outputs structured result
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test target
const TEST_TARGET = {
  type: "vc",
  name: "Lightspeed Venture Partners",
  assumed_handle: "@lightspeedvp",
  source_file: "test.json"
};

/**
 * Parse profile snapshot for verification data
 */
function parseProfileSnapshot(snapshot, expectedHandle) {
  const result = {
    exists: false,
    handle: `@${expectedHandle}`,
    followers: null,
    following: null,
    verified: false,
    hasRecentTweets: false
  };

  if (!snapshot) {
    console.log("   ⚠️  No snapshot received");
    return result;
  }

  const snapshotText = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);
  const lowerText = snapshotText.toLowerCase();

  // Check for account existence
  const notFoundIndicators = [
    "this account doesn't exist",
    "this account doesnt exist",
    "page not found",
    "something went wrong",
    "suspended",
    "account suspended"
  ];

  const isNotFound = notFoundIndicators.some(indicator => lowerText.includes(indicator));

  if (isNotFound) {
    result.exists = false;
    console.log("   ❌ Account not found or suspended");
    return result;
  }

  // Check for profile indicators
  const profileIndicators = [
    "profile", "follow", "followers", "following",
    "posts", "tweets", "joined", "bio", "location"
  ];

  const hasProfileIndicators = profileIndicators.some(ind => lowerText.includes(ind));

  if (!hasProfileIndicators) {
    console.log("   ⚠️  No profile indicators found in snapshot");
    result.exists = false;
    return result;
  }

  result.exists = true;

  // Extract follower count
  const followerMatch = snapshotText.match(/([\d,.]+[KM]?)\s+followers/i);
  if (followerMatch) {
    result.followers = parseCount(followerMatch[1]);
    console.log(`   📊 Followers: ${result.followers}`);
  }

  // Extract following count
  const followingMatch = snapshotText.match(/([\d,.]+[KM]?)\s+following/i);
  if (followingMatch) {
    result.following = parseCount(followingMatch[1]);
    console.log(`   📊 Following: ${result.following}`);
  }

  // Check for verified badge
  const verifiedIndicators = [
    "verified account", "verified", "blue check", "checkmark"
  ];
  result.verified = verifiedIndicators.some(ind => lowerText.includes(ind));
  if (result.verified) {
    console.log("   ✅ Verified account");
  }

  // Check for recent activity
  const recentActivityIndicators = [
    "min", "hour", "hours", "today", "yesterday",
    "1d", "2d", "3d", "4d", "5d", "6d", "7d"
  ];
  result.hasRecentTweets = recentActivityIndicators.some(ind => {
    const regex = new RegExp(`\\b${ind}\\b`, "i");
    return regex.test(snapshotText);
  });

  if (result.hasRecentTweets) {
    console.log("   📝 Recent activity detected");
  }

  return result;
}

function parseCount(countStr) {
  if (!countStr) return null;
  const clean = countStr.replace(/,/g, "").trim();
  if (clean.endsWith("K")) {
    return parseFloat(clean.slice(0, -1)) * 1000;
  } else if (clean.endsWith("M")) {
    return parseFloat(clean.slice(0, -1)) * 1000000;
  }
  const num = parseInt(clean, 10);
  return isNaN(num) ? null : num;
}

/**
 * Browser tool wrapper with retry logic
 */
async function browserToolCall(params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (typeof browser !== "function") {
        throw new Error(
          "browser() tool not available. " +
          "Run within OpenClaw agent context."
        );
      }
      return await browser(params);
    } catch (error) {
      const isTransient = error.message?.includes("PortInUse") ||
                         error.message?.includes("browser not running") ||
                         error.message?.includes("timeout") ||
                         error.message?.includes("Connection refused");

      if (isTransient && attempt < maxRetries) {
        console.log(`   🔄 Browser retry ${attempt}/${maxRetries}: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Main test
 */
async function main() {
  console.log("🔍 X-Scout Browser Integration Test");
  console.log("=====================================");
  console.log(`Target: ${TEST_TARGET.name} (${TEST_TARGET.assumed_handle})\n`);

  const cleanHandle = TEST_TARGET.assumed_handle.replace("@", "");
  const profileUrl = `https://x.com/${cleanHandle}`;

  let targetId = null;

  try {
    // Step 1: Open browser
    console.log("🌐 PHASE 1: Opening browser window...");
    const openResult = await browserToolCall({
      action: "open",
      profile: "alygn",
      target: "host",
      targetUrl: profileUrl
    });

    if (!openResult?.targetId) {
      throw new Error("Failed to open browser window");
    }

    targetId = openResult.targetId;
    console.log(`✅ Window opened: ${targetId}\n`);

    // Step 2: Wait for load
    console.log("⏳ PHASE 2: Waiting 15s for page load...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Step 3: Navigate
    console.log("📍 PHASE 3: Navigating to profile...");
    await browserToolCall({
      action: "navigate",
      profile: "alygn",
      target: "host",
      targetId: targetId,
      targetUrl: profileUrl,
      loadState: "domcontentloaded",
      timeoutMs: 15000
    });
    console.log("✅ Navigation complete\n");

    // Step 4: Snapshot
    console.log("📸 PHASE 4: Taking snapshot...");
    const snapshot = await browserToolCall({
      action: "snapshot",
      profile: "alygn",
      target: "host",
      targetId: targetId,
      refs: "aria",
      compact: true
    });
    console.log("✅ Snapshot captured\n");

    // Step 5: Parse
    console.log("🔍 PHASE 5: Parsing profile data...");
    const profileData = parseProfileSnapshot(snapshot, cleanHandle);

    // Step 6: Check follow button
    console.log("\n👥 PHASE 6: Checking follow button...");
    const followSnapshot = await browserToolCall({
      action: "snapshot",
      profile: "alygn",
      target: "host",
      targetId: targetId,
      refs: "aria",
      compact: true
    });

    const followText = typeof followSnapshot === "string" ? followSnapshot : JSON.stringify(followSnapshot);
    const lowerFollowText = followText.toLowerCase();
    const alreadyFollowing = lowerFollowText.includes("following") && !lowerFollowText.includes("follow @");
    const canFollow = lowerFollowText.includes("follow") && !alreadyFollowing;

    console.log(`   Can Follow: ${canFollow}`);
    console.log(`   Already Following: ${alreadyFollowing}`);

    // Step 7: Build result
    const result = {
      target: TEST_TARGET,
      verification: {
        status: profileData.exists ? "verified" : "not_found",
        handle: profileData.handle,
        profile_url: profileUrl,
        profile_exists: profileData.exists,
        followers_count: profileData.followers,
        following_count: profileData.following,
        is_verified: profileData.verified,
        recent_activity: profileData.hasRecentTweets,
        can_follow: canFollow,
        can_engage: profileData.hasRecentTweets,
        notes: []
      },
      tested_at: new Date().toISOString()
    };

    if (profileData.exists) {
      result.verification.notes.push("Profile exists and is accessible");
      if (profileData.verified) result.verification.notes.push("Account has verification badge");
      if (profileData.hasRecentTweets) result.verification.notes.push("Recent activity detected");
      if (canFollow) result.verification.notes.push("Follow button available");
      if (alreadyFollowing) result.verification.notes.push("Already following");
    } else {
      result.verification.notes.push("Profile not found");
    }

    // Step 8: Save report
    const reportDir = path.join(__dirname, "reports");
    fs.mkdirSync(reportDir, { recursive: true });
    const reportFile = path.join(reportDir, `x-scout-test-${cleanHandle}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(result, null, 2));

    // Step 9: Output summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST RESULT");
    console.log("=".repeat(50));
    console.log(`Status:        ${result.verification.status}`);
    console.log(`Handle:        ${result.verification.handle}`);
    console.log(`Exists:        ${result.verification.profile_exists}`);
    console.log(`Followers:     ${result.verification.followers_count || "N/A"}`);
    console.log(`Following:     ${result.verification.following_count || "N/A"}`);
    console.log(`Verified:      ${result.verification.is_verified}`);
    console.log(`Recent Activity: ${result.verification.recent_activity}`);
    console.log(`Can Follow:    ${result.verification.can_follow}`);
    console.log(`Can Engage:    ${result.verification.can_engage}`);
    console.log(`Notes:         ${result.verification.notes.join("; ")}`);
    console.log(`Report:        ${reportFile}`);
    console.log("=".repeat(50));

    // Step 10: Close browser
    console.log("\n🧹 PHASE 7: Closing browser...");
    await browserToolCall({
      action: "close",
      profile: "alygn",
      target: "host",
      targetId: targetId
    });
    console.log("✅ Browser closed\n");

    console.log("🎉 TEST COMPLETE");

  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.message);

    // Cleanup
    if (targetId) {
      try {
        await browserToolCall({
          action: "close",
          profile: "alygn",
          target: "host",
          targetId: targetId
        });
      } catch (cleanupError) {
        console.warn("Cleanup failed:", cleanupError.message);
      }
    }

    process.exit(1);
  }
}

main();
