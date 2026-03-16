/**
 * Campaign Approval - Local Government + Political Figure Outreach
 * 
 * Pure sub-agent script: Generates institutional emails (local governments) 
 * and personal emails (aligned political figures).
 * 
 * Tools:
 * - Grok: X/Twitter search for local government activity + politician posts
 * - Perplexity: Deep research on local government initiatives
 * - Firecrawl: Scrape official websites
 * 
 * Usage:
 *   node campaign-approval.js --region=cr --wave=1 --target-type=both
 */

import fs from "fs";
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
 * Main campaign approval function
 */
async function generateCampaignSamples(options) {
  const {
    region,
    wave,
    targetType = 'both', // 'local-government' | 'politician' | 'both'
    batchSize = 10
  } = options;
  
  console.log(`📋 Campaign Approval Generator - ${region} Wave ${wave}`);
  console.log(`   Target type: ${targetType}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Date: ${currentDate}`);
  
  // Load local governments
  const localGovernments = await loadLocalGovernments(region, wave, batchSize);
  console.log(`   Local governments loaded: ${localGovernments.length}`);
  
  const results = [];
  
  for (const lg of localGovernments) {
    try {
      console.log(`\n🏛️  Generating for: ${lg.name} (${lg.type})`);
      
      // Spawn sub-agent with mandatory Grok search
      const agentResult = await coordinator.spawnAndPoll(
        `campaign-personalizer:${region}:${wave}`,
        `Generate outreach emails for ${lg.name} in ${region} Wave ${wave}. TODAY: ${currentDate}`,
        {
          localGovernment: {
            name: lg.name,
            type: lg.type,
            xHandle: lg.x_handle,
            website: lg.website
          },
          politician: lg.politician || null,
          region,
          wave,
          currentDate,
          currentYear: 2026,
          targetType
        },
        90 // timeout seconds
      );
      
      console.log(`   ✅ Content generated`);
      
      // Save results
      results.push({
        localGovernment: lg.name,
        institutionalEmail: agentResult.institutionalEmail,
        politicalEmail: agentResult.politicalEmail || null,
        webVerification: agentResult.webVerification
      });
      
      // Save checkpoint
      checkpoint.autoSave(region, wave, {
        step: 'campaign-approval',
        lastLocalGovernment: lg.name,
        generatedCount: results.length
      });
      
    } catch (error) {
      console.error(`   ❌ Error generating for ${lg.name}:`, error.message);
      results.push({
        localGovernment: lg.name,
        error: error.message
      });
    }
  }
  
  console.log(`\n✅ Campaign generation complete: ${results.length} local governments`);
  
  // Save to file
  const outputDir = path.join(__dirname, '../../../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputFile = path.join(outputDir, `campaign-samples-${region}-wave${wave}-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    region,
    wave,
    targetType,
    total: results.length,
    results
  }, null, 2));
  
  console.log(`💾 Results saved to: ${outputFile}`);
  
  return { generated: results.length, results, outputFile };
}

/**
 * Load local governments from Supabase
 */
async function loadLocalGovernments(region, wave, limit) {
  let query = supabase
    .from('local_governments')
    .select('*')
    .eq('country', region)
    .eq('wave_number', wave)
    .order('priority_score', { ascending: false })
    .limit(limit);
  
  const { data, error } = await query;
  
  if (error) {
    console.error('❌ Failed to load local governments:', error.message);
    return [];
  }
  
  // Enrich with politician data if exists
  const enriched = [];
  for (const lg of data) {
    const politician = await loadAlignedPolitician(lg.id);
    enriched.push({ ...lg, politician });
  }
  
  return enriched;
}

/**
 * Load aligned politician for local government
 */
async function loadAlignedPolitician(localGovernmentId) {
  const { data, error } = await supabase
    .from('political_figures')
    .select('*')
    .eq('local_government_id', localGovernmentId)
    .eq('ideology_alignment', 'high')
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data;
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
  const targetType = parseArg('target-type') || 'both';
  const batchSize = parseInt(parseArg('batch-size') || '10');
  
  generateCampaignSamples({ region, wave, targetType, batchSize })
    .then(({ generated, results, outputFile }) => {
      console.log('\n📊 Detailed results saved to:', outputFile);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { generateCampaignSamples, loadLocalGovernments };
