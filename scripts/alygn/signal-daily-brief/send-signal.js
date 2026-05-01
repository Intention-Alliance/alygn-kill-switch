#!/usr/bin/env node
/**
 * ALYGN Daily Signal Brief — Report Output Module
 *
 * Reads synthesized report + audio metadata, outputs JSON for OpenClaw message tool.
 * This script prepares the payload - actual sending is done via OpenClaw's native Signal channel.
 *
 * Usage: node generate-audio.js | node send-signal.js > /tmp/alygn-brief-payload.json
 * Then use OpenClaw message tool to send with media attachment.
 */

const readline = require('readline');

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

async function main() {
  const report = await readStdin();

  // Extract text report and audio path
  let textReport = report.textReport || '';
  let audioPath = report.audioPath || null;

  // Reconstruct text report if needed
  if (!textReport && report.executiveSummary) {
    const lines = [];
    lines.push(`📡 ALYGN DAILY SIGNAL BRIEF — ${report.date || 'today'}`);
    lines.push('');
    lines.push('📈 EXECUTIVE SUMMARY');
    lines.push(report.executiveSummary);
    if (report.operations) {
      lines.push('');
      lines.push('🔧 OPERATIONS & SYSTEMS');
      lines.push(...report.operations);
    }
    if (report.outreach) {
      lines.push('');
      lines.push('📧 OUTREACH');
      lines.push(...report.outreach);
    }
    if (report.suggestions) {
      lines.push('');
      lines.push('💡 SUGGESTIONS');
      lines.push(...report.suggestions.map(s => `• ${s}`));
    }
    if (report.targets) {
      lines.push('');
      lines.push('🎯 TODAY\'S TARGETS');
      lines.push(...report.targets.map((t, i) => `${i + 1}. [${t.priority}] ${t.text} (${t.deadline})`));
    }
    textReport = lines.join('\n');
  }

  if (!textReport) {
    console.error('❌ No text report found');
    process.exit(1);
  }

  // Determine target based on mode
  const isProduction = process.argv.includes('--production');
  const productionGroupId = process.env.ALYGN_SIGNAL_GROUP_ID || '';

  let target;
  if (isProduction && productionGroupId) {
    target = productionGroupId;
  } else {
    target = '+50662163355'; // Test mode - Andler's direct number
  }

  // Output payload for OpenClaw message tool
  const payload = {
    channel: 'signal',
    target,
    message: textReport,
    media: audioPath,
    caption: `🎙️ ALYGN Daily Brief — ${report.date}\n\nDuration: ~${Math.ceil(report.wordCount / 2.5)}s | Voice: Wobblus (Piper TTS)`,
    metadata: {
      wordCount: report.wordCount,
      audioPath: audioPath,
      fileSizeKB: report.fileSizeKB,
      estimatedDurationSec: report.estimatedDurationSec,
    }
  };

  // Output JSON for OpenClaw message tool
  process.stdout.write(JSON.stringify(payload, null, 2));
  if (isProduction) {
    console.error(`📱 Production mode: sending to group ${target}`);
  } else {
    console.error(`📱 Test mode: sending to ${target}`);
  }
  console.error(`✅ Payload prepared: ${textReport.length} chars, audio: ${audioPath || 'none'}`);
}

main().catch((e) => {
  console.error(`❌ Error: ${e.message}`);
  process.exit(1);
});
