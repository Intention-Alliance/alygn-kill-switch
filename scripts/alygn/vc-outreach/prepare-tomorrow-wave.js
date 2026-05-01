#!/usr/bin/env node
/**
 * Prepare Tomorrow's Wave from Researched VCs
 * 
 * Takes the 95 researched VCs from cache and creates tomorrow's wave file
 * following the alygn-outreach skill wave format.
 */

import fs from 'fs';
import path from 'path';

const CACHE_DIR = '/tmp/vc-research-cache';
const WAVE_DIR = '/home/andlersrv/.openclaw/workspace/reports/alygn/vc-waves';
const TOMORROW_DATE = '2026-04-28'; // Tomorrow

function loadCacheFiles() {
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  const vcs = [];
  
  files.forEach(file => {
    const filePath = path.join(CACHE_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      // Cache files have data at root level OR under research key
      const research = data.research || (data.name ? data : null);
      if (research && research.name) {
        vcs.push(research);
      }
    } catch (e) {
      console.error(`Failed to load ${file}: ${e.message}`);
    }
  });
  
  console.log(`Loaded ${vcs.length} VCs from cache`);
  return vcs;
}

function createWaveEntity(vc, index) {
  // Generate entity ID in the format used by alygn-outreach skill
  const entityId = `entity-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  
  return {
    id: entityId,
    type: 'vc',
    name: vc.name,
    email: vc.emails || vc.email || null,
    website: vc.website || null,
    phone: null,
    location: {
      city: null,
      state: null,
      country: 'US',
      region: null
    },
    status: 'researched',
    priority: vc.governanceSignal === 'Strong' ? 'high' : 'medium',
    discoveredAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    outreachCount: 0,
    researchNotes: vc.thesis || vc.painPoints || '',
    personalizationContext: {
      painPoints: vc.painPoints ? [vc.painPoints] : [],
      tailoredHook: vc.governanceSignals || '',
      recentNews: vc.thesis || ''
    },
    typeData: {
      firmType: 'vc',
      stageFocus: [],
      sectorFocus: ['AI safety', 'AI governance'],
      checkSizeMin: null,
      checkSizeMax: null,
      portfolioCompanies: [],
      investmentThesis: vc.thesis || '',
      partners: vc.partners || []
    },
    metadata: {
      governanceSignal: vc.governanceSignal || 'Unknown',
      researchSources: ['web_search', 'web_fetch'],
      cached: true
    }
  };
}

function createWaveFile(entities) {
  return {
    timestamp: new Date().toISOString(),
    type: 'vc',
    phase: 'researched',
    data: {
      count: entities.length,
      entities: entities
    },
    metadata: {
      source: 'deep-research-batch-1-4',
      totalResearched: 95,
      batchDate: '2026-04-27',
      note: '95 VCs researched with emails + pain points. Ready for morning personalization.'
    }
  };
}

function updateWaveState(waveFile) {
  const statePath = path.join(WAVE_DIR, 'wave-state.json');
  let state = {};
  
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    console.log('Creating new wave state...');
  }
  
  state.tomorrowWave = {
    date: TOMORROW_DATE,
    entities: waveFile.data.entities.map(e => e.id),
    status: 'researched',
    nextPhase: 'personalize',
    note: `Evening research completed. ${waveFile.data.count} VCs researched with emails + pain points. Ready for morning personalization.`
  };
  
  state.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`Updated wave-state.json`);
}

async function main() {
  console.log('🔧 Preparing tomorrow\'s VC wave...\n');
  
  // Load cache files
  const vcs = loadCacheFiles();
  
  if (vcs.length === 0) {
    console.error('❌ No VCs found in cache!');
    process.exit(1);
  }
  
  // Create wave entities (limit to 20 for tomorrow's wave - rate limit)
  const entities = vcs.slice(0, 20).map((vc, i) => createWaveEntity(vc, i));
  
  console.log(`Created ${entities.length} wave entities\n`);
  
  // Create wave file
  const waveFile = createWaveFile(entities);
  const wavePath = path.join(WAVE_DIR, `${TOMORROW_DATE}.json`);
  
  fs.writeFileSync(wavePath, JSON.stringify(waveFile, null, 2));
  console.log(`✅ Wave file created: ${wavePath}`);
  
  // Update wave state
  updateWaveState(waveFile);
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`  - Total VCs in cache: ${vcs.length}`);
  console.log(`  - VCs in tomorrow's wave: ${entities.length}`);
  console.log(`  - Wave file: ${wavePath}`);
  console.log(`  - Ready for: Morning personalization at 09:00 CST\n`);
  
  // List top priority VCs
  console.log('🎯 Top Priority VCs in wave:');
  entities.slice(0, 5).forEach((vc, i) => {
    console.log(`  ${i + 1}. ${vc.name} (${vc.priority}) - ${vc.email || 'no email'}`);
  });
}

main().catch(console.error);
