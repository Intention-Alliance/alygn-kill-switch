/**
 * X Warmup Tracker - Warmth Scoring with Grok Verification
 * 
 * Hybrid script: Deterministic scoring + Grok sub-agent for X activity verification.
 * 
 * Tools:
 * - Grok API: X/Twitter activity search
 * - Supabase: Engagement data storage
 * 
 * Usage:
 *   node x-warmup-tracker.js --region=cr --wave=1 --batch-size=10
 */

import path from "path";
import coordinator from "../utils/sub-agent-coordinator.js";

// Load utilities
import supabase from "../../../utils/supabase-client.js".supabase;
import checkpoint from "../core/checkpoint.js";

// Current date for context
const currentDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

/**
 * Main tracking function
 */
async function trackWarmth(options) {
  const {
    region,
    wave,
    batchSize = 10,
    dryRun = false
  } = options;
  
  console.log(`🔍 X Warmup Tracker - ${region} Wave ${wave}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Dry run: ${dryRun ? '✅ YES (no changes)' : '❌ NO (will update)'}`);
  console.log(`   Date: ${currentDate}`);
  
  // Load municipalities ready for warmth tracking
  const { data: municipalities, error } = await supabase
    .from('municipalities')
    .select('*')
    .eq('wave_number', wave)
    .eq('country', region)
    .not('x_handle', 'is', null)
    .not('x_warmup_phase1_at', 'is', null)
    .is('x_warmup_phase2_at', null)
    .order('priority_score', { ascending: false })
    .limit(batchSize);
  
  if (error) {
    console.error('❌ Failed to load municipalities:', error.message);
    return { tracked: 0, results: [] };
  }
  
  console.log(`   Municipalities to track: ${municipalities.length}`);
  
  if (municipalities.length === 0) {
    console.log('⚠️  No municipalities ready for warmth tracking');
    return { tracked: 0, results: [] };
  }
  
  const results = [];
  
  for (const muni of municipalities) {
    try {
      console.log(`\n📍 Tracking: ${muni.name} (@${muni.x_handle})`);
      
      // Step 1: Load engagement data from Supabase (deterministic)
      const { data: engagements } = await supabase
        .from('x_engagements')
        .select('*')
        .eq('municipality_id', muni.id)
        .order('engaged_at', { ascending: false });
      
      const engagementData = engagements || [];
      console.log(`   Engagements found: ${engagementData.length}`);
      
      // Step 2: Calculate base score (deterministic)
      const baseScore = calculateBaseScore(engagementData);
      console.log(`   Base score: ${baseScore}`);
      
      // Step 3: Spawn sub-agent for Grok-based X activity verification
      console.log('   🤖 Spawning warmth analyst agent with Grok search...');
      
      const agentResult = await coordinator.spawnAndPoll(
        `warmth-analyst:${region}:${wave}`,
        `Assess X/Twitter warmth for ${muni.name} (@${muni.x_handle}) in ${region} Wave ${wave}. TODAY: ${currentDate}`,
        {
          municipality: muni.name,
          xHandle: muni.x_handle,
          engagements: engagementData,
          baseScore,
          region,
          wave,
          currentDate,
          currentYear: 2026
        },
        60 // timeout seconds
      );
      
      console.log(`   ✅ Agent assessment complete`);
      
      // Step 4: Combine scores
      const warmthAdjustment = agentResult.warmthAdjustment || 0;
      const finalScore = Math.min(100, Math.max(0, baseScore + warmthAdjustment));
      
      console.log(`   Adjustment: ${warmthAdjustment > 0 ? '+' : ''}${warmthAdjustment}`);
      console.log(`   Final score: ${finalScore}`);
      
      // Step 5: Update Supabase (or skip if dry-run)
      const readyForEmail = finalScore >= 70;
      
      if (dryRun) {
        console.log(`   💾 [DRY-RUN] Would update Supabase: ${readyForEmail ? '✅ Ready for email' : '⏳ Needs more warming'}`);
      } else {
        await supabase
          .from('municipalities')
          .update({
            x_warmup_phase2_at: readyForEmail ? new Date().toISOString() : null,
            x_engagement_count: engagementData.length,
            x_last_engagement_at: new Date().toISOString(),
            x_warmth_score: finalScore,
            x_ready_for_email: readyForEmail
          })
          .eq('id', muni.id);
        
        console.log(`   💾 Updated Supabase: ${readyForEmail ? '✅ Ready for email' : '⏳ Needs more warming'}`);
      }
      
      results.push({
        municipality: muni.name,
        xHandle: muni.x_handle,
        baseScore,
        warmthAdjustment,
        finalScore,
        readyForEmail,
        webVerification: agentResult.webVerification
      });
      
      // Save checkpoint
      checkpoint.autoSave(region, wave, {
        step: 'warmth-tracking',
        lastMunicipality: muni.name,
        trackedCount: results.length
      });
      
    } catch (error) {
      console.error(`   ❌ Error tracking ${muni.name}:`, error.message);
      results.push({
        municipality: muni.name,
        xHandle: muni.x_handle,
        error: error.message
      });
    }
  }
  
  console.log(`\n✅ Warmth tracking complete: ${results.length} municipalities`);
  
  const readyCount = results.filter(r => r.readyForEmail).length;
  console.log(`   Ready for email: ${readyCount}/${results.length}`);
  
  return { tracked: results.length, results };
}

/**
 * Calculate base warmth score (deterministic)
 */
function calculateBaseScore(engagements) {
  if (engagements.length === 0) return 0;
  
  let score = 0;
  
  // Engagement type weights
  const weights = {
    follow: 5,
    like: 2,
    reply: 10,
    quote: 15,
    retweet: 8
  };
  
  // Time decay (recent engagements worth more)
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  engagements.forEach(eng => {
    const engagedAt = new Date(eng.engaged_at).getTime();
    const daysAgo = (now - engagedAt) / oneDay;
    
    // Time decay multiplier
    const timeMultiplier = daysAgo < 1 ? 1.0 :
                          daysAgo < 3 ? 0.8 :
                          daysAgo < 7 ? 0.6 :
                          daysAgo < 14 ? 0.4 : 0.2;
    
    // Base weight
    const weight = weights[eng.engagement_type] || 1;
    
    // Add to score
    score += weight * timeMultiplier;
  });
  
  // Normalize to 0-100 scale
  const normalizedScore = Math.min(100, Math.floor(score * 2));
  
  return normalizedScore;
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
  const batchSize = parseInt(parseArg('batch-size') || '10');
  const dryRun = args.includes('--dry-run');
  
  trackWarmth({ region, wave, batchSize, dryRun })
    .then(({ tracked, results }) => {
      console.log('\n📊 Results:', JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { trackWarmth, calculateBaseScore };
