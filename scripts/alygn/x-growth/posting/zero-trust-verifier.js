#!/usr/bin/env node
/**
 * Zero-Trust Content Verifier for Alygn X-Growth
 * 
 * Every post candidate MUST pass ALL checks before posting.
 * "Confidence without verification = failure"
 * 
 * Usage:
 *   node zero-trust-verifier.js --input=<candidates.json> --output=<verified.json>
 *   node zero-trust-verifier.js --input=<candidates.json> --dry-run
 */

import fs from 'fs';
import path from 'path';

// ============================================================
// VERIFICATION CHECKS
// ============================================================

/**
 * Check 1: Information Veracity
 * - No speculation presented as fact
 * - Claims should be verifiable
 * - No unverified statistics
 */
function checkVeracity(candidate) {
  const issues = [];
  const text = candidate.text || candidate.content || '';
  const textLower = text.toLowerCase();
  
  // Speculation presented as fact
  const speculationPhrases = [
    'will definitely', 'guaranteed to', 'certainly will',
    'is going to', 'undoubtedly', 'without question',
    'it is certain', 'proven that', 'obviously'
  ];
  for (const phrase of speculationPhrases) {
    if (textLower.includes(phrase)) {
      issues.push(`Speculation as fact: "${phrase}"`);
    }
  }
  
  // Unverified statistics (numbers without source)
  const statPattern = /\d+%|\$\d+|\d+ million|\d+ billion/i;
  if (statPattern.test(text) && !candidate.source && !candidate.factChecked) {
    issues.push('Statistics present without source verification');
  }
  
  return {
    passed: issues.length === 0,
    check: 'veracity',
    issues
  };
}

/**
 * Check 2: Tone/Vibe Consistency
 * - Alygn institutional tone (calm, restrained, non-promotional)
 * - No hype, no urgency, no FOMO
 * - Governance-first language
 */
function checkTone(candidate) {
  const issues = [];
  const text = candidate.text || candidate.content || '';
  const textLower = text.toLowerCase();
  
  // Hype/promotional language
  const hypePhrases = [
    'revolutionary', 'game-changing', 'groundbreaking', 'unprecedented',
    'amazing', 'incredible', 'must-have', 'don\'t miss',
    'act now', 'limited time', 'exclusive', 'breakthrough',
    'disruptive', 'cutting-edge', 'next-gen', 'world-class'
  ];
  for (const phrase of hypePhrases) {
    if (textLower.includes(phrase)) {
      issues.push(`Hype language: "${phrase}"`);
    }
  }
  
  // Urgency/FOMO signals
  const urgencyPhrases = [
    'hurry', 'before it\'s too late', 'time is running out',
    'urgent', 'critical deadline', 'last chance', 'don\'t wait'
  ];
  for (const phrase of urgencyPhrases) {
    if (textLower.includes(phrase)) {
      issues.push(`Urgency/FOMO: "${phrase}"`);
    }
  }
  
  // Technology-first language (should be governance-first)
  const techFirstPhrases = [
    'our platform', 'our product', 'try our', 'sign up',
    'get started with', 'book a demo', 'schedule a call'
  ];
  for (const phrase of techFirstPhrases) {
    if (textLower.includes(phrase)) {
      issues.push(`Technology-first (should be governance-first): "${phrase}"`);
    }
  }
  
  return {
    passed: issues.length === 0,
    check: 'tone',
    issues
  };
}

/**
 * Check 3: X Rules Compliance
 * - No spam signals
 * - No manipulation
 * - No platform gaming
 */
function checkXRules(candidate) {
  const issues = [];
  const text = candidate.text || candidate.content || '';
  
  // Hashtag stuffing (more than 5 hashtags)
  const hashtagCount = (text.match(/#[A-Za-z0-9_]+/g) || []).length;
  if (hashtagCount > 5) {
    issues.push(`Hashtag stuffing: ${hashtagCount} hashtags (max 5)`);
  }
  
  // Mention spam (more than 3 mentions)
  const mentionCount = (text.match(/@[A-Za-z0-9_]+/g) || []).length;
  if (mentionCount > 3) {
    issues.push(`Mention spam: ${mentionCount} mentions (max 3)`);
  }
  
  // Repetitive content patterns
  const words = text.toLowerCase().split(/\s+/);
  const wordFreq = {};
  for (const w of words) {
    wordFreq[w] = (wordFreq[w] || 0) + 1;
  }
  for (const [word, count] of Object.entries(wordFreq)) {
    if (count > 3 && word.length > 3) {
      issues.push(`Repetitive word: "${word}" appears ${count} times`);
    }
  }
  
  // Engagement bait
  const baitPhrases = [
    'retweet if', 'like if', 'follow if', 'tag someone',
    'share if you agree', 'comment below'
  ];
  const textLower = text.toLowerCase();
  for (const phrase of baitPhrases) {
    if (textLower.includes(phrase)) {
      issues.push(`Engagement bait: "${phrase}"`);
    }
  }
  
  return {
    passed: issues.length === 0,
    check: 'x_rules',
    issues
  };
}

/**
 * Check 4: Content Variation
 * - No duplicate content from previous posts
 * - Fresh angle/perspective
 * - Diverse topics
 */
function checkVariation(candidate, previousPosts = []) {
  const issues = [];
  const text = candidate.text || candidate.content || '';
  
  // Check for exact duplicates
  for (const prev of previousPosts) {
    const prevText = prev.text || prev.content || '';
    if (prevText.trim() === text.trim()) {
      issues.push('Exact duplicate of previous post');
      break;
    }
    
    // High similarity (simple Jaccard)
    const wordsA = new Set(text.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(prevText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    const similarity = union.size > 0 ? intersection.size / union.size : 0;
    
    if (similarity > 0.7) {
      issues.push(`High similarity (${(similarity * 100).toFixed(0)}%) with previous post`);
      break;
    }
  }
  
  return {
    passed: issues.length === 0,
    check: 'variation',
    issues
  };
}

// ============================================================
// MAIN VERIFICATION PIPELINE
// ============================================================

function verifyCandidate(candidate, previousPosts = []) {
  const results = {
    candidate_id: candidate.id || 'unknown',
    text_preview: (candidate.text || candidate.content || '').substring(0, 80),
    checks: {},
    passed: true,
    rejection_reasons: []
  };
  
  // Run all checks
  const checks = [
    checkVeracity(candidate),
    checkTone(candidate),
    checkXRules(candidate),
    checkVariation(candidate, previousPosts)
  ];
  
  for (const check of checks) {
    results.checks[check.check] = check;
    if (!check.passed) {
      results.passed = false;
      results.rejection_reasons.push(...check.issues);
    }
  }
  
  return results;
}

function verifyAll(candidates, previousPosts = []) {
  const results = {
    timestamp: new Date().toISOString(),
    total_candidates: candidates.length,
    passed: [],
    rejected: [],
    summary: {
      veracity_fail: 0,
      tone_fail: 0,
      x_rules_fail: 0,
      variation_fail: 0
    }
  };
  
  for (const candidate of candidates) {
    const result = verifyCandidate(candidate, previousPosts);
    if (result.passed) {
      results.passed.push({ ...result, candidate });
    } else {
      results.rejected.push(result);
      for (const reason of result.rejection_reasons) {
        if (reason.includes('Speculation') || reason.includes('Statistics')) results.summary.veracity_fail++;
        else if (reason.includes('Hype') || reason.includes('Urgency') || reason.includes('Technology-first')) results.summary.tone_fail++;
        else if (reason.includes('Hashtag') || reason.includes('Mention') || reason.includes('Repetitive') || reason.includes('Engagement')) results.summary.x_rules_fail++;
        else if (reason.includes('duplicate') || reason.includes('similarity')) results.summary.variation_fail++;
      }
    }
  }
  
  return results;
}

// ============================================================
// CLI
// ============================================================

const args = process.argv.slice(2);
let inputFile = null;
let outputFile = null;
let dryRun = false;
let previousFile = null;

for (const arg of args) {
  if (arg.startsWith('--input=')) inputFile = arg.split('=')[1];
  else if (arg.startsWith('--output=')) outputFile = arg.split('=')[1];
  else if (arg === '--dry-run') dryRun = true;
  else if (arg.startsWith('--previous=')) previousFile = arg.split('=')[1];
}

if (!inputFile) {
  console.error('Usage: node zero-trust-verifier.js --input=<candidates.json> [--output=<verified.json>] [--dry-run] [--previous=<previous-posts.json>]');
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const previousPosts = previousFile ? JSON.parse(fs.readFileSync(previousFile, 'utf8')) : [];

const results = verifyAll(candidates, previousPosts);

console.log('\n🔍 ZERO-TRUST VERIFICATION RESULTS');
console.log('=====================================');
console.log(`Total candidates: ${results.total_candidates}`);
console.log(`✅ Passed: ${results.passed.length}`);
console.log(`❌ Rejected: ${results.rejected.length}`);
console.log('\nRejection breakdown:');
console.log(`  Veracity: ${results.summary.veracity_fail}`);
console.log(`  Tone: ${results.summary.tone_fail}`);
console.log(`  X Rules: ${results.summary.x_rules_fail}`);
console.log(`  Variation: ${results.summary.variation_fail}`);

if (results.rejected.length > 0) {
  console.log('\n❌ REJECTED CANDIDATES:');
  for (const r of results.rejected) {
    console.log(`  [${r.candidate_id}] "${r.text_preview}..."`);
    for (const reason of r.rejection_reasons) {
      console.log(`    → ${reason}`);
    }
  }
}

if (results.passed.length > 0) {
  console.log('\n✅ APPROVED CANDIDATES:');
  for (const p of results.passed) {
    console.log(`  [${p.candidate_id}] "${p.text_preview}..."`);
  }
}

if (outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to ${outputFile}`);
}

if (dryRun) {
  console.log('\n🏃 DRY RUN - No posts were made');
}

export { verifyAll, verifyCandidate, checkVeracity, checkTone, checkXRules, checkVariation };