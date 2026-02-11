#!/usr/bin/env node

/**
 * ALYGN Twitter Discovery - Phase 2: Decision Engine
 * 
 * Purpose:
 * - Read discovery-*.json from Phase 1 (Browser Exploration)
 * - Use Grok to evaluate: should we engage? how? (reply/quote/follow)
 * - Research profiles/posts with web search to verify relevance
 * - Output workflow-*.json for Phase 3 (X API Execution)
 * 
 * Workflow:
 * 1. Load discovery JSON from Phase 1
 * 2. For each discovered post:
 *    a. Run Grok prompt: "Is this worth engaging?"
 *    b. If yes: determine action (reply/quote/follow)
 *    c. Use web_search to verify author credibility/relevance
 * 3. Generate workflow JSON with posts/replies/profiles
 * 
 * Output Format (same as twitter-automation.js):
 * {
 *   "timestamp": "ISO-8601",
 *   "posts": [],
 *   "replies": [
 *     { "id": 1, "targetHandle": "@...", "targetUrl": "...", "content": "...", "mention": "@aialygn" }
 *   ],
 *   "profiles": ["@handle1", "@handle2"]
 * }
 */

const fs = require('fs').promises;
const path = require('path');
const { xai } = require('@ai-sdk/xai');
const { generateText } = require('ai');
const { getGrokKey, getGrokModel } = require('../../shared/load-credentials');

const GROK_API_KEY = getGrokKey();
const GROK_MODEL = getGrokModel();
process.env.XAI_API_KEY = GROK_API_KEY;

const DISCOVERY_DIR = path.join(__dirname, '../../../twitter-outputs/alygn/discovery');
const WORKFLOW_DIR = path.join(__dirname, '../../../twitter-outputs/alygn/workflows');

// Simple console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * TODO (Phase 2):
 * - Load latest discovery-*.json
 * - Evaluate each post with Grok:
 *   Prompt: "You are @aialygn. Is this post worth engaging with? Why? How? (reply/quote/follow)"
 * - Use web_search to verify author credibility
 * - Generate workflow JSON with approved targets
 * 
 * Key Questions for Grok:
 * 1. Is this post relevant to ALYGN's mission (AGI safety, alignment)?
 * 2. Does the author have credibility in this space?
 * 3. Would engaging increase our visibility/authority?
 * 4. What's the best engagement strategy? (reply with insight / quote with commentary / just follow)
 */

async function evaluateDiscovery(discoveryPath) {
  log('🧠 Starting decision engine...');
  
  // Load discovery data
  const discoveryData = JSON.parse(await fs.readFile(discoveryPath, 'utf-8'));
  log(`📂 Loaded ${discoveryData.discovered.length} discovered posts`);
  
  const workflow = {
    timestamp: new Date().toISOString(),
    posts: [],
    replies: [],
    profiles: []
  };
  
  // TODO: Implement Grok evaluation loop
  warn('⚠️  Phase 2 Decision Engine not yet implemented');
  warn('    Expected features:');
  warn('    - Grok evaluation per post');
  warn('    - Web search for author verification');
  warn('    - Action determination (reply/quote/follow)');
  warn('    - Output workflow JSON');
  
  return workflow;
}

/**
 * CLI Entry Point
 */
if (require.main === module) {
  (async () => {
    try {
      // Find latest discovery file
      const files = await fs.readdir(DISCOVERY_DIR);
      const discoveryFiles = files.filter(f => f.startsWith('discovery-')).sort().reverse();
      
      if (discoveryFiles.length === 0) {
        error('❌ No discovery files found. Run browser-explore.js first.');
        process.exit(1);
      }
      
      const latestDiscovery = path.join(DISCOVERY_DIR, discoveryFiles[0]);
      log(`📁 Processing: ${discoveryFiles[0]}`);
      
      const workflow = await evaluateDiscovery(latestDiscovery);
      
      // Save workflow
      const timestamp = Date.now();
      const workflowPath = path.join(WORKFLOW_DIR, `workflow-${timestamp}.json`);
      await fs.mkdir(WORKFLOW_DIR, { recursive: true });
      await fs.writeFile(workflowPath, JSON.stringify(workflow, null, 2));
      
      success(`✅ Decision complete! Workflow saved: ${workflowPath}`);
      
    } catch (err) {
      error('💥 Fatal error:', err);
      process.exit(1);
    }
  })();
}

module.exports = { evaluateDiscovery };
