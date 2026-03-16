/**
 * Test Pipeline - Live Data (No Production Send)
 * 
 * Executes complete pipeline with REAL Supabase inserts.
 * Returns ALL content that would be posted/sent (for review).
 * Does NOT actually send to X or email (production safety).
 * 
 * Pipeline:
 * 1. Discovery → Inserts into Supabase
 * 2. X Warmup → Inserts engagements into Supabase
 * 3. Campaign Approval → Generates emails (saved, not sent)
 * 4. Compliance Check → Validates emails
 * 5. Content Preview → Shows what would be posted/sent
 * 
 * Usage:
 *   node test-pipeline-live.js --region=cr --wave=1 --batch-size=5
 */

import path from "path";
import fs from "fs";

// Import scripts
import discoverLocalGovernments from "./discovery/discovery-local-governments-simple.js".discoverLocalGovernments;
import trackWarmth from "./engagement/x-warmup-tracker.js".trackWarmth;
import generateCampaignSamples from "./outreach/campaign-approval.js".generateCampaignSamples;
import checkCompliance from "./core/muni-compliance.js".checkCompliance;
import checkpoint from "./core/checkpoint.js";
import supabase from "../../utils/supabase-client.js".supabase;

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
    batchSize = 5,
    seedTargets = true
  } = options;
  
  console.log('='.repeat(80));
  console.log('🧪 ALYGN Municipal Outreach - LIVE TEST PIPELINE');
  console.log('='.repeat(80));
  console.log(`   Region: ${region}`);
  console.log(`   Wave: ${wave}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Supabase: ✅ LIVE (real inserts)`);
  console.log(`   Production: ❌ SAFE (no real sends)`);
  console.log(`   Date: ${currentDate}`);
  console.log('='.repeat(80));
  
  const results = {
    startTime: new Date().toISOString(),
    steps: [],
    contentPreview: {
      xPosts: [],
      emails: []
    }
  };
  
  // Step 0: Seed target local governments if needed
  if (seedTargets) {
    console.log('\n' + '='.repeat(80));
    console.log('STEP 0: Seed Target Local Governments');
    console.log('='.repeat(80));
    
    await seedTargetLocalGovernments(region, batchSize);
  }
  
  // Step 1: Discovery
  console.log('\n' + '='.repeat(80));
  console.log('STEP 1: Discovery (Local Governments + Politicians)');
  console.log('='.repeat(80));
  
  try {
    const discoveryResult = await discoverLocalGovernments({
      region,
      wave,
      batchSize,
      dryRun: false // LIVE inserts
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
      dryRun: false // LIVE inserts
    });
    
    results.steps.push({
      name: 'x-warmup',
      status: 'success',
      result: warmupResult
    });
    
    console.log(`\n✅ X warmup complete: ${warmupResult.tracked} municipalities`);
    
    const readyCount = warmupResult.results?.filter(r => r.readyForEmail).length || 0;
    console.log(`   Ready for email: ${readyCount}/${warmupResult.tracked}`);
    
    // Collect X posts that would be made
    if (warmupResult.results) {
      warmupResult.results.forEach(r => {
        if (r.xHandle) {
          results.contentPreview.xPosts.push({
            type: 'engagement',
            target: r.municipality || r.localGovernment,
            handle: r.xHandle,
            action: r.readyForEmail ? 'reply/follow' : 'like',
            warmthScore: r.finalScore
          });
        }
      });
    }
    
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
      dryRun: false // Generate and save (don't send)
    });
    
    results.steps.push({
      name: 'campaign-approval',
      status: 'success',
      result: campaignResult
    });
    
    console.log(`\n✅ Campaign samples generated: ${campaignResult.generated}`);
    console.log(`   Output file: ${campaignResult.outputFile}`);
    
    // Collect emails for preview
    if (campaignResult.results) {
      campaignResult.results.forEach(r => {
        if (r.institutionalEmail) {
          results.contentPreview.emails.push({
            type: 'institutional',
            target: r.localGovernment,
            subject: r.institutionalEmail.subject,
            body: r.institutionalEmail.body,
            wordCount: r.institutionalEmail.wordCount
          });
        }
        if (r.politicalEmail) {
          results.contentPreview.emails.push({
            type: 'political',
            target: r.politician?.name || 'Unknown',
            party: r.politician?.party,
            subject: r.politicalEmail.subject,
            body: r.politicalEmail.body,
            wordCount: r.politicalEmail.wordCount
          });
        }
      });
    }
    
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
  if (options.campaignOutput && fs.existsSync(options.campaignOutput)) {
    console.log('\n' + '='.repeat(80));
    console.log('STEP 4: Compliance Check');
    console.log('='.repeat(80));
    
    try {
      const complianceResult = await checkCompliance({
        region,
        wave,
        input: options.campaignOutput,
        dryRun: false // Save results
      });
      
      results.steps.push({
        name: 'compliance',
        status: 'success',
        result: complianceResult
      });
      
      console.log(`\n✅ Compliance check complete: ${complianceResult.checked} emails`);
      console.log(`   Approved: ${complianceResult.results?.filter(r => r.overallPass).length || 0}/${complianceResult.checked}`);
      
      // Mark approved emails as ready to send
      if (complianceResult.results) {
        complianceResult.results.forEach(r => {
          const email = results.contentPreview.emails.find(e => e.target === r.municipality);
          if (email) {
            email.complianceStatus = r.overallPass ? 'approved' : 'needs_revision';
            email.issues = r.issues || [];
          }
        });
      }
      
    } catch (error) {
      console.error(`❌ Compliance check failed: ${error.message}`);
      results.steps.push({
        name: 'compliance',
        status: 'failed',
        error: error.message
      });
    }
  }
  
  // Step 5: Content Preview
  console.log('\n' + '='.repeat(80));
  console.log('📋 STEP 5: CONTENT PREVIEW (What Would Be Sent)');
  console.log('='.repeat(80));
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`   X engagements ready: ${results.contentPreview.xPosts.length}`);
  console.log(`   Emails generated: ${results.contentPreview.emails.length}`);
  console.log(`   Emails approved: ${results.contentPreview.emails.filter(e => e.complianceStatus === 'approved').length}`);
  
  // Preview X posts
  if (results.contentPreview.xPosts.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('🐦 X/TWITTER ENGAGEMENTS:');
    console.log('-'.repeat(80));
    
    results.contentPreview.xPosts.forEach((post, i) => {
      console.log(`\n[${i + 1}] ${post.type.toUpperCase()}`);
      console.log(`   Target: ${post.target}`);
      console.log(`   Handle: @${post.handle}`);
      console.log(`   Action: ${post.action}`);
      console.log(`   Warmth Score: ${post.warmthScore}/100`);
    });
  }
  
  // Preview emails
  if (results.contentPreview.emails.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('📧 EMAILS READY TO SEND:');
    console.log('-'.repeat(80));
    
    results.contentPreview.emails.forEach((email, i) => {
      console.log(`\n[${i + 1}] ${email.type.toUpperCase()} - ${email.target}`);
      console.log(`   Subject: ${email.subject}`);
      console.log(`   Word count: ${email.wordCount}`);
      console.log(`   Status: ${email.complianceStatus || 'pending'}`);
      console.log(`   Body preview:`);
      console.log(`   ${email.body.substring(0, 200)}${email.body.length > 200 ? '...' : ''}`);
      
      if (email.issues && email.issues.length > 0) {
        console.log(`   Issues: ${email.issues.join(', ')}`);
      }
    });
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
  console.log(`   Supabase: ✅ LIVE inserts`);
  console.log(`   Production: ❌ SAFE (no sends)`);
  
  // Save summary
  const summaryFile = path.join(__dirname, `../../output/pipeline-live-${region}-wave${wave}-${Date.now()}.json`);
  const outputDir = path.dirname(summaryFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2));
  
  console.log(`\n💾 Summary saved to: ${summaryFile}`);
  console.log(`\n📁 Content preview saved for review`);
  console.log('='.repeat(80));
  console.log('✅ LIVE TEST COMPLETE - Data inserted into Supabase, no production sends');
  console.log('='.repeat(80));
  
  return results;
}

/**
 * Seed target local governments
 */
async function seedTargetLocalGovernments(region, batchSize) {
  // Costa Rica cantones
  const cantones = [
    { name: 'San José', type: 'canton', province: 'San José', priority: 95 },
    { name: 'Escazú', type: 'canton', province: 'San José', priority: 90 },
    { name: 'Desamparados', type: 'canton', province: 'San José', priority: 85 },
    { name: 'Santa Ana', type: 'canton', province: 'San José', priority: 90 },
    { name: 'Curridabat', type: 'canton', province: 'San José', priority: 85 },
    { name: 'Goicoechea', type: 'canton', province: 'San José', priority: 85 },
    { name: 'Moravia', type: 'canton', province: 'San José', priority: 75 },
    { name: 'Montes de Oca', type: 'canton', province: 'San José', priority: 85 },
    { name: 'Tibás', type: 'canton', province: 'San José', priority: 80 },
    { name: 'Alajuelita', type: 'canton', province: 'San José', priority: 80 }
  ];
  
  const toSeed = cantones.slice(0, batchSize);
  
  for (const canton of toSeed) {
    try {
      // Check if exists first
      const { data: existing } = await supabase
        .from('target_local_governments')
        .select('id')
        .eq('name', canton.name)
        .eq('country', region)
        .single();
      
      if (existing) {
        console.log(`   ℹ️  Already exists: ${canton.name}`);
        continue;
      }
      
      // Insert new
      const { data, error } = await supabase
        .from('target_local_governments')
        .insert({
          name: canton.name,
          type: canton.type,
          country: region,
          province: canton.province,
          priority: canton.priority,
          wave_number: 1
        });
      
      if (error) {
        console.log(`   ⚠️  ${canton.name}: ${error.message}`);
      } else {
        console.log(`   ✅ Seeded: ${canton.name} (${canton.province})`);
      }
    } catch (error) {
      console.log(`   ⚠️  ${canton.name}: ${error.message}`);
    }
  }
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
  const continueOnError = args.includes('--continue-on-error');
  const noSeed = args.includes('--no-seed');
  
  console.log(`\n🚀 Starting live pipeline test...`);
  
  runPipeline({ region, wave, batchSize, seedTargets: !noSeed, continueOnError })
    .then(results => {
      console.log('\n✅ Pipeline test complete');
      console.log('\n📝 NEXT STEPS:');
      console.log('   1. Review content preview above');
      console.log('   2. Check Supabase for inserted data');
      console.log('   3. If ready for production, run actual send scripts');
      process.exit(results.failureCount > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { runPipeline };
