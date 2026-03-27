/**
 * Add missing columns to municipalities table
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addColumns() {
  console.log('🔧 Adding missing columns to municipalities table...\n');
  
  // Try to add planning_email column
  const { error: error1 } = await supabase.rpc('add_column_if_not_exists', {
    table_name: 'municipalities',
    column_name: 'planning_email',
    column_type: 'text'
  });
  
  if (error1) {
    console.log('⚠️  Could not add planning_email via RPC:', error1.message);
    console.log('   Column may already exist or need manual SQL');
  } else {
    console.log('✅ planning_email column added');
  }
  
  // Try to add it_email column
  const { error: error2 } = await supabase.rpc('add_column_if_not_exists', {
    table_name: 'municipalities',
    column_name: 'it_email',
    column_type: 'text'
  });
  
  if (error2) {
    console.log('⚠️  Could not add it_email via RPC:', error2.message);
    console.log('   Column may already exist or need manual SQL');
  } else {
    console.log('✅ it_email column added');
  }
  
  // Alternative: Try direct SQL via REST
  console.log('\n📋 SQL to run manually if needed:');
  console.log('ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS planning_email TEXT;');
  console.log('ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS it_email TEXT;');
}

addColumns().catch(console.error);
