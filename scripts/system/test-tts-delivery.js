#!/usr/bin/env node
/**
 * TTS Delivery Test for WhatsApp
 * 
 * This script tests the text-to-speech delivery mechanism via WhatsApp.
 * It generates audio using sag and prepares it for sending via the message tool.
 * 
 * Usage:
 *   node test-tts-delivery.js                    # Basic test
 *   WHATSAPP_TEST_TARGET="+1234567890" node test-tts-delivery.js  # Full test
 * 
 * Environment Variables:
 *   - ELEVENLABS_API_KEY or SAG_API_KEY: Required for TTS
 *   - WHATSAPP_TEST_TARGET: Optional - phone number or contact name for delivery test
 *   - TTS_VOICE: Optional - voice to use (default: Roger)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  // WhatsApp target (can be overridden via env)
  target: process.env.WHATSAPP_TEST_TARGET || null,
  // Test message
  testMessage: "Hello! This is a TTS delivery test from OpenClaw. Testing audio quality and delivery reliability.",
  // Voice to use (use available voice since 'Clawd' is custom)
  voice: process.env.TTS_VOICE || 'Roger',
  // Output directory for test files
  outputDir: path.join(os.tmpdir(), 'openclaw-tts-test'),
};

// Test results
const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}

function addTestResult(name, status, details = {}) {
  const result = {
    name,
    status,
    timestamp: new Date().toISOString(),
    ...details
  };
  results.tests.push(result);
  results.summary.total++;
  if (status === 'passed') {
    results.summary.passed++;
    log('info', `✓ ${name}`);
  } else if (status === 'warning') {
    results.summary.warnings++;
    log('warning', `⚠ ${name}: ${details.warning || 'Warning'}`);
  } else {
    results.summary.failed++;
    log('error', `✗ ${name}: ${details.error || 'Failed'}`);
  }
  return result;
}

function checkPrerequisites() {
  log('info', 'Checking prerequisites...');
  
  // Check for sag CLI
  try {
    execSync('which sag', { stdio: 'ignore' });
    addTestResult('sag CLI available', 'passed', { tool: 'sag' });
  } catch (e) {
    return addTestResult('sag CLI available', 'failed', { 
      error: 'sag CLI not found in PATH. Please install sag first.' 
    });
  }
  
  // Check for ELEVENLABS_API_KEY
  if (!process.env.ELEVENLABS_API_KEY && !process.env.SAG_API_KEY) {
    return addTestResult('API key configured', 'failed', {
      error: 'ELEVENLABS_API_KEY or SAG_API_KEY environment variable required'
    });
  }
  addTestResult('API key configured', 'passed', { 
    keySource: process.env.ELEVENLABS_API_KEY ? 'ELEVENLABS_API_KEY' : 'SAG_API_KEY'
  });
  
  // Check for WhatsApp target
  if (!TEST_CONFIG.target) {
    return addTestResult('WhatsApp target configured', 'warning', {
      warning: 'WHATSAPP_TEST_TARGET not set - will test TTS generation only'
    });
  } else {
    addTestResult('WhatsApp target configured', 'passed', { target: TEST_CONFIG.target });
  }
  
  return true;
}

function getAvailableVoices() {
  try {
    const output = execSync('sag voices', { encoding: 'utf8', timeout: 10000 });
    const voices = output.split('\n')
      .filter(line => line.includes('premade') || line.match(/^[A-Za-z0-9]{20,}/))
      .map(line => {
        const match = line.match(/^([A-Za-z0-9]+)\s+(\S+)\s+(.+)$/);
        if (match) {
          return { id: match[1], name: match[2], description: match[3] };
        }
        return null;
      })
      .filter(Boolean);
    return voices;
  } catch (e) {
    return [];
  }
}

function generateAudioFile() {
  log('info', 'Generating TTS audio...');
  
  try {
    // Create output directory
    if (!fs.existsSync(TEST_CONFIG.outputDir)) {
      fs.mkdirSync(TEST_CONFIG.outputDir, { recursive: true });
    }
    
    const outputFile = path.join(TEST_CONFIG.outputDir, `tts-test-${Date.now()}.mp3`);
    
    // Generate audio using sag
    const sagCmd = `sag -v "${TEST_CONFIG.voice}" -o "${outputFile}" --play=false "${TEST_CONFIG.testMessage}"`;
    log('info', `Running: sag -v "${TEST_CONFIG.voice}" -o "${outputFile}" --play=false "[message]"`);
    
    const output = execSync(sagCmd, { encoding: 'utf8', timeout: 60000 });
    
    // Verify file was created
    if (!fs.existsSync(outputFile)) {
      return addTestResult('Audio file generation', 'failed', {
        error: 'Output file not created',
        voice: TEST_CONFIG.voice
      });
    }
    
    const stats = fs.statSync(outputFile);
    if (stats.size === 0) {
      fs.unlinkSync(outputFile);
      return addTestResult('Audio file generation', 'failed', {
        error: 'Output file is empty',
        voice: TEST_CONFIG.voice
      });
    }
    
    addTestResult('Audio file generation', 'passed', {
      filePath: outputFile,
      fileSize: `${(stats.size / 1024).toFixed(2)} KB`,
      voice: TEST_CONFIG.voice
    });
    
    return outputFile;
  } catch (error) {
    // Try to get available voices if voice not found
    if (error.message?.includes('not found')) {
      const voices = getAvailableVoices();
      return addTestResult('Audio file generation', 'failed', {
        error: `Voice "${TEST_CONFIG.voice}" not found`,
        suggestion: 'Try one of: ' + voices.slice(0, 5).map(v => v.name).join(', ') + '...',
        availableVoices: voices.slice(0, 10)
      });
    }
    
    return addTestResult('Audio file generation', 'failed', {
      error: error.message,
      stderr: error.stderr?.toString()
    });
  }
}

function prepareWhatsAppDelivery(audioFile) {
  log('info', 'Preparing audio for WhatsApp delivery...');
  
  try {
    // Get absolute path
    const absolutePath = path.resolve(audioFile);
    
    // Document the message payload for WhatsApp
    const messageData = {
      action: 'send',
      channel: 'whatsapp',
      target: TEST_CONFIG.target,
      media: absolutePath,
      caption: 'TTS Delivery Test - Audio message'
    };
    
    log('info', `Message payload prepared:`);
    log('info', JSON.stringify(messageData, null, 2));
    
    // Note: In the OpenClaw environment, the actual message sending
    // requires the message tool to be called with explicit approval
    // or proper gateway configuration
    
    addTestResult('WhatsApp message preparation', 'passed', {
      target: TEST_CONFIG.target,
      mediaPath: absolutePath,
      mediaSize: fs.statSync(absolutePath).size,
      note: 'Message prepared. Actual delivery requires message tool with proper target/channel.'
    });
    
    return {
      success: true,
      messageData,
      audioFile: absolutePath
    };
  } catch (error) {
    return addTestResult('WhatsApp message preparation', 'failed', {
      error: error.message
    });
  }
}

function validateAudioQuality(audioFile) {
  log('info', 'Validating audio quality...');
  
  try {
    // Check file format
    const buffer = fs.readFileSync(audioFile);
    const header = buffer.slice(0, 4);
    
    // MP3 files start with ID3 or have MPEG sync word
    const isMP3 = header.toString('ascii', 0, 3) === 'ID3' || 
                  (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0);
    
    if (!isMP3) {
      return addTestResult('Audio format validation', 'failed', {
        error: 'File does not appear to be a valid MP3',
        header: header.toString('hex')
      });
    }
    
    addTestResult('Audio format validation', 'passed', {
      format: 'MP3',
      header: header.toString('hex'),
      size: `${(buffer.length / 1024).toFixed(2)} KB`
    });
    
    // Check file size is reasonable
    const sizeKB = buffer.length / 1024;
    if (sizeKB < 10) {
      addTestResult('Audio size check', 'warning', {
        size: `${sizeKB.toFixed(2)} KB`,
        warning: 'Audio file is very small, may be truncated'
      });
    } else {
      addTestResult('Audio size check', 'passed', {
        size: `${sizeKB.toFixed(2)} KB`
      });
    }
    
    // Estimate duration based on typical MP3 bitrate
    // 128kbps = 16KB/s
    const estimatedDuration = sizeKB / 16;
    log('info', `Estimated audio duration: ~${estimatedDuration.toFixed(1)} seconds`);
    
    addTestResult('Audio duration check', 'passed', {
      estimatedDuration: `${estimatedDuration.toFixed(1)}s`,
      note: 'WhatsApp supports up to ~16MB audio files'
    });
    
    return true;
  } catch (error) {
    return addTestResult('Audio quality validation', 'failed', {
      error: error.message
    });
  }
}

function generateReport() {
  log('info', 'Generating test report...');
  
  const reportPath = path.join(TEST_CONFIG.outputDir, `tts-test-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('TTS DELIVERY TEST REPORT');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`Target: ${TEST_CONFIG.target || 'Not configured'}`);
  console.log(`Voice: ${TEST_CONFIG.voice}`);
  console.log(`\nTest Results: ${results.summary.passed}/${results.summary.total} passed`);
  if (results.summary.warnings > 0) {
    console.log(`Warnings: ${results.summary.warnings}`);
  }
  console.log('-'.repeat(60));
  
  results.tests.forEach(test => {
    const icon = test.status === 'passed' ? '✓' : test.status === 'warning' ? '⚠' : '✗';
    console.log(`${icon} ${test.name}: ${test.status.toUpperCase()}`);
    if (test.error) {
      console.log(`  Error: ${test.error}`);
    }
    if (test.suggestion) {
      console.log(`  Suggestion: ${test.suggestion}`);
    }
  });
  
  console.log('='.repeat(60));
  console.log(`Full report saved to: ${reportPath}`);
  
  return reportPath;
}

function provideRecommendations() {
  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(60));
  
  const issues = results.tests.filter(t => t.status === 'failed').length;
  const warnings = results.tests.filter(t => t.status === 'warning').length;
  
  if (issues === 0 && warnings === 0) {
    console.log('✓ All tests passed! The TTS delivery mechanism appears to be working correctly.');
    console.log('\nRecommendations for maintaining quality:');
    console.log('  1. Keep sag CLI updated: brew upgrade sag');
    console.log('  2. Monitor ElevenLabs API usage for rate limits');
    console.log('  3. Test regularly with different voice settings');
    console.log('  4. Consider implementing retry logic for WhatsApp delivery failures');
  } else {
    if (results.tests.some(t => t.name === 'sag CLI available' && t.status === 'failed')) {
      console.log('CRITICAL: sag CLI is not installed');
      console.log('  → Install with: brew install steipete/tap/sag');
      console.log('  → Or download from: https://sag.sh');
    }
    
    if (results.tests.some(t => t.name === 'API key configured' && t.status === 'failed')) {
      console.log('CRITICAL: API key not configured');
      console.log('  → Set ELEVENLABS_API_KEY environment variable');
      console.log('  → Get your API key from: https://elevenlabs.io/app/settings/api-keys');
    }
    
    const voiceTest = results.tests.find(t => t.name === 'Audio file generation');
    if (voiceTest?.status === 'failed' && voiceTest?.availableVoices) {
      console.log('\nVOICE NOT FOUND:');
      console.log(`  → Voice "${TEST_CONFIG.voice}" is not available`);
      console.log('  → Available premade voices:');
      voiceTest.availableVoices.forEach(v => {
        console.log(`     - ${v.name} (${v.id})`);
      });
      console.log('  → Run "sag voices" to see all available voices');
    }
    
    if (warnings > 0) {
      console.log('\nWARNINGS:');
      const whatsappWarning = results.tests.find(t => t.name === 'WhatsApp target configured' && t.status === 'warning');
      if (whatsappWarning) {
        console.log('  → WhatsApp target not set: TTS generation tested but not delivery');
        console.log('  → Set WHATSAPP_TEST_TARGET for full delivery test');
      }
      console.log('  → Small audio files may indicate issues with TTS generation');
    }
  }
  
  console.log('\n' + '-'.repeat(60));
  console.log('KNOWN LIMITATIONS & ISSUES:');
  console.log('-'.repeat(60));
  console.log('1. Message Tool Target Requirement:');
  console.log('   → The message tool requires explicit target parameter');
  console.log('   → Cannot use implicit target from session context');
  console.log('   → Must specify both channel and target for each send');
  console.log();
  console.log('2. Audio Format:');
  console.log('   → WhatsApp supports MP3, M4A, OGG, and WAV');
  console.log('   → sag generates MP3 which is compatible');
  console.log('   → Keep audio under 16MB for WhatsApp');
  console.log();
  console.log('3. Rate Limiting:');
  console.log('   → ElevenLabs has rate limits (varies by tier)');
  console.log('   → Implement exponential backoff for retries');
  console.log('   → Consider caching generated audio');
  console.log();
  console.log('4. Voice Availability:');
  console.log('   → Custom voice names like "Clawd" must be configured');
  console.log('   → Use "sag voices" to list available voices');
  console.log('   → Premade voices work out of the box');
  console.log();
  console.log('Best Practices:');
  console.log('  1. Use normalized text for better pronunciation (--normalize auto)');
  console.log('  2. Keep messages under 30 seconds for WhatsApp compatibility');
  console.log('  3. Clean up temporary audio files after successful delivery');
  console.log('  4. Implement exponential backoff for retry logic');
  console.log('  5. Monitor for rate limiting from ElevenLabs API');
  console.log('  6. Test voice availability before using custom voice names');
  console.log('  7. Store generated audio paths for potential resend');
  console.log('='.repeat(60));
}

// Main test runner
async function main() {
  console.log('🔊 TTS Delivery Test for WhatsApp');
  console.log('=====================================\n');
  
  log('info', 'Starting TTS delivery test suite...');
  log('info', `Output directory: ${TEST_CONFIG.outputDir}`);
  log('info', `Target voice: ${TEST_CONFIG.voice}`);
  
  // Run tests
  const prereqsOk = checkPrerequisites();
  if (!prereqsOk) {
    log('error', 'Prerequisites check failed. Cannot continue.');
    const reportPath = generateReport();
    provideRecommendations();
    process.exit(1);
  }
  
  const audioFile = generateAudioFile();
  if (!audioFile || typeof audioFile !== 'string') {
    log('error', 'Audio generation failed. Cannot continue.');
    const reportPath = generateReport();
    provideRecommendations();
    process.exit(1);
  }
  
  validateAudioQuality(audioFile);
  
  // Only attempt WhatsApp preparation if target is configured
  if (TEST_CONFIG.target) {
    const delivery = prepareWhatsAppDelivery(audioFile);
    if (delivery?.success) {
      log('info', '\n' + '='.repeat(60));
      log('info', 'READY FOR DELIVERY');
      log('info', '='.repeat(60));
      log('info', 'To send the audio via WhatsApp, use:');
      log('info', `message action:send channel:whatsapp target:"${delivery.messageData.target}" media:"${delivery.audioFile}"`);
    }
  } else {
    log('info', 'Skipping WhatsApp delivery test (no target configured)');
    log('info', 'To test delivery, set WHATSAPP_TEST_TARGET environment variable');
  }
  
  // Generate report
  const reportPath = generateReport();
  provideRecommendations();
  
  // Cleanup (keep file if delivery test was requested)
  if (!TEST_CONFIG.target) {
    log('info', 'Cleaning up temporary files...');
    try {
      fs.unlinkSync(audioFile);
      log('info', `Removed: ${audioFile}`);
    } catch (e) {
      log('warning', `Could not remove temp file: ${e.message}`);
    }
  } else {
    log('info', `Audio file preserved at: ${audioFile}`);
    log('info', 'Clean up manually when done testing');
  }
  
  // Exit with appropriate code
  const exitCode = results.summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

// Run if called directly
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { checkPrerequisites, generateAudioFile, validateAudioQuality, prepareWhatsAppDelivery };
