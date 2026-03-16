/**
 * Test Pipeline - Session 1 + Session 2 Dry-Run
 * 
 * Executes complete pipeline for Costa Rica with --dry-run flag.
 * Tests all scripts end-to-end without making actual changes.
 * 
 * Pipeline:
 * 1. Discovery (local governments + politicians)
 * 2. X Warmup Tracking
 * 3. Campaign Approval (email generation)
 * 4. Compliance Check
 * 
 * Usage:
 *   node test-pipeline.js --region=cr --wave=1 --dry-run
 *   node test-pipeline.js --region=cr --wave=1 --live (makes actual changes)
 */

import path from "path";
import fs from "fs";

// Import scripts
import discoverLocalGovernments from "./discovery/discovery-local-governments-simple.js".discoverLocalGovernments;
import trackWarmth from "./engagement/x-warmup-tracker.js".trackWarmth;
import generateCampaignSamples from "./outreach/campaign-approval.js".generateCampaignSamples;
import checkCompliance from "./core/muni-compliance.js".checkCompliance;
import checkpoint from "./core/checkpoint.js";

// Current date
const currentDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

/**
 * Main test pipeline function
 */
async function runPipeline(options) {
  const {
    region,
    wave,
    dryRun = true,
    batchSize = 5
  } = options;
  
  console.log('='.repeat(80));
  console.log('🧪 ALYGN Municipal Outreach - Test Pipeline');
  console.log('='.repeat(80));
  console.log(`   Region: ${region}`);
  console.log(`   Wave: ${wave}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Dry run: ${dryRun ? '✅ YES (no changes)' : '❌ NO (live)'}`);
  console.log(`   Date: ${currentDate}`);
  console.log('='.repeat(80));
  
  const results = {
    startTime: new Date().toISOString(),
    steps: []
  };
  
  // Step 1: Discovery
  console.log('\n' + '='.repeat(80));
  console.log('STEP 1: Discovery (Local Governments + Politicians)');
  console.log('='.repeat(80));
  
  try {
    const discoveryResult = await discoverLocalGovernments({
      region,
      wave,
      batchSize
    });
    
    results.steps.push({
      name: 'discovery',
      status: 'success',
      result: discoveryResult
    });
    
    console.log(`\n✅ Discovery complete: ${discoveryResult.discovered} local governments`);
    console.log(`   Political figures found: ${discoveryResult.totalPoliticians}`);
    
  } catch (error) {
    console.error(`❌ Discovery failed: ${error.message}`);
    results.steps.push({
      name: 'discovery',
      status: 'failed',
      error: error.message
    });
    
    if (!options.continueOnError) {
      console.log('⚠️  Stopping pipeline due to error');
      return results;
    }
  }
  
  // Step 2: X Warmup Tracking
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2: X Warmup Tracking');
  console.log('='.repeat(80));
  
  try {
    const warmupResult = await trackWarmth({
      region,
      wave,
      batchSize,
      dryRun
    });
    
    results.steps.push({
      name: 'x-warmup',
      status: 'success',
      result: warmupResult
    });
    
    console.log(`\n✅ X warmup complete: ${warmupResult.tracked} municipalities`);
    
    const readyCount = warmupResult.results.filter(r => r.readyForEmail).length;
    console.log(`   Ready for email: ${readyCount}/${warmupResult.tracked}`);
    
  } catch (error) {
    console.error(`❌ X warmup failed: ${error.message}`);
    results.steps.push({
      name: 'x-warmup',
      status: 'failed',
      error: error.message
    });
    
    if (!options.continueOnError) {
      console.log('⚠️  Stopping pipeline due to error');
      return results;
    }
  }
  
  // Step 3: Campaign Approval (Email Generation)
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3: Campaign Approval (Email Generation)');
  console.log('='.repeat(80));
  
  try {
    const campaignResult = await generateCampaignSamples({
      region,
      wave,
      targetType: 'both',
      batchSize,
      dryRun
    });
    
    results.steps.push({
      name: 'campaign-approval',
      status: 'success',
      result: campaignResult
    });
    
    console.log(`\n✅ Campaign samples generated: ${campaignResult.generated}`);
    console.log(`   Output file: ${campaignResult.outputFile}`);
    
    // Use this file for compliance check
    options.campaignOutput = campaignResult.outputFile;
    
  } catch (error) {
    console.error(`❌ Campaign approval failed: ${error.message}`);
    results.steps.push({
      name: 'campaign-approval',
      status: 'failed',
      error: error.message
    });
    
    if (!options.continueOnError) {
      console.log('⚠️  Stopping pipeline due to error');
      return results;
    }
  }
  
  // Step 4: Compliance Check
  if (options.campaignOutput) {
    console.log('\n' + '='.repeat(80));
    console.log('STEP 4: Compliance Check');
    console.log('='.repeat(80));
    
    try {
      const complianceResult = await checkCompliance({
        region,
        wave,
        input: options.campaignOutput,
        dryRun
      });
      
      results.steps.push({
        name: 'compliance',
        status: 'success',
        result: complianceResult
      });
      
      console.log(`\n✅ Compliance check complete: ${complianceResult.checked} emails`);
      console.log(`   Approved: ${complianceResult.results.filter(r => r.overallPass).length}/${complianceResult.checked}`);
      
    } catch (error) {
      console.error(`❌ Compliance check failed: ${error.message}`);
      results.steps.push({
        name: 'compliance',
        status: 'failed',
        error: error.message
      });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 PIPELINE SUMMARY');
  console.log('='.repeat(80));
  
  results.endTime = new Date().toISOString();
  results.successCount = results.steps.filter(s => s.status === 'success').length;
  results.failureCount = results.steps.filter(s => s.status === 'failed').length;
  
  console.log(`   Total steps: ${results.steps.length}`);
  console.log(`   Successful: ${results.successCount}`);
  console.log(`   Failed: ${results.failureCount}`);
  console.log(`   Dry run: ${dryRun ? '✅ YES' : '❌ NO'}`);
  
  // Save summary
  const summaryFile = path.join(__dirname, `../../output/pipeline-test-${region}-wave${wave}-${Date.now()}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2));
  
  console.log(`\n💾 Summary saved to: ${summaryFile}`);
  console.log('\n' + '='.repeat(80));
  
  if (dryRun) {
    console.log('✅ DRY-RUN COMPLETE - No changes were made to Supabase');
    console.log('   To run live: node test-pipeline.js --region=cr --wave=1 --live');
  } else {
    console.log('✅ LIVE RUN COMPLETE - Changes have been made to Supabase');
  }
  
  console.log('='.repeat(80));
  
  return results;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };
  
  const region = parseArg('region') || 'cr';
  const wave = parseInt(parseArg('wave') || '1');
  const batchSize = parseInt(parseArg('batch-size') || '5');
  const dryRun = !args.includes('--live');
  const continueOnError = args.includes('--continue-on-error');
  
  console.log(`\n🚀 Starting pipeline test...`);
  
  runPipeline({ region, wave, batchSize, dryRun, continueOnError })
    .then(results => {
      console.log('\n✅ Pipeline test complete');
      process.exit(results.failureCount > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { runPipeline };
