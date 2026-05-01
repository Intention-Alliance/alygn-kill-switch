/**
 * X-Scout Unified - Zero-Trust X Account Verification
 * 
 * Verifies X/Twitter profiles for BOTH VC and Municipal outreach
 * - VCs: Tracks in Notion (existing VC Outreach database)
 * - Municipalities: Tracks in Supabase (existing schema)
 * 
 * Uses browser relay (alygn profile) for live verification
 * Reports saved to workspace/reports/ directory
 * 
 * Usage:
 *   node x-scout-unified.js --scope=vc --batch-size=10
 *   node x-scout-unified.js --scope=municipal --wave=1 --batch-size=10
 *   node x-scout-unified.js --scope=all --batch-size=20
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const REPORTS_DIR = path.join(WORKSPACE_ROOT, "reports", "x-scout");
const VC_DRAFTS_DIR = path.join(__dirname, "vc-outreach", "drafts");
const MUNI_DISCOVERY_DIR = path.join(__dirname, "muni-outreach", "discovery");
const NOTION_CONFIG_PATH = path.join(__dirname, "vc-outreach", "config", "notion-config.json");

// Notion API Terminology:
// - DataSource: The connection/auth configuration
// - Database: The actual data structure within a DataSource
// We track VCs in a Notion Database (within the VC Outreach DataSource)

// Ensure reports directory exists
fs.mkdirSync(REPORTS_DIR, { recursive: true });

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const scopeArg = args.find(a => a.startsWith("--scope="));
  const batchSizeArg = args.find(a => a.startsWith("--batch-size="));
  const waveArg = args.find(a => a.startsWith("--wave="));

  if (!scopeArg) {
    console.error("Usage: node x-scout-unified.js --scope=vc|municipal|all [--batch-size=N] [--wave=N]");
    process.exit(1);
  }

  const scope = scopeArg.split("=")[1];
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1]) : 10;
  const wave = waveArg ? parseInt(waveArg.split("=")[1]) : 1;

  console.log(`🔍 X-Scout Unified - Zero-Trust Verification`);
  console.log(`   Scope: ${scope}`);
  console.log(`   Batch Size: ${batchSize}`);
  console.log(`   Wave: ${wave}`);
  console.log(`   Reports Dir: ${REPORTS_DIR}\n`);

  let targets = [];

  // Load targets based on scope
  if (scope === "vc" || scope === "all") {
    console.log("📊 Loading VC targets from draft files...");
    const vcTargets = loadVCTargets();
    console.log(`   Found ${vcTargets.length} VC firms\n`);
    targets.push(...vcTargets);
  }

  if (scope === "municipal" || scope === "all") {
    console.log("🏛️ Loading Municipal targets from discovery files...");
    const muniTargets = loadMuniTargets(wave);
    console.log(`   Found ${muniTargets.length} municipalities\n`);
    targets.push(...muniTargets);
  }

  // Limit to batch size
  targets = targets.slice(0, batchSize);

  console.log(`🎯 Total targets to verify: ${targets.length}\n`);

  // Use batch verification for multiple targets, single for 1
  let verified = [];

  if (targets.length === 1) {
    // Single target - use individual verification
    const target = targets[0];
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔍 Verifying: ${target.name} (${target.type})`);
    console.log(`${"=".repeat(60)}`);

    const verification = await verifyWithBrowserRelay(target);
    verified.push({
      ...target,
      verification,
      verified_at: new Date().toISOString()
    });
  } else if (targets.length > 1) {
    // Multiple targets - use batch verification
    console.log(`\n📦 Batch mode: verifying ${targets.length} targets simultaneously\n`);
    verified = await batchVerify(targets);
  } else {
    console.log("⚠️  No targets to verify");
    return;
  }

  // Generate reports
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const reportFile = path.join(REPORTS_DIR, `x-scout-${scope}-${timestamp}.json`);
  const markdownReport = path.join(REPORTS_DIR, `x-scout-${scope}-${timestamp}.md`);

  // Save JSON report
  fs.writeFileSync(reportFile, JSON.stringify({
    scope,
    batch_size: batchSize,
    wave,
    verified_at: new Date().toISOString(),
    total: verified.length,
    verified_count: verified.filter(v => v.verification?.status === "verified").length,
    not_found_count: verified.filter(v => v.verification?.status === "not_found").length,
    targets: verified
  }, null, 2));

  console.log(`\n💾 JSON Report: ${reportFile}`);

  // Generate Markdown report
  generateMarkdownReport(verified, markdownReport, scope);
  console.log(`📄 Markdown Report: ${markdownReport}`);

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 VERIFICATION SUMMARY");
  console.log(`${"=".repeat(60)}`);
  console.log(`Total Verified: ${verified.length}`);
  console.log(`✅ Confirmed Exists: ${verified.filter(v => v.verification?.status === "verified").length}`);
  console.log(`❌ Not Found: ${verified.filter(v => v.verification?.status === "not_found").length}`);
  console.log(`⚠️  Errors: ${verified.filter(v => v.verification?.status === "error").length}`);
  console.log(`📍 Ready for Follow: ${verified.filter(v => v.verification?.can_follow).length}`);
  console.log(`${"=".repeat(60)}\n`);
}

/**
 * Load VC targets from draft files
 */
function loadVCTargets() {
  const targets = [];
  const draftFiles = fs.readdirSync(VC_DRAFTS_DIR).filter(f => f.endsWith(".json"));

  for (const file of draftFiles) {
    try {
      const filePath = path.join(VC_DRAFTS_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

      if (data.vc && data.vc.name) {
        targets.push({
          type: "vc",
          name: data.vc.name,
          partner_name: data.vc.partnerName || null,
          email: data.vc.email || null,
          assumed_handle: extractHandleFromEmail(data.vc.email) || null,
          source_file: file,
          notion_database_id: loadNotionConfig().databaseId
        });
      }
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${file}: ${error.message}`);
    }
  }

  return targets;
}

/**
 * Load Municipal targets from discovery files
 */
function loadMuniTargets(wave) {
  const targets = [];
  const discoveryFiles = fs.readdirSync(MUNI_DISCOVERY_DIR).filter(f => f.endsWith(".json"));

  for (const file of discoveryFiles) {
    try {
      const filePath = path.join(MUNI_DISCOVERY_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

      if (data.municipalities && Array.isArray(data.municipalities)) {
        for (const muni of data.municipalities) {
          targets.push({
            type: "municipal",
            name: muni.name,
            province: muni.province || null,
            mayor_name: muni.mayor_name || null,
            email: muni.general_email || muni.mayor_email || null,
            assumed_handle: muni.x_handle || null,
            source_file: file,
            wave
          });
        }
      }
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${file}: ${error.message}`);
    }
  }

  return targets;
}

/**
 * Load Notion config
 */
function loadNotionConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(NOTION_CONFIG_PATH, "utf8"));
    return config;
  } catch (error) {
    console.warn("⚠️  Could not load Notion config, using default");
    return {
      databaseId: "30b33487-4af6-8106-8cba-d304fdd0b600"
    };
  }
}

/**
 * Extract X handle from email (heuristic)
 */
function extractHandleFromEmail(email) {
  if (!email) return null;
  const match = email.match(/@([^.]+)/);
  if (match) {
    return `@${match[1]}`;
  }
  return null;
}

/**
 * Verify target using browser relay (alygn profile)
 *
 * Browser Relay Pattern:
 * 1. Open all profile windows, save targetIds
 * 2. Wait 10-20 seconds for page load
 * 3. Iterate through each window, verify account exists
 * 4. Return to each window, verify follow action possible
 * 5. Retry failed windows
 */
async function verifyWithBrowserRelay(target) {
  const result = {
    status: "unknown",
    handle: null,
    profile_url: null,
    profile_exists: false,
    followers_count: null,
    following_count: null,
    is_verified: false,
    recent_activity: false,
    can_follow: false,
    can_engage: false,
    notes: [],
    browser_session: null
  };

  const assumedHandle = target.assumed_handle;

  if (!assumedHandle) {
    result.status = "not_found";
    result.notes.push("No assumed handle provided");
    result.can_engage = false;
    return result;
  }

  // Clean handle (remove @ if present)
  const cleanHandle = assumedHandle.replace("@", "");
  const profileUrl = `https://x.com/${cleanHandle}`;
  result.profile_url = profileUrl;

  console.log(`   🌐 Opening browser relay for: ${profileUrl}`);

  try {
    // Step 1: Open browser window using actual browser tool
    const openResult = await browserToolCall({
      action: "open",
      profile: "alygn",
      target: "host",
      targetUrl: profileUrl
    });

    if (!openResult || !openResult.targetId) {
      throw new Error("Failed to open browser window");
    }

    result.browser_session = {
      targetId: openResult.targetId,
      opened_at: new Date().toISOString()
    };

    console.log(`   ✅ Window opened: ${openResult.targetId}`);

    // Step 2: Wait 15 seconds for page load
    console.log(`   ⏳ Waiting 15 seconds for page load...`);
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Step 3: Navigate and snapshot to verify profile exists
    await browserToolCall({
      action: "navigate",
      profile: "alygn",
      target: "host",
      targetId: openResult.targetId,
      targetUrl: profileUrl,
      loadState: "domcontentloaded",
      timeoutMs: 15000
    });

    console.log(`   📍 Navigated to profile`);

    // Step 4: Take snapshot to extract profile info
    const snapshotResult = await browserToolCall({
      action: "snapshot",
      profile: "alygn",
      target: "host",
      targetId: openResult.targetId,
      refs: "aria",
      compact: true
    });

    // Step 5: Parse snapshot for profile verification
    const profileData = parseProfileSnapshot(snapshotResult, cleanHandle);

    result.handle = profileData.handle;
    result.followers_count = profileData.followers;
    result.following_count = profileData.following;
    result.is_verified = profileData.verified;
    result.recent_activity = profileData.hasRecentTweets;
    result.profile_exists = profileData.exists;

    if (result.profile_exists) {
      result.status = "verified";
      result.notes.push("Profile exists and is accessible");

      if (result.is_verified) {
        result.notes.push("Account has verification badge");
      }

      if (result.recent_activity) {
        result.notes.push("Recent activity detected");
        result.can_engage = true;
      }

      // Step 6: Check if follow button is present
      const followCheck = await checkFollowButton(openResult.targetId);
      result.can_follow = followCheck.canFollow;

      if (result.can_follow) {
        result.notes.push("Follow button is available");
      } else if (followCheck.alreadyFollowing) {
        result.notes.push("Already following this account");
        result.can_follow = false;
      }

    } else {
      result.status = "not_found";
      result.notes.push("Profile page returned error or does not exist");
    }

    // Step 7: Close browser window
    await browserToolCall({
      action: "close",
      profile: "alygn",
      target: "host",
      targetId: openResult.targetId
    });

    console.log(`   ✅ Verification complete: ${result.status}`);

  } catch (error) {
    console.error(`   ❌ Error verifying ${target.name}:`, error.message);
    result.status = "error";
    result.notes.push(`Verification error: ${error.message}`);

    // Cleanup: try to close any open windows
    try {
      if (result.browser_session?.targetId) {
        await browserToolCall({
          action: "close",
          profile: "alygn",
          target: "host",
          targetId: result.browser_session.targetId
        });
      }
    } catch (cleanupError) {
      console.warn(`   ⚠️  Cleanup failed: ${cleanupError.message}`);
    }
  }

  return result;
}

/**
 * Parse profile snapshot for verification data
 *
 * Extracts from aria snapshot:
 * - Profile existence (checks for "This account doesn't exist" or error states)
 * - Follower count (from text containing "followers")
 * - Following count (from text containing "following")
 * - Verified badge (checks for verified indicator in aria labels)
 * - Recent activity (checks for tweet timestamps or "joined" date)
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

  // Convert snapshot to string for analysis
  const snapshotText = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);
  const lowerText = snapshotText.toLowerCase();

  // Check for account existence - look for error indicators
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

  // Check for profile existence indicators
  const profileIndicators = [
    "profile",
    "follow",
    "followers",
    "following",
    "posts",
    "tweets",
    "joined",
    "bio",
    "location"
  ];

  const hasProfileIndicators = profileIndicators.some(ind => lowerText.includes(ind));

  if (!hasProfileIndicators) {
    // Might be a loading state or different page type
    console.log("   ⚠️  No profile indicators found in snapshot");
    result.exists = false;
    return result;
  }

  result.exists = true;

  // Extract follower count
  // Look for patterns like "1,234 followers" or "1.2M followers"
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
  // X uses various indicators for verified accounts
  const verifiedIndicators = [
    "verified account",
    "verified",
    "blue check",
    "checkmark"
  ];
  result.verified = verifiedIndicators.some(ind => lowerText.includes(ind));
  if (result.verified) {
    console.log("   ✅ Verified account");
  }

  // Check for recent activity
  // Look for time indicators in tweets/posts
  const recentActivityIndicators = [
    "min",
    "hour",
    "hours",
    "today",
    "yesterday",
    "1d",
    "2d",
    "3d",
    "4d",
    "5d",
    "6d",
    "7d"
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

/**
 * Parse count string to number
 * Handles formats like "1.2K", "1.5M", "1,234"
 */
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
 * Check if follow button is present
 *
 * Uses browser snapshot to detect follow button state:
 * - "Follow" button present → canFollow: true
 * - "Following" button present → alreadyFollowing: true
 * - Neither → canFollow: false
 */
async function checkFollowButton(targetId) {
  try {
    const snapshot = await browserToolCall({
      action: "snapshot",
      profile: "alygn",
      target: "host",
      targetId: targetId,
      refs: "aria",
      compact: true
    });

    const snapshotText = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);
    const lowerText = snapshotText.toLowerCase();

    // Check for "Following" button (already following)
    const alreadyFollowing = lowerText.includes("following") &&
      !lowerText.includes("follow @");

    // Check for "Follow" button (not following yet)
    const canFollow = lowerText.includes("follow") && !alreadyFollowing;

    if (alreadyFollowing) {
      console.log("   👥 Already following this account");
    } else if (canFollow) {
      console.log("   ➕ Follow button available");
    } else {
      console.log("   ❓ Follow button state unclear");
    }

    return {
      canFollow,
      alreadyFollowing
    };
  } catch (error) {
    console.warn(`   ⚠️  Follow check failed: ${error.message}`);
    return {
      canFollow: false,
      alreadyFollowing: false
    };
  }
}

/**
 * Batch verify multiple targets using browser relay
 *
 * Pattern:
 * 1. Open all windows for targets
 * 2. Wait 10-20 seconds
 * 3. Iterate through each window for verification
 * 4. Retry failed windows
 */
async function batchVerify(targets) {
  const windows = [];

  console.log(`\n📂 PHASE 1: Opening ${targets.length} browser windows...`);

  // Step 1: Open all windows
  for (const target of targets) {
    try {
      const cleanHandle = target.assumed_handle?.replace("@", "");
      if (!cleanHandle) {
        console.log(`   ⚠️  Skipping ${target.name} - no handle`);
        continue;
      }

      const profileUrl = `https://x.com/${cleanHandle}`;
      console.log(`   🌐 Opening: ${profileUrl}`);

      const openResult = await browserToolCall({
        action: "open",
        profile: "alygn",
        target: "host",
        targetUrl: profileUrl
      });

      if (openResult && openResult.targetId) {
        windows.push({
          target,
          targetId: openResult.targetId,
          profileUrl,
          cleanHandle,
          openedAt: Date.now()
        });
        console.log(`   ✅ Window opened: ${openResult.targetId}`);
      } else {
        console.warn(`   ⚠️  Failed to open window for ${target.name}`);
      }
    } catch (error) {
      console.error(`   ❌ Error opening window for ${target.name}:`, error.message);
    }
  }

  if (windows.length === 0) {
    console.log("❌ No windows opened successfully");
    return [];
  }

  // Step 2: Wait for pages to load
  console.log(`\n⏳ PHASE 2: Waiting 15 seconds for ${windows.length} pages to load...`);
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Step 3: Iterate through windows for verification
  console.log(`\n🔍 PHASE 3: Verifying ${windows.length} profiles...`);

  for (const win of windows) {
    try {
      console.log(`\n   🔎 Verifying: ${win.target.name}`);

      // Navigate to ensure page is loaded
      await browserToolCall({
        action: "navigate",
        profile: "alygn",
        target: "host",
        targetId: win.targetId,
        targetUrl: win.profileUrl,
        loadState: "domcontentloaded",
        timeoutMs: 15000
      });

      // Take snapshot
      const snapshot = await browserToolCall({
        action: "snapshot",
        profile: "alygn",
        target: "host",
        targetId: win.targetId,
        refs: "aria",
        compact: true
      });

      // Parse profile data
      const profileData = parseProfileSnapshot(snapshot, win.cleanHandle);
      win.verification = profileData;

      if (profileData.exists) {
        console.log(`   ✅ Profile exists: ${win.cleanHandle}`);
      } else {
        console.log(`   ❌ Profile not found: ${win.cleanHandle}`);
      }
    } catch (error) {
      console.error(`   ❌ Error verifying ${win.target.name}:`, error.message);
      win.verification = { exists: false, error: error.message };
    }
  }

  // Step 4: Check follow buttons for verified profiles
  console.log(`\n👥 PHASE 4: Checking follow buttons...`);

  for (const win of windows) {
    if (win.verification?.exists) {
      try {
        const followCheck = await checkFollowButton(win.targetId);
        win.canFollow = followCheck.canFollow;
        win.alreadyFollowing = followCheck.alreadyFollowing;
      } catch (error) {
        console.warn(`   ⚠️  Follow check failed for ${win.target.name}`);
        win.canFollow = false;
      }
    }
  }

  // Step 5: Retry failed windows
  console.log(`\n🔄 PHASE 5: Retrying failed verifications...`);

  const failedWindows = windows.filter(w => !w.verification?.exists && !w.verification?.error);

  for (const win of failedWindows) {
    console.log(`   🔄 Retrying: ${win.target.name}`);
    try {
      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Refresh page
      await browserToolCall({
        action: "navigate",
        profile: "alygn",
        target: "host",
        targetId: win.targetId,
        targetUrl: win.profileUrl,
        loadState: "networkidle",
        timeoutMs: 20000
      });

      // Take new snapshot
      const snapshot = await browserToolCall({
        action: "snapshot",
        profile: "alygn",
        target: "host",
        targetId: win.targetId,
        refs: "aria",
        compact: true
      });

      const profileData = parseProfileSnapshot(snapshot, win.cleanHandle);
      win.verification = profileData;

      if (profileData.exists) {
        console.log(`   ✅ Retry successful: ${win.cleanHandle}`);
        const followCheck = await checkFollowButton(win.targetId);
        win.canFollow = followCheck.canFollow;
        win.alreadyFollowing = followCheck.alreadyFollowing;
      } else {
        console.log(`   ❌ Retry failed: ${win.cleanHandle}`);
      }
    } catch (error) {
      console.error(`   ❌ Retry error for ${win.target.name}:`, error.message);
    }
  }

  // Close all windows
  console.log(`\n🧹 PHASE 6: Closing ${windows.length} browser windows...`);

  for (const win of windows) {
    try {
      await browserToolCall({
        action: "close",
        profile: "alygn",
        target: "host",
        targetId: win.targetId
      });
    } catch (error) {
      console.warn(`   ⚠️  Failed to close window ${win.targetId}`);
    }
  }

  // Build results
  return windows.map(win => ({
    ...win.target,
    verification: {
      status: win.verification?.exists ? "verified" : win.verification?.error ? "error" : "not_found",
      handle: win.verification?.handle || `@${win.cleanHandle}`,
      profile_url: win.profileUrl,
      profile_exists: win.verification?.exists || false,
      followers_count: win.verification?.followers || null,
      following_count: win.verification?.following || null,
      is_verified: win.verification?.verified || false,
      recent_activity: win.verification?.hasRecentTweets || false,
      can_follow: win.canFollow || false,
      can_engage: win.verification?.hasRecentTweets || false,
      notes: buildNotes(win),
      browser_session: {
        targetId: win.targetId,
        opened_at: new Date(win.openedAt).toISOString()
      }
    },
    verified_at: new Date().toISOString()
  }));
}

/**
 * Build human-readable notes from verification result
 */
function buildNotes(win) {
  const notes = [];

  if (win.verification?.exists) {
    notes.push("Profile exists and is accessible");

    if (win.verification?.verified) {
      notes.push("Account has verification badge");
    }

    if (win.verification?.hasRecentTweets) {
      notes.push("Recent activity detected");
    }

    if (win.canFollow) {
      notes.push("Follow button is available");
    } else if (win.alreadyFollowing) {
      notes.push("Already following this account");
    }
  } else {
    notes.push("Profile page returned error or does not exist");
  }

  if (win.verification?.error) {
    notes.push(`Error: ${win.verification.error}`);
  }

  return notes;
}

/**
 * Browser tool wrapper with retry logic for transient errors
 * Handles PortInUseError and other transient browser relay issues
 */
async function browserToolCall(params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // The browser() function is provided by the OpenClaw runtime
      // when the script is executed within an OpenClaw agent context
      if (typeof browser !== "function") {
        throw new Error(
          "browser() tool not available. " +
          "This script must be executed within an OpenClaw agent context " +
          "(e.g., via 'openclaw exec' or as an agent task)."
        );
      }

      return await browser(params);
    } catch (error) {
      const isTransient = error.message?.includes("PortInUse") ||
                         error.message?.includes("browser not running") ||
                         error.message?.includes("timeout") ||
                         error.message?.includes("Connection refused");

      if (isTransient && attempt < maxRetries) {
        console.log(`   🔄 Browser tool retry ${attempt}/${maxRetries} after error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        continue;
      }

      throw error;
    }
  }
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(verified, outputFile, scope) {
  let report = `# X-Scout Zero-Trust Verification Report\n\n`;
  report += `**Scope:** ${scope}\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;

  report += `## Summary\n\n`;
  report += `| Metric | Count |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Verified | ${verified.length} |\n`;
  report += `| ✅ Confirmed | ${verified.filter(v => v.verification?.status === "verified").length} |\n`;
  report += `| ❌ Not Found | ${verified.filter(v => v.verification?.status === "not_found").length} |\n`;
  report += `| ⚠️  Errors | ${verified.filter(v => v.verification?.status === "error").length} |\n`;
  report += `| 📍 Ready for Follow | ${verified.filter(v => v.verification?.can_follow).length} |\n\n`;

  report += `## Detailed Results\n\n`;

  // Group by type
  const vcs = verified.filter(v => v.type === "vc");
  const munis = verified.filter(v => v.type === "municipal");

  if (vcs.length > 0) {
    report += `### Venture Capital Firms\n\n`;
    report += `| Firm | Partner | Handle | Status | Can Follow |\n`;
    report += `|------|---------|--------|--------|------------|\n`;

    vcs.forEach(v => {
      const status = v.verification?.status === "verified" ? "✅" : v.verification?.status === "error" ? "⚠️" : "❌";
      const canFollow = v.verification?.can_follow ? "Yes" : "No";
      report += `| ${v.name} | ${v.partner_name || "-"} | ${v.verification?.handle || "-"} | ${status} | ${canFollow} |\n`;
    });

    report += `\n`;
  }

  if (munis.length > 0) {
    report += `### Municipalities\n\n`;
    report += `| Municipality | Province | Mayor | Handle | Status | Can Follow |\n`;
    report += `|--------------|----------|-------|--------|--------|------------|\n`;

    munis.forEach(v => {
      const status = v.verification?.status === "verified" ? "✅" : v.verification?.status === "error" ? "⚠️" : "❌";
      const canFollow = v.verification?.can_follow ? "Yes" : "No";
      report += `| ${v.name} | ${v.province || "-"} | ${v.mayor_name || "-"} | ${v.verification?.handle || "-"} | ${status} | ${canFollow} |\n`;
    });

    report += `\n`;
  }

  report += `## Next Actions\n\n`;
  report += `1. **Manual Follow**: Use browser relay (alygn profile) to follow verified accounts\n`;
  report += `2. **Track in Notion DataSource**: Update VC Outreach DataSource (Database ID: ${vcs[0]?.notion_database_id || '30b33487-4af6-8106-8cba-d304fdd0b600'}) with verified handles\n`;
  report += `3. **Track in Supabase**: Update municipalities table with verified handles\n`;
  report += `4. **X Warmup**: Begin Phase 1 (follow + like) for verified accounts\n\n`;

  report += `---\n`;
  report += `*Report generated by X-Scout Unified v1.0*\n`;

  fs.writeFileSync(outputFile, report);
}

// Run main
main().catch(error => {
  console.error("❌ Fatal error:", error.message);
  process.exit(1);
});
