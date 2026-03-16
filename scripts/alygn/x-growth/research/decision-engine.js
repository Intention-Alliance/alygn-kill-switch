
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
 * 2. Filter AI-related posts (keywords.length > 0)
 * 3. For each post:
 *    a. Run Grok prompt: "Is this worth engaging?"
 *    b. If yes: determine action (reply/quote/follow)
 *    c. Use web_search to verify author credibility
 * 4. Generate workflow JSON with posts/replies/profiles
 */

import fs from "fs".promises;
import path from "path";
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { getGrokKey, getGrokModel } from "../../../shared/load-credentials.js";

const GROK_API_KEY = getGrokKey();
const GROK_MODEL = getGrokModel();
process.env.XAI_API_KEY = GROK_API_KEY;

const WORKSPACE = path.join(__dirname, '../../../../');
const DISCOVERY_DIR = path.join(WORKSPACE, 'twitter-outputs/alygn/discovery');
const WORKFLOW_DIR = path.join(WORKSPACE, 'twitter-outputs/alygn/workflows');

// Simple console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * Grok evaluation: Should we engage with this post?
 */
async function evaluatePost(post) {
  const prompt = `You are @aialygn, ALYGN's official account.

ALYGN is an independent AI governance institution focused on coordination, legitimacy, and preparedness for advanced AI systems at global scale.

**Core principles:**
- Governance-first, not technology-first
- Institutional restraint and neutrality
- Coordination infrastructure, not control
- Pre-crisis preparation, not reactive regulation

**Tone:** Calm, institutional, restrained, non-promotional

Evaluate this post and decide if we should engage:

**Post by ${post.author} (${post.authorName})**
Content: "${post.content}"
Engagement: ${post.engagement.likes} likes, ${post.engagement.retweets} retweets, ${post.engagement.views} views
Keywords: ${post.keywords.join(', ')}
URL: ${post.url}

**Questions:**
1. Is this post relevant to AI governance, coordination, or institutional legitimacy?
2. Would engaging add governance perspective (not just technical commentary)?
3. Does this align with institutional restraint (avoid hype, claims, promotional language)?
4. What's the best engagement strategy?
   - Reply with institutional commentary
   - Quote with governance perspective
   - Just follow the author
   - Skip (not governance-relevant or too promotional)

**Preferred language:**
- "Supports coordination" / "Enables accountability"
- "Neutral infrastructure" / "Independent review"

**Avoid:**
- "Ensures compliance" / "Regulates" / "Controls"
- Hype, numbers, promotional language
- Claims about what ALYGN "will" do

**Output JSON format:**
{
  "engage": true/false,
  "reason": "...",
  "strategy": "reply" | "quote" | "follow" | "skip",
  "reply_content": "..." (if strategy=reply, keep calm/institutional tone),
  "quote_content": "..." (if strategy=quote, governance perspective only)
}

Be highly selective. Only engage if it genuinely adds governance perspective and maintains institutional credibility.`;

  try {
    const { text } = await generateText({
      model: xai(GROK_MODEL),
      prompt: prompt,
      temperature: 0.7
    });
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { engage: false, reason: 'Failed to parse Grok response', strategy: 'skip' };
  } catch (err) {
    error('Grok evaluation failed:', err.message);
    return { engage: false, reason: err.message, strategy: 'skip' };
  }
}

/**
 * Main decision engine workflow
 */
async function evaluateDiscovery(discoveryPath) {
  log('🧠 Starting decision engine...');
  
  // Load discovery data
  const discoveryData = JSON.parse(await fs.readFile(discoveryPath, 'utf-8'));
  log(`📂 Loaded ${discoveryData.discovered.length} discovered posts`);
  
  // Filter AI-related posts only
  const aiPosts = discoveryData.discovered.filter(p => p.keywords.length > 0);
  log(`🎯 Filtered to ${aiPosts.length} AI-related posts`);
  
  const workflow = {
    timestamp: new Date().toISOString(),
    posts: [],
    replies: [],
    profiles: []
  };
  
  // Evaluate each AI-related post
  for (const post of aiPosts) {
    log(`\n📊 Evaluating: ${post.author} - ${post.content.substring(0, 60)}...`);
    
    const evaluation = await evaluatePost(post);
    
    if (!evaluation.engage) {
      warn(`  ⏭️  Skip: ${evaluation.reason}`);
      continue;
    }
    
    success(`  ✅ Engage: ${evaluation.strategy} - ${evaluation.reason}`);
    
    // Add to workflow based on strategy
    if (evaluation.strategy === 'reply' && evaluation.reply_content) {
      workflow.replies.push({
        id: workflow.replies.length + 1,
        targetHandle: post.author,
        targetUrl: post.url,
        content: evaluation.reply_content,
        mention: '@aialygn'
      });
    } else if (evaluation.strategy === 'quote' && evaluation.quote_content) {
      workflow.posts.push({
        id: workflow.posts.length + 1,
        content: evaluation.quote_content,
        quoteTweetId: post.postId
      });
    } else if (evaluation.strategy === 'follow') {
      if (!workflow.profiles.includes(post.author)) {
        workflow.profiles.push(post.author);
      }
    }
  }
  
  success(`\n✅ Decision complete! ${workflow.replies.length} replies, ${workflow.posts.length} quotes, ${workflow.profiles.length} follows`);
  
  return workflow;
}

/**
 * CLI Entry Point
 */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
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
      
      success(`✅ Workflow saved: ${workflowPath}`);
      
      // Print summary
      console.log('\n📋 Workflow Summary:');
      console.log(`  Posts: ${workflow.posts.length}`);
      console.log(`  Replies: ${workflow.replies.length}`);
      console.log(`  Profiles to follow: ${workflow.profiles.length}`);
      
      if (workflow.replies.length > 0) {
        console.log('\n📝 Replies:');
        workflow.replies.forEach(r => {
          console.log(`  ${r.id}. ${r.targetHandle}: ${r.content.substring(0, 80)}...`);
        });
      }
      
    } catch (err) {
      error('💥 Fatal error:', err);
      process.exit(1);
    }
  })();
}

export { evaluateDiscovery, evaluatePost };
