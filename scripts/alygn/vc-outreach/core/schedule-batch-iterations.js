
/**
 * Cron Job Orchestrator for Batch VC Research Iterations
 * 
 * Purpose: Schedule and coordinate iterative batches of 5 VCs
 * 
 * Workflow:
 * 1. Every 4 hours, check which VCs need research
 * 2. Identify next batch of 5 unresearched VCs
 * 3. Post research request to Discord
 * 4. Wait for results via file coordination
 * 5. Verify and update Notion
 * 6. Next iteration picks up where we left off
 * 
 * Why 4 hours?
 * - Gives enough time to research + verify 5 VCs
 * - Doesn't overload the system
 * - Daily = 6 iterations = 30 VCs/day
 * 
 * Key Features:
 * - Only processes VCs that haven't been researched yet
 * - Uses last_edited_time to avoid re-researching
 * - Incremental updates (5 VCs at a time)
 * - Automatic progression (no manual intervention)
 * - Reports completion status each iteration
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { getClient, queryDatabase } from "../../../shared/notion-client.js";

const execAsync = promisify(exec);

const notion = getClient();
const DB_ID = '30533487-4af6-81e7-ad64-000bbd4829ff';
const BATCH_SIZE = 5;
const RESEARCH_TIMEOUT_MS = 30000; // 30 seconds per VC

/**
 * Get VCs needing research
 */
async function getUnresearchedVCs() {
  try {
    const response = await queryDatabase(notion, DB_ID, { page_size: 100 });
    
    return response.results
      .filter(vc => {
        const hasEmail = !!vc.properties.Email?.email;
        const hasSummary = (vc.properties.Summary?.rich_text?.length || 0) > 0;
        const hasPainPoints = (vc.properties['Pain Points']?.rich_text?.length || 0) > 0;
        
        // Return VCs missing any of these fields
        return !hasEmail || !hasSummary || !hasPainPoints;
      })
      .map(vc => ({
        id: vc.id,
        name: vc.properties.Name?.title?.[0]?.text?.content,
        last_edited: vc.last_edited_time
      }))
      .sort((a, b) => new Date(a.last_edited) - new Date(b.last_edited)); // Oldest first
  } catch (error) {
    console.error('❌ Failed to fetch VCs:', error.message);
    throw error;
  }
}

/**
 * Post research request to Discord
 */
async function postResearchRequest(batch, iteration) {
  const vcList = batch.map(vc => `• ${vc.name}`).join('\n');
  
  const message = `
🔬 **Phase 2: Batch Research - Iteration ${iteration}**

Starting research for ${batch.length} VCs:
${vcList}

This iteration will take ~${batch.length * 6} minutes to complete.
Next batch scheduled after verification.

Status: 🔄 In Progress
  `;
  
  console.log(message);
  
  // Post to Discord #annotations or #alygn
  try {
    // TODO: Integrate with Discord message API
    // For now, just log the request
  } catch (error) {
    console.error('Failed to post to Discord:', error.message);
  }
}

/**
 * Run batch iteration
 */
async function runBatchIteration(iteration) {
  console.log(`\n⏱️  Starting Iteration ${iteration} at ${new Date().toLocaleString()}\n`);
  
  // Get unresearched VCs
  const unresearched = await getUnresearchedVCs();
  
  if (unresearched.length === 0) {
    console.log('✅ All VCs researched! No more batches needed.');
    return { complete: true, iteration, batchCount: 0 };
  }
  
  // Take batch
  const batch = unresearched.slice(0, BATCH_SIZE);
  console.log(`📊 Found ${unresearched.length} unresearched VCs`);
  console.log(`📝 Processing batch of ${batch.length}:\n`);
  
  // Post request
  await postResearchRequest(batch, iteration);
  
  // Wait for results (file coordination)
  console.log('⏳ Waiting for research results...');
  
  // In real implementation:
  // 1. I see Discord message
  // 2. I spawn sub-agents for each VC
  // 3. Sub-agents save to /tmp/vc-research-[name].json
  // 4. Script detects files and updates Notion
  
  // For now, simulate waiting
  await new Promise(resolve => setTimeout(resolve, RESEARCH_TIMEOUT_MS));
  
  // Check for results
  const resultsFound = batch.filter(vc => {
    const resultPath = path.join(__dirname, 'data', `vc-research-${vc.name}.json`);
    return fs.existsSync(resultPath);
  });
  
  console.log(`\n✅ Iteration ${iteration} processed ${resultsFound.length}/${batch.length} VCs`);
  
  return {
    iteration,
    batchSize: batch.length,
    resultsFound: resultsFound.length,
    nextIteration: resultsFound.length > 0 ? iteration + 1 : null
  };
}

/**
 * Schedule periodic iterations
 */
function scheduleIterations() {
  console.log('📅 Setting up batch iteration schedule:\n');
  console.log('Every 4 hours:');
  console.log('  - Check for unresearched VCs');
  console.log('  - Take batch of 5');
  console.log('  - Post to Discord');
  console.log('  - Verify results');
  console.log('  - Update Notion');
  console.log('  - Schedule next batch\n');
  
  console.log('To set up cron job:');
  console.log('  crontab -e');
  console.log('  # Add: 0 */4 * * * /usr/bin/node /path/to/schedule-batch-iterations.js run\n');
  
  console.log('Or use OpenClaw cron:');
  console.log('  cron add --schedule "0 */4 * * *" --task "Phase 2 Batch Research"');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === 'run') {
    // Running as cron job
    const iterationNumber = parseInt(process.env.ITERATION || '1');
    try {
      const result = await runBatchIteration(iterationNumber);
      if (result.complete) {
        console.log('\n✅ All research complete!');
        process.exit(0);
      } else if (result.nextIteration) {
        process.exit(0); // Success, next iteration will run via cron
      } else {
        process.exit(1); // Error
      }
    } catch (error) {
      console.error('\n❌ Batch iteration failed:', error.message);
      process.exit(1);
    }
  } else {
    // Show schedule info
    scheduleIterations();
  }
}

main();
