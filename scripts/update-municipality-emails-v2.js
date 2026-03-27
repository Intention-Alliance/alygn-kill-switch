/**
 * Update Supabase municipalities table with scraped email data
 * Only updates existing columns (mayor_email, general_email)
 * New columns (planning_email, it_email, x_handle) need to be added via SQL first
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Supabase configuration
const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function updateMunicipalities() {
  console.log('🚀 Updating Supabase municipalities with scraped email data...\n');
  console.log('⚠️  Note: Only updating mayor_email and general_email columns');
  console.log('   planning_email, it_email, and x_handle columns need to be added via SQL first\n');
  
  // Load the scraped data
  const dataPath = join('$HOME/.openclaw/workspace/scripts', 'municipality-emails-data.json');
  const rawData = readFileSync(dataPath, 'utf-8');
  const { municipalities } = JSON.parse(rawData);
  
  console.log(`📊 Loaded ${municipalities.length} municipalities from scraped data\n`);
  
  // Get current municipalities from Supabase
  const { data: currentMunicipalities, error: fetchError } = await supabase
    .from('municipalities')
    .select('id, name, province, mayor_email, general_email');
  
  if (fetchError) {
    console.error('❌ Failed to fetch current municipalities:', fetchError.message);
    return;
  }
  
  console.log(`📊 Found ${currentMunicipalities.length} municipalities in Supabase\n`);
  
  // Statistics
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const updatedMunicipalities = [];
  const missingMayorEmail = [];
  
  // Update each municipality
  for (const muni of municipalities) {
    // Find matching municipality in Supabase
    const match = currentMunicipalities.find(cm => 
      cm.name.toLowerCase() === muni.name.toLowerCase() &&
      cm.province.toLowerCase() === muni.province.toLowerCase()
    );
    
    if (!match) {
      console.log(`⚠️  No match found for: ${muni.name} (${muni.province})`);
      skipped++;
      continue;
    }
    
    // Prepare update data (only existing columns)
    const updateData = {};
    
    if (muni.mayor_email) updateData.mayor_email = muni.mayor_email;
    if (muni.general_email) updateData.general_email = muni.general_email;
    
    // Only update if we have at least one email
    if (Object.keys(updateData).length === 0) {
      console.log(`⚠️  No email data for: ${muni.name}`);
      skipped++;
      if (!muni.mayor_email) missingMayorEmail.push(muni);
      continue;
    }
    
    updateData.updated_at = new Date().toISOString();
    
    // Update Supabase
    const { error: updateError } = await supabase
      .from('municipalities')
      .update(updateData)
      .eq('id', match.id);
    
    if (updateError) {
      console.error(`❌ Failed to update ${muni.name}:`, updateError.message);
      failed++;
    } else {
      console.log(`✅ Updated: ${muni.name}`);
      console.log(`   Mayor: ${muni.mayor_email || 'N/A'}`);
      console.log(`   General: ${muni.general_email || 'N/A'}`);
      updated++;
      updatedMunicipalities.push(muni);
      
      if (!muni.mayor_email) {
        missingMayorEmail.push(muni);
      }
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 UPDATE SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully updated: ${updated}`);
  console.log(`⚠️  Skipped (no match/no data): ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\n📧 Email Statistics:`);
  console.log(`   Mayor emails: ${municipalities.filter(m => m.mayor_email).length}/${municipalities.length}`);
  console.log(`   Planning emails: ${municipalities.filter(m => m.planning_email).length}/${municipalities.length} (not yet added to DB)`);
  console.log(`   IT emails: ${municipalities.filter(m => m.it_email).length}/${municipalities.length} (not yet added to DB)`);
  console.log(`   General emails: ${municipalities.filter(m => m.general_email).length}/${municipalities.length}`);
  
  console.log(`\n⚠️  Cantones missing mayor email: ${missingMayorEmail.length}`);
  missingMayorEmail.forEach(m => console.log(`   - ${m.name} (${m.province})`));
  
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Add new columns via Supabase SQL Editor:');
  console.log('   ALTER TABLE municipalities');
  console.log('   ADD COLUMN IF NOT EXISTS planning_email TEXT,');
  console.log('   ADD COLUMN IF NOT EXISTS it_email TEXT,');
  console.log('   ADD COLUMN IF NOT EXISTS x_handle TEXT;');
  console.log('2. Re-run this script to update all columns');
  
  console.log('\n✨ Update complete!');
}

updateMunicipalities().catch(console.error);
