#!/usr/bin/env node
/**
 * Check Tomorrow's Wave for Already-Sent VCs
 */

import fs from 'fs';
import path from 'path';

const SENT_DIR = '/home/andlersrv/.openclaw/workspace/reports/alygn/vc-sent';
const WAVE_FILE = '/home/andlersrv/.openclaw/workspace/reports/alygn/vc-waves/2026-04-28.json';

// Load all sent VCs
const sentVCs = new Set();
const sentFiles = fs.readdirSync(SENT_DIR).filter(f => f.endsWith('.json'));

sentFiles.forEach(file => {
  const filePath = path.join(SENT_DIR, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.data?.entities) {
      data.data.entities.forEach(entity => {
        if (entity.name) {
          sentVCs.add(entity.name.toLowerCase());
        }
      });
    }
  } catch (e) {
    console.error(`Failed to load ${file}: ${e.message}`);
  }
});

console.log(`📊 Total sent VCs: ${sentVCs.size}\n`);

// Load tomorrow's wave
const waveData = JSON.parse(fs.readFileSync(WAVE_FILE, 'utf8'));
const waveEntities = waveData.data.entities;

console.log(`📋 Tomorrow's wave: ${waveEntities.length} VCs\n`);

// Find duplicates
const duplicates = [];
const clean = [];

waveEntities.forEach(entity => {
  const normalizedName = entity.name.toLowerCase();
  if (sentVCs.has(normalizedName)) {
    duplicates.push(entity);
  } else {
    clean.push(entity);
  }
});

console.log(`⚠️ DUPLICATES FOUND: ${duplicates.length}\n`);

if (duplicates.length > 0) {
  console.log('Already sent (REMOVE from wave):\n');
  duplicates.forEach((vc, i) => {
    console.log(`  ${i + 1}. ${vc.name} (${vc.email || 'no email'})`);
  });
}

console.log(`\n✅ Clean VCs: ${clean.length}\n`);

if (clean.length > 0) {
  console.log('Safe to contact:\n');
  clean.slice(0, 10).forEach((vc, i) => {
    console.log(`  ${i + 1}. ${vc.name} (${vc.email || 'no email'})`);
  });
  if (clean.length > 10) {
    console.log(`  ... and ${clean.length - 10} more`);
  }
}

// Save results
fs.writeFileSync('/tmp/vc-duplicate-check.json', JSON.stringify({
  duplicates: duplicates.map(v => v.name),
  clean: clean.map(v => v.name),
  totalSent: sentVCs.size,
  totalWave: waveEntities.length
}, null, 2));

console.log('\n📄 Results saved to: /tmp/vc-duplicate-check.json');
