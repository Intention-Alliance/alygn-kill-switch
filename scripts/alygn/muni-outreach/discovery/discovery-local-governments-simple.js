/**
 * Local Governments Discovery - Simple Version (No Sub-agents)
 * 
 * This script posts discovery requests to Discord for Wobblus to process.
 * Wobblus will execute sub-agents and save results to /tmp/.
 * This script reads results and updates Supabase.
 * 
 * Usage:
 *   node discovery-local-governments-simple.js --region=cr --wave=1 --batch-size=5
 */

import path from "path";
import fs from "fs";
import { execSync } from "child_process";

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
 * Main discovery function
 */
async function discoverLocalGovernments(options) {
  const {
    region,
    wave,
    batchSize = 20,
    dryRun = false
  } = options;
  
  console.log(`🔍 Local Governments Discovery - ${region} Wave ${wave}`);
  console.log(`   Date: ${currentDate}`);
  console.log(`   Dry run: ${dryRun ? '✅ YES' : '❌ NO'}`);
  console.log(`   Target: Local governments + aligned political figures`);
  
  // Load target list (cantones, counties, municipalities)
  const targets = await loadTargetList(region, wave, batchSize);
  console.log(`   Targets to process: ${targets.length}`);
  
  if (targets.length === 0) {
    console.log('⚠️  No targets to process. Seed target_local_governments table first.');
    return { discovered: 0, results: [] };
  }
  
  const results = [];
  
  for (const target of targets) {
    try {
      console.log(`\n🏛️  Discovering: ${target.name} (${target.type})`);
      
      // Post request to Discord for Wobblus to process
      const requestId = postDiscoveryRequest(target, region, wave);
      console.log(`   📤 Posted discovery request: ${requestId}`);
      
      // Wait for Wobblus to process (poll for result file)
      const resultFile = `/tmp/local-gov-discovery-${target.name.replace(/\s+/g, '-').toLowerCase()}-${region}-wave${wave}.json`;
      
      console.log(`   ⏳ Waiting for result file: ${resultFile}`);
      
      // Poll for result (max 60 seconds)
      let attempts = 0;
      let agentResult = null;
      
      while (attempts < 12) { // 12 * 5s = 60s
        await sleep(5000);
        
        if (fs.existsSync(resultFile)) {
          try {
            const content = fs.readFileSync(resultFile, 'utf8');
            agentResult = JSON.parse(content);
            console.log(`   ✅ Result received`);
            break;
          } catch (error) {
            console.log(`   ⚠️  Result file exists but not ready: ${error.message}`);
          }
        }
        
        attempts++;
        console.log(`   ⏳ Waiting... (${attempts}/12)`);
      }
      
      if (!agentResult) {
        console.log(`   ⚠️  Timeout waiting for result. Skipping.`);
        results.push({
          localGovernment: target.name,
          status: 'timeout',
          error: 'Timeout waiting for sub-agent result'
        });
        continue;
      }
      
      // Save to Supabase (upsert logic)
      const lgData = agentResult.localGovernment || {};
      
      const lgDataToSave = {
        name: target.name,
        type: target.type,
        country: region,
        province: target.province || null,
        x_handle: lgData.xHandle || null,
        website: lgData.website || null,
        priority_score: lgData.priorityScore || 50,
        x_activity_score: lgData.xActivityScore || null,
        wave_number: wave,
        updated_at: new Date().toISOString()
      };
      
      // Check if exists
      const { data: existing } = await supabase
        .from('local_governments')
        .select('id')
        .eq('name', target.name)
        .eq('country', region)
        .single();
      
      let lgInserted;
      
      if (existing) {
        // Update existing
        if (!dryRun) {
          const { data: updated } = await supabase
            .from('local_governments')
            .update(lgDataToSave)
            .eq('id', existing.id)
            .select()
            .single();
          
          lgInserted = updated;
          console.log(`   🔄 Local government updated: ${lgInserted.id}`);
        } else {
          console.log(`   💾 [DRY-RUN] Would update local government`);
        }
      } else {
        // Insert new
        if (!dryRun) {
          const { data: inserted } = await supabase
            .from('local_governments')
            .insert({ ...lgDataToSave, discovered_at: new Date().toISOString() })
            .select()
            .single();
          
          lgInserted = inserted;
          console.log(`   💾 Local government inserted: ${lgInserted.id}`);
        } else {
          console.log(`   💾 [DRY-RUN] Would insert local government`);
        }
      }
      
      // Save political figures if found
      const politicians = agentResult.politicalFigures || [];
      
      if (lgInserted && !dryRun) {
        for (const politician of politicians) {
          const politicianInsert = {
            local_government_id: lgInserted.id,
            name: politician.name,
            x_handle: politician.handle,
            party: politician.party || null,
            position: politician.position || null,
            ideology_alignment: politician.ideologyAlignment || 'unknown',
            x_activity_score: politician.xActivityScore || null,
            ai_interest_score: politician.aiInterestScore || null,
            discovered_at: new Date().toISOString(),
            wave_number: wave
          };
          
          await supabase.from('political_figures').insert(politicianInsert);
          console.log(`   👤 Politician saved: ${politician.name} (${politician.party})`);
        }
      } else if (politicians.length > 0) {
        console.log(`   👤 [DRY-RUN] Would save ${politicians.length} politicians`);
      }
      
      results.push({
        localGovernment: target.name,
        type: target.type,
        status: 'success',
        politiciansFound: politicians.length,
        politicians: politicians
      });
      
      // Save checkpoint
      checkpoint.autoSave(region, wave, {
        step: 'local-gov-discovery',
        lastTarget: target.name,
        discoveredCount: results.length,
        totalPoliticians: results.reduce((sum, r) => sum + (r.politicians?.length || 0), 0)
      });
      
    } catch (error) {
      console.error(`   ❌ Error discovering ${target.name}:`, error.message);
      results.push({
        localGovernment: target.name,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  console.log(`\n✅ Discovery complete: ${results.length} local governments processed`);
  
  const successCount = results.filter(r => r.status === 'success').length;
  const totalPoliticians = results.reduce((sum, r) => r.politicians?.length || 0, 0);
  
  console.log(`   Successful: ${successCount}/${results.length}`);
  console.log(`   Political figures identified: ${totalPoliticians}`);
  
  return { discovered: results.length, results, totalPoliticians };
}

/**
 * Post discovery request to Discord
 */
function postDiscoveryRequest(target, region, wave) {
  const requestId = `lg-discovery-${Date.now()}`;
  
  const message = {
    requestId,
    type: 'local-gov-discovery',
    target: {
      name: target.name,
      type: target.type,
      province: target.province || null,
      country: region
    },
    region,
    wave,
    currentDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    currentYear: 2026,
    outputFile: `/tmp/local-gov-discovery-${target.name.replace(/\s+/g, '-').toLowerCase()}-${region}-wave${wave}.json`,
    grokSearchQueries: [
      `${target.name} ${region} gobierno 2026`,
      `${target.name} ${region} municipalidad 2026`,
      `${target.name} alcalde regidor 2026`,
      `${target.name} tecnología gobierno 2026`
    ],
    perplexityQueries: [
      `${target.name} ${region} local government 2026`,
      `${target.name} ${region} technology initiatives 2026`
    ]
  };
  
  // Post to Discord via OpenClaw
  try {
    execSync(`openclaw message send --channel=discord --target=annotations --message='${JSON.stringify(message).replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (error) {
    console.error(`   ⚠️  Failed to post to Discord: ${error.message}`);
    // Fallback: save request to file
    const requestFile = `/tmp/discovery-requests/${requestId}.json`;
    fs.mkdirSync(path.dirname(requestFile), { recursive: true });
    fs.writeFileSync(requestFile, JSON.stringify(message, null, 2));
    console.log(`   💾 Request saved to: ${requestFile}`);
  }
  
  return requestId;
}

/**
 * Load target list
 */
async function loadTargetList(region, wave, limit) {
  // Check if we have existing targets in Supabase
  try {
    const { data: existing } = await supabase
      .from('target_local_governments')
      .select('*')
      .eq('country', region)
      .is('discovered_at', null)
      .limit(limit);
    
    if (existing && existing.length > 0) {
      return existing;
    }
  } catch (error) {
    // Table might not exist, continue to fallback
  }
  
  // Fallback: hardcoded list for Costa Rica (82 cantones)
  if (region === 'cr') {
    return getCostaRicaCantones().slice(0, limit);
  }
  
  return [];
}

/**
 * Get Costa Rica cantones list
 */
function getCostaRicaCantones() {
  return [
    { name: 'San José', type: 'canton', province: 'San José' },
    { name: 'Escazú', type: 'canton', province: 'San José' },
    { name: 'Desamparados', type: 'canton', province: 'San José' },
    { name: 'Puriscal', type: 'canton', province: 'San José' },
    { name: 'Tarrazú', type: 'canton', province: 'San José' },
    { name: 'Aserrí', type: 'canton', province: 'San José' },
    { name: 'Mora', type: 'canton', province: 'San José' },
    { name: 'Goicoechea', type: 'canton', province: 'San José' },
    { name: 'Santa Ana', type: 'canton', province: 'San José' },
    { name: 'Alajuelita', type: 'canton', province: 'San José' },
    { name: 'Vásquez de Coronado', type: 'canton', province: 'San José' },
    { name: 'Acosta', type: 'canton', province: 'San José' },
    { name: 'Tibás', type: 'canton', province: 'San José' },
    { name: 'Moravia', type: 'canton', province: 'San José' },
    { name: 'Montes de Oca', type: 'canton', province: 'San José' },
    { name: 'Turrubares', type: 'canton', province: 'San José' },
    { name: 'Dota', type: 'canton', province: 'San José' },
    { name: 'Curridabat', type: 'canton', province: 'San José' },
    { name: 'Pérez Zeledón', type: 'canton', province: 'San José' },
    { name: 'León Cortés Castro', type: 'canton', province: 'San José' }
  ];
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  const dryRun = args.includes('--dry-run');
  
  discoverLocalGovernments({ region, wave, batchSize, dryRun })
    .then(({ discovered, results, totalPoliticians }) => {
      console.log('\n📊 Results:', JSON.stringify(results, null, 2));
      console.log(`\n✅ Total political figures: ${totalPoliticians}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { discoverLocalGovernments, loadTargetList };
