#!/usr/bin/env node

/**
 * Multi-Org Morning Briefing Generator
 * Runs at 8:00 AM to deliver audio summary for ALL organizations via SAG (ElevenLabs TTS)
 * 
 * Organizations:
 * - ALYGN (Intention Alliance)
 * - BitcashOrg
 * - AndlerRL Personal Projects
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'daily-reports');
const AUDIO_DIR = path.join(WORKSPACE, 'daily-reports/audio');

async function generateMorningBriefing() {
  console.log("🌅 Generating Multi-Org Morning Briefing\n");
  
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const audioPath = path.join(AUDIO_DIR, `${today}-briefing.ogg`);
  
  // Ensure audio directory exists
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  
  // Collect reports from all organizations
  const reports = {
    alygn: null,
    bitcash: null,
    andlerrl: null
  };
  
  // Try to read yesterday's reports (generated at 3:30 AM, 3:45 AM, 4:00 AM)
  try {
    reports.alygn = await fs.readFile(path.join(REPORT_DIR, `${yesterday}-summary.txt`), 'utf8');
  } catch {
    console.log("⚠️ No ALYGN report found for yesterday");
  }
  
  try {
    reports.bitcash = await fs.readFile(path.join(REPORT_DIR, `bitcash-${yesterday}.txt`), 'utf8');
  } catch {
    console.log("⚠️ No BitcashOrg report found for yesterday");
  }
  
  try {
    reports.andlerrl = await fs.readFile(path.join(REPORT_DIR, `andlerrl-${yesterday}.txt`), 'utf8');
  } catch {
    console.log("⚠️ No AndlerRL report found for yesterday");
  }
  
  // Build multi-org briefing text
  let briefingText = "Good morning, Andler! Wobblus here with your multi-organization daily briefing!\n\n";
  
  if (reports.alygn) {
    briefingText += "📊 ALYGN - Intention Alliance:\n";
    briefingText += formatReport(reports.alygn) + "\n\n";
  }
  
  if (reports.bitcash) {
    briefingText += "💰 BitcashOrg:\n";
    briefingText += formatReport(reports.bitcash) + "\n\n";
  }
  
  if (reports.andlerrl) {
    briefingText += "🎨 AndlerRL Personal Projects:\n";
    briefingText += formatReport(reports.andlerrl) + "\n\n";
  }
  
  if (!reports.alygn && !reports.bitcash && !reports.andlerrl) {
    briefingText += "No activity reports available yet. This might be the first day of tracking!\n\n";
  }
  
  briefingText += "That's all for today's morning update! Ready to make things happen! Woohoo!";
  
  // Convert to audio using SAG (ElevenLabs TTS with Wobblus gnome voice)
  console.log("🔊 Converting to audio with Wobblus gnome voice...");
  
  // Generate audio using generate-wobblus-voice.sh (Antoni + 20% pitch, fast profile)
  try {
    const tempTextFile = path.join(AUDIO_DIR, `${today}-briefing.txt`);
    await fs.writeFile(tempTextFile, briefingText);
    
    // Use SAG with Wobblus voice settings (read from file with -f flag)
    const sagCmd = `sag -v ErXwobaYiN019PkySvjV --speed 1.35 --stability 0 --style 0.9 --no-speaker-boost -f "${tempTextFile}" -o "${audioPath}.tmp.mp3"`;
    execSync(sagCmd);
    
    // Pitch shift +20% for gnome effect
    const ffmpegCmd = `ffmpeg -i "${audioPath}.tmp.mp3" -af "asetrate=44100*1.2,aresample=44100,atempo=1/1.2" -c:a libopus -b:a 64k "${audioPath}" -y 2>/dev/null`;
    execSync(ffmpegCmd);
    
    // Cleanup
    execSync(`rm "${audioPath}.tmp.mp3" "${tempTextFile}"`);
    
    console.log(`✅ Audio briefing generated: ${audioPath}`);
    
    return { audioPath, briefingText };
    
  } catch (error) {
    console.error("❌ Failed to generate audio:", error.message);
    console.log("ℹ️  Falling back to text-only briefing");
    return { audioPath: null, briefingText };
  }
}

/**
 * Format report for audio briefing (summarize key points)
 */
function formatReport(reportText) {
  // Extract key sections (simple parser for now)
  const lines = reportText.split('\n').filter(line => line.trim());
  
  // Look for key metrics
  const summary = [];
  
  for (const line of lines) {
    // Include lines with numbers or key phrases
    if (
      line.match(/\d+/) || // Has numbers
      line.toLowerCase().includes('commit') ||
      line.toLowerCase().includes('session') ||
      line.toLowerCase().includes('email') ||
      line.toLowerCase().includes('github') ||
      line.toLowerCase().includes('next step')
    ) {
      // Clean up formatting for audio
      const cleaned = line.replace(/[#*_]/g, '').trim();
      if (cleaned) summary.push(cleaned);
    }
  }
  
  // Limit to top 5 points per org
  return summary.slice(0, 5).join('. ') || 'No activity recorded yet';
}

// ===========================
// MAIN EXECUTION
// ===========================
if (require.main === module) {
  generateMorningBriefing()
    .then(({ audioPath, briefingText }) => {
      console.log("\n✅ Morning briefing ready!");
      if (audioPath) {
        console.log("\n🔊 Audio file:", audioPath);
        console.log("\nℹ️  Send via WhatsApp with:");
        console.log(`   openclaw message send --channel whatsapp --to +50662163355 --media "${audioPath}" --caption "Good morning! Here's your multi-org daily briefing 🔧"`);
      } else {
        console.log("\n📝 Text briefing:");
        console.log(briefingText);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error("\n❌ Error generating briefing:", error);
      process.exit(1);
    });
}

module.exports = { generateMorningBriefing };
