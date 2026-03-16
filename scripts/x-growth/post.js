/**
 * Post Script - Posts content to X/Twitter via API
 * Supports posts, replies, and quotes
 * 
 * Usage:
 *   node post.js --project=myproject --workflow=/path/to/content.json --mock
 */

import fs from "fs";

import { loadProject } from "./load-project.js";

/**
 * Posts content to X/Twitter
 * @param {Object} config - Project configuration
 * @param {Object} workflow - Workflow with posts, replies, quotes
 * @param {boolean} mock - Use mock mode (don't actually post)
 * @returns {Promise<Object>} Results of posting
 */
async function postContent(config, workflow, mock = false) {
  console.log(`📮 Posting content for ${config.name}...`);
  
  const results = {
    posts: [],
    replies: [],
    quotes: [],
    errors: [],
    metadata: {
      posted_at: new Date().toISOString(),
      project: config.name,
      mock
    }
  };
  
  if (mock) {
    console.log('⚠️  Mock mode enabled - simulating posts');
    return simulatePosting(config, workflow);
  }
  
  // In production, would use X API v2
  // For now, return mock results
  console.log('⚠️  X API posting not implemented - using mock mode');
  return simulatePosting(config, workflow);
}

/**
 * Simulates posting (mock mode)
 */
function simulatePosting(config, workflow) {
  const results = {
    posts: [],
    replies: [],
    quotes: [],
    metadata: {
      posted_at: new Date().toISOString(),
      project: config.name,
      mock: true
    }
  };
  
  // Simulate posts
  if (workflow.posts) {
    workflow.posts.forEach((post, index) => {
      results.posts.push({
        id: `mock-post-${index + 1}`,
        content: post.content,
        status: 'posted (mock)',
        url: `https://x.com/${config.twitter.handle}/status/mock${index + 1}`
      });
    });
    console.log(`✅ Posted ${workflow.posts.length} tweets (mock)`);
  }
  
  // Simulate replies
  if (workflow.replies) {
    workflow.replies.forEach((reply, index) => {
      results.replies.push({
        id: `mock-reply-${index + 1}`,
        content: reply.content,
        targetUrl: reply.targetUrl,
        status: 'replied (mock)'
      });
    });
    console.log(`✅ Replied to ${workflow.replies.length} tweets (mock)`);
  }
  
  // Simulate quotes
  if (workflow.quotes) {
    workflow.quotes.forEach((quote, index) => {
      results.quotes.push({
        id: `mock-quote-${index + 1}`,
        content: quote.content,
        targetUrl: quote.targetUrl,
        status: 'quoted (mock)'
      });
    });
    console.log(`✅ Quoted ${workflow.quotes.length} tweets (mock)`);
  }
  
  return results;
}

/**
 * Saves results to file
 */
function saveResults(results, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  return results;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const projectArg = args.find(a => a.startsWith('--project='));
  const workflowArg = args.find(a => a.startsWith('--workflow='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const mockArg = args.includes('--mock');
  
  if (!projectArg || !workflowArg) {
    console.error('Usage: node post.js --project=name --workflow=/path/to/content.json [--output=results.json] [--mock]');
    process.exit(1);
  }
  
  const projectName = projectArg.split('=')[1];
  const workflowFile = workflowArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : `/tmp/x-growth-${projectName}-results.json`;
  
  try {
    const config = loadProject(projectName);
    const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
    
    postContent(config, workflow, mockArg)
      .then(results => {
        saveResults(results, outputFile);
        
        console.log('\n📊 Posting Summary:');
        console.log(`   Posts: ${results.posts.length}`);
        console.log(`   Replies: ${results.replies.length}`);
        console.log(`   Quotes: ${results.quotes.length}`);
        console.log(`   Mode: ${results.metadata.mock ? 'MOCK' : 'LIVE'}`);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export {
  postContent,
  simulatePosting
};
