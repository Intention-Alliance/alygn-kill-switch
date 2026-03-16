/**
 * Sub-Agent Coordinator - Post requests to Discord and poll for results
 * 
 * This utility handles the coordination between scripts and Wobblus sub-agents.
 * 
 * Pattern:
 * 1. Script posts request to Discord (or saves to /tmp)
 * 2. Wobblus processes with sub-agents
 * 3. Wobblus saves result to /tmp/[request-id].json
 * 4. Script polls for result file
 * 5. Script reads and processes result
 * 
 * Usage:
 *   import coordinator from "./utils/sub-agent-coordinator.js";
 *   const result = await coordinator.spawnAndPoll('warmth-analyst:cr:1', task, context);
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * Spawn sub-agent via Discord message or file
 */
function postSubAgentRequest(agentId, task, context, outputFile) {
  const requestId = `${agentId.replace(/:/g, '-')}-${Date.now()}`;
  
  const request = {
    requestId,
    agentId,
    task,
    context,
    outputFile,
    timestamp: new Date().toISOString()
  };
  
  // Try Discord first
  try {
    const message = `
🤖 **Sub-Agent Request**

**Agent:** ${agentId}
**Task:** ${task.substring(0, 100)}...
**Output:** ${outputFile}
**Context:** ${JSON.stringify(context).substring(0, 200)}...

Please process and save result to: ${outputFile}
`.trim();
    
    execSync(`openclaw message send --channel=discord --target=annotations --message='${message.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    console.log(`   📤 Posted to Discord: ${requestId}`);
  } catch (error) {
    // Fallback: save to file
    const requestFile = `/tmp/sub-agent-requests/${requestId}.json`;
    fs.mkdirSync(path.dirname(requestFile), { recursive: true });
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    console.log(`   💾 Request saved to: ${requestFile}`);
  }
  
  return { requestId, outputFile };
}

/**
 * Poll for result file
 */
async function pollForResult(outputFile, timeoutSeconds = 60) {
  const maxAttempts = Math.floor(timeoutSeconds / 5); // Poll every 5 seconds
  let attempts = 0;
  
  console.log(`   ⏳ Waiting for result: ${outputFile}`);
  
  while (attempts < maxAttempts) {
    await sleep(5000);
    
    if (fs.existsSync(outputFile)) {
      try {
        const content = fs.readFileSync(outputFile, 'utf8');
        const result = JSON.parse(content);
        console.log(`   ✅ Result received (${attempts + 1} attempts)`);
        return result;
      } catch (error) {
        console.log(`   ⚠️  File exists but not ready: ${error.message}`);
      }
    }
    
    attempts++;
    console.log(`   ⏳ Waiting... (${attempts}/${maxAttempts})`);
  }
  
  throw new Error(`Timeout waiting for result after ${timeoutSeconds}s`);
}

/**
 * Spawn sub-agent and poll for result
 */
async function spawnAndPoll(agentId, task, context, timeoutSeconds = 60) {
  const outputFile = `/tmp/sub-agent-results/${agentId.replace(/:/g, '-')}-${Date.now()}.json`;
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  
  const { requestId } = postSubAgentRequest(agentId, task, context, outputFile);
  const result = await pollForResult(outputFile, timeoutSeconds);
  
  return result;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  postSubAgentRequest,
  pollForResult,
  spawnAndPoll,
  sleep
};
