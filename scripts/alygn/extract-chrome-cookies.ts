/**
 * Chrome Cookie Extractor for X.com (Twitter)
 * Uses Bun's built-in sqlite + crypto to extract Chrome cookies
 * 
 * Purpose: Extract auth_token & ct0 from Chrome's encrypted Cookies database
 * for use with Bird CLI or direct X API requests
 */

import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";

const CHROME_PROFILE = path.join(process.env.HOME!, ".config/google-chrome/Default");
const COOKIES_DB = path.join(CHROME_PROFILE, "Cookies");
const COOKIE_OUTPUT = "/tmp/x_cookies.json";

async function extractCookies() {
  console.log("🔐 Chrome Cookie Extractor for X.com");
  console.log("=".repeat(50));
  console.log("");

  // Check if DB exists
  if (!fs.existsSync(COOKIES_DB)) {
    console.error("❌ Chrome Cookies database not found at:", COOKIES_DB);
    process.exit(1);
  }

  try {
    // Open DB in read-only mode
    console.log("📂 Opening Chrome Cookies database...");
    const db = new Database(COOKIES_DB, { readonly: true });

    // Query X.com cookies
    console.log("🔍 Searching for X.com cookies...");
    const cookies: Record<string, string> = {};
    let found = 0;

    // Try to get auth tokens
    const query = db.query(`
      SELECT name, value, encrypted_value, host_key
      FROM cookies
      WHERE (host_key = '.x.com' OR host_key = 'x.com' OR host_key = '.twitter.com')
      AND name IN ('auth_token', 'ct0', 'guest_id', 'personalization_id')
      ORDER BY name
    `);

    for (const row of query.all() as any[]) {
      const { name, value, encrypted_value, host_key } = row;

      console.log(`\n📌 ${name} (host: ${host_key})`);

      // Try plain value first
      if (value && typeof value === "string" && value.length > 0) {
        cookies[name] = value;
        console.log(`   ✅ Plain text value found`);
        console.log(`   Length: ${value.length} chars`);
        found++;
      }
      // If encrypted, note it
      else if (encrypted_value && (encrypted_value as any).length > 0) {
        console.log(`   ⚠️ Value is encrypted (${(encrypted_value as any).length} bytes)`);
        console.log(`   (Linux DPAPI decryption requires system keyring access)`);
      } else {
        console.log(`   ❌ No value or encrypted data`);
      }
    }

    db.close();

    console.log("\n" + "=".repeat(50));
    console.log(`\n📊 Results: ${found}/4 critical cookies extracted\n`);

    if (found > 0) {
      // Save to file
      fs.writeFileSync(COOKIE_OUTPUT, JSON.stringify(cookies, null, 2));
      console.log(`✅ Cookies saved to: ${COOKIE_OUTPUT}`);
      
      if (cookies.auth_token && cookies.ct0) {
        console.log("\n🐦 Ready for Bird CLI:");
        console.log(`   bird --auth-token "${cookies.auth_token.substring(0, 10)}..." --ct0 "${cookies.ct0.substring(0, 10)}..." reply [tweet-id] "[text]"`);
      }
    } else {
      console.log("❌ No plain-text cookies extracted. They appear to be encrypted.");
      console.log("\n💡 Solutions:");
      console.log("   1. Use browser relay with profile flag (currently working):");
      console.log('      browser --profile="alygn" [action]');
      console.log("");
      console.log("   2. Try extracting via Chrome DevTools Protocol (CDP):");
      console.log("      chrome --remote-debugging-port=9222");
      console.log("");
      console.log("   3. Run Chrome in --password-store=basic mode (disables encryption)");
    }
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);

    if ((error as any).message?.includes("locked")) {
      console.error("\n⚠️ Chrome database is locked (Chrome may be running).");
      console.error("   Solution: Close Chrome first, or use --profile=alygn browser relay.");
    }

    process.exit(1);
  }
}

// Run
await extractCookies();
