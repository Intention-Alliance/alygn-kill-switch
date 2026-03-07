#!/usr/bin/env node

/**
 * Supabase Sync Script - Real Database Operations
 * 
 * Syncs municipal outreach data to Supabase database
 * 
 * Usage:
 *   node supabase-sync.js --input=/tmp/muni-personalized.json [--dry-run]
 * 
 * Features:
 * - Upsert municipalities (avoid duplicates)
 * - Track X warmup timestamps
 * - Store email verification results
 * - Log outreach emails sent
 * - Calculate priority scores automatically
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'postgres://postgres:xjMYgXdLg9nDQTKk@aws-pool:5432/postgres';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

// Console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');
const warn = (msg) => console.warn(`⚠️  ${msg}`);

/**
 * Initialize Supabase client
 */
function createSupabaseClient() {
  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_KEY environment variable is required');
  }
  
  // For PostgreSQL connection string format
  if (SUPABASE_URL.startsWith('postgres://')) {
    // Use direct PostgreSQL connection (for local/dev)
    // In production, use proper Supabase URL format
    const url = new URL(SUPABASE_URL);
    const supabaseUrl = `https://${url.hostname.split('.')[0]}.supabase.co`;
    return createClient(supabaseUrl, SUPABASE_KEY);
  }
  
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Upsert municipality data
 */
async function upsertMunicipality(supabase, muni) {
  const data = {
    name: muni.name,
    country: muni.country,
    region: muni.province || muni.region,
    population: muni.population,
    website_url: muni.website,
    mayor_name: muni.contacts?.mayor_name,
    mayor_email: muni.contacts?.mayor_email,
    council_emails: muni.contacts?.council_emails,
    general_email: muni.contacts?.general_email,
    x_handle: muni.x_handle?.replace('@', ''),
    
    // X warmup tracking
    x_warmup_phase1_at: muni.x_warmup_phase1_at,
    x_warmup_phase2_at: muni.x_warmup_phase2_at,
    x_engagement_count: muni.x_engagement_count,
    
    // Research data
    pain_points: muni.pain_points,
    ai_governance_signals: muni.ai_governance_signals ? JSON.stringify(muni.ai_governance_signals) : null,
    
    // Email verification
    verified_at: muni.verified_at,
    
    // Outreach
    outreach_sent_at: muni.outreach_sent_at,
    outreach_variant: muni.outreach?.variant,
    
    // Timestamps
    discovered_at: muni.discovered_at,
    researched_at: muni.researched_at,
    updated_at: new Date().toISOString()
  };
  
  // Try to find existing by name + country
  const { data: existing, error: fetchError } = await supabase
    .from('municipalities')
    .select('id')
    .eq('name', data.name)
    .eq('country', data.country)
    .single();
  
  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
    throw fetchError;
  }
  
  let result;
  
  if (existing) {
    // Update existing
    result = await supabase
      .from('municipalities')
      .update(data)
      .eq('id', existing.id)
      .select();
    
    log(`  📝 Updated: ${muni.name}`);
  } else {
    // Insert new
    result = await supabase
      .from('municipalities')
      .insert([data])
      .select();
    
    log(`  ➕ Inserted: ${muni.name}`);
  }
  
  if (result.error) {
    throw result.error;
  }
  
  return result.data?.[0];
}

/**
 * Log outreach email
 */
async function logOutreachEmail(supabase, municipalityId, outreach) {
  if (!outreach) return;
  
  const data = {
    municipality_id: municipalityId,
    variant: outreach.variant,
    subject: outreach.subject,
    body: outreach.body,
    sent_at: outreach.generated_at || new Date().toISOString(),
    status: 'draft', // Will be updated when actually sent
    x_warmup_completed: true,
    x_engagements_before_email: 5 // Approximate from warmup phases
  };
  
  const result = await supabase
    .from('outreach_emails')
    .insert([data])
    .select();
  
  if (result.error) {
    throw result.error;
  }
  
  return result.data?.[0];
}

/**
 * Log X engagement
 */
async function logXEngagement(supabase, municipalityId, engagement) {
  const data = {
    municipality_id: municipalityId,
    engagement_type: engagement.action,
    x_handle: engagement.x_handle?.replace('@', ''),
    tweet_id: engagement.tweet_id,
    content: engagement.content,
    engaged_at: engagement.completed_at,
    phase: engagement.action === 'follow' || engagement.action === 'like' ? 1 : 2,
    notes: engagement.mock ? 'Mock data' : null
  };
  
  const result = await supabase
    .from('x_engagements')
    .insert([data])
    .select();
  
  if (result.error) {
    throw result.error;
  }
  
  return result.data?.[0];
}

/**
 * Main sync function
 */
async function syncToSupabase(inputFile, dryRun = false) {
  log(`📂 Loading data from: ${inputFile}`);
  
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  const municipalities = data.municipalities || data;
  
  log(`📊 Found ${municipalities.length} municipalities`);
  
  if (dryRun) {
    log('🔍 DRY-RUN MODE - No database operations will be performed\n');
    
    let validCount = 0;
    let withEmails = 0;
    let withXHandle = 0;
    let withOutreach = 0;
    
    municipalities.forEach(muni => {
      validCount++;
      if (muni.contacts?.mayor_email) withEmails++;
      if (muni.x_handle) withXHandle++;
      if (muni.outreach) withOutreach++;
      
      log(`  ${muni.name}: ${muni.x_handle ? '✅ X warmup' : '⏳ No X'} | ${muni.outreach ? '✅ Email ready' : '⏳ No email'}`);
    });
    
    console.log('\n📊 Summary:');
    console.log(`  Total: ${validCount}`);
    console.log(`  With emails: ${withEmails}`);
    console.log(`  With X handle: ${withXHandle}`);
    console.log(`  With outreach: ${withOutreach}`);
    
    return { success: true, count: validCount, dryRun: true };
  }
  
  // Initialize Supabase client
  let supabase;
  try {
    supabase = createSupabaseClient();
    success('Supabase client initialized\n');
  } catch (err) {
    error('Failed to initialize Supabase:', err.message);
    console.error('\n💡 Make sure SUPABASE_URL and SUPABASE_KEY are set in .env');
    console.error('   Or run: bunx supabase login && bunx supabase init');
    throw err;
  }
  
  const results = {
    synced: 0,
    failed: 0,
    errors: [],
    municipalities: [],
    emails: [],
    engagements: []
  };
  
  // Sync each municipality
  for (const muni of municipalities) {
    try {
      log(`\nSyncing: ${muni.name}...`);
      
      // Upsert municipality
      const dbMuni = await upsertMunicipality(supabase, muni);
      results.municipalities.push(dbMuni);
      results.synced++;
      
      // Log outreach email if exists
      if (muni.outreach) {
        const email = await logOutreachEmail(supabase, dbMuni.id, muni.outreach);
        results.emails.push(email);
        log(`  📧 Logged outreach email`);
      }
      
      // Log X engagements if available
      if (muni.engagements) {
        for (const engagement of muni.engagements) {
          const eng = await logXEngagement(supabase, dbMuni.id, engagement);
          results.engagements.push(eng);
        }
        log(`  🐦 Logged ${muni.engagements.length} X engagements`);
      }
      
      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (err) {
      error(`  Failed:`, err.message);
      results.failed++;
      results.errors.push({ name: muni.name, error: err.message });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  success(`✅ Sync complete! ${results.synced} synced, ${results.failed} failed`);
  console.log('='.repeat(60));
  
  console.log('\n📊 Results:');
  console.log(`  Municipalities: ${results.municipalities.length}`);
  console.log(`  Emails logged: ${results.emails.length}`);
  console.log(`  Engagements logged: ${results.engagements.length}`);
  console.log(`  Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.name}: ${e.error}`);
    });
  }
  
  // Generate seed file for backup
  const seedFile = path.join(path.dirname(inputFile), `supabase-seed-${Date.now()}.json`);
  const seedData = {
    generated_at: new Date().toISOString(),
    count: results.municipalities.length,
    municipalities: results.municipalities,
    outreach_emails: results.emails,
    x_engagements: results.engagements
  };
  
  fs.writeFileSync(seedFile, JSON.stringify(seedData, null, 2));
  log(`\n💾 Seed file generated: ${seedFile}`);
  log('   Use this to restore data if needed');
  
  return results;
}

/**
 * CLI Entry Point
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    
    const inputArg = args.find(a => a.startsWith('--input='));
    
    if (!inputArg) {
      console.log(`
❌ No input file provided.

Usage:
  node supabase-sync.js --input=/tmp/muni-personalized.json [--dry-run]

Options:
  --input=<file>   Path to JSON file with municipal data (required)
  --dry-run        Simulate sync without database operations

Examples:
  # Dry-run (test)
  node supabase-sync.js --input=/tmp/muni-personalized.json --dry-run
  
  # Live sync
  node supabase-sync.js --input=/tmp/muni-personalized.json
`);
      process.exit(1);
    }
    
    const inputFile = inputArg.split('=')[1];
    
    if (!fs.existsSync(inputFile)) {
      error(`Input file not found: ${inputFile}`);
      process.exit(1);
    }
    
    const results = await syncToSupabase(inputFile, DRY_RUN);
    
    // Exit with status code
    process.exit(results.failed > 0 ? 1 : 0);
    
  } catch (err) {
    error('💥 Fatal error:', err);
    console.error('\n💡 This might be error 402 (quota exceeded). Check your Supabase plan.');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { syncToSupabase, upsertMunicipality, logOutreachEmail, logXEngagement };
