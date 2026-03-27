/**
 * Add missing columns to municipalities table using SQL
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addColumns() {
  console.log('🔧 Adding missing columns to municipalities table...\n');
  
  // SQL to add columns
  const sql = `
    ALTER TABLE municipalities 
    ADD COLUMN IF NOT EXISTS planning_email TEXT,
    ADD COLUMN IF NOT EXISTS it_email TEXT,
    ADD COLUMN IF NOT EXISTS x_handle TEXT;
  `;
  
  console.log('SQL to execute:');
  console.log(sql);
  console.log('\n⚠️  Please run this SQL in the Supabase SQL Editor:');
  console.log('1. Go to https://app.supabase.com/project/uwusstfgikzeryvaruuk');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Run the SQL above');
  console.log('\nAlternatively, I can try using the REST API...');
  
  // Try to execute via RPC if available
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      console.log('\n❌ RPC failed:', error.message);
      console.log('Please run the SQL manually in Supabase SQL Editor');
    } else {
      console.log('\n✅ Columns added successfully via RPC!');
    }
  } catch (e) {
    console.log('\n❌ Could not execute SQL automatically');
    console.log('Please run the SQL manually in Supabase SQL Editor');
  }
}

addColumns().catch(console.error);
