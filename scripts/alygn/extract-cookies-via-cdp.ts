/**
 * Extract Chrome Cookies via Chrome DevTools Protocol (CDP)
 * 
 * This connects to a running Chrome instance (with --remote-debugging-port)
 * and extracts cookies via the Protocol API (no decryption needed!)
 */

import { execSync } from "child_process";

async function extractViaCDP() {
  console.log("🔐 Chrome Cookie Extractor via CDP");
  console.log("=".repeat(50));
  console.log("");

  try {
    // Check if Chrome is running with remote debugging
    console.log("🔍 Checking for Chrome remote debugging port...");
    
    // Try to find Chrome processes with debugging enabled
    let cdpPort = 9222; // Default
    let wsUrl: string | null = null;

    try {
      const curlOutput = await (async () => {
        try {
          return execSync(`curl -s http://127.0.0.1:${cdpPort}/json/version 2>/dev/null || echo ""`, {
            encoding: "utf8",
            timeout: 2000,
          });
        } catch {
          return "";
        }
      })();

      if (curlOutput) {
        const versionData = JSON.parse(curlOutput);
        wsUrl = versionData["webSocketDebuggerUrl"];
        console.log(`✅ Found Chrome on port ${cdpPort}`);
        console.log(`   WS URL: ${wsUrl}`);
      }
    } catch (e) {
      console.log(`⚠️ Chrome not found on port ${cdpPort}`);
      console.log("\n💡 To enable remote debugging, start Chrome with:");
      console.log('   google-chrome --remote-debugging-port=9222 &');
      console.log("");
      console.log("   Or if Chrome is already running:");
      console.log('   google-chrome --profile-directory="alygn" --remote-debugging-port=9222 &');
    }

    if (!wsUrl) {
      console.log("\n❌ Chrome DevTools not available.");
      console.log("\n✅ Fallback: Use browser relay (which is already working):");
      console.log('   browser --profile="alygn" [action]');
      process.exit(0);
    }

    // If we got here, we have CDP access
    // Use CDP to get cookies
    console.log("\n📡 Connecting to Chrome via CDP...");
    
    // Use Puppeteer or simple CDP client
    console.log("⚠️ Full CDP implementation pending");
    console.log("\n💡 Recommendation: Stay with browser relay for now");
    console.log("   It's already working and authenticated!");

  } catch (error) {
    console.error("Error:", (error as Error).message);
  }
}

await extractViaCDP();
