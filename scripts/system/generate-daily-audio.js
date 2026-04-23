/**
 * Generate Audio for Daily Reports
 * Uses local Piper TTS (no API calls, no rate limits)
 * 
 * Runs after daily reports are generated (8:15 AM)
 * Creates audio versions of:
 * - ALYGN daily report
 * - BitcashOrg daily report
 * - Personal daily report
 * - Multi-org summary
 */

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const REPORTS_DIR = path.join(WORKSPACE, 'daily-reports');
const AUDIO_DIR = path.join(REPORTS_DIR, 'audio');
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_TTS = path.join(__dirname, 'local-tts.sh');

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

async function generateAudio(reportFile, outputName, profile = 'fast') {
  // Try today's report first, then yesterday's
  let inputPath = path.join(REPORTS_DIR, reportFile.replace('YYYY-MM-DD', today));
  
  try {
    await fs.access(inputPath);
  } catch {
    // Try yesterday's report
    inputPath = path.join(REPORTS_DIR, reportFile.replace('YYYY-MM-DD', yesterday));
    try {
      await fs.access(inputPath);
    } catch {
      console.log(`⚠️  Report not found: ${reportFile}`);
      return false;
    }
  }

  const outputPath = path.join(AUDIO_DIR, outputName.replace('YYYY-MM-DD', today) + '.ogg');

  console.log(`🎙️  Generating audio for ${path.basename(inputPath)}...`);

  try {
    // Read report text
    const reportText = await fs.readFile(inputPath, 'utf8');
    
    // Clean markdown formatting for better TTS
    const cleanText = reportText
      .replace(/[#*_`]/g, '')  // Remove markdown symbols
      .replace(/\n{3,}/g, '\n\n')  // Normalize line breaks
      .trim();
    
    // Generate audio with local TTS
    execSync(`"${LOCAL_TTS}" "${cleanText}" "${outputPath}" "${profile}"`, {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    console.log(`✅ Audio generated: ${path.basename(outputPath)}`);
    return true;
  } catch (error) {
    console.error(`❌ Error generating audio: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`📊 Generating daily report audio - ${today}\n`);

  // Ensure audio directory exists
  await fs.mkdir(AUDIO_DIR, { recursive: true });

  // Generate audio for each report
  const results = await Promise.all([
    generateAudio('YYYY-MM-DD-summary.txt', 'alygn-daily-YYYY-MM-DD', 'fast'),
    generateAudio('bitcash-YYYY-MM-DD.txt', 'bitcash-daily-YYYY-MM-DD', 'fast'),
    generateAudio('andlerrl-YYYY-MM-DD.txt', 'personal-daily-YYYY-MM-DD', 'fast'),
    // Multi-org summary gets balanced quality (slightly better)
    generateAudio('multi-org-YYYY-MM-DD.txt', 'multi-org-summary-YYYY-MM-DD', 'balanced')
  ]);

  const successCount = results.filter(Boolean).length;
  console.log(`\n✅ Generated ${successCount}/${results.length} audio reports!`);
  
  if (successCount === 0) {
    console.log('\n⚠️  No audio generated. Check if daily reports exist.');
    console.log('   Daily reports should be generated at 3:30 AM, 3:45 AM, 4:00 AM');
  }
}

// Execute
main().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
