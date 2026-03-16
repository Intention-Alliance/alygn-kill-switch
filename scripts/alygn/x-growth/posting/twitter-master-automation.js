
/**
 * ALYGN Twitter Master Automation - Governance-First (v3)
 * 
 * Combines three workflows:
 * 1. Pre-Approved Posts (one per day, sequential) - institutional content
 * 2. Content Generation with Parser/Validator - Grok-generated posts
 * 3. Discovery System - reactive engagement
 * 
 * Daily Execution:
 * - Post next pre-approved institutional content (1/day)
 * - Generate 5 posts + 5 replies via Grok → parse → validate → post
 * - Discover governance-relevant posts via browser
 * - Evaluate & engage with governance perspective
 * 
 * Updated: Feb 27, 2026 (Parser/Validator Integration)
 * Target: 1 pre-approved + 5 Grok posts + 2-5 discovery engagements per day
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const WORKSPACE = path.join(process.env.HOME, '.openclaw/workspace');
const SCRIPTS_DIR = path.join(WORKSPACE, 'scripts/alygn');

// Simple console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg) => console.error(`❌ ${msg}`);
const section = (title) => console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}\n`);

/**
 * Execute shell command with output
 */
function exec(cmd, cwd = WORKSPACE) {
  try {
    return execSync(cmd, { 
      cwd, 
      encoding: 'utf-8',
      stdio: 'inherit'
    });
  } catch (err) {
    throw new Error(`Command failed: ${cmd}\n${err.message}`);
  }
}

/**
 * Phase 1: Pre-Approved Post (Governance-First Content)
 */
async function runPreApprovedPost() {
  section('PHASE 1: PRE-APPROVED POST (Governance-First Content)');
  
  try {
    log('📝 Posting next pre-approved institutional content...');
    
    // Run post-pre-approved.js (posts next sequential post)
    exec('node scripts/alygn/post-pre-approved.js');
    
    success('Pre-approved post complete!');
    return true;
  } catch (err) {
    error('Pre-approved post failed:', err.message);
    console.log('\n⚠️  This is non-fatal. Continuing with content generation...');
    return false;
  }
}

/**
 * Phase 2: Content Generation with Parser/Validator Pipeline
 */
async function runContentGeneration() {
  section('PHASE 2: CONTENT GENERATION (Parser/Validator Pipeline)');
  
  try {
    // Step 2.1: Generate content with Grok (Prompts #1 and #13)
    log('📝 Phase 2.1: Generating content with Grok...');
    log('   Running Prompt #1 (thread ideas)...');
    exec('node scripts/alygn/x-growth/twitter-automation.js exec 1');
    
    log('   Running Prompt #13 (strategic replies)...');
    exec('node scripts/alygn/x-growth/twitter-automation.js exec 13');
    
    success('Content generation complete!');
    
    // Step 2.2: Parse, validate, and format content
    log('🔧 Phase 2.2: Running parser & validator pipeline...');
    log('   Parsing Grok output → validating → formatting...');
    
    // Find latest Grok output file
    const outputDir = path.join(WORKSPACE, 'twitter-outputs');
    const files = fs.readdirSync(outputDir)
      .filter(f => f.startsWith('prompt-') && f.endsWith('.md'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      throw new Error('No Grok output files found in twitter-outputs/');
    }
    
    const latestOutput = files[0];
    log(`   Latest output: ${latestOutput}`);
    
    // Run parser/validator in dry-run first
    log('   Running dry-run validation...');
    exec(`node scripts/shared/x-growth/x-api-executor.js twitter-outputs/${latestOutput} --dry-run`);
    
    // Run live posting
    log('   Posting validated content via X API...');
    exec(`node scripts/shared/x-growth/x-api-executor.js twitter-outputs/${latestOutput} --live`);
    
    success('Parser/validator pipeline complete!');
    
    return true;
  } catch (err) {
    error('Content generation failed:', err.message);
    console.log('\n⚠️  This is non-fatal. Continuing with discovery system...');
    return false;
  }
}

/**
 * Phase 3: Discovery System (Reactive Engagement)
 */
async function runDiscovery() {
  section('PHASE 3: DISCOVERY SYSTEM (Reactive Engagement)');
  
  try {
    // Step 3.1: Browser Discovery
    log('🔍 Phase 3.1: Browser Discovery (search governance keywords)...');
    
    // This will be called by OpenClaw agent with browser access
    log('⚠️  Note: Browser discovery requires OpenClaw agent execution');
    log('   Expected: Search "AI governance", "coordination", "institutional AI"');
    log('   Output: discovery-{timestamp}.json\n');
    
    // Step 3.2: Decision Engine (Governance-First)
    log('🧠 Phase 3.2: Decision Engine (Grok evaluation with governance lens)...');
    exec('node scripts/alygn/x-growth/research/decision-engine.js');
    success('Decision engine complete!');
    
    // Step 3.3: X API Execution
    log('⚡ Phase 3.3: X API Execution (post institutional replies/quotes)...');
    exec('node scripts/shared/x-growth/x-api-executor.js');
    success('Discovery system complete!');
    
    return true;
  } catch (err) {
    error('Discovery system failed:', err.message);
    console.log('\n⚠️  This is non-fatal. Continuing...');
    return false;
  }
}

/**
 * Generate Summary Report
 */
function generateSummary(results) {
  section('EXECUTION SUMMARY');
  
  console.log('📊 Results:');
  console.log(`  Phase 1 - Pre-Approved Post: ${results.preApprovedPost ? '✅' : '❌'}`);
  console.log(`  Phase 2 - Content Generation: ${results.contentGeneration ? '✅' : '❌'}`);
  console.log(`  Phase 3 - Discovery System: ${results.discovery ? '✅' : '❌'}`);
  
  const totalSuccess = [results.preApprovedPost, results.contentGeneration, results.discovery].filter(Boolean).length;
  console.log(`\n  Overall: ${totalSuccess}/3 phases successful`);
  
  if (totalSuccess === 3) {
    success('\n🎉 ALL PHASES COMPLETE! Twitter automation successful.');
  } else if (totalSuccess >= 1) {
    console.log('\n⚠️  Partial success. Check logs above for details.');
  } else {
    error('\n❌ All phases failed. Check logs above.');
  }
}

/**
 * Main Execution
 */
async function main() {
  console.log('🐦 ALYGN Twitter Master Automation (Governance-First v3)');
  console.log('   Pre-Approved Posts + Parser/Validator + Discovery System');
  console.log('');
  
  const results = {
    preApprovedPost: false,
    contentGeneration: false,
    discovery: false
  };
  
  // Phase 1: Pre-Approved Post (Governance-First)
  results.preApprovedPost = await runPreApprovedPost();
  
  // Phase 2: Content Generation with Parser/Validator
  results.contentGeneration = await runContentGeneration();
  
  // Phase 3: Discovery System (Reactive Engagement)
  results.discovery = await runDiscovery();
  
  // Summary
  generateSummary(results);
  
  // Exit with proper code
  // Note: Partial success is acceptable (at least one phase succeeded)
  const anySuccess = Object.values(results).some(Boolean);
  process.exit(anySuccess ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    error('💥 Fatal error:', err);
    process.exit(1);
  });
}

export { main, runContentGeneration, runDiscovery, runPreApprovedPost };

