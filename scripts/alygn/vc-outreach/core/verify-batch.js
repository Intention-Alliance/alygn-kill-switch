
/**
 * Phase 2: Batch Verification & Incremental Update Strategy
 * 
 * Goal: Verify research success by working in batches of 5 VCs
 * 
 * Strategy:
 * 1. Fetch all VCs from Notion
 * 2. Check last_edited_time to find VCs NOT yet researched
 * 3. Verify VCs that WERE researched (have data)
 * 4. Report: Complete / Partial / Need-Research
 * 5. Schedule next batch via cron
 * 
 * Workflow:
 * - Iteration 1: Research VCs 1-5
 * - Iteration 2 (later): Research VCs 6-10
 * - Iteration 3 (later): Research VCs 11-15
 * - Continue until all researched
 * 
 * Verification:
 * - Check if last_edited_time is recent (within 24h)
 * - Check if data fields are populated (Email, Summary, Pain Points)
 * - Use timestamps to avoid re-researching already-done VCs
 */

import fs from "fs";
import path from "path";
import { getClient, queryDatabase } from "../../../shared/notion-client.js";

const notion = getClient();
const DB_ID = '305334874af681ef983df57c7f70de33';
const BATCH_SIZE = 5;
const HOURS_AGO_THRESHOLD = 24; // Consider "researched" if edited in last 24h

/**
 * Fetch all VCs with metadata
 */
async function fetchAllVCs() {
  try {
    const response = await queryDatabase(notion, DB_ID, { page_size: 100 });
    
    return response.results.map(vc => ({
      id: vc.id,
      name: vc.properties.Name?.title?.[0]?.text?.content,
      email: vc.properties.Email?.email,
      summary: vc.properties.Summary?.rich_text?.map(r => r.text.content).join(''),
      pain_points: vc.properties['Pain Points']?.rich_text?.map(r => r.text.content).join(''),
      last_edited: vc.last_edited_time,
      status: vc.properties['Draft Status']?.select?.name
    }));
  } catch (error) {
    console.error('❌ Failed to fetch VCs:', error.message);
    throw error;
  }
}

/**
 * Check if VC was recently updated (researched)
 */
function isRecentlyEdited(lastEdited, hoursAgo = HOURS_AGO_THRESHOLD) {
  const editTime = new Date(lastEdited);
  const thresholdTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return editTime > thresholdTime;
}

/**
 * Classify VCs by research status
 */
function classifyVCs(vcs) {
  const now = new Date();
  
  const classification = {
    researched: [],      // Has email + summary + pain points + recently edited
    partial: [],         // Has some data but not all
    not_researched: [],  // Has only name, no research data
    needs_retry: []      // Has data but old (24h+ ago)
  };
  
  for (const vc of vcs) {
    if (!vc.name) continue; // Skip invalid entries
    
    const hasEmail = !!vc.email;
    const hasSummary = vc.summary && vc.summary.length > 0;
    const hasPainPoints = vc.pain_points && vc.pain_points.length > 0;
    const isRecent = isRecentlyEdited(vc.last_edited);
    
    // Classify
    if (hasEmail && hasSummary && hasPainPoints && isRecent) {
      classification.researched.push({
        name: vc.name,
        last_edited: vc.last_edited,
        email: vc.email
      });
    } else if ((hasEmail || hasSummary || hasPainPoints) && !isRecent) {
      classification.needs_retry.push({
        name: vc.name,
        last_edited: vc.last_edited,
        missing: [
          !hasEmail ? 'email' : null,
          !hasSummary ? 'summary' : null,
          !hasPainPoints ? 'pain points' : null
        ].filter(Boolean)
      });
    } else if (hasEmail || hasSummary || hasPainPoints) {
      classification.partial.push({
        name: vc.name,
        has: [
          hasEmail ? 'email' : null,
          hasSummary ? 'summary' : null,
          hasPainPoints ? 'pain points' : null
        ].filter(Boolean)
      });
    } else {
      classification.not_researched.push({
        name: vc.name,
        last_edited: vc.last_edited
      });
    }
  }
  
  return classification;
}

/**
 * Identify next batch to research
 */
function getNextBatch(vcs, batchSize = BATCH_SIZE) {
  const unresearched = vcs.filter(vc => 
    !vc.email || !vc.summary || !vc.pain_points
  );
  
  return unresearched.slice(0, batchSize);
}

/**
 * Generate batch report
 */
async function generateBatchReport() {
  console.log('\n📊 Phase 2: Batch Verification Report\n');
  
  const vcs = await fetchAllVCs();
  const classified = classifyVCs(vcs);
  
  // Summary
  console.log('📈 Research Status:');
  console.log(`   ✅ Researched (complete & recent): ${classified.researched.length}`);
  console.log(`   ⚠️  Partial (incomplete data): ${classified.partial.length}`);
  console.log(`   ❌ Not researched: ${classified.not_researched.length}`);
  console.log(`   🔄 Needs retry (old data): ${classified.needs_retry.length}`);
  console.log(`   📊 Total: ${vcs.length}\n`);
  
  // Completion rate
  const completeRate = (classified.researched.length / vcs.length * 100).toFixed(1);
  console.log(`🎯 Completion Rate: ${completeRate}%\n`);
  
  // List researched VCs
  if (classified.researched.length > 0) {
    console.log('✅ Researched VCs:');
    classified.researched.slice(0, 5).forEach(vc => {
      console.log(`   ${vc.name} (${new Date(vc.last_edited).toLocaleString()})`);
    });
    if (classified.researched.length > 5) {
      console.log(`   ... and ${classified.researched.length - 5} more`);
    }
  }
  
  // Identify next batch
  const nextBatch = getNextBatch(vcs, BATCH_SIZE);
  if (nextBatch.length > 0) {
    console.log(`\n📝 Next Batch (${nextBatch.length} VCs):`);
    nextBatch.forEach(vc => {
      console.log(`   ${vc.name}`);
    });
  } else {
    console.log('\n🎉 All VCs researched!');
  }
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    batch_size: BATCH_SIZE,
    summary: {
      total: vcs.length,
      researched: classified.researched.length,
      partial: classified.partial.length,
      not_researched: classified.not_researched.length,
      needs_retry: classified.needs_retry.length,
      completion_rate: parseFloat(completeRate)
    },
    next_batch: nextBatch.map(vc => vc.name),
    classified: classified
  };
  
  const reportPath = path.join(__dirname, 'data', `batch-report-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n💾 Report saved: ${reportPath}\n`);
  
  return report;
}

/**
 * Check if ready for Phase 3
 */
function checkPhase3Readiness(report) {
  const threshold = 0.8; // 80% complete
  const rate = report.summary.completion_rate / 100;
  
  console.log('🚀 Phase 3 Readiness:');
  if (rate >= threshold) {
    console.log(`   ✅ READY (${report.summary.completion_rate}% > ${threshold * 100}%)`);
    return true;
  } else {
    console.log(`   ❌ NOT READY (${report.summary.completion_rate}% < ${threshold * 100}%)`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const report = await generateBatchReport();
    const isReady = checkPhase3Readiness(report);
    
    process.exit(isReady ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
