#!/usr/bin/env node
/**
 * deliver-briefing.js - Morning Briefing Delivery
 *
 * Finds today's briefing text and audio, outputs delivery manifest.
 */

import fs from "fs";
import path from "path";

const WORKSPACE = process.env.HOME + "/.openclaw/workspace";
const REPORTS_DIR = path.join(WORKSPACE, "daily-reports");
const AUDIO_DIR = path.join(REPORTS_DIR, "audio");

const today = new Date().toISOString().split("T")[0];

function deliverBriefing() {
  // 1. Find today's briefing text
  const reportFiles = fs.readdirSync(REPORTS_DIR).filter(f => f.includes(today) && (f.endsWith(".txt") || f.endsWith(".md")));
  
  if (reportFiles.length === 0) {
    console.error("❌ No briefing text found for", today);
    process.exit(1);
  }

  const briefingPath = path.join(REPORTS_DIR, reportFiles[0]);
  const briefingText = fs.readFileSync(briefingPath, "utf-8");

  console.log(`✅ Found briefing text: ${reportFiles[0]}`);

  // 2. Check for audio file
  let audioPath = null;
  if (fs.existsSync(AUDIO_DIR)) {
    const audioFiles = fs.readdirSync(AUDIO_DIR).filter(f => f.includes(today));
    if (audioFiles.length > 0) {
      audioPath = path.join(AUDIO_DIR, audioFiles[0]);
      console.log(`✅ Found audio: ${audioFiles[0]}`);
    }
  }

  if (!audioPath) {
    console.log("⚠️  No audio file found — text-only delivery");
  }

  // 3. Output manifest
  const manifest = {
    date: today,
    textFile: briefingPath,
    audioFile: audioPath,
    textOnly: !audioPath,
    deliveredAt: new Date().toISOString(),
  };

  const manifestPath = path.join(REPORTS_DIR, `delivery-manifest-${today}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n📦 DELIVERY MANIFEST:");
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved: ${manifestPath}`);
}

deliverBriefing();
