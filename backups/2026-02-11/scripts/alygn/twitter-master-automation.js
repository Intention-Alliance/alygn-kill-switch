#!/usr/bin/env node

/**
 * ALYGN Twitter Master Automation - Governance-First (v2)
 * 
 * Combines two workflows:
 * 1. Pre-Approved Posts (one per day, sequential) - institutional content
 * 2. Discovery System (twitter-discovery/) - reactive engagement
 * 
 * Daily Execution:
 * - Post next pre-approved institutional content
 * - Discover governance-relevant posts via search
 * - Evaluate & engage with governance perspective
 * - Post via X API
 * 
 * Updated: Feb 10, 2026 (Governance-First Context Update)
 * Target: 1 pre-approved post + 2-5 reactive engagements per day
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
    console.log('\n⚠️  This is non-fatal. Continuing with discovery system...');
    return false;
  }
}

/**
 * Phase 2: Discovery System (Reactive Engagement)
 */
async function runDiscovery() {
  section('PHASE 2: DISCOVERY SYSTEM (Reactive Engagement)');
  
  try {
    // Step 2.1: Browser Discovery
    log('🔍 Phase 2.1: Browser Discovery (search governance keywords)...');
    
    // This will be called by OpenClaw agent with browser access
    log('⚠️  Note: Browser discovery requires OpenClaw agent execution');
    log('   Expected: Search "AI governance", "coordination", "institutional AI"');
    log('   Output: discovery-{timestamp}.json\n');
    
    // Step 2.2: Decision Engine (Governance-First)
    log('🧠 Phase 2.2: Decision Engine (Grok evaluation with governance lens)...');
    exec('node scripts/alygn/twitter-discovery/decision-engine.js');
    success('Decision engine complete!');
    
    // Step 2.3: X API Execution
    log('⚡ Phase 2.3: X API Execution (post institutional replies/quotes)...');
    exec('node scripts/alygn/twitter-discovery/x-api-executor.js');
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
  console.log(`  Pre-Approved Post: ${results.preApprovedPost ? '✅' : '❌'}`);
  console.log(`  Discovery System: ${results.discovery ? '✅' : '❌'}`);
  
  const totalSuccess = [results.preApprovedPost, results.discovery].filter(Boolean).length;
  console.log(`\n  Overall: ${totalSuccess}/2 phases successful`);
  
  if (totalSuccess === 2) {
    success('\n🎉 ALL PHASES COMPLETE! Twitter automation successful.');
  } else if (totalSuccess === 1) {
    console.log('\n⚠️  Partial success. Check logs above for details.');
  } else {
    error('\n❌ Both phases failed. Check logs above.');
  }
}

/**
 * Main Execution
 */
async function main() {
  console.log('🐦 ALYGN Twitter Master Automation (Governance-First v2)');
  console.log('   Pre-Approved Posts + Discovery System');
  console.log('');
  
  const results = {
    preApprovedPost: false,
    discovery: false
  };
  
  // Phase 1: Pre-Approved Post (Governance-First)
  results.preApprovedPost = await runPreApprovedPost();
  
  // Phase 2: Discovery System (Reactive Engagement)
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

export { main, runPreApprovedPost, runDiscovery };
