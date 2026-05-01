#!/usr/bin/env node
/**
 * ALYGN Daily Signal Brief — Audio Generation Module
 *
 * Reads synthesized report JSON from stdin, generates audio using
 * the Wobblus voice pipeline (Piper TTS, balanced profile).
 * 
 * Updated for longer audio content (up to 2:45min, ~400 words).
 *
 * Usage: node synthesize-report.js | node generate-audio.js [--output /path/to/output.ogg]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// ─── Config ─────────────────────────────────────────────────────────────────
const VOICE_SCRIPT = path.join(__dirname, '..', '..', 'system', 'generate-wobblus-voice.sh');
const DEFAULT_PROFILE = 'balanced';
const MAX_WORDS = 400; // Target: up to 2:45min at ~2.5 words/sec (increased from 180)
const TIMEOUT_MS = 120000; // 2 minutes timeout (increased from 60000)

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => (input += line + '\n'));
    rl.on('close', () => {
      try { resolve(JSON.parse(input)); }
      catch (e) { reject(new Error(`Invalid JSON input: ${e.message}`)); }
    });
  });
}

function truncateToMaxWords(text, maxWords = MAX_WORDS) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  // Truncate and add closing
  const truncated = words.slice(0, maxWords - 3).join(' ');
  // Find last sentence boundary
  const lastPeriod = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'));
  if (lastPeriod > truncated.length * 0.7) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated + '... That\'s your brief!';
}

async function main() {
  const report = await readStdin();
  const audioScript = report.audioScript;

  if (!audioScript) {
    console.error('❌ No audioScript found in report');
    process.exit(1);
  }

  // Truncate script to target word count
  const script = truncateToMaxWords(audioScript);
  const wordCount = script.split(/\s+/).length;
  console.error(`📝 Audio script: ${wordCount} words (target: ${MAX_WORDS} max, ~${Math.ceil(wordCount / 2.5 / 60)}:${(wordCount / 2.5 % 60).toFixed(0).padStart(2, '0')}min)`);

  // Determine output path
  const outputArg = process.argv.find(a => a.startsWith('--output'));
  let outputPath;
  if (outputArg) {
    outputPath = outputArg.includes('=') ? outputArg.split('=')[1] : process.argv[process.argv.indexOf(outputArg) + 1];
  } else {
    const date = report.date || new Date().toISOString().split('T')[0];
    outputPath = `/tmp/alygn-daily-brief-${date}.ogg`;
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate audio using Wobblus voice script
  console.error(`🎙️  Generating audio with profile: ${DEFAULT_PROFILE}`);
  console.error(`   Script: "${script.slice(0, 80)}..."`);
  console.error(`   Output: ${outputPath}`);
  console.error(`   Timeout: ${TIMEOUT_MS / 1000}s`);

  try {
    // Use balanced profile for daily briefs (professional but characterful)
    const cmd = `bash "${VOICE_SCRIPT}" "${script.replace(/"/g, '\\"')}" "${outputPath}" ${DEFAULT_PROFILE}`;
    execSync(cmd, { encoding: 'utf8', timeout: TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] });

    // Verify output
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Audio file not created: ${outputPath}`);
    }

    const stats = fs.statSync(outputPath);
    const durationEstimate = (wordCount / 2.5).toFixed(0); // seconds
    console.error(`✅ Audio generated: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB, ~${durationEstimate}s)`);

    // Output result JSON — MERGE with original report to pass textReport through
    const result = {
      ...report, // Pass through all original report fields (textReport, executiveSummary, etc.)
      audioPath: outputPath,
      audioScript: script,
      wordCount,
      profile: DEFAULT_PROFILE,
      fileSizeKB: (stats.size / 1024).toFixed(1),
      estimatedDurationSec: parseInt(durationEstimate),
    };

    process.stdout.write(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`❌ Audio generation failed: ${e.message}`);
    console.error('   Falling back to text-only delivery');

    const result = {
      audioPath: null,
      audioScript: script,
      wordCount,
      profile: DEFAULT_PROFILE,
      error: e.message,
      date: report.date,
    };

    process.stdout.write(JSON.stringify(result, null, 2));
    process.exit(0); // Don't fail the whole pipeline
  }
}

main().catch((e) => {
  console.error(`❌ Fatal error: ${e.message}`);
  process.exit(1);
});
