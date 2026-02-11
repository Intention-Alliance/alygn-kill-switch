#!/usr/bin/env node

/**
 * ALYGN Twitter Master Automation
 * 
 * Combines two workflows:
 * 1. Content Generation (twitter-automation.js) - original posts/threads
 * 2. Discovery System (twitter-discovery/) - reactive engagement
 * 
 * Daily Execution:
 * - Generate original content via Grok
 * - Discover AI safety posts via search
 * - Evaluate & engage with community
 * - Post via X API
 * 
 * Target: 5 original posts + 2-5 reactive engagements per day
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

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
 * Phase 1: Original Content Generation (Existing System)
 */
async function runContentGeneration() {
  section('PHASE 1: CONTENT GENERATION (Twitter Automation v4)');
  
  try {
    log('🎨 Generating original posts via Grok...');
    
    // Run twitter-automation.js (generates workflow JSON)
    exec('node scripts/alygn/x-twitter/twitter-automation.js');
    
    success('Content generation complete!');
    return true;
  } catch (err) {
    error('Content generation failed:', err.message);
    return false;
  }
}

/**
 * Phase 2: Discovery System (New System)
 */
async function runDiscovery() {
  section('PHASE 2: DISCOVERY SYSTEM (Reactive Engagement)');
  
  try {
    // Step 2.1: Browser Discovery
    log('🔍 Phase 2.1: Browser Discovery (search AI safety keywords)...');
    
    // This will be called by OpenClaw agent with browser access
    log('⚠️  Note: Browser discovery requires OpenClaw agent execution');
    log('   Expected: Search "AGI alignment", "AI safety", "existential risk"');
    log('   Output: discovery-{timestamp}.json\n');
    
    // Step 2.2: Decision Engine
    log('🧠 Phase 2.2: Decision Engine (Grok evaluation)...');
    exec('node scripts/alygn/twitter-discovery/decision-engine.js');
    success('Decision engine complete!');
    
    // Step 2.3: X API Execution
    log('⚡ Phase 2.3: X API Execution (post quotes/replies)...');
    exec('node scripts/alygn/twitter-discovery/x-api-executor.js');
    success('Discovery system complete!');
    
    return true;
  } catch (err) {
    error('Discovery system failed:', err.message);
    return false;
  }
}

/**
 * Phase 3: Browser Posting (Existing System)
 */
async function runBrowserPosting() {
  section('PHASE 3: BROWSER POSTING (Original Content)');
  
  try {
    log('🐦 Posting original content via browser relay (alygn profile)...');
    
    // This will be called by OpenClaw agent with browser access
    log('⚠️  Note: Browser posting requires OpenClaw agent execution');
    log('   Expected: Post threads via compose dialog, replies via target URLs');
    log('   Browser profile: alygn (authenticated X.com session)\n');
    
    success('Browser posting queued!');
    return true;
  } catch (err) {
    error('Browser posting failed:', err.message);
    return false;
  }
}

/**
 * Generate Summary Report
 */
function generateSummary(results) {
  section('EXECUTION SUMMARY');
  
  console.log('📊 Results:');
  console.log(`  Content Generation: ${results.contentGen ? '✅' : '❌'}`);
  console.log(`  Discovery System: ${results.discovery ? '✅' : '❌'}`);
  console.log(`  Browser Posting: ${results.browserPost ? '✅' : '❌'}`);
  
  const totalSuccess = [results.contentGen, results.discovery, results.browserPost].filter(Boolean).length;
  console.log(`\n  Overall: ${totalSuccess}/3 phases successful`);
  
  if (totalSuccess === 3) {
    success('\n🎉 ALL PHASES COMPLETE! Twitter automation successful.');
  } else {
    error(`\n⚠️  ${3 - totalSuccess} phase(s) failed. Check logs above.`);
  }
}

/**
 * Main Execution
 */
async function main() {
  console.log('🐦 ALYGN Twitter Master Automation');
  console.log('   Original Content + Discovery System');
  console.log('');
  
  const results = {
    contentGen: false,
    discovery: false,
    browserPost: false
  };
  
  // Phase 1: Content Generation
  results.contentGen = await runContentGeneration();
  
  // Phase 2: Discovery System
  results.discovery = await runDiscovery();
  
  // Phase 3: Browser Posting (depends on Phase 1)
  if (results.contentGen) {
    results.browserPost = await runBrowserPosting();
  } else {
    error('⏭️  Skipping browser posting (content generation failed)');
  }
  
  // Summary
  generateSummary(results);
  
  // Exit with proper code
  const allSuccess = Object.values(results).every(Boolean);
  process.exit(allSuccess ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    error('💥 Fatal error:', err);
    process.exit(1);
  });
}

export { main, runContentGeneration, runDiscovery, runBrowserPosting };
