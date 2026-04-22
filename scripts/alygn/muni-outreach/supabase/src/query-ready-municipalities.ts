#!/usr/bin/env node
/**
 * Query Supabase for Municipalities Ready for Outreach
 * 
 * Finds municipalities with:
 * - email is not null (mayor_email or general_email)
 * - outreach_sent_at is null (not yet sent)
 * - Not contacted (no outreach_sent_at and no reply)
 * 
 * Returns top 5 candidates for today's outreach
 * 
 * Usage:
 *   node query-ready-municipalities.js [--limit=5]
 */

import { createClient } from '@supabase/supabase-js';

// Load environment variables from shell export
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing required environment variables: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_KEY (or VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_SERVICE_KEY)');
  process.exit(1);
}

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5');

// Console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');

/**
 * Initialize Supabase client
 */
function createSupabaseClient() {
  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_KEY environment variable is required');
  }
  
  // Handle connection string format
  let url = SUPABASE_URL;
  if (SUPABASE_URL && SUPABASE_URL.startsWith('postgres://')) {
    // Extract project ref from connection string
    const match = SUPABASE_URL.match(/@([^.]+)\./);
    if (match) {
      url = `https://${match[1]}.supabase.co`;
    }
  }
  
  if (!url) {
    throw new Error('SUPABASE_URL environment variable is required');
  }
  
  return createClient(url, SUPABASE_KEY);
}

/**
 * Query municipalities ready for outreach
 */
async function queryReadyMunicipalities(supabase, limit = 5) {
  log(`Querying Supabase for municipalities ready for outreach...`);
  log(`   Limit: ${limit}`);
  
  // Query: email is not null, outreach_sent_at is null
  // Order by priority_score DESC (highest first)
  const { data: municipalities, error: queryError } = await supabase
    .from('municipalities')
    .select('id, name, province, mayor_name, mayor_email, general_email, priority_score, x_handle, population')
    .or('mayor_email.neq.null,general_email.neq.null')  // Has email
    .is('outreach_sent_at', null)                        // Not sent yet
    .order('priority_score', { ascending: false })       // Highest priority first
    .limit(limit * 2);                                    // Fetch extra in case some have drafts
  
  if (queryError) {
    throw queryError;
  }
  
  log(`Found ${municipalities?.length || 0} municipalities with emails`);
  
  if (!municipalities || municipalities.length === 0) {
    return [];
  }
  
  // Get IDs to check for existing drafts
  const ids = municipalities.map(m => m.id);
  
  // Check for existing drafts in outreach_emails table
  const { data: drafts, error: draftsError } = await supabase
    .from('outreach_emails')
    .select('municipality_id, status, subject')
    .in('municipality_id', ids)
    .eq('status', 'draft');
  
  if (draftsError) {
    console.warn('⚠️ Could not check for drafts:', draftsError.message);
  }
  
  // Create a set of municipality IDs that have drafts
  const draftIds = new Set(drafts?.map(d => d.municipality_id) || []);
  
  log(`   ${draftIds.size} municipalities already have draft emails`);
  
  // Map to result format
  const results = municipalities.map(m => ({
    id: m.id,
    name: m.name,
    province: m.province,
    canton: m.name, // In Costa Rica, municipalities are cantons
    mayor_name: m.mayor_name,
    email: m.mayor_email || m.general_email,
    priority_score: m.priority_score,
    population: m.population,
    x_handle: m.x_handle,
    has_draft: draftIds.has(m.id)
  }));
  
  // Return top N (prioritizing those without drafts)
  // Sort: those without drafts first, then by priority score
  results.sort((a, b) => {
    if (a.has_draft !== b.has_draft) {
      return a.has_draft ? 1 : -1; // No drafts first
    }
    return (b.priority_score || 0) - (a.priority_score || 0); // Higher priority first
  });
  
  return results.slice(0, limit);
}

/**
 * Main function
 */
async function main() {
  try {
    // Initialize Supabase client
    let supabase;
    try {
      supabase = createSupabaseClient();
      success('Supabase client initialized\n');
    } catch (err) {
      error('Failed to initialize Supabase:', err.message);
      console.error('\n💡 Make sure SUPABASE_URL and SUPABASE_KEY are set in .env');
      throw err;
    }
    
    // Query municipalities
    const candidates = await queryReadyMunicipalities(supabase, LIMIT);
    
    if (candidates.length === 0) {
      console.log('\n📭 No municipalities ready for outreach found.');
      console.log('   All municipalities either:');
      console.log('   - Have no email address');
      console.log('   - Have already been contacted');
      return { candidates: [], count: 0 };
    }
    
    // Output results
    console.log('\n' + '='.repeat(80));
    success(`TOP ${candidates.length} MUNICIPALITIES READY FOR OUTREACH`);
    console.log('='.repeat(80));
    
    candidates.forEach((m, i) => {
      console.log(`\n${i + 1}. ${m.name}, ${m.province}`);
      console.log(`   📧 UUID: ${m.id}`);
      console.log(`   🏛️  Municipality: ${m.name}`);
      console.log(`   📍 Canton: ${m.canton}`);
      console.log(`   🗺️  Province: ${m.province}`);
      console.log(`   👤 Mayor: ${m.mayor_name || 'N/A'}`);
      console.log(`   ✉️  Email: ${m.email}`);
      console.log(`   ⭐ Priority Score: ${m.priority_score || 'N/A'}`);
      console.log(`   👥 Population: ${m.population?.toLocaleString() || 'N/A'}`);
      console.log(`   📝 Has Draft: ${m.has_draft ? 'Yes' : 'No'}`);
    });
    
    console.log('\n' + '='.repeat(80));
    
    // Return structured data for programmatic use
    const output = {
      date: new Date().toISOString().split('T')[0],
      total_ready: candidates.length,
      candidates: candidates.map(c => ({
        uuid: c.id,
        municipality_name: c.name,
        canton: c.canton,
        province: c.province,
        mayor_name: c.mayor_name,
        email: c.email,
        priority_score: c.priority_score,
        has_existing_draft: c.has_draft
      }))
    };
    
    // Save to file
    const outputPath = '/tmp/municipalities-ready-for-outreach.json';
    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    log(`Results saved to: ${outputPath}`);
    
    // Also output JSON for piping
    console.log('\n--- JSON OUTPUT ---');
    console.log(JSON.stringify(output, null, 2));
    
    return output;
    
  } catch (err) {
    error('💥 Fatal error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { queryReadyMunicipalities };
