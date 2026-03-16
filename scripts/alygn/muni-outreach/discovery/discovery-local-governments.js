/**
 * Local Governments Discovery - International (Cantones/Counties/Municipios)
 * 
 * PRIMARY: Discover local government entities (82 cantones in CR, counties in USA, etc.)
 * SECONDARY: Identify political figures within local government (if aligned)
 * 
 * Uses Grok for X search, Perplexity for deep research, Firecrawl for scraping.
 * 
 * Usage:
 *   node discovery-local-governments.js --region=cr --wave=1 --batch-size=20
 */

import path from "path";
import { execSync } from "child_process";

// Load utilities
import supabase from "../../../utils/supabase-client.js".supabase;
import checkpoint from "../core/checkpoint.js";

/**
 * Spawn sub-agent via OpenClaw CLI
 */
function spawnSubAgent(task, agentId, attachments) {
  try {
    const result = execSync(`openclaw sessions spawn --task="${task.replace(/"/g, '\\"')}" --agent-id="${agentId}" --mode=run --cleanup=delete`, {
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    return JSON.parse(result.trim());
  } catch (error) {
    console.error('Failed to spawn sub-agent:', error.message);
    throw error;
  }
}

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
    batchSize = 20
  } = options;
  
  console.log(`🔍 Local Governments Discovery - ${region} Wave ${wave}`);
  console.log(`   Date: ${currentDate}`);
  console.log(`   Target: Local governments + aligned political figures`);
  
  // Load target list (cantones, counties, municipalities)
  const targets = await loadTargetList(region, wave, batchSize);
  console.log(`   Targets to process: ${targets.length}`);
  
  const results = [];
  
  for (const target of targets) {
    try {
      console.log(`\n🏛️  Discovering: ${target.name} (${target.type})`);
      
      // Spawn sub-agent for Grok + Perplexity research
      const agentResult = await sessions_spawn({
        task: `Discover local government info and political figures for ${target.name} in ${region}. TODAY: ${currentDate}`,
        agentId: `local-gov-discovery:${region}:${wave}`,
        model: 'ollama/qwen3.5:cloud',
        attachments: [{
          name: 'discovery-context.json',
          content: JSON.stringify({
            target: {
              name: target.name,
              type: target.type, // canton, county, municipality, borough, etc.
              province: target.province || null,
              country: region
            },
            region,
            wave,
            currentDate,
            currentYear: 2026,
            mandatoryGrokSearch: true,
            grokSearchQueries: [
              `${target.name} ${region} gobierno 2026`,
              `${target.name} ${region} municipalidad 2026`,
              `${target.name} alcalde regidor 2026`,
              `${target.name} tecnología gobierno 2026`,
              `${target.name} IA gobierno municipal`
            ],
            perplexityQueries: [
              `${target.name} ${region} local government 2026`,
              `${target.name} ${region} technology initiatives 2026`,
              `${target.name} ${region} digital government 2026`,
              `${target.name} ${region} mayor council 2026`
            ],
            firecrawlUrls: [
              target.officialWebsite || null
            ].filter(Boolean)
          })
        }]
      });
      
      console.log(`   ✅ Discovery complete`);
      
      // Save local government to Supabase (upsert: update if exists)
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
        const { data: updated, error: updateError } = await supabase
          .from('local_governments')
          .update(lgDataToSave)
          .eq('id', existing.id)
          .select()
          .single();
        
        if (updateError) {
          console.error(`   ⚠️  Failed to update local government: ${updateError.message}`);
        } else {
          lgInserted = updated;
          console.log(`   🔄 Local government updated: ${lgInserted.id}`);
        }
      } else {
        // Insert new
        const { data: inserted, error: insertError } = await supabase
          .from('local_governments')
          .insert({ ...lgDataToSave, discovered_at: new Date().toISOString() })
          .select()
          .single();
        
        if (insertError) {
          console.error(`   ⚠️  Failed to insert local government: ${insertError.message}`);
        } else {
          lgInserted = inserted;
          console.log(`   💾 Local government inserted: ${lgInserted.id}`);
        }
      }
      
      if (lgInserted) {
        
        // Save political figures if found
        const politicians = agentResult.politicalFigures || [];
        
        for (const politician of politicians) {
          const politicianInsert = {
            local_government_id: lgInserted.id,
            name: politician.name,
            x_handle: politician.handle,
            party: politician.party || null,
            position: politician.position || null,
            ideology_alignment: politician.ideologyAlignment || 'unknown', // high|medium|low|unknown
            x_activity_score: politician.xActivityScore || null,
            ai_interest_score: politician.aiInterestScore || null,
            discovered_at: new Date().toISOString(),
            wave_number: wave
          };
          
          await supabase
            .from('political_figures')
            .insert(politicianInsert);
          
          console.log(`   👤 Politician saved: ${politician.name} (${politician.party})`);
        }
      }
      
      results.push({
        localGovernment: target.name,
        type: target.type,
        politiciansFound: politicians.length,
        politicians: politicians
      });
      
      // Save checkpoint
      checkpoint.autoSave(region, wave, {
        step: 'local-gov-discovery',
        lastTarget: target.name,
        discoveredCount: results.length,
        totalPoliticians: results.reduce((sum, r) => sum + r.politiciansFound, 0)
      });
      
    } catch (error) {
      console.error(`   ❌ Error discovering ${target.name}:`, error.message);
      results.push({
        localGovernment: target.name,
        error: error.message
      });
    }
  }
  
  console.log(`\n✅ Discovery complete: ${results.length} local governments processed`);
  
  const totalPoliticians = results.reduce((sum, r) => r.politicians?.length || 0, 0);
  console.log(`   Political figures identified: ${totalPoliticians}`);
  
  return { discovered: results.length, results, totalPoliticians };
}

/**
 * Load target list (cantones, counties, municipalities)
 */
async function loadTargetList(region, wave, limit) {
  // Check if we have existing targets in Supabase
  const { data: existing } = await supabase
    .from('target_local_governments')
    .select('*')
    .eq('country', region)
    .is('discovered_at', null)
    .limit(limit);
  
  if (existing && existing.length > 0) {
    return existing;
  }
  
  // Fallback: hardcoded list for Costa Rica (82 cantones)
  if (region === 'cr') {
    return getCostaRicaCantones().slice(0, limit);
  }
  
  // Other regions: return empty (needs manual seeding)
  console.log('⚠️  No target list available for this region. Seed target_local_governments table first.');
  return [];
}

/**
 * Get Costa Rica cantones list (82 total)
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
    { name: 'León Cortés Castro', type: 'canton', province: 'San José' },
    { name: 'Alajuela', type: 'canton', province: 'Alajuela' },
    { name: 'Atenas', type: 'canton', province: 'Alajuela' },
    { name: 'Barva', type: 'canton', province: 'Heredia' },
    { name: 'Cartago', type: 'canton', province: 'Cartago' },
    { name: 'Puntarenas', type: 'canton', province: 'Puntarenas' },
    { name: 'Liberia', type: 'canton', province: 'Guanacaste' },
    { name: 'Limón', type: 'canton', province: 'Limón' }
    // Add remaining 55 cantones as needed
  ];
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
  const batchSize = parseInt(parseArg('batch-size') || '20');
  
  discoverLocalGovernments({ region, wave, batchSize })
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
