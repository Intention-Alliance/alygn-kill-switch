#!/usr/bin/env node
/**
 * Fix Tomorrow's Wave - Remove Duplicates
 */

import fs from 'fs';
import path from 'path';

const WAVE_FILE = '/home/andlersrv/.openclaw/workspace/reports/alygn/vc-waves/2026-04-28.json';
const CACHE_DIR = '/tmp/vc-research-cache';
const DUPLICATES = ['AI Safety Ventures', 'Air Street Capital'];

// Load tomorrow's wave
const waveData = JSON.parse(fs.readFileSync(WAVE_FILE, 'utf8'));

// Remove duplicates
const filteredEntities = waveData.data.entities.filter(entity => {
  const isDuplicate = DUPLICATES.some(dup => 
    entity.name.toLowerCase().includes(dup.toLowerCase())
  );
  return !isDuplicate;
});

console.log(`Removed ${waveData.data.entities.length - filteredEntities.length} duplicates`);

// Load remaining cache files to fill the wave
const cacheFiles = fs.readdirSync(CACHE_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
      return data.research || (data.name ? data : null);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

// Find VCs not already in the wave
const existingNames = new Set(filteredEntities.map(e => e.name.toLowerCase()));
const newCandidates = cacheFiles.filter(vc => 
  !existingNames.has(vc.name.toLowerCase()) &&
  !DUPLICATES.some(d => vc.name.toLowerCase().includes(d.toLowerCase()))
);

console.log(`Found ${newCandidates.length} new candidates in cache`);

// Add up to 2 replacements to maintain 20 VC wave
const replacements = newCandidates.slice(0, 2);

replacements.forEach(vc => {
  const entityId = `entity-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  filteredEntities.push({
    id: entityId,
    type: 'vc',
    name: vc.name,
    email: vc.emails || vc.email || null,
    website: vc.website || null,
    phone: null,
    location: { city: null, state: null, country: 'US', region: null },
    status: 'researched',
    priority: 'medium',
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
  });
  console.log(`  + Added: ${vc.name}`);
});

// Update wave data
waveData.data.entities = filteredEntities;
waveData.data.count = filteredEntities.length;
waveData.metadata.note = `Fixed: Removed ${DUPLICATES.length} duplicates (AI Safety Ventures, Air Street Capital). Added ${replacements.length} replacements from cache.`;
waveData.timestamp = new Date().toISOString();

// Save fixed wave
fs.writeFileSync(WAVE_FILE, JSON.stringify(waveData, null, 2));

// Update wave state
const statePath = '/home/andlersrv/.openclaw/workspace/reports/alygn/vc-waves/wave-state.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.tomorrowWave.entities = filteredEntities.map(e => e.id);
state.tomorrowWave.note = `Fixed: Removed duplicates. ${filteredEntities.length} VCs ready for morning personalization.`;
state.lastUpdated = new Date().toISOString();
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

console.log(`\n✅ Wave fixed: ${filteredEntities.length} VCs ready for tomorrow`);
console.log(`\n📄 Wave file: ${WAVE_FILE}`);
